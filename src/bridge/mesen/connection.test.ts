import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as net from "node:net";
import { MesenConnection } from "./connection.js";

describe("MesenConnection", () => {
  describe("message framing", () => {
    // Test the buffer processing logic by simulating TCP data chunks
    let server: MesenConnection;
    let tcpServer: net.Server;
    let tcpClient: net.Socket;

    beforeEach(async () => {
      server = new MesenConnection({ port: 0, requestTimeout: 2000 });
      await server.listen();

      // Get the actual port assigned
      const addr = (server as any).server.address();
      const port = addr.port;

      // Connect a mock TCP client
      tcpClient = new net.Socket();
      await new Promise<void>((resolve) => {
        tcpClient.connect(port, "127.0.0.1", () => resolve());
      });

      // Wait for the connection to register
      await new Promise((r) => setTimeout(r, 50));
    });

    afterEach(() => {
      tcpClient?.destroy();
      server?.shutdown();
    });

    it("accepts a client connection", () => {
      expect(server.isConnected).toBe(true);
    });

    it("resolves a request when the client sends a matching response", async () => {
      // Set up the client to echo back a response
      tcpClient.on("data", (data) => {
        const req = JSON.parse(data.toString().trim());
        const resp = JSON.stringify({ id: req.id, result: { pong: true } });
        tcpClient.write(resp + "\n");
      });

      const result = await server.request<{ pong: boolean }>("ping");
      expect(result.pong).toBe(true);
    });

    it("rejects with bridge error when client returns error", async () => {
      tcpClient.on("data", (data) => {
        const req = JSON.parse(data.toString().trim());
        const resp = JSON.stringify({ id: req.id, error: "not found" });
        tcpClient.write(resp + "\n");
      });

      await expect(server.request("bad_method")).rejects.toThrow(
        "Bridge error: not found"
      );
    });

    it("times out if client never responds", async () => {
      // Client receives but never replies
      await expect(
        server.request("slow_method")
      ).rejects.toThrow(/timed out/);
    });

    it("handles split messages (partial TCP chunks)", async () => {
      tcpClient.on("data", (data) => {
        const req = JSON.parse(data.toString().trim());
        const resp = JSON.stringify({ id: req.id, result: { ok: true } });
        const full = resp + "\n";
        // Send in two chunks
        tcpClient.write(full.slice(0, 10));
        setTimeout(() => tcpClient.write(full.slice(10)), 20);
      });

      const result = await server.request<{ ok: boolean }>("test");
      expect(result.ok).toBe(true);
    });

    it("handles multiple responses in one chunk", async () => {
      let reqCount = 0;
      tcpClient.on("data", (data) => {
        // Could receive multiple requests in one chunk
        const lines = data.toString().split("\n").filter(Boolean);
        const responses: string[] = [];
        for (const line of lines) {
          const req = JSON.parse(line);
          responses.push(
            JSON.stringify({ id: req.id, result: { n: ++reqCount } })
          );
        }
        // Send all responses in one write
        tcpClient.write(responses.join("\n") + "\n");
      });

      const [r1, r2] = await Promise.all([
        server.request<{ n: number }>("a"),
        server.request<{ n: number }>("b"),
      ]);

      expect(r1.n).toBeGreaterThan(0);
      expect(r2.n).toBeGreaterThan(0);
      expect(r1.n).not.toBe(r2.n);
    });

    it("rejects all pending requests on disconnect", async () => {
      const promise = server.request("test");
      tcpClient.destroy();
      await expect(promise).rejects.toThrow();
    });
  });

  describe("server lifecycle", () => {
    it("reports not connected when no client is attached", async () => {
      const server = new MesenConnection({ port: 0 });
      await server.listen();
      expect(server.isConnected).toBe(false);
      server.shutdown();
    });

    it("throws when requesting without a client", async () => {
      const server = new MesenConnection({ port: 0 });
      await server.listen();
      await expect(server.request("ping")).rejects.toThrow(
        "No Mesen bridge client connected"
      );
      server.shutdown();
    });
  });
});
