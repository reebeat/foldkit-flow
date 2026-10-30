import type { FlowEdge, FlowNode, HandleDef } from "@tsukuri/flow";
import { Array } from "effect";

// The three graphs of the example, as pure data. Layout is the application's job: positions here are written by hand
// (and, for the large graph, computed from the index); an ELK.js layout would produce the same kind of data.

export interface Graph {
  readonly edges: readonly FlowEdge[];
  readonly nodes: readonly FlowNode[];
}

const input: HandleDef = { id: "in", kind: "target", side: "Left" };

const output: HandleDef = { id: "out", kind: "source", side: "Right" };

interface NodeOptions {
  readonly handles?: readonly HandleDef[];
  readonly height?: number;
  readonly isClampedToParent?: boolean;
  readonly parentId?: string;
  readonly type?: string;
  readonly width?: number;
}

const node = (
  id: string,
  label: string,
  x: number,
  y: number,
  options: NodeOptions = {}
): FlowNode => ({
  data: { title: label },
  draggable: true,
  handles: options.handles ?? [input, output],
  height: options.height ?? 50,
  id,
  isClampedToParent: options.isClampedToParent ?? false,
  label,
  parentId: options.parentId,
  position: { x, y },
  selected: false,
  type: options.type ?? "state",
  width: options.width ?? 140,
});

const edge = (
  id: string,
  source: string,
  target: string,
  kind: FlowEdge["kind"] = "Bezier",
  label = ""
): FlowEdge => ({
  hasArrow: true,
  id,
  kind,
  label,
  selected: false,
  source,
  sourceHandle: "out",
  target,
  targetHandle: "in",
});

/** The journey graph: five states, three edge kinds. */
export const small: Graph = {
  edges: [
    edge("e1", "start", "load"),
    edge("e2", "load", "check", "SmoothStep", "ok"),
    edge("e3", "check", "done", "Straight"),
    edge("e4", "check", "load", "Bezier", "retry"),
  ],
  nodes: [
    node("start", "Start", 0, 60, { handles: [output], width: 100 }),
    node("load", "Load", 200, 0),
    node("check", "Check", 420, 60),
    node("done", "Done", 640, 60, { handles: [input], width: 100 }),
    node("spare", "Spare", 200, 160),
  ],
};

/** Scenes (parent nodes) that hold States: the statechart shape. */
export const compound: Graph = {
  edges: [
    edge("c1", "intro-a", "intro-b"),
    edge("c2", "intro-b", "main-a", "SmoothStep"),
    edge("c3", "main-a", "main-b"),
  ],
  nodes: [
    node("intro", "Scene: Intro", 0, 0, {
      handles: [],
      height: 200,
      type: "scene",
      width: 360,
    }),
    node("intro-a", "Title", 24, 70, {
      isClampedToParent: true,
      parentId: "intro",
    }),
    node("intro-b", "Credits", 190, 70, {
      isClampedToParent: true,
      parentId: "intro",
    }),
    node("main", "Scene: Main", 460, 0, {
      handles: [],
      height: 200,
      type: "scene",
      width: 360,
    }),
    node("main-a", "Talk", 484, 70, {
      isClampedToParent: true,
      parentId: "main",
    }),
    node("main-b", "Demo", 650, 70, {
      isClampedToParent: true,
      parentId: "main",
    }),
  ],
};

const columns = 25;

const largeNodeCount = 500;

const largeEdgeCount = 700;

const nodeIds = Array.makeBy(largeNodeCount, (index) => `n${index}`);

/** The performance graph: 500 nodes in a grid and 700 edges. */
export const large: Graph = {
  edges: Array.makeBy(largeEdgeCount, (index) => {
    const source = index % largeNodeCount;
    const rawTarget = (index * 7 + 1 + (index % 3)) % largeNodeCount;

    const target =
      rawTarget === source ? (source + 1) % largeNodeCount : rawTarget;

    return edge(`e${index}`, nodeIds[source] ?? "n0", nodeIds[target] ?? "n1");
  }),
  nodes: Array.map(nodeIds, (id, index) =>
    node(
      id,
      `Node ${index}`,
      (index % columns) * 180,
      Math.floor(index / columns) * 90,
      {
        width: 120,
      }
    )
  ),
};
