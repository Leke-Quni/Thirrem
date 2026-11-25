import type { SandboxLiveCloseCode, SandboxLiveMessage, SimulatedDriver } from '@thirrem/types';

const FIRST_WAIT_MS = 1_000;
const LONGEST_WAIT_MS = 10_000;
const REOPEN_WAIT_MS = 2_000;
const STOPPED_RECHECK_MS = 60_000;
const UNKNOWN_SESSION: SandboxLiveCloseCode = 4401;
const NO_SANDBOX: SandboxLiveCloseCode = 4404;
const STOPPED: SandboxLiveCloseCode = 4410;

export interface LiveSocket {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  send(message: string): void;
  close(): void;
}

interface Watch {
  token: string;
  connect(): LiveSocket;
  onDrivers(drivers: SimulatedDriver[]): void;
  /** The connection dropped and is being restored. */
  onLost(): void;
  /** The feed cannot go on: the server has no Sandbox for this session, or does not accept the session. */
  onGone(): void;
  /** The Sandbox stopped for lack of activity, and stays so until opened again. */
  onStopped(): void;
  /** The stopped Sandbox is no longer there to come back to. */
  onDiscarded(): void;
}

// The browser's handlers are typed with their events, which are more than a LiveSocket needs to promise.
export const browserSocket = (url: string) => new WebSocket(url) as unknown as LiveSocket;

export function liveUrl(apiBaseUrl: string, pageUrl: string): string {
  const url = new URL('/rider/live', apiBaseUrl || pageUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

/** Follows the Sandbox's Drivers, reconnecting as needed, until the returned function is called. */
export function watchDrivers({ token, connect, onDrivers, onLost, onGone, onStopped, onDiscarded }: Watch): () => void {
  let socket: LiveSocket;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wait = FIRST_WAIT_MS;
  let stopped = false;
  let timedOut = false;

  const open = () => {
    socket = connect();
    socket.onopen = () => socket.send(JSON.stringify({ event: 'watch', data: { token } }));
    socket.onmessage = ({ data }) => {
      if (stopped) return;
      wait = FIRST_WAIT_MS;
      timedOut = false;
      onDrivers((JSON.parse(data) as SandboxLiveMessage).data.drivers);
    };
    socket.onclose = ({ code }) => {
      if (stopped) return;
      if (timedOut && code === NO_SANDBOX) return onDiscarded();
      if (code === STOPPED) {
        timedOut = true;
        onStopped();
      }
      // The feed does not count as activity, so looking again leaves a stopped Sandbox stopped.
      if (timedOut) {
        timer = setTimeout(open, STOPPED_RECHECK_MS);
        return;
      }
      // Reconnecting would not help with either, so opening the Sandbox again is left to sort it out or explain.
      if (code === UNKNOWN_SESSION || code === NO_SANDBOX) {
        timer = setTimeout(onGone, REOPEN_WAIT_MS);
        return;
      }
      onLost();
      timer = setTimeout(open, wait);
      wait = Math.min(wait * 2, LONGEST_WAIT_MS);
    };
  };
  open();

  return () => {
    stopped = true;
    clearTimeout(timer);
    socket.close();
  };
}
