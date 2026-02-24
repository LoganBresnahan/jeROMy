/**
 * jeROMy — Chat Entry Point
 *
 * Bootstraps the actor system, connects the WebSocket, and wires up all
 * rendering actors for the chat panel and emulator sidebar.
 */

import { EventStateManager } from './state/index.js';
import { VirtualListActor } from './actors/virtual-list/VirtualListActor.js';
import { GatewayActor } from './actors/gateway/GatewayActor.js';
import { InputAreaActor } from './actors/input-area/InputAreaActor.js';
import { ScrollActor } from './actors/scroll/ScrollActor.js';
import { EmulatorSidebar } from './actors/sidebar/EmulatorSidebar.js';
import { SessionPanel } from './actors/sidebar/SessionPanel.js';

// -- Bootstrap ----------------------------------------------------------------

const manager = new EventStateManager();

// -- Sidebar (vanilla JS, not actor-based) ------------------------------------

const sidebarEl = document.querySelector<HTMLElement>('.sidebar')!;
const sidebar = new EmulatorSidebar(sidebarEl);

// -- Session Panel (vanilla JS, sidebar) --------------------------------------

const sessionsPanelEl = document.querySelector<HTMLElement>('#sessionsPanel')!;
const sessionPanel = new SessionPanel(sessionsPanelEl);

// -- Virtual List (chat turns) ------------------------------------------------

const chatScrollEl = document.querySelector<HTMLElement>('.chat-scroll')!;
const virtualList = new VirtualListActor(manager, chatScrollEl);

// -- Gateway (WebSocket + interleaving coordinator) ---------------------------

const gatewayEl = document.createElement('div');
gatewayEl.id = 'gateway';
gatewayEl.style.display = 'none';
document.body.appendChild(gatewayEl);

const gateway = new GatewayActor({
  manager,
  element: gatewayEl,
  virtualList,
  sidebar,
});

// Wire sidebar → gateway
sidebar.setGateway(gateway);

// Wire session panel ↔ gateway
sessionPanel.setGateway(gateway);
gateway.setSessionPanel(sessionPanel);

// -- Input Area (chat input + attachment preview) -----------------------------

const inputAreaEl = document.querySelector<HTMLElement>('.chat-input-area')!;
const inputArea = new InputAreaActor({
  manager,
  element: inputAreaEl,
  gateway,
});

// Wire sidebar → inputArea (for Attach button)
sidebar.setInputArea(inputArea);

// -- Scroll Actor (auto-scroll during streaming) -----------------------------

const _scrollActor = new ScrollActor({
  manager,
  element: chatScrollEl,
});

// -- Connection Status (gateway.connected → sidebar status indicators) --------

// The gateway publishes 'gateway.connected'; we listen for it to update sidebar.
// Since EmulatorSidebar is not an actor, we use a lightweight state-changed
// listener on the gateway element.
gatewayEl.addEventListener('state-changed', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail?.changedKeys?.includes('gateway.connected')) {
    sidebar.setConnected(detail.state['gateway.connected'] as boolean);
  }
});

// -- Connect ------------------------------------------------------------------

gateway.connect(`ws://${location.host}`);

console.log('[jeROMy] Actor system initialized', {
  actorCount: manager.getActorCount(),
});
