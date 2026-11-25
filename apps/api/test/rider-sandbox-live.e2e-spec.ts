import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { SandboxLiveMessage, SimulatedDriver } from '@thirrem/types';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import { createTestApp, ManualClock } from './support/app.js';
import { FakeRoadService } from './support/fake-road-service.js';
import { InstantPacer } from './support/pacers.js';

const password = 'Correct-horse-battery';
const centre = { lat: 42.3803, lon: 20.4308 };

/** A socket with everything it was told. */
function listen(url: string) {
  const socket = new WebSocket(url);
  const received: SimulatedDriver[][] = [];
  socket.addEventListener('message', (event) => received.push((JSON.parse(String(event.data)) as SandboxLiveMessage).data.drivers));
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () => reject(new Error('The socket did not open')));
  });
  const closed = new Promise<number>((resolve) => socket.addEventListener('close', (event) => resolve(event.code)));
  return {
    socket,
    received,
    opened,
    closed,
    send: (message: unknown) => socket.send(typeof message === 'string' ? message : JSON.stringify(message)),
    next: (count: number) => vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(count), { interval: 5 }),
  };
}

describe("The live feed of a Rider's simulated Drivers", () => {
  let app: INestApplication;
  let url: string;
  const clock = new ManualClock(new Date('2026-01-01T00:00:00Z'));
  const roads = new FakeRoadService();
  const sockets: WebSocket[] = [];

  const rider = async () => {
    const { body } = await request(app.getHttpServer()).post('/rider/auth/signup').send({ email: `rider-${randomUUID()}@example.com`, password });
    return body.token as string;
  };
  const openSandbox = async (token: string, at = centre) => {
    const res = await request(app.getHttpServer()).put('/rider/sandbox').set('Authorization', `Bearer ${token}`).send({ centre: at }).expect(200);
    return res.body.drivers as SimulatedDriver[];
  };
  const connect = async () => {
    const feed = listen(url);
    sockets.push(feed.socket);
    await feed.opened;
    return feed;
  };
  const watch = async (token: string) => {
    const feed = await connect();
    feed.send({ event: 'watch', data: { token } });
    return feed;
  };
  const ids = (drivers: SimulatedDriver[]) => drivers.map((driver) => driver.id).sort();

  beforeAll(async () => {
    app = await createTestApp({ clock, roads, pacer: new InstantPacer(), config: { live: { intervalMs: 20, helloTimeoutMs: 200 } } });
    await app.listen(0, '127.0.0.1');
    url = `ws://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/rider/live`;
  });
  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.close();
  });
  afterAll(async () => {
    await app.close();
  });

  it('sends the Drivers of the Rider who is watching', async () => {
    const token = await rider();
    const drivers = await openSandbox(token);

    const feed = await watch(token);
    await feed.next(1);

    expect(ids(feed.received[0]!)).toEqual(ids(drivers));
    expect(Object.keys(feed.received[0]![0]!).sort()).toEqual(['heading', 'id', 'lat', 'lon', 'vehicleType']);
  });

  it('keeps sending positions as the simulation clock moves, with no new request', async () => {
    const token = await rider();
    await openSandbox(token);
    await vi.waitFor(() => expect(roads.routeRequests.length).toBeGreaterThanOrEqual(60), { interval: 5 });
    const feed = await watch(token);
    await feed.next(2);
    expect(feed.received[1]).toEqual(feed.received[0]);

    clock.advance(10_000);
    const before = feed.received.length;
    await feed.next(before + 2);

    expect(feed.received.at(-1)![0]).not.toEqual(feed.received[0]![0]);
  });

  it('never sends one Rider the Drivers of another Sandbox', async () => {
    const [one, other] = [await rider(), await rider()];
    const mine = await openSandbox(one);
    await openSandbox(other);

    const feed = await watch(one);
    await feed.next(3);

    for (const drivers of feed.received) expect(ids(drivers)).toEqual(ids(mine));
  });

  it('follows the Sandbox when it moves somewhere else', async () => {
    const token = await rider();
    await openSandbox(token);
    const feed = await watch(token);
    await feed.next(1);

    const moved = await openSandbox(token, { lat: 48.8566, lon: 2.3522 });

    await vi.waitFor(() => expect(ids(feed.received.at(-1)!)).toEqual(ids(moved)), { interval: 5 });
  });

  it('closes a connection with an unknown session', async () => {
    const feed = await watch('not-a-session');

    expect(await feed.closed).toBe(4401);
    expect(feed.received).toEqual([]);
  });

  it('closes with a server error, not as an unknown session, when the session cannot be checked', async () => {
    const check = vi.spyOn(app.get(AuthService), 'authenticate').mockRejectedValueOnce(new Error('the database is down'));

    const feed = await watch(await rider());

    expect(await feed.closed).toBe(1011);
    check.mockRestore();
  });

  it('closes a connection whose Rider has no Sandbox, so the app can open one', async () => {
    const feed = await watch(await rider());

    expect(await feed.closed).toBe(4404);
  });

  it('closes a connection that never says who it is', async () => {
    const feed = await connect();

    expect(await feed.closed).toBe(4408);
  });

  it('survives messages that make no sense', async () => {
    const feed = await connect();

    feed.send('not json');
    feed.send({ event: 'watch' });

    expect(await feed.closed).toBe(4401);
    const token = await rider();
    await openSandbox(token);
    await (await watch(token)).next(1);
  });

  it('refuses an oversized message', async () => {
    const feed = await connect();

    feed.send({ event: 'watch', data: { token: 'x'.repeat(5_000) } });

    expect(await feed.closed).toBe(1009);
  });
});
