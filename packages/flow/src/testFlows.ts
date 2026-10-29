import { Array, Option } from "effect";

import { init } from "./model.ts";
import type { Model } from "./model.ts";
import type { FlowEdge, FlowNode, HandleDef } from "./types.ts";

// Small flows the tests start from. Nodes have explicit sizes, so nothing needs a DOM measurement.

const inHandle: HandleDef = { id: "in", kind: "target", side: "Left" };

const outHandle: HandleDef = {
  id: "out",
  kind: "source",
  side: "Right",
};

interface NodeOptions {
  readonly draggable?: boolean;
  readonly handles?: readonly HandleDef[];
  readonly height?: number;
  readonly isClampedToParent?: boolean;
  readonly parentId?: string;
  readonly selected?: boolean;
  readonly width?: number;
}

export const nodeAt = (
  id: string,
  x: number,
  y: number,
  options: NodeOptions = {}
): FlowNode => ({
  data: {},
  draggable: options.draggable ?? true,
  handles: options.handles ?? [inHandle, outHandle],
  height: options.height ?? 50,
  id,
  isClampedToParent: options.isClampedToParent ?? false,
  label: `Node ${id}`,
  parentId: options.parentId,
  position: { x, y },
  selected: options.selected ?? false,
  type: "state",
  width: options.width ?? 100,
});

const edgeBetween = (
  id: string,
  source: string,
  target: string,
  selected = false
): FlowEdge => ({
  hasArrow: false,
  id,
  kind: "Bezier",
  label: "",
  selected,
  source,
  sourceHandle: "out",
  target,
  targetHandle: "in",
});

/** a at the origin, b at 300,0 and c at 0,200, with edges a to b and b to c. */
export const abc = (): Model =>
  init({
    edges: [edgeBetween("ab", "a", "b"), edgeBetween("bc", "b", "c")],
    id: "test-flow",
    isFitOnInit: false,
    nodes: [nodeAt("a", 0, 0), nodeAt("b", 300, 0), nodeAt("c", 0, 200)],
  });

/** A scene holding two states, and one node outside. */
export const compound = (): Model =>
  init({
    edges: [],
    id: "test-flow",
    isFitOnInit: false,
    nodes: [
      nodeAt("scene", 100, 100, { handles: [], height: 200, width: 300 }),
      nodeAt("child-a", 20, 30, { isClampedToParent: true, parentId: "scene" }),
      nodeAt("child-b", 150, 30, {
        isClampedToParent: true,
        parentId: "scene",
      }),
      nodeAt("outside", 600, 0),
    ],
  });

/** A scene holding a state that holds a sub-state, and a node outside, with edges from the nested nodes to it. */
export const nested = (): Model =>
  init({
    edges: [
      edgeBetween("child-to-outside", "child-a", "outside"),
      edgeBetween("deep-to-outside", "deep", "outside"),
      edgeBetween("outside-to-sibling", "outside", "sibling"),
    ],
    id: "test-flow",
    isFitOnInit: false,
    nodes: [
      nodeAt("scene", 100, 100, { handles: [], height: 300, width: 400 }),
      nodeAt("child-a", 20, 30, {
        height: 200,
        isClampedToParent: true,
        parentId: "scene",
        width: 300,
      }),
      nodeAt("deep", 10, 10, { isClampedToParent: true, parentId: "child-a" }),
      nodeAt("outside", 600, 0),
      nodeAt("sibling", 600, 200),
    ],
  });

/** The node with this id; a test that names a node that is not there fails. */
export const nodeNamed = (nodes: readonly FlowNode[], id: string): FlowNode =>
  Option.getOrThrow(Array.findFirst(nodes, (node) => node.id === id));

/** The edge with this id; a test that names an edge that is not there fails. */
export const edgeNamed = (flow: Model, id: string): FlowEdge =>
  Option.getOrThrow(Array.findFirst(flow.edges, (edge) => edge.id === id));

export const idsOf = (items: readonly { readonly id: string }[]) =>
  Array.map(items, (item) => item.id);
