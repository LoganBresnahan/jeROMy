/**
 * Host-agnostic shapes the core tools speak (ADR-0005). The dsh adapter maps
 * these onto the harness's own types; nothing here may import a host.
 */

/** A tool as offered to the model: name, description, JSON-schema input. */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image";
  media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  data: string; // base64
}

/** Content a tool result can carry back to the model. */
export type ContentBlock = TextBlock | ImageBlock;

/** A decoded image kept by the host for follow-up tools (e.g. extract_sprite). */
export interface StoredImage {
  data: Buffer;
  width: number;
  height: number;
}
