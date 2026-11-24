import { Controller, Get, Inject } from '@nestjs/common';
import type { RoadGraphSummary } from '@thirrem/types';
import { ROAD_GRAPH, type RoadGraph } from './road-graph.js';

@Controller('road-graph')
export class RoadGraphController {
  constructor(@Inject(ROAD_GRAPH) private readonly graph: RoadGraph) {}

  @Get()
  summary(): RoadGraphSummary {
    return { nodes: this.graph.nodes.length, edges: this.graph.edges.length };
  }
}
