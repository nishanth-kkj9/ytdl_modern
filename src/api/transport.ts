/**
 * transport.ts — web transport layer for the local-hosted website.
 *
 * Sends commands to the Node.js backend via REST (`fetch`) and receives live
 * engine events via a native `WebSocket` connection.
 *
 * To add a new backend command, add an endpoint in web/routes/* and a case in
 * the `invoke` switch below. No component changes needed.
 */

/** Unsubscribe function returned by listen(). */
export type UnlistenFn = () => void;

// ── WebSocket event bus state ────────────────────────────────────────────────
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
// Tracks whether the socket has ever opened, so `onopen` can distinguish the
// first connect from a reconnect (reconnects trigger state reconciliation).
let everConnected = false;
const eventHandlers = new Map<string, Set<(payload: any) => void>>();
const reconnectHandlers = new Set<() => void>();

function ensureWebSocket() {
  if (ws) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    reconnectAttempts = 0;
    if (everConnected) {
      // Reconnect (not first connect): a WS drop may have swallowed terminal
      // download events (result/error/cancelled). Subscribers use this hook
      // to reconcile queue state against the server.
      for (const fn of [...reconnectHandlers]) {
        try {
          fn();
        } catch (err) {
          console.error("[transport] reconnect handler error:", err);
        }
      }
    }
    everConnected = true;
  };
  ws.onmessage = (msg) => {
    let data: any;
    try {
      data = JSON.parse(msg.data);
    } catch {
      return;
    }
    const type = data?.type;
    if (!type) return;
    // "engine-event" is a wildcard — every engine event routes through it,
    // mirroring the Tauri `emit("engine-event", ...)` contract.
    for (const key of new Set([type, "engine-event"])) {
      const handlers = eventHandlers.get(key);
      if (!handlers) continue;
      for (const fn of handlers) {
        try {
          fn(data);
        } catch (err) {
          console.error(`[transport] handler error for ${key}:`, err);
        }
      }
    }
  };
  ws.onclose = () => {
    ws = null;
    // Reconnect with exponential backoff (1.5s → capped at 30s) so a dead
    // server doesn't trigger an infinite rapid-fire reconnect loop.
    const delay = Math.min(1500 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;
    setTimeout(ensureWebSocket, delay);
  };
}

async function webFetch(url: string, method: string, body?: unknown, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed: ${res.status}`);
    }
    const data = await res.json().catch((e) => {
      console.error("Fetch parse error:", e);
      return {};
    });
    if (data && data.error) throw new Error(data.error);
    return data;
  } catch (e: any) {
    if (e?.name === "AbortError")
      throw new Error(`Request timed out: ${method} ${url}`, { cause: e });
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ── Unified invoke (maps Tauri-style commands to REST endpoints) ────────────
export async function invoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
  const base = "";
  switch (command) {
    case "probe_url":
      return webFetch(`${base}/api/probe`, "POST", { url: args?.url });
    case "start_download":
      return webFetch(`${base}/api/download`, "POST", {
        url: args?.url,
        format: args?.format,
        quality: args?.quality,
        mode: args?.mode,
        id: args?.id,
        title: args?.title,
        uploader: args?.uploader,
        description: args?.description,
        thumbnail: args?.thumbnail,
        duration: args?.duration,
        webpage_url: args?.webpage_url,
      });
    case "cancel_download":
      return webFetch(`${base}/api/download/cancel`, "POST", { id: args?.id });
    case "restart_engine":
      return webFetch(`${base}/api/engine/restart`, "POST", {});
    case "get_download_dir":
      return webFetch(`${base}/api/status`, "GET").then((s) => s.downloadDir);
    case "get_active_jobs":
      // Snapshot of active download jobs [{ id, status }] — used on WS
      // reconnect to reconcile queue items that missed terminal events.
      return webFetch(`${base}/api/status`, "GET").then((s) => s.activeJobs ?? []);
    case "save_history":
      return webFetch(`${base}/api/history`, "POST", args?.record);
    case "load_history":
      return webFetch(`${base}/api/history`, "GET");
    case "clear_history":
      return webFetch(`${base}/api/history`, "DELETE");
    default:
      throw new Error(`Unknown command in web mode: ${command}`);
  }
}

// ── Unified listen (WebSocket events) ───────────────────────────────────────
export async function listen(event: string, handler: (payload: any) => void): Promise<UnlistenFn> {
  ensureWebSocket();
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set());
  }
  eventHandlers.get(event)!.add(handler);
  return () => {
    eventHandlers.get(event)?.delete(handler);
  };
}

// Fires after a WebSocket RE-connect (not the initial connect), so consumers
// can reconcile state that may have drifted while the connection was down.
export function onReconnect(handler: () => void): UnlistenFn {
  ensureWebSocket();
  reconnectHandlers.add(handler);
  return () => {
    reconnectHandlers.delete(handler);
  };
}

// ── File helpers (browser equivalents) ──────────────────────────────────────
export async function openPath(path: string): Promise<void> {
  // Open the download URL in a new tab.
  const downloadUrl = `/downloads/${encodeURIComponent(path.split(/[\\/]/).pop() || "")}`;
  window.open(downloadUrl, "_blank");
  return undefined as any;
}
