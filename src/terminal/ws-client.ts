export class WsClient {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private onDataCallback: ((data: string) => void) | null = null;
  private onOpenCallback: (() => void) | null = null;
  private onCloseCallback: (() => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  public connect(
    queryParams: { mode?: string; session?: string } = {},
    onOpen?: () => void,
    onData?: (data: string) => void,
    onClose?: () => void
  ) {
    if (onOpen) this.onOpenCallback = onOpen;
    if (onData) this.onDataCallback = onData;
    if (onClose) this.onCloseCallback = onClose;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    const url = new URL(this.baseUrl);
    if (queryParams.mode) url.searchParams.set('mode', queryParams.mode);
    if (queryParams.session) url.searchParams.set('session', queryParams.session);

    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      this.onOpenCallback?.();
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.onDataCallback?.(event.data);
      } else if (event.data instanceof Blob) {
        event.data.text().then((text) => this.onDataCallback?.(text));
      }
    };

    this.ws.onclose = () => {
      this.onCloseCallback?.();
    };

    this.ws.onerror = (err) => {
      console.error('[WsClient] Connection error:', err);
    };
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public send(data: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  public sendResize(cols: number, rows: number) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
