/** How long a Sandbox keeps running after the Rider last did something. */
export const STOP_AFTER_MS = 15 * 60_000;

export type SandboxStatus = 'running' | 'stopped';

export const stoppedAtMs = (lastActiveMs: number) => lastActiveMs + STOP_AFTER_MS;

export const sandboxStatus = (lastActiveMs: number, nowMs: number): SandboxStatus => (nowMs < stoppedAtMs(lastActiveMs) ? 'running' : 'stopped');
