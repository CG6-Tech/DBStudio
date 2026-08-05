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
const MODULARITY_PASSES = 12;
const MERGE_ROUNDS = 8;

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

function groupByCommunity(ordered: string[], community: Map<string, string>): string[][] {
  const groups = new Map<string, string[]>();
  ordered.forEach((id) => {
    const label = community.get(id)!;
    const members = groups.get(label);
    if (members) members.push(id);
    else groups.set(label, [id]);
  });
  return [...groups.values()];
}

/**
 * Greedy modularity optimisation (the local-moving phase of Louvain). Unlike a
 * size-capped traversal it cuts a component at its weakest links, so the
 * relationships that survive inside a cluster are the ones ELK can actually
 * lay out. Nodes are visited in id order so the result is reorder-invariant.
 */
function detectCommunities(component: string[], adjacency: Map<string, Set<string>>): string[][] {
  const ordered = [...component].sort(compareIds);
  const degree = new Map(ordered.map((id) => [id, adjacency.get(id)?.size ?? 0]));
  const linkTotal = Math.max(1, ordered.reduce((sum, id) => sum + degree.get(id)!, 0) / 2);
  const community = new Map(ordered.map((id) => [id, id]));
  const totalDegree = new Map(ordered.map((id) => [id, degree.get(id)!]));
  const size = new Map(ordered.map((id) => [id, 1]));

  for (let pass = 0; pass < MODULARITY_PASSES; pass += 1) {
    let moved = false;
    ordered.forEach((id) => {
      const own = community.get(id)!;
      const nodeDegree = degree.get(id)!;
      const links = new Map<string, number>();
      adjacency.get(id)?.forEach((neighbor) => {
        const label = community.get(neighbor);
        if (label !== undefined) links.set(label, (links.get(label) ?? 0) + 1);
      });
      totalDegree.set(own, totalDegree.get(own)! - nodeDegree);
      size.set(own, size.get(own)! - 1);

      let best = own;
      let bestGain = (links.get(own) ?? 0) - (totalDegree.get(own)! * nodeDegree) / (2 * linkTotal);
      [...links.entries()].sort(([left], [right]) => compareIds(left, right)).forEach(([label, weight]) => {
        if (label === own || size.get(label)! >= MAX_COMMUNITY_SIZE) return;
        const gain = weight - (totalDegree.get(label)! * nodeDegree) / (2 * linkTotal);
        if (gain > bestGain + 1e-9) {
          bestGain = gain;
          best = label;
        }
      });

      totalDegree.set(best, totalDegree.get(best)! + nodeDegree);
      size.set(best, size.get(best)! + 1);
      community.set(id, best);
      if (best !== own) moved = true;
    });
    if (!moved) break;
  }

  return mergeSmallCommunities(groupByCommunity(ordered, community), adjacency);
}

/**
 * Modularity happily emits pairs and triples. Folding anything under
 * MIN_COMMUNITY_SIZE into its strongest neighbour keeps clusters worth packing
 * without ever crossing MAX_COMMUNITY_SIZE.
 */
function mergeSmallCommunities(groups: string[][], adjacency: Map<string, Set<string>>): string[][] {
  const byLabel = new Map(groups.map((members) => [members[0], [...members]]));
  const labelOf = new Map<string, string>();
  byLabel.forEach((members, label) => members.forEach((id) => labelOf.set(id, label)));

  const labelsBySize = () => [...byLabel.keys()]
    .filter((label) => byLabel.get(label)!.length < MIN_COMMUNITY_SIZE)
    .sort((left, right) => byLabel.get(left)!.length - byLabel.get(right)!.length || compareIds(left, right));

  for (let round = 0; round < MERGE_ROUNDS; round += 1) {
    const candidates = labelsBySize();
    if (candidates.length === 0) break;
    let merged = false;
    candidates.forEach((label) => {
      const members = byLabel.get(label);
      if (!members || members.length >= MIN_COMMUNITY_SIZE) return;
      const links = new Map<string, number>();
      members.forEach((id) => adjacency.get(id)?.forEach((neighbor) => {
        const other = labelOf.get(neighbor);
        if (other && other !== label) links.set(other, (links.get(other) ?? 0) + 1);
      }));
      const target = [...links.entries()]
        .filter(([other]) => byLabel.get(other)!.length + members.length <= MAX_COMMUNITY_SIZE)
        .sort(([leftLabel, leftWeight], [rightLabel, rightWeight]) => rightWeight - leftWeight || compareIds(leftLabel, rightLabel))[0]?.[0];
      if (!target) return;
      byLabel.get(target)!.push(...members);
      members.forEach((id) => labelOf.set(id, target));
      byLabel.delete(label);
      merged = true;
    });
    if (!merged) break;
  }

  return [...byLabel.values()]
    .map((members) => members.sort(compareIds))
    .sort((left, right) => compareIds(left[0], right[0]));
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
    const groups = component.length <= MAX_COMMUNITY_SIZE ? [component] : detectCommunities(component, adjacency);
    groups.forEach((members) => {
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
