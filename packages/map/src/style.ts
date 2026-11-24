import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

export type MapTheme = 'dark' | 'light';

export const ROUTE_SOURCE = 'route';
const TILES_SOURCE = 'city';

const palettes = {
  dark: {
    land: '#0b1018',
    water: '#0f2238',
    park: '#0e1c1b',
    building: '#121a27',
    minor: '#1c2638',
    major: '#2a3750',
    label: '#98a1b3',
    halo: '#07090d',
    route: '#8b5cf6',
    routeCasing: '#07090d',
  },
  light: {
    land: '#e3e7ee',
    water: '#b9d2ec',
    park: '#d2e4d1',
    building: '#d6dbe4',
    minor: '#fbfcfe',
    major: '#ffffff',
    label: '#566074',
    halo: '#eef0f4',
    route: '#7c3aed',
    routeCasing: '#ffffff',
  },
} as const;

const width = (min: number, max: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 12, min, 18, max];

const roadClass = (...classes: string[]): ExpressionSpecification => ['in', ['get', 'class'], ['literal', classes]];

const OPENFREEMAP = 'https://tiles.openfreemap.org';
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export function buildMapStyle(theme: MapTheme): StyleSpecification {
  const p = palettes[theme];
  const layers: LayerSpecification[] = [
    { id: 'land', type: 'background', paint: { 'background-color': p.land } },
    { id: 'park', type: 'fill', source: TILES_SOURCE, 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland']]], paint: { 'fill-color': p.park } },
    { id: 'water', type: 'fill', source: TILES_SOURCE, 'source-layer': 'water', paint: { 'fill-color': p.water } },
    { id: 'waterway', type: 'line', source: TILES_SOURCE, 'source-layer': 'waterway', paint: { 'line-color': p.water, 'line-width': width(0.6, 4) } },
    { id: 'building', type: 'fill', source: TILES_SOURCE, 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': p.building } },
    { id: 'road-minor', type: 'line', source: TILES_SOURCE, 'source-layer': 'transportation', filter: roadClass('minor', 'service', 'track'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.minor, 'line-width': width(0.5, 7) } },
    { id: 'road-major', type: 'line', source: TILES_SOURCE, 'source-layer': 'transportation', filter: roadClass('tertiary', 'secondary', 'primary', 'trunk', 'motorway'), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.major, 'line-width': width(1, 12) } },
    { id: 'road-label', type: 'symbol', source: TILES_SOURCE, 'source-layer': 'transportation_name', minzoom: 14, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: { 'text-color': p.label, 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
    { id: 'place-label', type: 'symbol', source: TILES_SOURCE, 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village', 'suburb', 'neighbourhood']]], layout: { 'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': 13 }, paint: { 'text-color': p.label, 'text-halo-color': p.halo, 'text-halo-width': 1.5 } },
    { id: 'route-casing', type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.routeCasing, 'line-width': 9, 'line-opacity': 0.85 } },
    { id: 'route-line', type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': p.route, 'line-width': 5 } },
  ];

  return {
    version: 8,
    glyphs: `${OPENFREEMAP}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      [TILES_SOURCE]: { type: 'vector', url: `${OPENFREEMAP}/planet`, attribution: ATTRIBUTION },
      [ROUTE_SOURCE]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers,
  };
}
