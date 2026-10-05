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

-- Mirror the log to a file WSL can read (/mnt/c/.../Mesen2/LuaScriptData/...),
-- because the script window is the only other place a Lua error shows up.
local log_file = nil
local log_file_path = nil
do
  local ok, folder = pcall(function() return emu.getScriptDataFolder() end)
  if ok and type(folder) == "string" and #folder > 0 then
    log_file_path = folder .. "\\jeromy-bridge.log"
    local f = io.open(log_file_path, "a")
    if f then log_file = f end
  end
end

local function buffered_log(msg)
  _emu_log(msg)  -- still write to Mesen2's script log
  if log_file then
    log_file:write(os.date("%Y-%m-%d %H:%M:%S "), tostring(msg), "\n")
    log_file:flush()
  end
  log_buffer[#log_buffer + 1] = { ts = os.time(), msg = msg }
  -- Trim oldest if over limit
  if #log_buffer > LOG_MAX then
    table.remove(log_buffer, 1)
    log_overflow = log_overflow + 1
  end
end
emu.log = buffered_log
emu.log("[jeROMy] script start; log file: " .. tostring(log_file_path or "(none: getScriptDataFolder unavailable)"))

-- A Lua error inside a callback stops the whole script in Mesen, which from
-- WSL looks like a client that never reconnects (docs/issues.md 2026-10-05).
-- Log it and keep the callback registered.
local function guarded(name, fn)
  return function()
    local ok, err = pcall(fn)
    if not ok then emu.log("[jeROMy] " .. name .. " callback error: " .. tostring(err)) end
  end
end

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
-- Emulator pause state
--
-- When paused, the codeBreak callback uses BLOCKING TCP receives
-- (200ms timeout × 3 iterations = ~600ms) to wait for commands.
-- This stays under Mesen's 1-second Lua watchdog (which only checks
-- between Lua VM instructions, not during C socket calls).
--
-- emu.step() does NOT block — it queues and returns immediately.
-- The step executes AFTER the callback returns.
-- emu.step(1, emu.stepType.ppuFrame) = advance exactly 1 rendered frame.
---------------------------------------------------------------------------
local is_paused = false
local step_active = false    -- true after emu.step() from codeBreak; tells
                             -- endFrame not to clear is_paused
local pending_steps = 0      -- step_frame count (decremented 1/turn in codeBreak)
local pending_resume = false  -- resume flag (checked each codeBreak turn)
local frame_counter = 0       -- endFrame count since script start (two-phase requests, ADR-0010)
local MAX_PENDING_FRAMES = 600  -- ~10 s: a parked request past this is an error
local POLL_TIMEOUT = 0.2     -- seconds per blocking receive (×3 = 600ms)
local POLL_ROUNDS = 3        -- iterations per codeBreak invocation

---------------------------------------------------------------------------
-- Palette Freeze: overrides re-applied every frame so the game can't
-- clobber them during VBlank.  Keys are palette RAM offsets (0-31),
-- values are NES color indices (0-63).
---------------------------------------------------------------------------
local palette_overrides = {}
-- The color each override replaced, kept from the first override of a slot so
-- clear_palette_overrides can put it back (docs/issues.md, 2026-10-05).
local palette_originals = {}

-- screenshot: Capture current frame as base64-encoded PNG
function handlers.screenshot(params)
  local png = emu.takeScreenshot()
  return { png_base64 = base64_encode(png), paused = is_paused }
end

