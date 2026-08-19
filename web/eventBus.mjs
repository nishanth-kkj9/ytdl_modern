/**
 * eventBus.mjs — lightweight pub/sub event bus.
 *
 * Decouples producers (engine manager, services) from consumers
 * (WebSocket broadcaster, loggers, metrics). Adding a new consumer is just
 * one `subscribe` call — no changes to producers needed.
 */
export class EventBus {
  constructor() {
    this.subscribers = new Map();
  }

  /**
   * Subscribe to an event type.
   * @param {string} type Event type name (or "*" for all)
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe function
   */
  subscribe(type, handler) {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    this.subscribers.get(type).add(handler);
    return () => this.subscribers.get(type)?.delete(handler);
  }

  /**
   * Publish an event to all matching subscribers.
   * @param {string} type
   * @param {any} payload
   */
  emit(type, payload) {
    const wildcard = this.subscribers.get("*");
    if (wildcard) {
      for (const fn of wildcard) {
        try {
          fn({ type, payload });
        } catch (err) {
          console.error("[eventBus] wildcard handler error:", err);
        }
      }
    }
    const specific = this.subscribers.get(type);
    if (specific) {
      for (const fn of specific) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[eventBus] handler error for ${type}:`, err);
        }
      }
    }
  }
}
