/**
 * The session's click history (ADR-0015). A click in the emulator view no
 * longer reaches the model by itself: it becomes a record here, checked by
 * default when it is the newest of its selection mode, and the checked
 * records ride along with the person's next prompt (index.ts hands them to
 * the agent at `agent/pre-step`). In-memory only: it lives as long as the
 * plugin process and is never persisted; dsh's session log is the record of
 * what actually reached the model (ADR-0003).
 */
import type { RegionMode, RegionRun } from "../agent/region.js";
import type { ScreenBox } from "../agent/tile-lookup.js";

export interface ClickOverlay {
  box: ScreenBox;
  sprite_box?: ScreenBox;
  runs?: RegionRun[];
}

export interface ClickRecord {
  id: number;
  mode: RegionMode;
  x: number;
  y: number;
  /** ISO time of the click. */
  at: string;
  /** Short line for the history list. */
  label: string;
  /** The full context line the model receives when this record is sent. */
  text: string;
  /** Whether it goes with the next prompt. */
  selected: boolean;
  /** The turn it was sent with, once sent. */
  sent_turn?: number;
  overlay: ClickOverlay;
}

/** Records kept per mode; older unselected ones fall off. */
export const HISTORY_CAP = 40;

export class ClickHistory {
  /** Bumps on every change so the view can refetch only when needed. */
  rev = 0;
  private seq = 0;
  private records: ClickRecord[] = [];

  /** Newest first. */
  list(): ClickRecord[] {
    return [...this.records].reverse();
  }

  get(id: number): ClickRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  /**
   * Add a click. The newest click of a mode is the one checked by default,
   * so the previous unsent click of the same mode is unchecked; other modes
   * are untouched (one checked click per mode is the default send).
   */
  add(input: Omit<ClickRecord, "id" | "at" | "selected" | "sent_turn">): ClickRecord {
    for (const r of this.records) if (r.mode === input.mode && r.selected) r.selected = false;
    const record: ClickRecord = { ...input, id: ++this.seq, at: new Date().toISOString(), selected: true };
    this.records.push(record);
    if (this.records.length > HISTORY_CAP) {
      const victim = this.records.findIndex((r) => !r.selected);
      this.records.splice(victim >= 0 ? victim : 0, 1);
    }
    this.rev++;
    return record;
  }

  setSelected(id: number, selected: boolean): boolean {
    const r = this.get(id);
    if (!r) return false;
    if (r.selected !== selected) { r.selected = selected; this.rev++; }
    return true;
  }

  /** The checked records, oldest first, now marked as sent with `turn` and unchecked. */
  takeSelected(turn: number): ClickRecord[] {
    const taken = this.records.filter((r) => r.selected);
    for (const r of taken) { r.selected = false; r.sent_turn = turn; }
    if (taken.length) this.rev++;
    return taken;
  }

  selectedCount(): number {
    return this.records.filter((r) => r.selected).length;
  }

  clear(): void {
    if (this.records.length) { this.records = []; this.rev++; }
  }
}
