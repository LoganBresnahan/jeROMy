import { describe, it, expect, vi } from "vitest";
import { agentTools } from "../../agent/tools.js";

// The dsh packages are symlinked from the harness checkout by scripts/link-dsh.sh;
// without them this suite cannot load the mapper and is skipped, not failed.
const linked = await import("@deepseek-ai/dsh-tools").then(() => true, () => false);

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

function deps(overrides: Record<string, unknown> = {}) {
  const adapter = {
    isConnected: true,
    screenshot: vi.fn().mockResolvedValue({ png_base64: PNG_1x1, paused: false }),
    getPalette: vi.fn().mockResolvedValue({ palette_id: 1, colors: [15, 54, 23, 15] }),
    pauseEmulator: vi.fn().mockResolvedValue({ paused: true }),
  } as any;
  const saveImage = vi.fn().mockResolvedValue({
    attachmentId: "att-1", mediaType: "image/png", bytes: 70, width: 1, height: 1,
  });
  return {
    adapter,
    saveImage,
    deps: {
      mesen: () => adapter,
      attachments: () => ({ saveImage }) as any,
      waitForConnection: vi.fn().mockResolvedValue(true),
      disassembler: () => null,
      mapping: () => null,
      ...overrides,
    },
  };
}

const exec = { signal: new AbortController().signal } as any;

describe.skipIf(!linked)("makeCoreTools (ADR-0005 mapper)", async () => {
  const { makeCoreTools, UNSUPPORTED_CORE_TOOLS, renderCoreValue, BRIDGE_WAIT_MS } = await import("./core-tools.js");

  it("registers every core tool except the unsupported set, with the core JSON schema", () => {
    const tools = makeCoreTools(deps().deps);
    const names = tools.map((t) => t.name).sort();
    const expected = agentTools.map((t) => t.name).filter((n) => !UNSUPPORTED_CORE_TOOLS.has(n)).sort();
    expect(names).toEqual(expected);
    const shot = tools.find((t) => t.name === "get_palette")!;
    expect(shot.parameters).toEqual(agentTools.find((t) => t.name === "get_palette")!.input_schema);
  });

  it("text tools return {text, images: []} and render one text block", async () => {
    const d = deps();
    const tool = makeCoreTools(d.deps).find((t) => t.name === "get_palette")!;
    const value = (await tool.execute({ palette_id: 1 }, exec)) as any;
    expect(value.images).toEqual([]);
    expect(JSON.parse(value.text)).toMatchObject({ palette_id: 1 });
    expect(renderCoreValue(value)).toEqual([{ type: "text", text: value.text }]);
  });

  it("screenshot persists the PNG as an attachment and renders an image block", async () => {
    const d = deps();
    const tool = makeCoreTools(d.deps).find((t) => t.name === "screenshot")!;
    const value = (await tool.execute({}, exec)) as any;
    expect(d.saveImage).toHaveBeenCalledOnce();
    expect(d.saveImage.mock.calls[0][0].mediaType).toBe("image/png");
    expect(value.images).toHaveLength(1);
    const blocks = renderCoreValue(value);
    expect(blocks.at(-1)).toMatchObject({ type: "image", attachment: { attachmentId: "att-1", width: 1 } });
  });

  it("an empty screenshot (paused emulator) throws instead of storing an empty image", async () => {
    const d = deps();
    d.adapter.screenshot.mockResolvedValue({ png_base64: "", paused: true });
    const tool = makeCoreTools(d.deps).find((t) => t.name === "screenshot")!;
    await expect(tool.execute({}, exec)).rejects.toThrow(/paused/);
    expect(d.saveImage).not.toHaveBeenCalled();
  });

  it("waits for the bridge when disconnected and fails with a hint on timeout", async () => {
    const d = deps({ waitForConnection: vi.fn().mockResolvedValue(false) });
    d.adapter.isConnected = false;
    const tool = makeCoreTools(d.deps).find((t) => t.name === "get_palette")!;
    await expect(tool.execute({ palette_id: 1 }, exec)).rejects.toThrow(/bridge.lua/);
    expect(d.deps.waitForConnection).toHaveBeenCalledWith(BRIDGE_WAIT_MS, exec.signal);
  });

  it("reports results to onResult so the service can track pause state", async () => {
    const onResult = vi.fn();
    const d = deps({ onResult });
    const tool = makeCoreTools(d.deps).find((t) => t.name === "pause_emulator")!;
    await tool.execute({}, exec);
    expect(onResult).toHaveBeenCalledWith("pause_emulator", expect.objectContaining({ type: "text" }));
  });
});
