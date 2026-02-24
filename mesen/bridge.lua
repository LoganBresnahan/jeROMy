-- jeROMy Bridge Script for Mesen2
-- Turns the emulator into a controllable tool server via TCP.
-- Load this in Mesen2: Tools → Script Window → Open
--
-- The script connects to the TypeScript bridge server (running in WSL2)
-- and executes JSON commands from it.

local socket = require("socket.core")

---------------------------------------------------------------------------
-- Configuration
---------------------------------------------------------------------------
local PORT = 9001
local BRIDGE_HOST = "127.0.0.1"  -- TypeScript server in WSL2 (reachable via localhost from Windows)

---------------------------------------------------------------------------
-- Minimal JSON encoder/decoder
-- Mesen2's Lua 5.4 doesn't ship cjson, so we roll a small one.
---------------------------------------------------------------------------
local json = {}

function json.encode(val)
  local t = type(val)
  if t == "nil" then
    return "null"
  elseif t == "boolean" then
    return val and "true" or "false"
  elseif t == "number" then
    if val ~= val then return "null" end -- NaN
    if val == math.huge or val == -math.huge then return "null" end
    -- Use integer format when possible
    if val == math.floor(val) and val >= -2147483648 and val <= 2147483647 then
      return string.format("%d", val)
    end
    return string.format("%.17g", val)
  elseif t == "string" then
    -- Escape special characters
    local s = val:gsub('\\', '\\\\')
                  :gsub('"', '\\"')
                  :gsub('\n', '\\n')
                  :gsub('\r', '\\r')
                  :gsub('\t', '\\t')
    return '"' .. s .. '"'
  elseif t == "table" then
    -- Detect array vs object
    local isArray = true
    local maxIndex = 0
    for k, _ in pairs(val) do
      if type(k) == "number" and k == math.floor(k) and k > 0 then
        if k > maxIndex then maxIndex = k end
      else
        isArray = false
        break
      end
    end
    if isArray and maxIndex == #val then
      -- Encode as array
      local parts = {}
      for i = 1, #val do
        parts[i] = json.encode(val[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      -- Encode as object
      local parts = {}
      for k, v in pairs(val) do
        table.insert(parts, json.encode(tostring(k)) .. ":" .. json.encode(v))
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

function json.decode(str)
  local pos = 1
  local function skip_whitespace()
    while pos <= #str do
      local c = str:byte(pos)
      if c == 32 or c == 9 or c == 10 or c == 13 then
        pos = pos + 1
      else
        break
      end
    end
  end

  local function parse_string()
    pos = pos + 1 -- skip opening quote
    local start = pos
    local parts = {}
    while pos <= #str do
      local c = str:sub(pos, pos)
      if c == '\\' then
        table.insert(parts, str:sub(start, pos - 1))
        pos = pos + 1
        local esc = str:sub(pos, pos)
        if esc == 'n' then table.insert(parts, '\n')
        elseif esc == 'r' then table.insert(parts, '\r')
        elseif esc == 't' then table.insert(parts, '\t')
        elseif esc == '"' then table.insert(parts, '"')
        elseif esc == '\\' then table.insert(parts, '\\')
        elseif esc == '/' then table.insert(parts, '/')
        else table.insert(parts, esc) end
        pos = pos + 1
        start = pos
      elseif c == '"' then
        table.insert(parts, str:sub(start, pos - 1))
        pos = pos + 1
        return table.concat(parts)
      else
        pos = pos + 1
      end
    end
    error("unterminated string")
  end

  local function parse_number()
    local start = pos
    if str:sub(pos, pos) == '-' then pos = pos + 1 end
    while pos <= #str and str:byte(pos) >= 48 and str:byte(pos) <= 57 do
      pos = pos + 1
    end
    if pos <= #str and str:sub(pos, pos) == '.' then
      pos = pos + 1
      while pos <= #str and str:byte(pos) >= 48 and str:byte(pos) <= 57 do
        pos = pos + 1
      end
    end
    if pos <= #str and (str:sub(pos, pos) == 'e' or str:sub(pos, pos) == 'E') then
      pos = pos + 1
      if pos <= #str and (str:sub(pos, pos) == '+' or str:sub(pos, pos) == '-') then
        pos = pos + 1
      end
      while pos <= #str and str:byte(pos) >= 48 and str:byte(pos) <= 57 do
        pos = pos + 1
      end
    end
    return tonumber(str:sub(start, pos - 1))
  end

  local parse_value -- forward declaration

  local function parse_array()
    pos = pos + 1 -- skip [
    local arr = {}
    skip_whitespace()
    if pos <= #str and str:sub(pos, pos) == ']' then
      pos = pos + 1
      return arr
    end
    while true do
      table.insert(arr, parse_value())
      skip_whitespace()
      if str:sub(pos, pos) == ',' then
        pos = pos + 1
        skip_whitespace()
      elseif str:sub(pos, pos) == ']' then
        pos = pos + 1
        return arr
      else
        error("expected , or ] in array at pos " .. pos)
      end
    end
  end

  local function parse_object()
    pos = pos + 1 -- skip {
    local obj = {}
    skip_whitespace()
    if pos <= #str and str:sub(pos, pos) == '}' then
      pos = pos + 1
      return obj
    end
    while true do
      skip_whitespace()
      local key = parse_string()
      skip_whitespace()
      if str:sub(pos, pos) ~= ':' then error("expected : at pos " .. pos) end
      pos = pos + 1
      obj[key] = parse_value()
      skip_whitespace()
      if str:sub(pos, pos) == ',' then
        pos = pos + 1
      elseif str:sub(pos, pos) == '}' then
        pos = pos + 1
        return obj
      else
        error("expected , or } in object at pos " .. pos)
      end
    end
  end

  parse_value = function()
    skip_whitespace()
    local c = str:sub(pos, pos)
    if c == '"' then return parse_string()
    elseif c == '{' then return parse_object()
    elseif c == '[' then return parse_array()
    elseif c == 't' then pos = pos + 4; return true
    elseif c == 'f' then pos = pos + 5; return false
    elseif c == 'n' then pos = pos + 4; return nil
    else return parse_number()
    end
  end

  return parse_value()
end

---------------------------------------------------------------------------
-- Base64 encoder (for screenshot PNG data)
---------------------------------------------------------------------------
local b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function base64_encode(data)
  local out = {}
  local len = #data
  for i = 1, len, 3 do
    local a = data:byte(i)
    local b = (i + 1 <= len) and data:byte(i + 1) or 0
    local c = (i + 2 <= len) and data:byte(i + 2) or 0
    local n = a * 65536 + b * 256 + c
    table.insert(out, b64chars:sub(math.floor(n / 262144) % 64 + 1, math.floor(n / 262144) % 64 + 1))
    table.insert(out, b64chars:sub(math.floor(n / 4096) % 64 + 1, math.floor(n / 4096) % 64 + 1))
    if i + 1 <= len then
      table.insert(out, b64chars:sub(math.floor(n / 64) % 64 + 1, math.floor(n / 64) % 64 + 1))
    else
      table.insert(out, "=")
    end
    if i + 2 <= len then
      table.insert(out, b64chars:sub(n % 64 + 1, n % 64 + 1))
    else
      table.insert(out, "=")
    end
  end
  return table.concat(out)
end

---------------------------------------------------------------------------
-- Log buffer — captures emu.log calls so we can forward them over TCP
---------------------------------------------------------------------------
local log_buffer = {}
local log_overflow = 0  -- count of dropped entries
local LOG_MAX = 200  -- keep last N entries
local _emu_log = emu.log  -- save original

local function buffered_log(msg)
  _emu_log(msg)  -- still write to Mesen2's script log
  log_buffer[#log_buffer + 1] = { ts = os.time(), msg = msg }
  -- Trim oldest if over limit
  if #log_buffer > LOG_MAX then
    table.remove(log_buffer, 1)
    log_overflow = log_overflow + 1
  end
end
emu.log = buffered_log

---------------------------------------------------------------------------
-- memType Resolver
-- Mesen2 builds vary: some use short names (palette, ppuDebug),
-- others use NES-prefixed names (nesPaletteRam, nesPpuDebug).
-- Resolve once at startup so all handlers use the right enum values.
---------------------------------------------------------------------------
local function resolveMemType(...)
  for _, name in ipairs({...}) do
    if emu.memType[name] ~= nil then return emu.memType[name] end
  end
  return nil
end

local MT = {
  cpu       = resolveMemType("nesMemory",       "cpu"),
  ppu       = resolveMemType("nesPpuMemory",    "ppu"),
  cpuDebug  = resolveMemType("nesDebug",        "cpuDebug"),
  ppuDebug  = resolveMemType("nesPpuDebug",     "ppuDebug"),
  palette   = resolveMemType("nesPaletteRam",   "palette"),
  oam       = resolveMemType("nesSpriteRam",    "oam"),
  prgRom    = resolveMemType("nesPrgRom",       "prgRom"),
  chrRom    = resolveMemType("nesChrRom",       "chrRom"),
  chrRam    = resolveMemType("nesChrRam",       "chrRam"),
  workRam   = resolveMemType("nesWorkRam",      "workRam"),
  saveRam   = resolveMemType("nesSaveRam",      "saveRam"),
  nametable = resolveMemType("nesNametableRam", "nametableRam"),
}

-- Log what we resolved
do
  local resolved = {}
  for k, v in pairs(MT) do
    resolved[#resolved + 1] = k .. "=" .. (v ~= nil and tostring(v) or "NIL")
  end
  table.sort(resolved)
  emu.log("[jeROMy] Resolved memTypes: " .. table.concat(resolved, ", "))
end

---------------------------------------------------------------------------
-- Tool Handlers
---------------------------------------------------------------------------
local handlers = {}

---------------------------------------------------------------------------
-- Palette Freeze: overrides re-applied every frame so the game can't
-- clobber them during VBlank.  Keys are palette RAM offsets (0-31),
-- values are NES color indices (0-63).
---------------------------------------------------------------------------
local palette_overrides = {}

-- screenshot: Capture current frame as base64-encoded PNG
function handlers.screenshot(params)
  local png = emu.takeScreenshot()
  return { png_base64 = base64_encode(png) }
end

-- get_tile_at_pixel: Given screen coordinates, return tile and palette info
function handlers.get_tile_at_pixel(params)
  local x = params.x
  local y = params.y

  if not x or not y then
    error("x and y are required")
  end

  -- Convert pixel coords to tile coords (8x8 tiles)
  local tile_x = math.floor(x / 8)
  local tile_y = math.floor(y / 8)

  -- Read scroll position from PPU state
  -- Mesen2 getState() returns a flat table with dot-separated keys like "ppu.xScroll"
  local state = emu.getState()
  local scroll_x = state["ppu.xScroll"] or 0
  local scroll_y = state["ppu.yScroll"] or 0

  -- Adjust for scroll
  local abs_x = tile_x + math.floor(scroll_x / 8)
  local abs_y = tile_y + math.floor(scroll_y / 8)

  -- Determine which nametable (0-3) based on scroll
  local nt_index = 0
  if abs_x >= 32 then
    nt_index = nt_index + 1
    abs_x = abs_x - 32
  end
  if abs_y >= 30 then
    nt_index = nt_index + 2
    abs_y = abs_y - 30
  end

  -- Nametable base addresses: $2000, $2400, $2800, $2C00
  local nt_base = 0x2000 + (nt_index * 0x400)

  -- Read tile ID from nametable
  local nt_addr = nt_base + (abs_y * 32) + abs_x
  local tile_id = emu.read(nt_addr, MT.ppuDebug)

  -- Read attribute byte for palette assignment
  -- Attribute table is at nametable base + $3C0
  local attr_addr = nt_base + 0x3C0 + (math.floor(abs_y / 4) * 8) + math.floor(abs_x / 4)
  local attr_byte = emu.read(attr_addr, MT.ppuDebug)

  -- Extract 2-bit palette index for this tile's quadrant
  -- Each attribute byte covers a 4x4 tile area (32x32 pixels)
  -- divided into four 2x2 tile quadrants
  local quadrant_x = math.floor((abs_x % 4) / 2)
  local quadrant_y = math.floor((abs_y % 4) / 2)
  local shift = (quadrant_y * 2 + quadrant_x) * 2
  local palette_id = (attr_byte >> shift) & 0x03

  return {
    tile_id = tile_id,
    palette_id = palette_id,
    tile_x = tile_x,
    tile_y = tile_y,
    scroll_x = scroll_x,
    scroll_y = scroll_y,
    nametable = nt_index,
    nametable_addr = nt_addr,
    attribute_addr = attr_addr
  }
end

-- Read/write palette RAM using the resolved memType.
-- MT.palette points to nesPaletteRam (or legacy palette), a 32-byte region.
-- Fallback to ppuDebug at $3F00+ if palette memType wasn't resolved.
local function readPalette(offset)
  if MT.palette then
    return emu.read(offset, MT.palette)
  elseif MT.ppuDebug then
    return emu.read(0x3F00 + offset, MT.ppuDebug)
  end
  return 0
end

local function writePalette(offset, value)
  if MT.palette then
    emu.write(offset, value, MT.palette)
  elseif MT.ppuDebug then
    emu.write(0x3F00 + offset, value, MT.ppuDebug)
  end
end

-- get_palette: Return the 4 NES color indices for a palette
function handlers.get_palette(params)
  local palette_id = params.palette_id
  if not palette_id then
    error("palette_id is required")
  end

  local base = palette_id * 4
  local colors = {}
  for i = 0, 3 do
    colors[i + 1] = readPalette(base + i)
  end

  -- Also read the universal background color ($3F00)
  local bg_color = readPalette(0)

  return {
    palette_id = palette_id,
    colors = colors,
    background_color = bg_color
  }
end

-- write_palette: Change a palette color in live memory
function handlers.write_palette(params)
  local palette_id = params.palette_id
  local color_index = params.color_index
  local nes_color = params.nes_color

  if not palette_id or not color_index or not nes_color then
    error("palette_id, color_index, and nes_color are required")
  end

  if nes_color < 0 or nes_color > 0x3F then
    error("nes_color must be 0-63")
  end

  if color_index < 0 or color_index > 3 then
    error("color_index must be 0-3")
  end

  local addr = palette_id * 4 + color_index
  local old_color = readPalette(addr)
  writePalette(addr, nes_color)

  -- Freeze: re-apply this value every frame so the game can't overwrite it
  palette_overrides[addr] = nes_color

  return {
    palette_id = palette_id,
    color_index = color_index,
    old_color = old_color,
    new_color = nes_color,
    frozen = true
  }
end

-- get_all_palettes: Return all 8 palettes (4 BG + 4 sprite)
function handlers.get_all_palettes(params)
  local palettes = {}
  for p = 0, 7 do
    local colors = {}
    for i = 0, 3 do
      colors[i + 1] = readPalette(p * 4 + i)
    end
    palettes[p + 1] = {
      palette_id = p,
      type = (p < 4) and "background" or "sprite",
      colors = colors
    }
  end
  return { palettes = palettes }
end

-- clear_palette_overrides: Unfreeze some or all palette overrides
function handlers.clear_palette_overrides(params)
  -- If palette_id and color_index are given, clear just that one entry.
  -- If only palette_id is given, clear all 4 entries for that palette.
  -- Otherwise clear everything.
  local cleared = 0

  if params.palette_id and params.color_index then
    local addr = params.palette_id * 4 + params.color_index
    if palette_overrides[addr] ~= nil then
      palette_overrides[addr] = nil
      cleared = 1
    end
  elseif params.palette_id then
    local base = params.palette_id * 4
    for i = 0, 3 do
      if palette_overrides[base + i] ~= nil then
        palette_overrides[base + i] = nil
        cleared = cleared + 1
      end
    end
  else
    for k in pairs(palette_overrides) do
      palette_overrides[k] = nil
      cleared = cleared + 1
    end
  end

  return { cleared = cleared }
end

-- read_memory: Read bytes from a memory region
function handlers.read_memory(params)
  local addr = params.address
  local length = params.length or 1
  local mem_type = params.mem_type or "cpuDebug"

  local mt = MT[mem_type]
  if not mt then
    local avail = {}
    for k, v in pairs(MT) do if v then avail[#avail + 1] = k end end
    table.sort(avail)
    error("unknown mem_type: " .. tostring(mem_type) .. " (available: " .. table.concat(avail, ", ") .. ")")
  end

  local bytes = {}
  for i = 0, length - 1 do
    bytes[i + 1] = emu.read(addr + i, mt)
  end

  return { address = addr, mem_type = mem_type, bytes = bytes }
end

-- write_memory: Write bytes to a memory region
function handlers.write_memory(params)
  local addr = params.address
  local bytes = params.bytes
  local mem_type = params.mem_type or "cpu"

  local mt = MT[mem_type]
  if not mt then
    local avail = {}
    for k, v in pairs(MT) do if v then avail[#avail + 1] = k end end
    table.sort(avail)
    error("unknown mem_type: " .. tostring(mem_type) .. " (available: " .. table.concat(avail, ", ") .. ")")
  end

  for i = 1, #bytes do
    emu.write(addr + i - 1, bytes[i], mt)
  end

  return { address = addr, mem_type = mem_type, bytes_written = #bytes }
end

-- get_cpu_state: Return CPU registers and state
function handlers.get_cpu_state(params)
  -- Mesen2 getState() uses flat dot-separated keys
  local state = emu.getState()
  return {
    a = state["cpu.a"],
    x = state["cpu.x"],
    y = state["cpu.y"],
    sp = state["cpu.sp"],
    pc = state["cpu.pc"],
    status = state["cpu.ps"],
    cycle = state["cpu.cycleCount"],
    scanline = state["ppu.scanline"],
    ppu_cycle = state["ppu.cycle"]
  }
end

-- get_rom_info: Return metadata about the loaded ROM
function handlers.get_rom_info(params)
  local info = emu.getRomInfo()
  return {
    name = info.name,
    path = info.path,
    sha1 = info.fileSha1Hash,
    format = info.format
  }
end

-- save_state / load_state: Quick navigation
-- Mesen2 API varies by build: discover the right function names at startup.
local save_fn = emu.saveSavestateAsync or emu.saveSavestate or emu.createSavestate or emu.saveState or nil
local load_fn = emu.loadSavestateAsync or emu.loadSavestate or emu.loadState or nil

function handlers.save_state(params)
  local slot = params.slot or 0
  if save_fn then
    save_fn(slot)
    return { slot = slot, action = "saved" }
  end
  -- Fallback: try executeShortcut if available (Mesen2 exposes UI actions this way)
  if emu.executeShortcut then
    emu.executeShortcut("SaveState", tostring(slot + 1))
    return { slot = slot, action = "saved", method = "executeShortcut" }
  end
  error("save state API not found. Available emu functions logged at startup.")
end

function handlers.load_state(params)
  local slot = params.slot or 0
  if load_fn then
    load_fn(slot)
    return { slot = slot, action = "loaded" }
  end
  if emu.executeShortcut then
    emu.executeShortcut("LoadState", tostring(slot + 1))
    return { slot = slot, action = "loaded", method = "executeShortcut" }
  end
  error("load state API not found. Available emu functions logged at startup.")
end

-- ping: Health check
function handlers.ping(params)
  return { pong = true, timestamp = os.time() }
end

-- get_lua_logs: Return buffered emu.log entries since a given timestamp
function handlers.get_lua_logs(params)
  local since = params.since or 0  -- unix timestamp; 0 = return all
  local entries = {}
  for _, entry in ipairs(log_buffer) do
    if entry.ts >= since then
      entries[#entries + 1] = entry
    end
  end
  return { logs = entries, count = #entries, overflow = log_overflow }
end

-- debug_state: Dump the top-level keys of emu.getState() to discover structure
function handlers.debug_state(params)
  local state = emu.getState()
  local depth = params.depth or 2
  local path = params.path  -- optional: e.g. "nes.ppu" to drill into

  -- Navigate to a nested path if given
  local target = state
  if path then
    for key in path:gmatch("[^.]+") do
      if type(target) == "table" and target[key] ~= nil then
        target = target[key]
      else
        return { error = "path not found: " .. path, at_key = key }
      end
    end
  end

  -- Enumerate keys up to given depth
  local function enumerate(t, d)
    if type(t) ~= "table" or d <= 0 then
      return tostring(t)
    end
    local result = {}
    local count = 0
    for k, v in pairs(t) do
      count = count + 1
      if count > 50 then
        result["..."] = "(truncated)"
        break
      end
      if type(v) == "table" then
        result[tostring(k)] = enumerate(v, d - 1)
      else
        result[tostring(k)] = tostring(v)
      end
    end
    return result
  end

  return { keys = enumerate(target, depth) }
end

---------------------------------------------------------------------------
-- TCP Client (connects to TypeScript server in WSL2)
---------------------------------------------------------------------------
local conn = nil
local recv_buffer = ""
local reconnect_countdown = 0  -- frames until next reconnect attempt

local function try_connect()
  local tcp = socket.tcp()
  tcp:settimeout(0.5)  -- short timeout for connect attempt
  local ok, err = tcp:connect(BRIDGE_HOST, PORT)
  if ok then
    tcp:settimeout(0)  -- switch to non-blocking for normal operation
    conn = tcp
    recv_buffer = ""
    emu.log("[jeROMy] Connected to bridge server at " .. BRIDGE_HOST .. ":" .. PORT)
    emu.displayMessage("jeROMy", "Connected to bridge")
    return true
  else
    tcp:close()
    return false
  end
end

local function handle_message(msg)
  -- Strip trailing \r in case of Windows line endings
  if msg:sub(-1) == "\r" then
    msg = msg:sub(1, -2)
  end

  if #msg == 0 then
    return json.encode({ id = "error", error = "empty message" })
  end

  local ok, request = pcall(json.decode, msg)
  if not ok then
    emu.log("[jeROMy] JSON parse error: " .. tostring(request))
    return json.encode({ id = "error", error = "invalid JSON: " .. tostring(request) })
  end

  if type(request) ~= "table" then
    emu.log("[jeROMy] Decoded value is not a table: " .. type(request) .. " raw=" .. msg:sub(1, 80))
    return json.encode({ id = "error", error = "expected JSON object, got " .. type(request) })
  end

  local id = request.id
  local method = request.method
  local params = request.params or {}

  local handler = handlers[method]
  if not handler then
    emu.log("[jeROMy] Unknown method: " .. tostring(method))
    return json.encode({ id = id, error = "unknown method: " .. tostring(method) })
  end

  -- Log handler invocation (skip noisy screenshot/ping)
  if method ~= "screenshot" and method ~= "ping" then
    local param_summary = ""
    for k, v in pairs(params) do
      if param_summary ~= "" then param_summary = param_summary .. ", " end
      param_summary = param_summary .. k .. "=" .. tostring(v)
      if #param_summary > 80 then param_summary = param_summary:sub(1, 80) .. "..."; break end
    end
    emu.log("[jeROMy] → " .. method .. "(" .. param_summary .. ")")
  end

  local t0 = os.clock()
  local success, result = pcall(handler, params)
  local elapsed = os.clock() - t0

  if success then
    if method ~= "screenshot" and method ~= "ping" then
      emu.log("[jeROMy] ← " .. method .. " ok (" .. string.format("%.3f", elapsed) .. "s)")
    end
    return json.encode({ id = id, result = result })
  else
    emu.log("[jeROMy] ← " .. method .. " FAILED (" .. string.format("%.3f", elapsed) .. "s): " .. tostring(result))
    return json.encode({ id = id, error = tostring(result) })
  end
end

local function poll_connection()
  if not conn then return end

  -- Try to receive data (non-blocking)
  local data, err, partial = conn:receive(8192)
  local chunk = data or partial

  if chunk and #chunk > 0 then
    recv_buffer = recv_buffer .. chunk
  end

  -- Process complete messages (newline-delimited)
  while true do
    local nl = recv_buffer:find("\n")
    if not nl then break end

    local msg = recv_buffer:sub(1, nl - 1)
    recv_buffer = recv_buffer:sub(nl + 1)

    if #msg > 0 then
      -- Wrap in pcall so one bad message doesn't kill the connection
      local ok, response = pcall(handle_message, msg)
      if not ok then
        emu.log("[jeROMy] handle_message crashed: " .. tostring(response))
        response = json.encode({ id = "error", error = "internal error: " .. tostring(response) })
      end

      local send_ok, send_err = conn:send(response .. "\n")
      if not send_ok then
        emu.log("[jeROMy] Send error: " .. tostring(send_err))
        conn:close()
        conn = nil
        recv_buffer = ""
        emu.displayMessage("jeROMy", "Disconnected from bridge")
        return
      end
    end
  end

  -- Check for disconnect
  if err == "closed" then
    emu.log("[jeROMy] Disconnected from bridge server")
    emu.displayMessage("jeROMy", "Disconnected from bridge")
    conn:close()
    conn = nil
    recv_buffer = ""
  end
end

---------------------------------------------------------------------------
-- Main: Connect to bridge server and register frame callback
---------------------------------------------------------------------------
local RECONNECT_INTERVAL = 120  -- frames between reconnect attempts (~2s at 60fps)

-- Dump available emu.memType entries and key emu functions for debugging
do
  local mt_names = {}
  for k, v in pairs(emu.memType) do
    mt_names[#mt_names + 1] = k .. "=" .. tostring(v)
  end
  table.sort(mt_names)
  emu.log("[jeROMy] emu.memType entries: " .. table.concat(mt_names, ", "))

  -- Check save state API availability
  local save_fns = {}
  if emu.saveSavestateAsync then save_fns[#save_fns + 1] = "saveSavestateAsync" end
  if emu.saveSavestate then save_fns[#save_fns + 1] = "saveSavestate" end
  if emu.createSavestate then save_fns[#save_fns + 1] = "createSavestate" end
  if emu.loadSavestateAsync then save_fns[#save_fns + 1] = "loadSavestateAsync" end
  if emu.loadSavestate then save_fns[#save_fns + 1] = "loadSavestate" end
  emu.log("[jeROMy] Save state functions: " .. (#save_fns > 0 and table.concat(save_fns, ", ") or "NONE"))

  -- Report which palette access method we're using
  if MT.palette then
    emu.log("[jeROMy] Palette access: direct (MT.palette=" .. tostring(MT.palette) .. ")")
  elseif MT.ppuDebug then
    emu.log("[jeROMy] Palette access: ppuDebug fallback at $3F00+ (MT.ppuDebug=" .. tostring(MT.ppuDebug) .. ")")
  else
    emu.log("[jeROMy] Palette access: NONE — palette reads/writes will fail!")
  end

  -- Enumerate all emu functions so we can discover the actual API surface
  local emu_fns = {}
  for k, v in pairs(emu) do
    if type(v) == "function" then emu_fns[#emu_fns + 1] = k end
  end
  table.sort(emu_fns)
  emu.log("[jeROMy] emu functions (" .. #emu_fns .. "): " .. table.concat(emu_fns, ", "))
end

emu.log("[jeROMy] Connecting to bridge server at " .. BRIDGE_HOST .. ":" .. PORT .. "...")
if not try_connect() then
  emu.log("[jeROMy] Bridge server not available yet — will retry each frame callback")
  emu.displayMessage("jeROMy", "Waiting for bridge server...")
  reconnect_countdown = RECONNECT_INTERVAL
end

emu.addEventCallback(function()
  -- Re-apply frozen palette overrides every frame (before the game's VBlank
  -- writes take visible effect on the *next* frame the PPU renders).
  for addr, color in pairs(palette_overrides) do
    writePalette(addr, color)
  end

  if not conn then
    -- Try to reconnect periodically
    reconnect_countdown = reconnect_countdown - 1
    if reconnect_countdown <= 0 then
      if not try_connect() then
        reconnect_countdown = RECONNECT_INTERVAL
      end
    end
  else
    poll_connection()
  end
end, emu.eventType.endFrame)

-- Cleanup on script end
emu.addEventCallback(function()
  emu.log("[jeROMy] Script ending, closing connection")
  if conn then conn:close() end
end, emu.eventType.scriptEnded)
