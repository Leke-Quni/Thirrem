export interface RoadNode {
  id: string;
  lat: number;
  lon: number;
}

export interface RoadEdge {
  from: string;
  to: string;
  distanceM: number;
}

export interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

export const ROAD_GRAPH = Symbol('ROAD_GRAPH');
