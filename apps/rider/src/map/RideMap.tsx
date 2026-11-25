import { buildMapStyle, DEFAULT_VIEW, ROUTE_SOURCE, type MapTheme } from '@thirrem/map';
import type { Coordinate, SimulatedDriver } from '@thirrem/types';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { type CarMark, DriverFleet } from './driver-fleet';
import { driverCar } from './driver-marker';
import { DROPOFF_PIN_PATH, DROPOFF_PIN_VIEWBOX } from './pin-shape';
import type { PinSlot, PlanPoint } from './planner';

interface RideMapProps {
  pickup: PlanPoint | null;
  dropoff: PlanPoint | null;
  geometry: Array<[number, number]> | null;
  drivers: SimulatedDriver[];
  marks: ReadonlyMap<string, CarMark>;
  /** The pins cannot be moved while a Ride Request is open. */
  locked: boolean;
  focus: { point: Coordinate; nonce: number } | null;
  onPlace(point: Coordinate): void;
  onMove(slot: PinSlot, point: Coordinate): void;
  onReady(): void;
  onFailure(): void;
}

maplibregl.setWorkerUrl(workerUrl);

const PIN_LABEL: Record<PinSlot, string> = { pickup: 'Pickup Point', dropoff: 'Drop-off Point' };
const NUDGE_DEGREES = 0.0001;

const currentTheme = (): MapTheme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function dropoffShape(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', DROPOFF_PIN_VIEWBOX);
  svg.setAttribute('width', '34');
  svg.setAttribute('height', '44');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', DROPOFF_PIN_PATH);
  path.setAttribute('fill', 'var(--accent-solid)');
  path.setAttribute('stroke', '#fff');
  path.setAttribute('stroke-width', '2.5');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', '17');
  dot.setAttribute('cy', '16.5');
  dot.setAttribute('r', '5.5');
  dot.setAttribute('fill', '#fff');
  svg.append(path, dot);
  return svg;
}

const pinLabel = (slot: PinSlot, locked: boolean) =>
  locked ? `${PIN_LABEL[slot]} pin. It stays put while your Ride Request is open.` : `${PIN_LABEL[slot]} pin. Drag it, or use the arrow keys to move it.`;

function pinElement(slot: PinSlot): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `pin pin-${slot}`;
  if (slot === 'dropoff') el.append(dropoffShape());
  return el;
}

export function RideMap({ pickup, dropoff, geometry, drivers, marks, locked, focus, onPlace, onMove, onReady, onFailure }: RideMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Partial<Record<PinSlot, maplibregl.Marker>>>({});
  const fleet = useRef<DriverFleet | null>(null);
  const latest = useRef({ onPlace, onMove, onReady, onFailure, geometry });
  latest.current = { onPlace, onMove, onReady, onFailure, geometry };

  const drawRoute = () => {
    const source = map.current?.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    const line = latest.current.geometry;
    source?.setData({
      type: 'FeatureCollection',
      features: line ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } }] : [],
    });
  };

  useEffect(() => {
    const instance = new maplibregl.Map({
      container: container.current!,
      style: buildMapStyle(currentTheme()),
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      attributionControl: false,
    });
    map.current = instance;
    const lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    fleet.current = new DriverFleet({
      createCar: (pose) => driverCar(instance, pose),
      requestFrame: (draw) => requestAnimationFrame(draw),
      cancelFrame: (frame) => cancelAnimationFrame(frame),
      now: () => performance.now(),
      reducedMotion: () => lessMotion.matches,
    });
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    instance.on('load', () => latest.current.onReady());
    instance.on('error', (event) => {
      if ((event as { sourceId?: string }).sourceId === 'city') latest.current.onFailure();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.target as HTMLElement).classList.contains('maplibregl-canvas')) return;
      event.preventDefault();
      const { lat, lng } = instance.getCenter();
      latest.current.onPlace({ lat, lon: lng });
    };
    container.current!.addEventListener('keydown', onKeyDown);
    instance.on('click', (event) => latest.current.onPlace({ lat: event.lngLat.lat, lon: event.lngLat.lng }));
    instance.on('style.load', drawRoute);

    const themeWatcher = new MutationObserver(() => instance.setStyle(buildMapStyle(currentTheme())));
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const host = container.current!;
    return () => {
      host.removeEventListener('keydown', onKeyDown);
      themeWatcher.disconnect();
      fleet.current?.clear();
      fleet.current = null;
      instance.remove();
      map.current = null;
      markers.current = {};
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const points: Record<PinSlot, Coordinate | null> = { pickup, dropoff };
    (['pickup', 'dropoff'] as const).forEach((slot) => {
      const point = points[slot];
      const existing = markers.current[slot];
      if (!point) {
        existing?.remove();
        delete markers.current[slot];
        return;
      }
      if (existing) {
        existing.setLngLat([point.lon, point.lat]).setDraggable(!locked);
        existing.getElement().setAttribute('aria-label', pinLabel(slot, locked));
        return;
      }
      const el = pinElement(slot);
      el.setAttribute('aria-label', pinLabel(slot, locked));
      const marker = new maplibregl.Marker({ element: el, draggable: !locked, anchor: slot === 'dropoff' ? 'bottom' : 'center' }).setLngLat([point.lon, point.lat]).addTo(instance);
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLngLat();
        latest.current.onMove(slot, { lat, lon: lng });
      });
      el.addEventListener('keydown', (event) => {
        const delta = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
        if (!delta) return;
        event.preventDefault();
        const { lat, lng } = marker.getLngLat();
        const step = NUDGE_DEGREES * (event.shiftKey ? 5 : 1);
        latest.current.onMove(slot, { lat: lat + delta[1] * step, lon: lng + delta[0] * step });
      });
      markers.current[slot] = marker;
    });
  }, [pickup, dropoff, locked]);

  useEffect(() => {
    fleet.current?.show(drivers, marks);
  }, [drivers, marks]);

  useEffect(() => {
    drawRoute();
    const instance = map.current;
    if (!instance || !geometry || geometry.length < 2) return;
    const bounds = geometry.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(geometry[0], geometry[0]));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    instance.fitBounds(bounds, { padding: 60, duration: reduceMotion ? 0 : 600, maxZoom: 17 });
  }, [geometry]);

  useEffect(() => {
    if (!focus) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.current?.flyTo({ center: [focus.point.lon, focus.point.lat], zoom: 15, duration: reduceMotion ? 0 : 900 });
  }, [focus]);

  return <div ref={container} className="ride-map" role="application" aria-label="Map. Click to place a pin, or move the map with the arrow keys and press Enter to place it at the centre mark." />;
}
