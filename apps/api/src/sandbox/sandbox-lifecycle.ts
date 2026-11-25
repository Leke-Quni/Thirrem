/** How long a Sandbox keeps running after the Rider last did something. */
export const STOP_AFTER_MS = 15 * 60_000;
/** How long a stopped Sandbox is kept for the Rider to come back to. */
export const DISCARD_AFTER_MS = 24 * 60 * 60_000;

export type SandboxStatus = 'running' | 'stopped' | 'discarded';

export const stoppedAtMs = (lastActiveMs: number) => lastActiveMs + STOP_AFTER_MS;

/** A Sandbox last active at or before this is to be discarded. */
export const discardCutoffMs = (nowMs: number) => nowMs - STOP_AFTER_MS - DISCARD_AFTER_MS;

/** A Sandbox last active after this is running. */
export const runningCutoffMs = (nowMs: number) => nowMs - STOP_AFTER_MS;

export function sandboxStatus(lastActiveMs: number, nowMs: number): SandboxStatus {
  if (lastActiveMs <= discardCutoffMs(nowMs)) return 'discarded';
  return nowMs < stoppedAtMs(lastActiveMs) ? 'running' : 'stopped';
}
