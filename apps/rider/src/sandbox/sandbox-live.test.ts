import type { SimulatedDriver } from '@thirrem/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveUrl, watchDrivers } from './sandbox-live';

const driver: SimulatedDriver = { id: 'one', vehicleType: 'economy', heading: 0, lat: 42.38, lon: 20.43, available: true };

class FakeSocket {
  readonly sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  send(message: string) {
    this.sent.push(JSON.parse(message));
  }
  close() {
    this.closed = true;
  }
  drivers(list: SimulatedDriver[]) {
    this.onmessage?.({ data: JSON.stringify({ event: 'drivers', data: { drivers: list } }) });
  }
}

describe('liveUrl', () => {
  it('uses the page address when the API shares it', () => {
    expect(liveUrl('', 'http://localhost:5002')).toBe('ws://localhost:5002/rider/live');
  });

  it('uses a secure socket on the API address when one is set', () => {
    expect(liveUrl('https://laptop.example.ts.net', 'https://rider.example.app')).toBe('wss://laptop.example.ts.net/rider/live');
  });
});

describe('watchDrivers', () => {
  let sockets: FakeSocket[];
  const handlers = { onDrivers: vi.fn(), onLost: vi.fn(), onGone: vi.fn(), onStopped: vi.fn(), onDiscarded: vi.fn() };
  const watch = () =>
    watchDrivers({
      token: 'secret',
      ...handlers,
      connect: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    });

  beforeEach(() => {
    sockets = [];
    vi.useFakeTimers();
    vi.resetAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('says who it is once connected, then passes on each set of positions', () => {
    watch();

    sockets[0]!.onopen?.();
    sockets[0]!.drivers([driver]);

    expect(sockets[0]!.sent).toEqual([{ event: 'watch', data: { token: 'secret' } }]);
    expect(handlers.onDrivers).toHaveBeenCalledWith([driver]);
  });

  it('reconnects after a dropped connection, waiting longer each time', () => {
    watch();

    sockets[0]!.onclose?.({ code: 1006 });
    expect(handlers.onLost).toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1_999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
  });

  it('never waits more than 10 seconds, and starts short again once positions arrive', () => {
    watch();
    for (let drop = 0; drop < 8; drop += 1) {
      sockets.at(-1)!.onclose?.({ code: 1006 });
      vi.advanceTimersByTime(10_000);
    }
    expect(sockets).toHaveLength(9);

    sockets.at(-1)!.drivers([driver]);
    sockets.at(-1)!.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1_000);

    expect(sockets).toHaveLength(10);
  });

  it('asks for a new Sandbox when the server has none, after a short wait', () => {
    watch();

    sockets[0]!.onclose?.({ code: 4404 });
    expect(handlers.onGone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);

    expect(handlers.onGone).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(1);
  });

  describe('once the Sandbox has stopped', () => {
    const stoppedFeed = () => {
      watch();
      sockets[0]!.onclose?.({ code: 4410 });
    };

    it('says so and leaves it stopped', () => {
      stoppedFeed();

      expect(handlers.onStopped).toHaveBeenCalledOnce();
      expect(handlers.onGone).not.toHaveBeenCalled();
      expect(handlers.onLost).not.toHaveBeenCalled();
    });

    it('looks again once a minute, whether or not the server answers', () => {
      stoppedFeed();
      vi.advanceTimersByTime(59_999);
      expect(sockets).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(2);

      sockets[1]!.onclose?.({ code: 1006 });
      vi.advanceTimersByTime(60_000);

      expect(sockets).toHaveLength(3);
      expect(handlers.onLost).not.toHaveBeenCalled();
    });

    it('says when it has been discarded, and does not open a new one by itself', () => {
      stoppedFeed();
      vi.advanceTimersByTime(60_000);

      sockets[1]!.onclose?.({ code: 4404 });
      vi.advanceTimersByTime(600_000);

      expect(handlers.onDiscarded).toHaveBeenCalledOnce();
      expect(handlers.onGone).not.toHaveBeenCalled();
      expect(sockets).toHaveLength(2);
    });

    it('carries on if the Sandbox was resumed elsewhere', () => {
      stoppedFeed();
      vi.advanceTimersByTime(60_000);

      sockets[1]!.drivers([driver]);
      sockets[1]!.onclose?.({ code: 1006 });

      expect(handlers.onDrivers).toHaveBeenCalledWith([driver]);
      expect(handlers.onLost).toHaveBeenCalledOnce();
    });
  });

  it('goes back to the API when the session is not accepted, which says why', () => {
    watch();

    sockets[0]!.onclose?.({ code: 4401 });
    vi.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(1);
    expect(handlers.onGone).toHaveBeenCalledOnce();
  });

  it('closes for good when told to stop', () => {
    const stop = watch();
    const first = sockets[0]!;

    stop();
    first.onclose?.({ code: 1000 });
    first.drivers([driver]);
    vi.advanceTimersByTime(60_000);

    expect(first.closed).toBe(true);
    expect(sockets).toHaveLength(1);
    expect(handlers.onDrivers).not.toHaveBeenCalled();
    expect(handlers.onLost).not.toHaveBeenCalled();
  });
});
