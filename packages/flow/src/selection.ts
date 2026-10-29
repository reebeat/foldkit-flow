import { Array } from "effect";

import type { FlowEdge, FlowNode } from "./types.ts";

// Selection is two flags, `selected` on nodes and on edges. These functions change them and keep every unchanged
// element (and the array, when nothing changed) so that memoised views and the controller lookups stay valid.

/** Keeps the old array, and every unchanged element, when `change` changes nothing. */
export const preserving = <A>(items: readonly A[], change: (item: A) => A) => {
  const next = Array.map(items, change);

  return Array.every(next, (item, index) => item === items[index])
    ? items
    : next;
};

export const selectedNodeIds = (nodes: readonly FlowNode[]) =>
  Array.map(
    Array.filter(nodes, (node) => node.selected),
    (node) => node.id
  );

export const selectedEdgeIds = (edges: readonly FlowEdge[]) =>
  Array.map(
    Array.filter(edges, (edge) => edge.selected),
    (edge) => edge.id
  );

/** Exactly the nodes in `ids` selected. */
export const withNodeSelection = (
  nodes: readonly FlowNode[],
  ids: readonly string[]
) =>
  preserving(nodes, (node) =>
    node.selected === Array.contains(ids, node.id)
      ? node
      : { ...node, selected: !node.selected }
  );

/** Exactly the edges in `ids` selected. */
export const withEdgeSelection = (
  edges: readonly FlowEdge[],
  ids: readonly string[]
) =>
  preserving(edges, (edge) =>
    edge.selected === Array.contains(ids, edge.id)
      ? edge
      : { ...edge, selected: !edge.selected }
  );

const toggled = (ids: readonly string[], id: string) =>
  Array.contains(ids, id)
    ? Array.filter(ids, (candidate) => candidate !== id)
    : [...ids, id];

/**
 * The selected node ids after pressing node `id`: with a modifier it toggles that node, without one it selects the node
 * alone, unless the node is already part of the selection (so a group can be dragged by one of its members).
 */
export const nextNodeSelection = (
  selected: readonly string[],
  id: string,
  isAdditive: boolean
): readonly string[] => {
  if (isAdditive) {
    return toggled(selected, id);
  }

  return Array.contains(selected, id) ? selected : [id];
};
