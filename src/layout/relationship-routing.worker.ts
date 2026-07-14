/// <reference lib="webworker" />
import RBush from "rbush";
import { routeOrthogonalAStar, type RoutingObstacle, type RoutingRequest } from "../domain/orthogonalRouter";

export interface RoutingWorkerRequest { generation: number; obstacles: RoutingObstacle[]; relationships: RoutingRequest[] }
export interface RoutingWorkerResponse { generation: number; routes: Array<{ id: string; points: ReturnType<typeof routeOrthogonalAStar> }>; complete: boolean }

self.onmessage = (event: MessageEvent<RoutingWorkerRequest>) => {
  const { generation, obstacles, relationships } = event.data;
  const obstacleIndex = new RBush<RoutingObstacle>();
  obstacleIndex.load(obstacles);
  const batch: RoutingWorkerResponse["routes"] = [];
  relationships.forEach((relationship, index) => {
    const margin = 280;
    const localObstacles = obstacleIndex.search({ minX: Math.min(relationship.start.x, relationship.end.x) - margin, minY: Math.min(relationship.start.y, relationship.end.y) - margin, maxX: Math.max(relationship.start.x, relationship.end.x) + margin, maxY: Math.max(relationship.start.y, relationship.end.y) + margin });
    batch.push({ id: relationship.id, points: routeOrthogonalAStar(relationship, localObstacles) });
    if (batch.length === 40 || index === relationships.length - 1) {
      self.postMessage({ generation, routes: batch.splice(0), complete: index === relationships.length - 1 } satisfies RoutingWorkerResponse);
    }
  });
};
