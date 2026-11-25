/** Spaces out work in real time, whatever the simulation clock is doing. */
export abstract class Pacer {
  abstract pause(ms: number): Promise<void>;
}

export class SystemPacer extends Pacer {
  pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms).unref());
  }
}
