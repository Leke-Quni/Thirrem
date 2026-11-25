import { Pacer } from '../../src/sandbox/pacer.js';

/** Lets everything already under way finish. */
export const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Ends each pause only when the test says so. */
export class ManualPacer extends Pacer {
  readonly pauses: number[] = [];
  private readonly waiting: Array<() => void> = [];

  pause(ms: number): Promise<void> {
    this.pauses.push(ms);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  async step(): Promise<void> {
    this.waiting.shift()?.();
    await settle();
  }
}

/** Ends every pause straight away. */
export class InstantPacer extends Pacer {
  pause(): Promise<void> {
    return settle();
  }
}
