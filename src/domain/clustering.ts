import type { SchemaDocument } from "./types";

export type LayoutClusterKind = "area" | "community" | "isolated";

export interface LayoutCluster {
  id: string;
  kind: LayoutClusterKind;
  tableIds: string[];
  areaId?: string;
}

const MIN_COMMUNITY_SIZE = 8;
const MAX_COMMUNITY_SIZE = 20;

function compareIds(left: string, right: string): number {
  return left.localeCompare(right);
}

function balancedSizes(total: number): number[] {
  if (total <= MAX_COMMUNITY_SIZE) return [total];
  const count = Math.ceil(total / MAX_COMMUNITY_SIZE);
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

interface Candidate {
  id: string;
  links: number;
  degree: number;
}

function higherPriority(left: Candidate, right: Candidate): boolean {
  if (left.links !== right.links) return left.links > right.links;
  if (left.degree !== right.degree) return left.degree > right.degree;
  return compareIds(left.id, right.id) < 0;
}

class CandidateHeap {
  private values: Candidate[] = [];

  get size(): number { return this.values.length; }

  push(value: Candidate): void {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (higherPriority(this.values[parent], value)) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop(): Candidate | undefined {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.values.length) break;
      const child = right < this.values.length && higherPriority(this.values[right], this.values[left]) ? right : left;
      if (higherPriority(last, this.values[child])) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

function splitComponent(component: string[], adjacency: Map<string, Set<string>>): string[][] {
  const remaining = new Set(component);
  const seedHeap = new CandidateHeap();
  component.forEach((id) => seedHeap.push({ id, links: 0, degree: adjacency.get(id)?.size ?? 0 }));

  const takeSeed = (): string | undefined => {
    while (seedHeap.size > 0) {
      const candidate = seedHeap.pop()!;
      if (remaining.has(candidate.id)) return candidate.id;
    }
    return undefined;
  };

  return balancedSizes(component.length).map((targetSize) => {
    const group: string[] = [];
    const frontier = new CandidateHeap();
    const linksIntoGroup = new Map<string, number>();

    const add = (id: string) => {
      if (!remaining.delete(id)) return;
      group.push(id);
      adjacency.get(id)?.forEach((neighbor) => {
        if (!remaining.has(neighbor)) return;
        const links = (linksIntoGroup.get(neighbor) ?? 0) + 1;
        linksIntoGroup.set(neighbor, links);
        frontier.push({ id: neighbor, links, degree: adjacency.get(neighbor)?.size ?? 0 });
      });
    };

    const takeFrontier = (): string | undefined => {
      while (frontier.size > 0) {
        const candidate = frontier.pop()!;
        if (remaining.has(candidate.id) && linksIntoGroup.get(candidate.id) === candidate.links) return candidate.id;
      }
      return undefined;
    };

    const seed = takeSeed();
    if (seed) add(seed);
    while (group.length < targetSize && remaining.size > 0) {
      const next = takeFrontier() ?? takeSeed();
      if (!next) break;
      add(next);
    }
    return group;
  });
}

function connectedComponents(ids: string[], adjacency: Map<string, Set<string>>): string[][] {
  const unseen = new Set(ids);
  const components: string[][] = [];
  const sortedIds = [...ids].sort(compareIds);
  sortedIds.forEach((seed) => {
    if (!unseen.delete(seed)) return;
    const queue = [seed];
    let head = 0;
    const component: string[] = [];
    while (head < queue.length) {
      const current = queue[head++];
      component.push(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (!unseen.delete(neighbor)) return;
        queue.push(neighbor);
      });
    }
    components.push(component.sort(compareIds));
  });
  return components.sort((left, right) => compareIds(left[0], right[0]));
}

export function clusterTables(document: SchemaDocument): LayoutCluster[] {
  const tableIds = new Set(document.tables.map((table) => table.id));
  const assigned = new Set<string>();
  const clusters: LayoutCluster[] = [];

  document.areas.forEach((area) => {
    const members = area.tableIds.filter((id) => tableIds.has(id) && !assigned.has(id));
    if (members.length === 0) return;
    members.forEach((id) => assigned.add(id));
    clusters.push({ id: `area:${area.id}`, kind: "area", areaId: area.id, tableIds: members });
  });

  const unassigned = document.tables.map((table) => table.id).filter((id) => !assigned.has(id));
  const unassignedSet = new Set(unassigned);
  const adjacency = new Map(unassigned.map((id) => [id, new Set<string>()]));
  document.relationships.forEach((relationship) => {
    if (!unassignedSet.has(relationship.sourceTableId) || !unassignedSet.has(relationship.targetTableId)) return;
    adjacency.get(relationship.sourceTableId)!.add(relationship.targetTableId);
    adjacency.get(relationship.targetTableId)!.add(relationship.sourceTableId);
  });

  const isolated: string[] = [];
  let communityIndex = 0;
  connectedComponents(unassigned, adjacency).forEach((component) => {
    if (component.length === 1 && adjacency.get(component[0])?.size === 0) {
      isolated.push(component[0]);
      return;
    }
    splitComponent(component, adjacency).forEach((members) => {
      clusters.push({ id: `community:${communityIndex++}:${members[0]}`, kind: "community", tableIds: members });
    });
  });

  let isolatedIndex = 0;
  const sortedIsolated = isolated.sort(compareIds);
  let isolatedCursor = 0;
  balancedSizes(sortedIsolated.length).forEach((size) => {
    if (size === 0) return;
    const members = sortedIsolated.slice(isolatedCursor, isolatedCursor + size);
    isolatedCursor += size;
    clusters.push({ id: `isolated:${isolatedIndex++}:${members[0]}`, kind: "isolated", tableIds: members });
  });
  return clusters;
}

export const communitySizeRange = { min: MIN_COMMUNITY_SIZE, max: MAX_COMMUNITY_SIZE };
