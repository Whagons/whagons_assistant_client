export type EventHandler = (jsonString: string) => void;

class MultiplexWSManager {
  private ws: WebSocket | null = null;
  private urlBase: string;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private subscribed: Set<string> = new Set();
  private shouldReconnect = true;
  private reconnectTimer: number | undefined;
  private heartbeatTimer: number | undefined;
  private lastActivityAt = 0;

  constructor(urlBase: string) {
    this.urlBase = urlBase.startsWith("https") ? urlBase.replace("https", "wss") : urlBase.replace("http", "ws");
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const wsUrl = `${this.urlBase}/api/v1/chats/ws-all`;
    this.ws = new WebSocket(wsUrl);
    this.ws.onopen = () => {
      // Resubscribe any active ids
      if (this.subscribed.size > 0) {
        try {
          this.ws?.send(JSON.stringify({ type: "subscribe", conversation_ids: Array.from(this.subscribed) }));
        } catch {}
      }
      // Start heartbeat every 2s
      if (this.heartbeatTimer !== undefined) {
        clearInterval(this.heartbeatTimer);
      }
      this.heartbeatTimer = window.setInterval(() => {
        const now = Date.now();
        const inactiveMs = now - this.lastActivityAt;
        if (inactiveMs >= 2000) {
          try { this.ws?.send(JSON.stringify({ type: 'ping', ts: now })); } catch {}
        }
      }, 2000);
    };
    this.ws.onmessage = (evt) => {
      const data = evt.data as string;
      try {
        const parsed = JSON.parse(data);
        // Track any activity
        this.lastActivityAt = Date.now();
        // Broadcast pong/acks to all handlers that might care if needed in future
        if (parsed?.type === 'pong') {
          // No direct per-cid dispatch; consumers can attach a global listener later if needed
        }
        const cid = parsed?.conversation_id;
        if (!cid) return;
        const listeners = this.handlers.get(cid);
        if (!listeners || listeners.size === 0) return;
        for (const fn of listeners) {
          try { fn(JSON.stringify(parsed)); } catch {}
        }
      } catch {
        // Ignore malformed
      }
    };
    this.ws.onclose = () => {
      if (this.heartbeatTimer !== undefined) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
      }
      // Only reconnect if there are active subscriptions/listeners
      const hasDemand = this.subscribed.size > 0 || Array.from(this.handlers.values()).some(set => set.size > 0);
      if (this.shouldReconnect && hasDemand) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1500);
      }
    };
    this.ws.onerror = () => {
      try { this.ws?.close(); } catch {}
    };
  }

  subscribe(conversationId: string, handler: EventHandler): () => void {
    if (!conversationId) return () => {};
    this.connect();
    if (!this.handlers.has(conversationId)) {
      this.handlers.set(conversationId, new Set());
    }
    const set = this.handlers.get(conversationId)!;
    set.add(handler);
    if (!this.subscribed.has(conversationId)) {
      this.subscribed.add(conversationId);
      try {
        this.ws?.send(JSON.stringify({ type: "subscribe", conversation_id: conversationId }));
      } catch {}
    }
    return () => {
      const listeners = this.handlers.get(conversationId);
      if (!listeners) return;
      listeners.delete(handler);
      if (listeners.size === 0) {
        this.handlers.delete(conversationId);
        if (this.subscribed.has(conversationId)) {
          this.subscribed.delete(conversationId);
          try { this.ws?.send(JSON.stringify({ type: "unsubscribe", conversation_id: conversationId })); } catch {}
        }
        // If no more demand, close the socket to avoid keeping it open
        const hasDemand = this.subscribed.size > 0 || Array.from(this.handlers.values()).some(set => set.size > 0);
        if (!hasDemand && this.ws) {
          try { this.ws.close(); } catch {}
        }
      }
    };
  }
}

// Singleton instance; import HOST dynamically in consumer to avoid circular env usage in tests
export function createWSManager(host: string) {
  return new MultiplexWSManager(host);
}


