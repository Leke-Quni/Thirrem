import { buildMapStyle, DEFAULT_VIEW, type MapTheme } from '@thirrem/map';
import type { DriverCar } from '@thirrem/types';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Car } from '../components/Car';

maplibregl.setWorkerUrl(workerUrl);

const CAR_ZOOM = 15;
const currentTheme = (): MapTheme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function carElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'own-car';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Your car');
  return el;
}

/** A map of the Sandbox with the Driver's car, in its own paint, at its centre. */
export function DriverMap({ car, paint }: { car: DriverCar | null; paint: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [element] = useState(carElement);
  const [tiles, setTiles] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const instance = new maplibregl.Map({
      container: container.current!,
      style: buildMapStyle(currentTheme()),
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom,
      attributionControl: false,
    });
    map.current = instance;
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    instance.on('load', () => setTiles('ready'));
    instance.on('error', (event) => {
      if ((event as { sourceId?: string }).sourceId === 'city') setTiles('failed');
    });
    const themeWatcher = new MutationObserver(() => instance.setStyle(buildMapStyle(currentTheme())));
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      themeWatcher.disconnect();
      instance.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  const { lat, lon, heading } = car ?? {};
  useEffect(() => {
    const instance = map.current;
    if (!instance || lat === undefined || lon === undefined) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    marker.current ??= new maplibregl.Marker({ element, rotationAlignment: 'map' }).setLngLat([lon, lat]).addTo(instance);
    marker.current.setLngLat([lon, lat]).setRotation(heading ?? 0);
    instance.jumpTo({ center: [lon, lat], zoom: CAR_ZOOM });
  }, [lat, lon, heading, element]);

  return (
    <>
      <div ref={container} className="driver-map" role="application" aria-label="Map around your car. Move it with the arrow keys, and zoom with plus and minus." />
      {tiles === 'failed' && (
        <p className="map-failure" role="alert">
          The map could not be loaded. Check your connection, then reload the page.
        </p>
      )}
      {createPortal(
        <svg viewBox="-20 -26 40 52" width="34" height="44" aria-hidden="true" style={{ '--paint': paint } as CSSProperties}>
          <Car x={0} y={0} />
        </svg>,
        element,
      )}
    </>
  );
}
