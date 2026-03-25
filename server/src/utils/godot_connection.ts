import WebSocket from 'ws';

export interface GodotResponse {
  status: 'success' | 'error';
  result?: any;
  message?: string;
  commandId?: string;
}

export interface GodotCommand {
  type: string;
  params: Record<string, any>;
  commandId: string;
}

export class GodotConnection {
  private ws: WebSocket | null = null;
  private connected = false;
  private commandQueue: Map<string, { 
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private commandId = 0;

  constructor(
    private url: string = 'ws://localhost:9080',
    private commandTimeout: number = 30000,
    private connectTimeout: number = 5000,
  ) {}

  async connect(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;
    this.cleanup();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cleanup();
        reject(new Error('Connection timeout — is the Godot MCP plugin enabled?'));
      }, this.connectTimeout);

      this.ws = new WebSocket(this.url, {
        protocol: 'json',
        handshakeTimeout: this.connectTimeout,
        perMessageDeflate: false,
      });

      this.ws.on('open', () => {
        clearTimeout(timer);
        this.connected = true;
        console.error('Connected to Godot WebSocket server');
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const response: GodotResponse = JSON.parse(data.toString());
          if (response.commandId) {
            const pending = this.commandQueue.get(response.commandId);
            if (pending) {
              clearTimeout(pending.timeout);
              this.commandQueue.delete(response.commandId);
              if (response.status === 'success') {
                pending.resolve(response.result);
              } else {
                pending.reject(new Error(response.message || 'Unknown error'));
              }
            }
          }
        } catch (error) {
          console.error('Error parsing response:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      this.ws.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.rejectPending('Connection lost');
        if (wasConnected) {
          console.error('Disconnected from Godot — will reconnect on next command');
        }
      });
    });
  }

  async sendCommand<T = any>(type: string, params: Record<string, any> = {}): Promise<T> {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return new Promise<T>((resolve, reject) => {
      const id = `cmd_${this.commandId++}`;

      const timeoutId = setTimeout(() => {
        this.commandQueue.delete(id);
        reject(new Error(`Command timed out: ${type}`));
      }, this.commandTimeout);

      this.commandQueue.set(id, { resolve, reject, timeout: timeoutId });

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type, params, commandId: id }));
      } else {
        clearTimeout(timeoutId);
        this.commandQueue.delete(id);
        reject(new Error('WebSocket not connected'));
      }
    });
  }

  disconnect(): void {
    this.cleanup();
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  private cleanup(): void {
    this.rejectPending('Connection closed');
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
    this.connected = false;
  }

  private rejectPending(reason: string): void {
    this.commandQueue.forEach((cmd, id) => {
      clearTimeout(cmd.timeout);
      cmd.reject(new Error(reason));
    });
    this.commandQueue.clear();
  }
}

let connectionInstance: GodotConnection | null = null;

export function getGodotConnection(): GodotConnection {
  if (!connectionInstance) {
    connectionInstance = new GodotConnection();
  }
  return connectionInstance;
}
