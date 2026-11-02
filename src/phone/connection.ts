import {
  REMOTE_WS_PATH,
  type RemoteCommand,
  type RemoteState,
  type ToPhone,
} from '../remote/protocol';

const TOKEN_KEY = 'roomDefense.phoneToken';

function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // without storage the phone just asks for the code again next time
  }
}

export type ConnectionStatus =
  | { kind: 'need-code'; error?: string }
  | { kind: 'connecting' }
  | { kind: 'waiting-for-pc' }
  | { kind: 'connected' };

/** Phone side of the link: pairs, reconnects, and passes state and commands. */
export class Connection {
  status: ConnectionStatus = { kind: 'connecting' };
  onStatus: (s: ConnectionStatus) => void = () => {};
  onState: (s: RemoteState) => void = () => {};

  private ws: WebSocket | null = null;
  private token = loadToken();
  private code: string | null = null;
  private retry: number | null = null;

  start(codeFromLink: string | null): void {
    if (codeFromLink) this.code = codeFromLink;
    if (!this.code && !this.token) return this.setStatus({ kind: 'need-code' });
    this.open();
  }

  pairWithCode(code: string): void {
    this.code = code.replace(/\D/g, '');
    this.token = null;
    this.open();
  }

  send(cmd: RemoteCommand): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status.kind === 'connected') {
      this.ws.send(JSON.stringify({ type: 'cmd', cmd }));
    }
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s;
    this.onStatus(s);
  }

  private open(): void {
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.ws?.close();
    this.setStatus({ kind: 'connecting' });
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}${REMOTE_WS_PATH}`);
    this.ws = ws;
    let rejected = false;

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          type: 'pair',
          token: this.token ?? undefined,
          code: this.code ?? undefined,
        }),
      );
    });
    ws.addEventListener('message', (e) => {
      let msg: ToPhone;
      try {
        msg = JSON.parse(String(e.data)) as ToPhone;
      } catch {
        return;
      }
      if (msg.type === 'paired') {
        this.token = msg.token;
        this.code = null;
        saveToken(msg.token);
        this.setStatus({ kind: 'waiting-for-pc' });
      } else if (msg.type === 'state') {
        if (this.status.kind !== 'connected') this.setStatus({ kind: 'connected' });
        this.onState(msg.state);
      } else if (msg.type === 'no-host') {
        this.setStatus({ kind: 'waiting-for-pc' });
      } else if (msg.type === 'error') {
        rejected = true;
        this.token = null;
        this.code = null;
        saveToken(null);
        this.setStatus({ kind: 'need-code', error: msg.message });
      }
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (rejected || this.status.kind === 'need-code') return;
      // The game was closed or Wi-Fi dropped: keep trying with the saved token.
      this.setStatus({ kind: 'connecting' });
      this.retry = window.setTimeout(() => this.open(), 2000);
    });
  }
}
