/**
 * One mapping from the host-agnostic tool registry (src/agent/tools.ts) onto
 * dsh ToolDefinitions (ADR-0005). Core specs already carry a name, a
 * model-facing description and a JSON-schema `input_schema`; dsh accepts raw
 * JSON-schema definitions through `ctx.tools.register`, so nothing is
 * re-declared by hand. Core results are text or mixed text+image; images go
 * through `ctx.attachments` so the session log holds a durable reference and
 * the model sees an image block (ADR-0003: model-visible means logged).
 */
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { AttachmentId, type AttachmentStore, type ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import { agentTools, executeTool, type ToolResult } from "../../agent/tools.js";
import type { MesenAdapter } from "../../bridge/mesen/adapter.js";
import type { Disassembler } from "../../agent/disassembler.js";
import type { EditLedger } from "../../agent/edit-ledger.js";
import type { GameMapping } from "../../mappings/types.js";

export interface CoreToolDeps {
  mesen: () => MesenAdapter;
  attachments: () => AttachmentStore | undefined;
  /** Wait for the Lua client; resolves false on timeout. */
  waitForConnection: (timeoutMs: number, signal?: AbortSignal) => Promise<boolean>;
  disassembler: () => Disassembler | null;
  mapping: () => GameMapping | null;
  /** The loaded ROM's edit ledger, or null before the bridge has identified a ROM (ADR-0009). */
  ledger?: () => EditLedger | null;
  /** Called after a successful call so the service can track emulator state. */
  onResult?: (name: string, result: ToolResult) => void;
}

/**
 * How long a tool waits for the bridge before failing. The Lua side retries
 * every ~2 s once it notices a disconnect, and a previous dsh process can take
 * several seconds to release the socket on shutdown, so 15 s covers a
 * back-to-back headless run (seen 2026-10-05).
 */
export const BRIDGE_WAIT_MS = 15_000;

/**
 * Core tools not registered in dsh yet. `extract_sprite` reads user-uploaded
 * images from the v0.1 server's per-session image store; in dsh those arrive
 * as image attachments on the user message, which needs its own adapter.
 * Carry-in on roadmap item 4.
 */
export const UNSUPPORTED_CORE_TOOLS: ReadonlySet<string> = new Set(["extract_sprite"]);

/** Canonical value every mapped core tool returns. */
export interface CoreToolValue {
  text: string;
  images: Array<{
    attachmentId: string;
    mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
    bytes: number;
    width: number;
    height: number;
  }>;
}

const IMAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["attachmentId", "mediaType", "bytes", "width", "height"],
  properties: {
    attachmentId: { type: "string" },
    mediaType: { type: "string", enum: ["image/png", "image/jpeg", "image/gif", "image/webp"] },
    bytes: { type: "integer" },
    width: { type: "integer" },
    height: { type: "integer" },
  },
} as const;

/** Raw JSON Schema (not a defineTool spec): raw ToolDefinitions carry real JSON Schema. */
export const CORE_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "images"],
  properties: {
    text: { type: "string" },
    images: { type: "array", items: IMAGE_SCHEMA },
  },
} as const;

export function imageRef(image: CoreToolValue["images"][number]): ImageAttachmentRef {
  return {
    attachmentId: AttachmentId(image.attachmentId),
    mediaType: image.mediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
  };
}

export function renderCoreValue(value: CoreToolValue): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (value.text.length > 0) blocks.push({ type: "text", text: value.text });
  for (const image of value.images) blocks.push({ type: "image", attachment: imageRef(image) });
  if (blocks.length === 0) blocks.push({ type: "text", text: "(no output)" });
  return blocks;
}

/** Turn a core ToolResult into the canonical value, persisting any images. */
export async function coreResultToValue(
  result: ToolResult,
  attachments: AttachmentStore | undefined,
  name: string,
): Promise<CoreToolValue> {
  if (result.type === "text") return { text: result.text, images: [] };
  const texts: string[] = [];
  const images: CoreToolValue["images"] = [];
  for (const block of result.content) {
    if (block.type === "text") {
      texts.push(block.text);
    } else if (block.type === "image") {
      if (!block.data) {
        throw new Error(`${name}: the emulator returned no image data (is it paused? call resume_emulator or step_frame)`);
      }
      if (attachments === undefined) throw new Error(`${name}: no attachment service is mounted; cannot return an image`);
      const ref = await attachments.saveImage({
        data: new Uint8Array(Buffer.from(block.data, "base64")),
        mediaType: block.media_type,
        name: `${name}.${block.media_type.split("/")[1]}`,
      });
      images.push({
        attachmentId: ref.attachmentId as unknown as string,
        mediaType: block.media_type,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
      });
    }
  }
  return { text: texts.join("\n"), images };
}

/** Build dsh ToolDefinitions for every supported core tool. */
export function makeCoreTools(deps: CoreToolDeps): ToolDefinition[] {
  return agentTools
    .filter((spec) => !UNSUPPORTED_CORE_TOOLS.has(spec.name))
    .map((spec): ToolDefinition => ({
      name: spec.name,
      description: spec.description,
      parameters: spec.input_schema as unknown as Record<string, unknown>,
      output: {
        schema: CORE_VALUE_SCHEMA as unknown as ToolDefinition["output"]["schema"],
        render: (_args, value) => renderCoreValue(value as unknown as CoreToolValue),
      },
      async execute(args: unknown, exec: ToolRunContext): Promise<CoreToolValue> {
        const adapter = deps.mesen();
        // Always wait: the service also uses this to finish identifying the
        // ROM after the connect edge, which the ledger tools depend on.
        if (!(await deps.waitForConnection(BRIDGE_WAIT_MS, exec.signal))) {
          throw new Error("Mesen bridge is not connected. Load mesen/bridge.lua in Mesen2's Script Window (or run scripts/mesen-up.sh).");
        }
        const result = await executeTool(
          spec.name,
          (args ?? {}) as Record<string, unknown>,
          adapter,
          deps.disassembler(),
          deps.mapping(),
          null,
          deps.ledger?.() ?? null,
        );
        deps.onResult?.(spec.name, result);
        return coreResultToValue(result, deps.attachments(), spec.name);
      },
    }));
}
