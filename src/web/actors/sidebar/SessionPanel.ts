/**
 * SessionPanel — manages the session list UI in the sidebar.
 *
 * Plain vanilla JS class (same pattern as EmulatorSidebar).
 * Renders the session list, handles switch/new/fork/delete actions,
 * and receives updates from the GatewayActor.
 */

import type { GatewayActor } from "../gateway/GatewayActor.js";

// -- Types (match server's SessionSummary shape) ----------------------------

interface SessionInfo {
  id: string;
  name: string;
  parent_id: string | null;
  event_count: number;
  created_at: string;
  updated_at: string;
}

// -- SessionPanel -----------------------------------------------------------

export class SessionPanel {
  private el: HTMLElement;
  private listEl: HTMLElement;
  private forkBtn: HTMLButtonElement;
  private deleteBtn: HTMLButtonElement;
  private gateway: GatewayActor | null = null;
  private sessions: SessionInfo[] = [];
  private activeSessionId: string | null = null;

  constructor(el: HTMLElement) {
    this.el = el;
    this.listEl = el.querySelector(".session-list")!;
    this.forkBtn = el.querySelector('[data-session-action="fork"]') as HTMLButtonElement;
    this.deleteBtn = el.querySelector('[data-session-action="delete"]') as HTMLButtonElement;

    // Disable action buttons until we have an active session
    this.forkBtn.disabled = true;
    this.deleteBtn.disabled = true;

    // Event delegation for all clicks within the panel
    el.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;

      // Check for button actions first
      const actionEl = target.closest("[data-session-action]") as HTMLElement | null;
      if (actionEl) {
        const action = actionEl.getAttribute("data-session-action");
        this.handleAction(action!);
        return;
      }

      // Check for session entry click (switch)
      const entry = target.closest("[data-session-id]") as HTMLElement | null;
      if (entry) {
        const id = entry.getAttribute("data-session-id")!;
        if (id !== this.activeSessionId) {
          this.gateway?.switchToSession(id);
        }
      }
    });
  }

  /** Wire up the gateway for sending session commands. */
  setGateway(gw: GatewayActor): void {
    this.gateway = gw;
  }

  /** Render the session list and update the active indicator. */
  renderSessions(sessions: SessionInfo[], activeId: string | null): void {
    this.sessions = sessions;
    this.activeSessionId = activeId;

    // Enable/disable action buttons
    this.forkBtn.disabled = !activeId;
    this.deleteBtn.disabled = !activeId;

    if (sessions.length === 0) {
      this.listEl.innerHTML =
        '<div style="color:#666; font-size:12px; padding:4px">No sessions yet</div>';
      return;
    }

    // Sort by updated_at descending (most recent first)
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    this.listEl.innerHTML = sorted
      .map((s) => {
        const isActive = s.id === activeId;
        const timeAgo = this.formatTimeAgo(s.updated_at);
        return `<div class="session-entry${isActive ? " active" : ""}" data-session-id="${s.id}">
          <div class="session-name">
            ${isActive ? '<span class="session-dot"></span>' : ""}
            <span class="session-title">${this.escapeHtml(s.name)}</span>
            <span class="session-count">${s.event_count}</span>
          </div>
          <div class="session-meta">${timeAgo}${s.parent_id ? " &middot; forked" : ""}</div>
        </div>`;
      })
      .join("");
  }

  // -- Action Handlers ------------------------------------------------------

  private handleAction(action: string): void {
    if (!this.gateway) return;

    switch (action) {
      case "new":
        this.gateway.createSession("New Session");
        break;

      case "fork": {
        if (!this.activeSessionId) return;
        const active = this.sessions.find((s) => s.id === this.activeSessionId);
        if (active) {
          this.gateway.forkCurrentSession(
            "Fork of " + active.name,
            active.event_count
          );
        }
        break;
      }

      case "delete":
        if (this.activeSessionId && confirm("Delete this session?")) {
          this.gateway.deleteSession(this.activeSessionId);
        }
        break;
    }
  }

  // -- Helpers --------------------------------------------------------------

  private formatTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  private escapeHtml(text: string): string {
    const el = document.createElement("span");
    el.textContent = text;
    return el.innerHTML;
  }
}
