export function stronglyConnectedComponents<T>(graph: ReadonlyMap<T, ReadonlySet<T>>): T[][] {
  let nextIndex = 0;
  const indexes = new Map<T, number>();
  const lowLinks = new Map<T, number>();
  const stack: T[] = [];
  const onStack = new Set<T>();
  const result: T[][] = [];

  const visit = (node: T) => {
    indexes.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    for (const target of graph.get(node) ?? []) {
      if (!indexes.has(target)) {
        visit(target);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!));
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indexes.get(target)!));
      }
    }
    if (lowLinks.get(node) !== indexes.get(node)) return;
    const component: T[] = [];
    while (stack.length) {
      const item = stack.pop()!;
      onStack.delete(item);
      component.push(item);
      if (item === node) break;
    }
    result.push(component);
  };

  for (const node of graph.keys()) if (!indexes.has(node)) visit(node);
  return result;
}

export function stableDependencyOrder<T>(nodes: readonly T[], dependencies: ReadonlyMap<T, ReadonlySet<T>>, key: (node: T) => string): T[] {
  const nodeSet = new Set(nodes);
  const graph = new Map<T, Set<T>>();
  nodes.forEach((node) => graph.set(node, new Set([...(dependencies.get(node) ?? [])].filter((dependency) => nodeSet.has(dependency)))));
  const components = stronglyConnectedComponents(graph).map((items) => [...items].sort((left, right) => key(left).localeCompare(key(right))));
  const componentByNode = new Map<T, number>();
  components.forEach((component, index) => component.forEach((node) => componentByNode.set(node, index)));
  const outgoing = new Map<number, Set<number>>(components.map((_component, index) => [index, new Set()]));
  const indegree = new Map<number, number>(components.map((_component, index) => [index, 0]));
  graph.forEach((required, node) => required.forEach((dependency) => {
    const from = componentByNode.get(dependency)!;
    const to = componentByNode.get(node)!;
    if (from === to || outgoing.get(from)!.has(to)) return;
    outgoing.get(from)!.add(to);
    indegree.set(to, indegree.get(to)! + 1);
  }));
  const componentKey = (index: number) => key(components[index][0]);
  const ready = components.map((_component, index) => index).filter((index) => indegree.get(index) === 0).sort((left, right) => componentKey(left).localeCompare(componentKey(right)));
  const result: T[] = [];
  while (ready.length) {
    const current = ready.shift()!;
    result.push(...components[current]);
    outgoing.get(current)!.forEach((target) => {
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) {
        ready.push(target);
        ready.sort((left, right) => componentKey(left).localeCompare(componentKey(right)));
      }
    });
  }
  return result;
}