-- get_tile_at_pixel: Given screen coordinates, return tile and palette info
-- search_memory: find a byte pattern (nil/-1 = wildcard) in a memory type
-- (ADR-0009). Bounded: at most `length` bytes from `start` (default the whole
-- memory, capped at 64 KiB per call: Mesen's watchdog counts Lua VM time and
-- a 512 KiB mapper ROM is one emu.read per byte; the TypeScript side chains
-- calls), at most `max_results` hits.
function handlers.search_memory(params)
  local pattern = params.pattern
  if type(pattern) ~= "table" or #pattern == 0 then error("pattern must be a non-empty array of bytes (-1 or null = wildcard)") end
  local mem_type = params.mem_type or "prgRom"
  local mt = MT[mem_type]
  if not mt then error("unknown mem_type: " .. tostring(mem_type)) end
  local size = emu.getMemorySize(mt)
  local start = params.start or 0
  local max_len = 64 * 1024
  local length = math.min(params.length or (size - start), size - start, max_len)
  local max_results = params.max_results or 64
  local offsets = {}
  local n = #pattern
  local first = pattern[1]
  local last_start = start + length - n
  local i = start
  local truncated = false
  while i <= last_start do
    local b = emu.read(i, mt)
    if first == -1 or first == nil or b == first then
      local match = true
      for k = 2, n do
        local p = pattern[k]
        if p ~= -1 and p ~= nil and emu.read(i + k - 1, mt) ~= p then match = false; break end
      end
      if match then
        offsets[#offsets + 1] = i
        if #offsets >= max_results then truncated = (i < last_start); break end
      end
    end
    i = i + 1
  end
  return { mem_type = mem_type, memory_size = size, start = start, searched = length, offsets = offsets, truncated = truncated, pattern_length = n }
end

-- reset_emulator: soft reset (ADR-0009: proving a ROM edit survived).
-- Clears palette overrides first so a frozen color is not mistaken for a
-- persistent one. Two-phase: answers after `frames` (default 30) have run
-- so the game has re-initialised RAM and palette RAM before the caller's
-- next read; a get_palette one request after an instant reset still saw the
-- pre-reset bytes (2026-10-05, trio persist). While paused it steps those
-- frames itself and stays paused.
function handlers.reset_emulator(params)
  local frames = params.frames or 30
  if frames < 1 or frames > MAX_PENDING_FRAMES then error("frames must be 1-" .. MAX_PENDING_FRAMES) end
  local cleared = 0
  for _ in pairs(palette_overrides) do cleared = cleared + 1 end
  palette_overrides = {}
  palette_originals = {}
  local paused = is_paused
  if paused then pending_steps = pending_steps + frames end
  emu.reset()
  local start = frame_counter
  return {
    pending = {
      frames = frames,
      allow_paused = paused,
      complete = function()
        return { reset = true, cleared_palette_overrides = cleared, frames_waited = frame_counter - start, paused = is_paused }
      end,
      cancel = function() end,
    },
  }
end

-- trace_writes: who writes (or reads) an address range, for N frames
-- (ADR-0009). Two-phase. The callback body is a counter plus one getState
-- for the PC, recorded for at most MAX_TRACE_EVENTS accesses and
-- max_writers distinct PCs; past the cap it only counts, so a hot address
-- costs one table increment per access. One trace at a time; complete()
-- resolves each PC through convertAddress once (the bank mapped at
-- completion time, exact on NROM).
local trace = nil
local MAX_TRACE_EVENTS = 4096

local function remove_trace()
  if trace and trace.ref then
    pcall(emu.removeMemoryCallback, trace.ref, trace.cb_type, trace.first, trace.last, trace.cpu_type, trace.mem_id)
  end
  trace = nil
end

function handlers.trace_writes(params)
  local addr = params.address
  if not addr then error("address is required") end
  local length = params.length or 1
  if length < 1 or length > 256 then error("length must be 1-256") end
  local frames = params.frames or 60
  if frames < 1 or frames > MAX_PENDING_FRAMES then error("frames must be 1-" .. MAX_PENDING_FRAMES) end
  local mem_type = params.mem_type or "cpu"
  local mode = params.mode or "write"
  local cb_type = mode == "read" and emu.callbackType.read or emu.callbackType.write
  local max_writers = params.max_writers or 64
  if is_paused then error("trace_writes needs frames to run and the emulator is paused; resume_emulator first") end
  remove_trace()
  local writers, order = {}, {}
  local total, recorded = 0, 0
  local start_frame = frame_counter
  local function on_access(a, v)
    total = total + 1
    if recorded >= MAX_TRACE_EVENTS then return end
    recorded = recorded + 1
    local pc = emu.getState()["cpu.pc"]
    local w = writers[pc]
    if not w then
      if #order >= max_writers then return end
      w = { pc = pc, count = 0, samples = {} }
      writers[pc] = w
      order[#order + 1] = pc
    end
    w.count = w.count + 1
    w.last_value = v
    w.last_address = a
    w.last_frame = frame_counter - start_frame
    if #w.samples < 8 then w.samples[#w.samples + 1] = { address = a, value = v, frame = frame_counter - start_frame } end
  end
  local first, last = addr, addr + length - 1
  local ref, cpu_type, mem_id
  if mem_type == "cpu" then
    ref = emu.addMemoryCallback(on_access, cb_type, first, last)
  else
    mem_id = MT[mem_type]
    if not mem_id then error("unknown mem_type: " .. tostring(mem_type)) end
    cpu_type = emu.cpuType and emu.cpuType.nes or nil
    ref = emu.addMemoryCallback(on_access, cb_type, first, last, cpu_type, mem_id)
  end
  trace = { ref = ref, cb_type = cb_type, first = first, last = last, cpu_type = cpu_type, mem_id = mem_id }
  return {
    pending = {
      frames = frames,
      complete = function()
        remove_trace()
        local out = {}
        for _, pc in ipairs(order) do
          local w = writers[pc]
          local origin = nil
          local ok, res = pcall(emu.convertAddress, pc)
          if ok and type(res) == "table" then
            local name = nil
            for n, id in pairs(MT) do if id == res.memType then name = n end end
            origin = { address = res.address, mem_type = name, mem_type_id = res.memType }
          end
          out[#out + 1] = { pc = pc, count = w.count, last_value = w.last_value, last_address = w.last_address, last_frame = w.last_frame, samples = w.samples, origin = origin }
        end
        table.sort(out, function(x, y) return x.count > y.count end)
        return {
          address = addr, length = length, mem_type = mem_type, mode = mode, frames = frames,
          total_accesses = total, recorded_accesses = recorded,
          truncated = recorded >= MAX_TRACE_EVENTS or #order >= max_writers,
          writers = out,
        }
      end,
      cancel = function() remove_trace() end,
    },
  }
end

-- convert_address: CPU (or other) address → its ROM/RAM origin through the
-- mapper (ADR-0009). Returns Mesen's raw answer plus the memType name.
function handlers.convert_address(params)
  local addr = params.address
  if not addr then error("address is required") end
  local mem_type = params.mem_type or "cpu"
  local mt = MT[mem_type]
  if not mt then error("unknown mem_type: " .. tostring(mem_type)) end
  local ok, res = pcall(emu.convertAddress, addr, mt)
  if not ok then
    ok, res = pcall(emu.convertAddress, addr)
  end
  if not ok then error("convertAddress failed: " .. tostring(res)) end
  local out = { input = addr, input_mem_type = mem_type, raw = res }
  if type(res) == "table" then
    out.address = res.address
    for name, id in pairs(MT) do
      if id == res.memType then out.mem_type = name end
    end
    out.mem_type_id = res.memType
  end
  return out
end

-- wait_frames: the smallest two-phase request (ADR-0010). Parks for N frames
-- and answers with how many actually elapsed; exists so the pending path can
-- be exercised without the scroll capture.
function handlers.wait_frames(params)
  local n = params.frames or 1
  if n < 1 or n > MAX_PENDING_FRAMES then
    error("frames must be 1-" .. MAX_PENDING_FRAMES)
  end
  local start = frame_counter
  return {
    pending = {
      frames = n,
      complete = function()
        return { requested = n, waited = frame_counter - start }
      end,
      cancel = function() end,
    },
  }
end

-- capture_scroll_writes: record every CPU write to the PPU registers
-- ($2000-$3FFF, mirrors included) for N frames, with the PPU position and
-- the loopy registers (t, v, fine x, w) as Mesen reports them right after
-- the write (ADR-0010 phase 2). Pending: installs the hook now, answers from
-- the endFrame N frames later; cancel removes the hook. Only one capture at
-- a time; a new one tears down any previous hook first.
local scroll_capture = nil  -- { ref = callback reference, writes = {...} }

local function remove_scroll_capture()
  if scroll_capture and scroll_capture.ref then
    pcall(emu.removeMemoryCallback, scroll_capture.ref, emu.callbackType.write, 0x2000, 0x3FFF)
  end
  scroll_capture = nil
end

-- Standing scroll-write ring (ADR-0013): every CPU write to $2000/$2005/
-- $2006 is recorded with the pre-write loopy state into the frame in
-- progress, and endFrame seals that list as the last completed frame. A
-- one-frame capture answers from the sealed frame at once, paused or
-- running. Never make this hook conditional or step to fill it: a pick
-- while paused has no other source of the frame's writes, and stepping on
-- a click moved the game under the user (ADR-0013).
local scroll_ring = { current = {}, last = nil, last_frame = -1, last_mask = nil }

local function ring_on_write(addr, value)
  local reg = addr & 7
  if reg ~= 0 and reg ~= 5 and reg ~= 6 then return end
  local cur = scroll_ring.current
  if #cur >= 256 then return end
  local st = emu.getState()
  cur[#cur + 1] = {
    frame = 0,
    scanline = st["ppu.scanline"],
    cycle = st["ppu.cycle"],
    reg = reg,
    value = value,
    t = st["ppu.tmpVideoRamAddr"],
    v = st["ppu.videoRamAddr"],
    x = st["ppu.xScroll"],
    w = st["ppu.writeToggle"],
  }
end

local function ring_seal_frame()
  scroll_ring.last = scroll_ring.current
  scroll_ring.last_frame = frame_counter
  scroll_ring.current = {}
  -- The mask that drew this frame. Never read the mask live for a lookup:
  -- SMB switches rendering off inside its NMI, and a pause (whose keep-alive
  -- steps creep through instructions) can sit in that window for minutes,
  -- making every "is anything drawn here" answer wrong (ADR-0014, 2026-10-05).
  local st = emu.getState()
  scroll_ring.last_mask = {
    background = st["ppu.mask.backgroundEnabled"] ~= false,
    sprites = st["ppu.mask.spritesEnabled"] ~= false,
  }
end

-- Rendering flags as of the last completed frame, falling back to the live
-- state before the first frame has sealed.
local function frame_mask(st)
  local m = scroll_ring.last_mask
  if m then return m.background, m.sprites, "frame" end
  return st["ppu.mask.backgroundEnabled"] ~= false, st["ppu.mask.spritesEnabled"] ~= false, "live"
end

-- A write callback's return value replaces the written byte, so this hook
-- must return nothing (guarded() drops the arguments, hence its own pcall).
emu.addMemoryCallback(function(addr, value)
  local ok, err = pcall(ring_on_write, addr, value)
  if not ok then emu.log("[jeROMy] scrollRing callback error: " .. tostring(err)) end
end, emu.callbackType.write, 0x2000, 0x3FFF)

function handlers.capture_scroll_writes(params)
  local frames = params.frames or 1
  if frames < 1 or frames > 10 then error("frames must be 1-10") end
  if frames == 1 then
    if not scroll_ring.last then error("no completed frame in the scroll ring yet (script just started)") end
    local st = emu.getState()
    return {
      frames = 1,
      stepped_frames = 0,
      source = "ring",
      start_frame = scroll_ring.last_frame - 1,
      end_frame = scroll_ring.last_frame,
      other_register_writes = 0,
      final = { t = st["ppu.tmpVideoRamAddr"], v = st["ppu.videoRamAddr"], x = st["ppu.xScroll"], w = st["ppu.writeToggle"], scanline = st["ppu.scanline"], cycle = st["ppu.cycle"] },
      writes = scroll_ring.last,
    }
  end
  -- Several frames: a live hook over the next N frames. Paused, endFrame
  -- never fires and ADR-0013 forbids stepping for a lookup, so refuse.
  if is_paused then error("capturing more than one frame needs a running emulator; one frame answers from the ring while paused (ADR-0013)") end
  remove_scroll_capture()
  local paused = false
  local writes = {}
  local other = 0
  local start_frame = frame_counter
  -- Mesen invokes write callbacks BEFORE the write lands and lets the return
  -- value override it (ScriptingContext.cpp), so t/v/x/w here are the state
  -- before this write; the TypeScript side applies the write itself.
  local function on_write(addr, value)
    local reg = addr & 7
    if reg ~= 0 and reg ~= 5 and reg ~= 6 then other = other + 1; return end
    if #writes >= 256 then return end
    local st = emu.getState()
    writes[#writes + 1] = {
      frame = frame_counter - start_frame,
      scanline = st["ppu.scanline"],
      cycle = st["ppu.cycle"],
      reg = reg,
      value = value,
      t = st["ppu.tmpVideoRamAddr"],
      v = st["ppu.videoRamAddr"],
      x = st["ppu.xScroll"],
      w = st["ppu.writeToggle"],
    }
  end
  local ref = emu.addMemoryCallback(on_write, emu.callbackType.write, 0x2000, 0x3FFF)
  scroll_capture = { ref = ref, writes = writes }
  return {
    pending = {
      frames = frames,
      allow_paused = paused,
      complete = function()
        remove_scroll_capture()
        local st = emu.getState()
        return {
          frames = frames,
          stepped_frames = 0,
          source = "frames",
          start_frame = start_frame,
          end_frame = frame_counter,
          other_register_writes = other,
          final = { t = st["ppu.tmpVideoRamAddr"], v = st["ppu.videoRamAddr"], x = st["ppu.xScroll"], w = st["ppu.writeToggle"], scanline = st["ppu.scanline"], cycle = st["ppu.cycle"] },
          writes = writes,
        }
      end,
      cancel = function() remove_scroll_capture() end,
    },
  }
end

-- get_pixel_color: the rendered ARGB at a screen position (ADR-0010). Ground
-- truth regardless of mid-frame scroll splits; the TypeScript side maps it to
-- the nearest master-palette index.
function handlers.get_pixel_color(params)
  local x = params.x
  local y = params.y
  if not x or not y then
    error("x and y are required")
  end
  if x < 0 or x > 255 or y < 0 or y > 239 then
    error("x must be 0-255 and y 0-239")
  end
  local argb = emu.getPixel(x, y)
  return {
    x = x,
    y = y,
    argb = argb,
    r = (argb >> 16) & 0xFF,
    g = (argb >> 8) & 0xFF,
    b = argb & 0xFF,
  }
end

-- get_sprites: OAM decoded through the PPU control flags (ADR-0013). With
-- x and y, only the sprites covering that pixel, each hit-tested against its
-- pattern bytes read through PPU address space (so CHR banking holds) and
-- carrying the 8x8 cell the pixel falls in; without them, every sprite that
-- is on screen. chr_tile is the index into the 512-tile pattern space, the
-- number read_tile/write_tile want, never the raw OAM tile byte.
function handlers.get_sprites(params)
  local st = emu.getState()
  local large = st["ppu.control.largeSprites"] == true
  local height = large and 16 or 8
  local sprite_base = st["ppu.control.spritePatternAddr"] or 0
  local bg_base = st["ppu.control.backgroundPatternAddr"] or 0
  local px, py = params.x, params.y
  local filter = px ~= nil and py ~= nil
  if filter and (px < 0 or px > 255 or py < 0 or py > 239) then error("x must be 0-255 and y 0-239") end
  local out = {}
  for i = 0, 63 do
    local o = i * 4
    local y0 = emu.read(o, MT.oam) + 1   -- OAM Y is the scanline above the sprite's first row
    local tile = emu.read(o + 1, MT.oam)
    local attr = emu.read(o + 2, MT.oam)
    local x0 = emu.read(o + 3, MT.oam)
    if y0 <= 239 then
      local covers = (not filter) or (px >= x0 and px < x0 + 8 and py >= y0 and py < y0 + height)
      if covers then
        local flip_h = (attr & 0x40) ~= 0
        local flip_v = (attr & 0x80) ~= 0
        local top_addr, bottom_addr
        if large then
          top_addr = (tile & 1) * 0x1000 + (tile & 0xFE) * 16
          bottom_addr = top_addr + 16
        else
          top_addr = sprite_base + tile * 16
        end
        local entry = {
          index = i, x = x0, y = y0, width = 8, height = height,
          tile = tile, attr = attr, palette = 4 + (attr & 3),
          behind_background = (attr & 0x20) ~= 0, flip_h = flip_h, flip_v = flip_v,
          chr_tile = top_addr // 16,
        }
        if large then entry.chr_tile_bottom = bottom_addr // 16 end
        if filter then
          local row = py - y0
          local col = px - x0
          if flip_v then row = height - 1 - row end
          if flip_h then col = 7 - col end
          local addr = top_addr
          if large and row >= 8 then addr = bottom_addr; row = row - 8 end
          local p0 = emu.read(addr + row, MT.ppuDebug)
          local p1 = emu.read(addr + row + 8, MT.ppuDebug)
          local bit = 7 - col
          local value = (((p1 >> bit) & 1) << 1) | ((p0 >> bit) & 1)
          entry.pixel_value = value
          entry.opaque = value ~= 0
          entry.hit_tile = addr // 16
          local cell_y = y0
          if large and (py - y0) >= 8 then cell_y = y0 + 8 end
          entry.cell = { x = x0, y = cell_y, width = 8, height = 8 }
        end
        out[#out + 1] = entry
      end
    end
  end
  local _, spr_on, mask_source = frame_mask(st)
  return {
    large_sprites = large,
    sprite_pattern_addr = sprite_base,
    background_pattern_addr = bg_base,
    sprites_enabled = spr_on,
    mask_source = mask_source,
    count = #out,
    sprites = out,
  }
end

-- read_region: a PPU-faithful pixel map of a screen window (ADR-0014). For
-- every pixel: layer (0 none, 1 background, 2 sprite), palette, slot, the
-- pattern-space tile and the OAM index, resolved the way the PPU composes
-- them (lower OAM index wins; behind-background sprites lose to an opaque
-- background pixel). The caller supplies the background scroll per row
-- (from the ring reconstruction, ADR-0013): Lua never guesses the scroll.
-- Window is capped at 64x64 so the response stays near 60 KB and the loop
-- well inside the codeBreak budget; reads are cached per tile row.
function handlers.read_region(params)
  local x0, y0 = params.x, params.y
  local w, h = params.w or 64, params.h or 64
  local rows = params.rows
  if not x0 or not y0 then error("x and y are required") end
  if w < 1 or h < 1 or w > 64 or h > 64 then error("w and h must be 1-64") end
  if x0 < 0 or y0 < 0 or x0 + w > 256 or y0 + h > 240 then error("window must lie within 256x240") end
  if not rows or #rows ~= h then error("rows must hold one scroll entry per window row") end

  local st = emu.getState()
  local large = st["ppu.control.largeSprites"] == true
  local height = large and 16 or 8
  local sprite_base = st["ppu.control.spritePatternAddr"] or 0
  local bg_base = st["ppu.control.backgroundPatternAddr"] or 0
  local bg_on, spr_on, mask_source = frame_mask(st)

  local n = w * h
  local layer, palette, slot, tile, oam = {}, {}, {}, {}, {}
  for i = 1, n do layer[i] = 0; palette[i] = 0; slot[i] = 0; tile[i] = -1; oam[i] = -1 end

  local pat_cache = {}
  local function pattern_row(addr)  -- addr = tile base + row; returns plane0, plane1
    local c = pat_cache[addr]
    if c then return c[1], c[2] end
    local p0, p1 = emu.read(addr, MT.ppuDebug), emu.read(addr + 8, MT.ppuDebug)
    pat_cache[addr] = { p0, p1 }
    return p0, p1
  end

  -- Sprites first, lowest OAM index claiming each pixel.
  local spr_behind = {}
  if spr_on then
    for i = 0, 63 do
      local o = i * 4
      local sy = emu.read(o, MT.oam) + 1
      if sy <= 239 and sy < y0 + h and sy + height > y0 then
        local tbyte = emu.read(o + 1, MT.oam)
        local attr = emu.read(o + 2, MT.oam)
        local sx = emu.read(o + 3, MT.oam)
        if sx < x0 + w and sx + 8 > x0 then
          local flip_h, flip_v = (attr & 0x40) ~= 0, (attr & 0x80) ~= 0
          local top_addr, bottom_addr
          if large then
            top_addr = (tbyte & 1) * 0x1000 + (tbyte & 0xFE) * 16
            bottom_addr = top_addr + 16
          else
            top_addr = sprite_base + tbyte * 16
          end
          for r = 0, height - 1 do
            local py = sy + r
            if py >= y0 and py < y0 + h then
              local row = flip_v and (height - 1 - r) or r
              local addr = top_addr
              if large and row >= 8 then addr = bottom_addr; row = row - 8 end
              local p0, p1 = pattern_row(addr + row)
              for c = 0, 7 do
                local px = sx + c
                if px >= x0 and px < x0 + w then
                  local idx = (py - y0) * w + (px - x0) + 1
                  if oam[idx] == -1 then
                    local col = flip_h and (7 - c) or c
                    local bit = 7 - col
                    local v = (((p1 >> bit) & 1) << 1) | ((p0 >> bit) & 1)
                    if v ~= 0 then
                      oam[idx] = i
                      layer[idx] = 2
                      palette[idx] = 4 + (attr & 3)
                      slot[idx] = v
                      tile[idx] = addr // 16
                      spr_behind[idx] = (attr & 0x20) ~= 0
                    end
                  end
                end
              end
            end
          end
        end
      end
    end
  end

  -- Background per row with the supplied scroll, then compose.
  local nt_cache = {}
  for r = 0, h - 1 do
    local row = rows[r + 1]
    local scroll_x = row.scroll_x or 0
    local nt_x = row.nt_x or 0
    local vy = row.v_y or 0
    local nt_y = row.nt_y or 0
    for c = 0, w - 1 do
      local idx = r * w + c + 1
      local bslot, bpal, btile = 0, 0, -1
      if bg_on then
        local nx = x0 + c + scroll_x
        local ntx = nt_x
        if nx >= 256 then nx = nx - 256; ntx = ntx ~ 1 end
        local nt_base = 0x2000 + (nt_y * 2 + ntx) * 0x400
        local tx, ty = nx // 8, vy // 8
        local key = nt_base + ty * 32 + tx
        local ent = nt_cache[key]
        if not ent then
          local tbyte = emu.read(key, MT.ppuDebug)
          local abyte = emu.read(nt_base + 0x3C0 + (ty // 4) * 8 + (tx // 4), MT.ppuDebug)
          local shift = ((ty % 4) // 2) * 4 + ((tx % 4) // 2) * 2
          ent = { tile = tbyte, pal = (abyte >> shift) & 3 }
          nt_cache[key] = ent
        end
        local p0, p1 = pattern_row(bg_base + ent.tile * 16 + (vy % 8))
        local bit = 7 - (nx % 8)
        bslot = (((p1 >> bit) & 1) << 1) | ((p0 >> bit) & 1)
        bpal = ent.pal
        btile = (bg_base + ent.tile * 16) // 16
      end
      local sprite_here = oam[idx] ~= -1
      if sprite_here and spr_behind[idx] and bslot ~= 0 then sprite_here = false end
      if not sprite_here then
        if bg_on then
          layer[idx] = 1; palette[idx] = bpal; slot[idx] = bslot; tile[idx] = btile; oam[idx] = -1
        else
          layer[idx] = 0; palette[idx] = 0; slot[idx] = 0; tile[idx] = -1; oam[idx] = -1
        end
      end
    end
  end

  return {
    x = x0, y = y0, w = w, h = h,
    large_sprites = large,
    background_pattern_addr = bg_base,
    sprite_pattern_addr = sprite_base,
    rendering = { background = bg_on, sprites = spr_on, source = mask_source },
    layer = layer, palette = palette, slot = slot, tile = tile, oam = oam,
  }
end

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
  if palette_originals[addr] == nil then palette_originals[addr] = old_color end
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
  local cleared, restored = 0, 0
  local restore = params.restore ~= false  -- default: put the original color back
  local function clear_one(addr)
    if palette_overrides[addr] == nil then return end
    palette_overrides[addr] = nil
    cleared = cleared + 1
    if restore and palette_originals[addr] ~= nil then
      writePalette(addr, palette_originals[addr])
      restored = restored + 1
    end
    palette_originals[addr] = nil
  end

  if params.palette_id and params.color_index then
    clear_one(params.palette_id * 4 + params.color_index)
  elseif params.palette_id then
    for i = 0, 3 do clear_one(params.palette_id * 4 + i) end
  else
    local addrs = {}
    for k in pairs(palette_overrides) do addrs[#addrs + 1] = k end
    for _, k in ipairs(addrs) do clear_one(k) end
  end

  return { cleared = cleared, restored = restored }
end

-- read_chr_tile: Read a single 8x8 tile from CHR memory, decoded to pixel grid
function handlers.read_chr_tile(params)
  local tile_id = params.tile_id
  local source = params.source or "chrRom"  -- "chrRom" or "chrRam"

  if not tile_id then
    error("tile_id is required")
  end

  local mt = MT[source]
  if not mt then
    error("unsupported CHR source: " .. tostring(source) .. " (try chrRom or chrRam)")
  end

  -- Each tile is 16 bytes: 2 bitplanes of 8 rows
  local base = tile_id * 16
  local pixels = {}  -- 8 rows of 8 pixels (values 0-3)

  for row = 0, 7 do
    local plane0 = emu.read(base + row, mt)
    local plane1 = emu.read(base + row + 8, mt)
    local row_pixels = {}
    for col = 0, 7 do
      local bit = 7 - col
      local lo = (plane0 >> bit) & 1
      local hi = (plane1 >> bit) & 1
      row_pixels[col + 1] = hi * 2 + lo
    end
    pixels[row + 1] = row_pixels
  end

  return { tile_id = tile_id, source = source, pixels = pixels }
end

-- write_chr_tile: Encode a pixel grid back to CHR format and write it
function handlers.write_chr_tile(params)
  local tile_id = params.tile_id
  local pixels = params.pixels
  local target = params.target or "chrRam"  -- "chrRam" preferred; "chrRom" for ROM patching

  if not tile_id then
    error("tile_id is required")
  end
  if not pixels or #pixels ~= 8 then
    error("pixels must be an 8-row array of 8 values each")
  end

  local mt = MT[target]
  if not mt then
    error("unsupported CHR target: " .. tostring(target) .. " (try chrRam or chrRom)")
  end

  local base = tile_id * 16
  for row = 0, 7 do
    local plane0, plane1 = 0, 0
    local row_pixels = pixels[row + 1]
    if not row_pixels or #row_pixels ~= 8 then
      error("row " .. row .. " must have exactly 8 pixel values")
    end
    for col = 0, 7 do
      local bit = 7 - col
      local px = row_pixels[col + 1]
      if (px & 1) ~= 0 then plane0 = plane0 | (1 << bit) end
      if (px & 2) ~= 0 then plane1 = plane1 | (1 << bit) end
    end
    emu.write(base + row, plane0, mt)
    emu.write(base + row + 8, plane1, mt)
  end

  return { tile_id = tile_id, target = target, rows_written = 8 }
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
-- For NES ROMs, also parses the iNES header to extract mapper/CHR info.
function handlers.get_rom_info(params)
  local info = emu.getRomInfo()
  local result = {
    name = info.name,
    path = info.path,
    sha1 = info.fileSha1Hash,
    format = info.format
  }

  -- Parse iNES header for NES ROMs only
  local fmt = (info.format or ""):lower()
  if fmt == "ines" or fmt == "nes" or fmt == "unif" or fmt:find("nes") then
    local ok, header = pcall(function()
      local f = io.open(info.path, "rb")
      if not f then return nil end
      local data = f:read(16)
      f:close()
      if not data or #data < 16 then return nil end
      -- Verify iNES magic: "NES\x1A"
      if data:sub(1, 4) ~= "NES\x1a" then return nil end
      return data
    end)

    if ok and header then
      local prg_pages = header:byte(5)  -- 16KB each
      local chr_pages = header:byte(6)  -- 8KB each, 0 = CHR RAM
      local flags6 = header:byte(7)
      local flags7 = header:byte(8)
      local mapper = ((flags7 & 0xF0) | (flags6 >> 4))

      result.prgRomSize = prg_pages * 16  -- KB
      result.chrRomSize = chr_pages * 8   -- KB, 0 = uses CHR RAM
      result.mapper = mapper
      result.usesChrRam = (chr_pages == 0)
    end
  end

  return result
end

-- save_state / load_state: Quick navigation
-- Mesen2 API varies by build: discover the right function names at startup.

-- Save states (fix 2026-10-05): Mesen2 only allows createSavestate /
-- loadSavestate from inside an exec memory callback for the main CPU, and
-- its Lua API has no slots: the blob is a string the script keeps. Both
-- handlers are two-phase: a one-shot exec hook on the whole CPU range does
-- the work at the next executed instruction, and the request completes at
-- the following endFrame. While paused one frame is stepped so an
-- instruction runs; slots live in this script and vanish when it reloads.
local state_slots = {}

local function run_in_exec(work)
  local job = { done = false, ok = nil, result = nil, ref = nil }
  job.ref = emu.addMemoryCallback(function()
    if job.done then return end
    job.done = true
    job.ok, job.result = pcall(work)
  end, emu.callbackType.exec, 0x0000, 0xFFFF)
  job.remove = function()
    if job.ref ~= nil then
      pcall(emu.removeMemoryCallback, job.ref, emu.callbackType.exec, 0x0000, 0xFFFF)
      job.ref = nil
    end
  end
  return job
end

local function state_request(slot, action, work)
  local paused = is_paused
  if paused then pending_steps = pending_steps + 1 end
  local job = run_in_exec(work)
  return {
    pending = {
      frames = 1,
      allow_paused = paused,
      complete = function()
        job.remove()
        if not job.done then error(action .. " never ran: no CPU instruction executed in the window") end
        if not job.ok then error(action .. " failed: " .. tostring(job.result)) end
        return { slot = slot, action = action, bytes = job.result, stepped_frames = paused and 1 or 0, paused = is_paused }
      end,
      cancel = function() job.remove() end,
    },
  }
end

function handlers.save_state(params)
  local slot = params.slot or 0
  if not emu.createSavestate then error("emu.createSavestate is not available in this Mesen build") end
  return state_request(slot, "saved", function()
    local blob = emu.createSavestate()
    state_slots[slot] = blob
    return #blob
  end)
end

function handlers.load_state(params)
  local slot = params.slot or 0
  if not emu.loadSavestate then error("emu.loadSavestate is not available in this Mesen build") end
  local blob = state_slots[slot]
  if not blob then error("slot " .. slot .. " is empty in this script session (states live in the running bridge.lua; save_state first)") end
  return state_request(slot, "loaded", function()
    emu.loadSavestate(blob)
    return #blob
  end)
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
  local filter = params.filter  -- optional: only keys starting with this prefix (getState is flat, e.g. "ppu.")
  if filter then
    local out = {}
    for k, v in pairs(state) do
      if type(k) == "string" and k:sub(1, #filter) == filter then out[k] = tostring(v) end
    end
    return { keys = out }
  end

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
-- Emulator Control: pause, resume, step frame
---------------------------------------------------------------------------

-- pause_emulator: Break execution and mark as paused.
-- breakExecution() internally does Step(1, Step) — runs 1 more CPU
-- instruction then breaks. codeBreak fires after the callback returns.
function handlers.pause_emulator(params)
  is_paused = true
  step_active = true  -- prevent endFrame from clearing is_paused before codeBreak fires
  emu.breakExecution()
  return { paused = true }
end

-- resume_emulator: Sets a flag for the next codeBreak turn.
-- codeBreak calls emu.resume() and returns → Mesen runs freely.
function handlers.resume_emulator(params)
  pending_resume = true
  return { resumed = true }
end

-- step_frame: Queues N frames. codeBreak steps one PPU frame per turn
-- via emu.step(1, emu.stepType.ppuFrame), decrementing until done.
function handlers.step_frame(params)
  local count = params.count or 1
  pending_steps = pending_steps + count
  return { stepped = count, paused = true }
end

-- get_emulator_status: Query current pause/run state
function handlers.get_emulator_status(params)
  return { paused = is_paused }
end

---------------------------------------------------------------------------
-- TCP Client (connects to TypeScript server in WSL2)
---------------------------------------------------------------------------
local conn = nil
local recv_buffer = ""
local reconnect_countdown = 0  -- frames until next reconnect attempt
-- A peer that exits without the FIN reaching us (seen 2026-10-05 when a
-- headless dsh run ended: no "Disconnected" ever logged, the client sat on a
-- dead socket while the next server listened) is only detected by sending.
-- The TypeScript side ignores heartbeat lines; the second send after a RST
-- fails and triggers a reconnect within ~4 s.
local HEARTBEAT_INTERVAL = 120  -- frames (~2s)
local heartbeat_countdown = HEARTBEAT_INTERVAL

-- Two-phase requests (ADR-0010). A handler may return
--   { pending = { frames = N, complete = fn, cancel = fn, allow_paused = bool } }
-- instead of a result: the request id is parked here and answered from a
-- later endFrame when `frames` have elapsed, with complete()'s return value.
-- cancel() runs on cap expiry and on disconnect so memory callbacks never
-- outlive their request. Completion runs only from endFrame, never from the
-- codeBreak blocking poll, so it cannot eat the 600 ms watchdog budget.
local pending_requests = {}

local function cancel_all_pending(reason)
  for id, p in pairs(pending_requests) do
    if p.cancel then pcall(p.cancel) end
    emu.log("[jeROMy] pending " .. p.method .. " (" .. tostring(id) .. ") cancelled: " .. reason)
    pending_requests[id] = nil
  end
end

local function drop_connection(reason)
  emu.log("[jeROMy] " .. reason .. "; reconnecting")
  emu.displayMessage("jeROMy", "Disconnected from bridge")
  cancel_all_pending("connection dropped")
  if conn then conn:close() end
  conn = nil
  recv_buffer = ""
  reconnect_countdown = 0
  heartbeat_countdown = HEARTBEAT_INTERVAL
end

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
    -- Also the shape of a watchdog trip inside the decoder (seen 2026-10-05
    -- while paused): recover the id by string match so the caller gets an
    -- immediate error instead of a 15 s timeout, and can retry.
    local id = msg:match('"id"%s*:%s*"([^"]+)"') or "error"
    emu.log("[jeROMy] JSON parse error: " .. tostring(request))
    return json.encode({ id = id, error = "bridge could not decode the request: " .. tostring(request) })
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

  if success and type(result) == "table" and result.pending then
    local pend = result.pending
    if is_paused and not pend.allow_paused then
      -- endFrame does not fire while paused, so a parked request could never
      -- complete; fail now rather than leak the handler's callbacks.
      if pend.cancel then pcall(pend.cancel) end
      emu.log("[jeROMy] ← " .. method .. " refused: pending while paused")
      return json.encode({ id = id, error = method .. " needs frames to run and the emulator is paused; resume_emulator or step_frame first" })
    end
    pending_requests[id] = {
      method = method,
      frames = pend.frames or 1,
      complete = pend.complete,
      cancel = pend.cancel,
      started = frame_counter,
    }
    emu.log("[jeROMy] … " .. method .. " pending for " .. tostring(pend.frames or 1) .. " frame(s)")
    return nil
  end

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

  -- Line mode: a numeric pattern would block for the whole timeout waiting
  -- for 8192 bytes even when a complete request is already in; "*l" returns
  -- the moment a line arrives (paused requests went from 200 ms to ~0).
  -- A timeout hands back the partial line, which is consumed from the
  -- socket, so it is kept here until the rest arrives.
  local data, err, partial = conn:receive("*l")
  if data then
    recv_buffer = recv_buffer .. data .. "\n"
  elseif partial and #partial > 0 then
    recv_buffer = recv_buffer .. partial
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

      if response ~= nil then
        local send_ok, send_err = conn:send(response .. "\n")
        if not send_ok then
          drop_connection("Send error: " .. tostring(send_err))
          return
        end
      end
    end
  end

  -- Check for disconnect
  if err == "closed" then
    drop_connection("Disconnected from bridge server")
  end
end

-- Answer parked requests whose frames have elapsed. endFrame only.
local function tick_pending()
  if next(pending_requests) == nil then return end
  for id, p in pairs(pending_requests) do
    if p.started ~= frame_counter then p.frames = p.frames - 1 end
    local waited = frame_counter - p.started
    local response = nil
    if p.frames <= 0 then
      local ok, result = pcall(p.complete)
      if ok then
        emu.log("[jeROMy] ← " .. p.method .. " completed after " .. waited .. " frame(s)")
        response = json.encode({ id = id, result = result })
      else
        emu.log("[jeROMy] ← " .. p.method .. " FAILED on completion: " .. tostring(result))
        response = json.encode({ id = id, error = tostring(result) })
      end
      pending_requests[id] = nil
    elseif waited > MAX_PENDING_FRAMES then
      if p.cancel then pcall(p.cancel) end
      emu.log("[jeROMy] ← " .. p.method .. " cancelled: exceeded " .. MAX_PENDING_FRAMES .. " frames")
      response = json.encode({ id = id, error = p.method .. " did not complete within " .. MAX_PENDING_FRAMES .. " frames" })
      pending_requests[id] = nil
    end
    if response and conn then
      local send_ok, send_err = conn:send(response .. "\n")
      if not send_ok then
        drop_connection("Send error: " .. tostring(send_err))
        return
      end
    end
  end
end

---------------------------------------------------------------------------
-- Main: Connect to bridge server and register frame callback
---------------------------------------------------------------------------
local RECONNECT_INTERVAL = 120  -- frames between reconnect attempts (~2s at 60fps)

local function send_heartbeat()
  heartbeat_countdown = heartbeat_countdown - 1
  if heartbeat_countdown > 0 then return end
  heartbeat_countdown = HEARTBEAT_INTERVAL
  local ok, err = conn:send('{"heartbeat":true}\n')
  if not ok then drop_connection("Heartbeat send failed: " .. tostring(err)) end
end

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

local function on_end_frame()
  frame_counter = frame_counter + 1
  ring_seal_frame()
  -- External resume detection: if is_paused is true but step_active is
  -- false, the game is running freely — someone resumed via Mesen's UI.
  --
  -- When codeBreak calls emu.step(), it sets step_active = true. The
  -- step fires endFrame (for full-frame steps), then codeBreak fires and
  -- clears step_active. If endFrame fires WITHOUT step_active, it means
  -- the game is running on its own (external resume).
  --
  -- We clear step_active after checking so that if codeBreak doesn't
  -- re-set it (because the step was cancelled by external resume), the
  -- next endFrame detects it. This gives a 2-frame detection delay (~33ms).
  if is_paused then
    if not step_active then
      is_paused = false
      emu.log("[jeROMy] endFrame: detected external resume (Mesen UI)")
    end
    step_active = false  -- consumed; codeBreak will re-set if still paused
  end

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
    if conn then tick_pending() end
    if conn then send_heartbeat() end
  end
end
emu.addEventCallback(guarded("endFrame", on_end_frame), emu.eventType.endFrame)

-- On pause (codeBreak): blocking-receive TCP polling.
--
-- When the emulator breaks, this callback gets ONE chance to process
-- commands. We make the most of it by switching the socket to blocking
-- mode (200ms timeout) and looping up to 3 times (~600ms total).
-- This stays under Mesen's 1-second Lua watchdog, which only fires
-- between Lua VM instructions (not during C socket waits).
--
-- On each iteration we poll TCP (blocking up to 200ms), then check
-- the flags set by handlers. If step/resume is requested, we handle
-- it and return. If nothing arrives after 3 rounds, we try a best-
-- effort keep-alive (emu.step 1 instruction) and return.
local last_paused_connect_attempt = 0

local function on_code_break()
  if not conn then
    -- Paused and disconnected: endFrame never runs, so this is the only place
    -- a reconnect can happen. One bounded attempt (0.5 s connect timeout) at
    -- most once a second, then a keep-alive step so we are called again.
    if os.time() - last_paused_connect_attempt >= 1 then
      last_paused_connect_attempt = os.time()
      if try_connect() then
        emu.log("[jeROMy] codeBreak: reconnected while paused")
      end
    end
    if not conn then
      -- Throttle the retry loop: each keep-alive step re-enters this callback
      -- after one instruction, which would otherwise spin at CPU speed.
      pcall(socket.sleep, 0.2)
      step_active = true
      emu.step(1, emu.stepType.step)
      return
    end
  end

  -- Clear step_active from previous turn
  step_active = false

  -- Mark as paused
  if not is_paused then
    emu.log("[jeROMy] codeBreak: paused (external or Mesen UI)")
  end
  is_paused = true

  -- Switch to blocking mode for the duration of this callback
  conn:settimeout(POLL_TIMEOUT)
  local entered = os.clock()

  for round = 1, POLL_ROUNDS do
    -- Blocking poll — waits up to POLL_TIMEOUT seconds for data
    poll_connection()
    -- Never let one callback run near the 1 s watchdog, whatever the rounds
    -- and handlers cost: hand back to Mesen with a keep-alive step instead.
    if os.clock() - entered > 0.6 and conn then
      conn:settimeout(0)
      step_active = true
      emu.step(1, emu.stepType.step)
      return
    end
    if not conn then
      -- Dropped inside the poll. Keep the break alive so the next codeBreak
      -- can reconnect; without a step Mesen sits paused and nobody is called.
      step_active = true
      emu.step(1, emu.stepType.step)
      return
    end

    -- Resume? → callback returns → Mesen runs freely
    if pending_resume then
      emu.log("[jeROMy] codeBreak: resuming (round " .. round .. ")")
      pending_resume = false
      pending_steps = 0
      is_paused = false
      step_active = false
      conn:settimeout(0)  -- restore non-blocking
      emu.resume()
      return
    end

    -- Step? → queue 1 PPU frame, return → Mesen executes it, breaks again
    if pending_steps > 0 then
      pending_steps = pending_steps - 1
      emu.log("[jeROMy] codeBreak: stepping 1 frame, " .. pending_steps .. " remaining (round " .. round .. ")")
      step_active = true
      conn:settimeout(0)  -- restore non-blocking
      emu.step(1, emu.stepType.ppuFrame)
      return
    end
  end

  -- No commands after POLL_ROUNDS rounds. Restore non-blocking and
  -- try a best-effort keep-alive: step 1 instruction to maybe trigger
  -- another codeBreak. If Mesen's internal sleep loop blocks it, this
  -- codeBreak was our only chance — next command waits for an external
  -- resume event.
  conn:settimeout(0)
  step_active = true
  emu.step(1, emu.stepType.step)
end
emu.addEventCallback(guarded("codeBreak", on_code_break), emu.eventType.codeBreak)

-- Cleanup on script end
emu.addEventCallback(function()
  emu.log("[jeROMy] Script ending, closing connection")
  if conn then conn:close() end
end, emu.eventType.scriptEnded)
