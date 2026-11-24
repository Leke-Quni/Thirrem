export abstract class SimulationClock {
  abstract now(): Date;
}

export class SystemClock extends SimulationClock {
  now(): Date {
    return new Date();
  }
}
