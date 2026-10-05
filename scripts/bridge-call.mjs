#!/usr/bin/env node
// Call one Lua bridge handler directly, no dsh and no model: listen on the
// bridge port, wait for Mesen's Lua client to connect (it retries every ~2 s),
// send one request, print the JSON result, exit. For debugging handlers that
// are not model tools (get_lua_logs, debug_state, ping) and for checking the
// Lua side after a change. Refuses to run while another process owns the
// port: stop dsh first (scripts/up.sh --down) and bring it back after.
//
//   scripts/bridge-call.mjs get_lua_logs
//   scripts/bridge-call.mjs get_tile_at_pixel '{"x":128,"y":220}'
//   scripts/bridge-call.mjs ping --timeout 30

import net from "node:net";

const args = process.argv.slice(2);
const method = args[0];
if (!method) {
  console.error("usage: bridge-call.mjs <method> [json-params] [--port N] [--timeout S]");
  process.exit(2);
}
const flag = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const port = Number(flag("--port", 9001));
const timeoutS = Number(flag("--timeout", 20));
const paramsArg = args.slice(1).find((a) => a.startsWith("{"));
const params = paramsArg ? JSON.parse(paramsArg) : {};

const timer = setTimeout(() => {
  console.error(`no Lua client connected within ${timeoutS}s (is bridge.lua running in Mesen? scripts/mesen-up.sh reloads it)`);
  process.exit(1);
}, timeoutS * 1000);

const server = net.createServer((socket) => {
  clearTimeout(timer);
  let buf = "";
  const id = `call-${Date.now()}`;
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buf += chunk;
    // Consume every complete line: heartbeats ({"heartbeat":true}) arrive on
    // the same stream and must not block the response behind them.
    for (;;) {
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        console.error(`unparseable line: ${line.slice(0, 200)}`);
        continue;
      }
      if (msg.id !== id) continue;
      if (msg.error) {
        console.error(`bridge error: ${msg.error}`);
        process.exitCode = 1;
      } else {
        console.log(JSON.stringify(msg.result, null, 2));
      }
      socket.end();
      server.close();
      return;
    }
  });
  socket.write(`${JSON.stringify({ id, method, params })}\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`port ${port} is owned by another process (dsh?). Run scripts/up.sh --down first, then scripts/up.sh after.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});


server.listen(port, "0.0.0.0", () => {
  console.error(`[bridge-call] waiting for the Lua client on :${port} …`);
});
