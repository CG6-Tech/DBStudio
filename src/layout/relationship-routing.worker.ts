/// <reference lib="webworker" />
import RBush from "rbush";
import { routeOrthogonalAStar, type RoutingObstacle, type RoutingRequest } from "../domain/orthogonalRouter";

export interface RoutingWorkerRequest { generation: number; obstacles: RoutingObstacle[]; relationships: RoutingRequest[] }
export interface RoutingWorkerResponse { generation: number; routes: Array<{ id: string; points: ReturnType<typeof routeOrthogonalAStar> }>; complete: boolean }

let activeGeneration = 0;

self.onmessage = (event: MessageEvent<RoutingWorkerRequest>) => {
  const { generation, obstacles, relationships } = event.data;
  activeGeneration = generation;
  const obstacleIndex = new RBush<RoutingObstacle>();
  obstacleIndex.load(obstacles);
  let cursor = 0;
  const routeBatch = () => {
    if (generation !== activeGeneration) return;
    const routes: RoutingWorkerResponse["routes"] = [];
    const end = Math.min(relationships.length, cursor + 40);
    for (; cursor < end; cursor += 1) {
      const relationship = relationships[cursor];
      const margin = 280;
      const localObstacles = obstacleIndex.search({ minX: Math.min(relationship.start.x, relationship.end.x) - margin, minY: Math.min(relationship.start.y, relationship.end.y) - margin, maxX: Math.max(relationship.start.x, relationship.end.x) + margin, maxY: Math.max(relationship.start.y, relationship.end.y) + margin });
      routes.push({ id: relationship.id, points: routeOrthogonalAStar(relationship, localObstacles) });
    }
    self.postMessage({ generation, routes, complete: cursor >= relationships.length } satisfies RoutingWorkerResponse);
    if (cursor < relationships.length) setTimeout(routeBatch, 0);
  };
  routeBatch();
};
