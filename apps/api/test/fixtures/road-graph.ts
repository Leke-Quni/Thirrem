import type { RoadGraph } from '../../src/road-graph/road-graph.js';

// Six junctions near the centre of Gjakova joined by seven two-way roads.
export const gjakovaFixture: RoadGraph = {
  nodes: [
    { id: 'bazaar', lat: 42.3803, lon: 20.4308 },
    { id: 'clock-tower', lat: 42.3797, lon: 20.4322 },
    { id: 'hadum-mosque', lat: 42.3806, lon: 20.4315 },
    { id: 'main-square', lat: 42.3789, lon: 20.4291 },
    { id: 'hospital', lat: 42.3771, lon: 20.4335 },
    { id: 'bus-station', lat: 42.3760, lon: 20.4290 },
  ],
  edges: [
    { from: 'bazaar', to: 'hadum-mosque', distanceM: 70 },
    { from: 'bazaar', to: 'clock-tower', distanceM: 130 },
    { from: 'bazaar', to: 'main-square', distanceM: 190 },
    { from: 'hadum-mosque', to: 'clock-tower', distanceM: 110 },
    { from: 'clock-tower', to: 'hospital', distanceM: 300 },
    { from: 'main-square', to: 'bus-station', distanceM: 330 },
    { from: 'hospital', to: 'bus-station', distanceM: 420 },
  ],
};
