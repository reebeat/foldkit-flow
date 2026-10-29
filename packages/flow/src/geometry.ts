import {
  ConnectionMode,
  Position,
  adoptUserNodes,
  getBezierPath,
  getEdgePosition,
  getInternalNodesBounds,
  getNodesInside,
  getSmoothStepPath,
  getStraightPath,
  getViewportForBounds,
} from "@xyflow/system";
import type {
  EdgePosition,
  Handle,
  InternalNodeBase,
  NodeBase,
  ParentLookup,
} from "@xyflow/system";
import { Array, Match, Option } from "effect";

import type { FlowEdge, FlowNode, Side, Size, Viewport, XY } from "./types.ts";

// Pure geometry. The xyflow utilities do the work; these functions adapt the Model's plain data to them and back.

/** The side length, in flow units, of the square a handle occupies. */
export const handleSize = 10;

export const zoomStep = 1.2;

const fitPadding = 0.1;

const sides: readonly Side[] = ["Top", "Right", "Bottom", "Left"];

const sideToPosition = (side: Side): Position =>
  Match.value(side).pipe(
    Match.when("Top", () => Position.Top),
    Match.when("Right", () => Position.Right),
    Match.when("Bottom", () => Position.Bottom),
    Match.when("Left", () => Position.Left),
    Match.exhaustive
  );

const placeOnSide = (
  node: FlowNode,
  side: Side,
  index: number,
  count: number
): XY => {
  const half = handleSize / 2;
  const ratio = (index + 1) / (count + 1);

  return Match.value(side).pipe(
    Match.when("Left", () => ({ x: -half, y: node.height * ratio - half })),
    Match.when("Right", () => ({
      x: node.width - half,
      y: node.height * ratio - half,
    })),
    Match.when("Top", () => ({ x: node.width * ratio - half, y: -half })),
    Match.when("Bottom", () => ({
      x: node.width * ratio - half,
      y: node.height - half,
    })),
    Match.exhaustive
  );
};

/** Where each handle of the node sits, in the node's own coordinates: handles on one side are spread evenly. */
export const handleLayout = (node: FlowNode): readonly Handle[] =>
  Array.flatMap(sides, (side) => {
    const onSide = Array.filter(node.handles, (handle) => handle.side === side);

    return Array.map(onSide, (handle, index) => ({
      height: handleSize,
      id: handle.id,
      nodeId: node.id,
      position: sideToPosition(side),
      type: handle.kind,
      width: handleSize,
      ...placeOnSide(node, side, index, onSide.length),
    }));
  });

const withParent = (base: NodeBase, node: FlowNode): NodeBase =>
  node.parentId === undefined ? base : { ...base, parentId: node.parentId };

const withExtent = (base: NodeBase, node: FlowNode): NodeBase =>
  node.isClampedToParent ? { ...base, extent: "parent" } : base;

const toNodeBase = (node: FlowNode): NodeBase =>
  withExtent(
    withParent(
      {
        data: {},
        draggable: node.draggable,
        handles: [...handleLayout(node)],
        height: node.height,
        id: node.id,
        position: node.position,
        selected: node.selected,
        type: node.type,
        width: node.width,
      },
      node
    ),
    node
  );

export interface Lookups {
  readonly nodeLookup: Map<string, InternalNodeBase>;
  readonly parentLookup: ParentLookup;
}

// A node that did not change keeps its xyflow base (and so its handle layout), so a lookup of a list that differs by one
// node allocates for that node only.
const baseCache = new WeakMap<FlowNode, NodeBase>();

const baseOf = (node: FlowNode): NodeBase => {
  const cached = baseCache.get(node);

  if (cached !== undefined) {
    return cached;
  }

  const built = toNodeBase(node);

  baseCache.set(node, built);

  return built;
};

const lookupCache = new WeakMap<readonly FlowNode[], Lookups>();

/**
 * The xyflow node lookup and parent lookup of a node list: absolute positions, handle bounds. This is what the
 * controllers read; it is memoised on the list, so it is built once per list and only when a controller asks.
 */
export const lookupsOf = (nodes: readonly FlowNode[]): Lookups => {
  const cached = lookupCache.get(nodes);

  if (cached !== undefined) {
    return cached;
  }

  const nodeLookup = new Map<string, InternalNodeBase>();
  const parentLookup: ParentLookup = new Map();

  adoptUserNodes(Array.map(nodes, baseOf), nodeLookup, parentLookup, {
    elevateNodesOnSelect: true,
  });

  const built = { nodeLookup, parentLookup };

  lookupCache.set(nodes, built);

  return built;
};

const absoluteCache = new WeakMap<
  readonly FlowNode[],
  ReadonlyMap<string, XY>
>();

/** The position of every node in flow coordinates (its own plus its parents'), memoised on the list. */
export const absolutePositions = (
  nodes: readonly FlowNode[]
): ReadonlyMap<string, XY> => {
  const cached = absoluteCache.get(nodes);

  if (cached !== undefined) {
    return cached;
  }

  const byId = new Map(Array.map(nodes, (node) => [node.id, node] as const));
  const resolved = new Map<string, XY>();
  const visiting = new Set<string>();

  const resolve = (node: FlowNode): XY => {
    const done = resolved.get(node.id);

    if (done !== undefined) {
      return done;
    }

    const parent =
      node.parentId === undefined || visiting.has(node.id)
        ? undefined
        : byId.get(node.parentId);

    visiting.add(node.id);

    const origin = parent === undefined ? { x: 0, y: 0 } : resolve(parent);

    const absolute = {
      x: origin.x + node.position.x,
      y: origin.y + node.position.y,
    };

    resolved.set(node.id, absolute);

    return absolute;
  };

  for (const node of nodes) {
    resolve(node);
  }

  absoluteCache.set(nodes, resolved);

  return resolved;
};

const internalOf = (node: FlowNode, absolute: XY): InternalNodeBase => {
  const base = toNodeBase(node);
  const handles = handleLayout(node);

  return {
    ...base,
    internals: {
      handleBounds: {
        source: Array.filter(handles, (handle) => handle.type === "source"),
        target: Array.filter(handles, (handle) => handle.type === "target"),
      },
      positionAbsolute: absolute,
      userNode: base,
      z: 0,
    },
    measured: { height: node.height, width: node.width },
  };
};

export interface EdgeGeometry {
  readonly labelX: number;
  readonly labelY: number;
  readonly path: string;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
}

const pathFor = (
  edge: FlowEdge,
  ends: EdgePosition
): readonly [string, number, number] => {
  const [path, labelX, labelY] = Match.value(edge.kind).pipe(
    Match.when("Straight", () => getStraightPath(ends)),
    Match.when("SmoothStep", () => getSmoothStepPath(ends)),
    Match.when("Bezier", () => getBezierPath(ends)),
    Match.exhaustive
  );

  return [path, labelX, labelY];
};

/** An end node of an edge with its absolute position. */
export interface EdgeEnd {
  readonly absolute: XY;
  readonly node: FlowNode;
}

/** The drawn shape of an edge, or none when the handle an end names does not exist on its node. */
export const edgeGeometry = (
  edge: FlowEdge,
  source: EdgeEnd,
  target: EdgeEnd
): Option.Option<EdgeGeometry> => {
  const ends = getEdgePosition({
    connectionMode: ConnectionMode.Strict,
    id: edge.id,
    sourceHandle: edge.sourceHandle ?? null,
    sourceNode: internalOf(source.node, source.absolute),
    targetHandle: edge.targetHandle ?? null,
    targetNode: internalOf(target.node, target.absolute),
  });

  if (ends === null) {
    return Option.none();
  }

  const [path, labelX, labelY] = pathFor(edge, ends);

  return Option.some({
    labelX,
    labelY,
    path,
    sourceX: ends.sourceX,
    sourceY: ends.sourceY,
    targetX: ends.targetX,
    targetY: ends.targetY,
  });
};

export const identityViewport: Viewport = { x: 0, y: 0, zoom: 1 };

/** The viewport that frames every node with padding, within the zoom limits; the identity for no nodes. */
export const fitViewport = (
  nodes: readonly FlowNode[],
  size: Size,
  minZoom: number,
  maxZoom: number
): Viewport => {
  const { nodeLookup } = lookupsOf(nodes);

  if (nodeLookup.size === 0 || size.width === 0 || size.height === 0) {
    return identityViewport;
  }

  return getViewportForBounds(
    getInternalNodesBounds(nodeLookup),
    size.width,
    size.height,
    minZoom,
    maxZoom,
    fitPadding
  );
};

const clampZoom = (zoom: number, minZoom: number, maxZoom: number) =>
  Math.min(maxZoom, Math.max(minZoom, zoom));

/** The viewport after zooming by `factor` around the centre of the pane, within the zoom limits. */
export const zoomBy = (
  viewport: Viewport,
  size: Size,
  factor: number,
  minZoom: number,
  maxZoom: number
): Viewport => {
  const zoom = clampZoom(viewport.zoom * factor, minZoom, maxZoom);
  const ratio = zoom / viewport.zoom;
  const centreX = size.width / 2;
  const centreY = size.height / 2;

  return {
    x: centreX - (centreX - viewport.x) * ratio,
    y: centreY - (centreY - viewport.y) * ratio,
    zoom,
  };
};

/** A box given by two corners, in any order, as a rectangle. */
const boxFromCorners = (a: XY, b: XY) => ({
  height: Math.abs(a.y - b.y),
  width: Math.abs(a.x - b.x),
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
});

/** The ids of the nodes that touch a box drawn on the pane (screen coordinates relative to the pane). */
export const nodeIdsInBox = (
  nodes: readonly FlowNode[],
  viewport: Viewport,
  a: XY,
  b: XY
): readonly string[] =>
  Array.map(
    getNodesInside(
      lookupsOf(nodes).nodeLookup,
      boxFromCorners(a, b),
      [viewport.x, viewport.y, viewport.zoom],
      true,
      true
    ),
    (node) => node.id
  );

/** A rectangle in flow coordinates. */
interface Rect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/** The size, in pixels, of the minimap. */
export const minimapSize: Size = { height: 150, width: 200 };

const minimapPadding = 5;

export interface MinimapGeometry {
  /** Flow units per minimap pixel. */
  readonly scale: number;
  /** The `viewBox` of the minimap: every node and the visible area, centred, with padding. */
  readonly viewBox: Rect;
  /** The part of the flow the pane shows. */
  readonly visible: Rect;
}

const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);

  return {
    height: Math.max(a.y + a.height, b.y + b.height) - y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    x,
    y,
  };
};

/** The minimap's frame, computed from the node list, the viewport and the pane size (as React Flow's MiniMap does). */
export const minimapGeometry = (
  nodes: readonly FlowNode[],
  viewport: Viewport,
  size: Size
): MinimapGeometry => {
  const visible: Rect = {
    height: size.height / viewport.zoom,
    width: size.width / viewport.zoom,
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
  };

  const absolutes = absolutePositions(nodes);

  const bounds = Array.reduce(nodes, visible, (frame, node) => {
    const at = absolutes.get(node.id) ?? node.position;

    return union(frame, {
      height: node.height,
      width: node.width,
      x: at.x,
      y: at.y,
    });
  });

  const scale = Math.max(
    bounds.width / minimapSize.width,
    bounds.height / minimapSize.height,
    Number.EPSILON
  );

  const viewWidth = scale * minimapSize.width;
  const viewHeight = scale * minimapSize.height;
  const offset = minimapPadding * scale;

  return {
    scale,
    viewBox: {
      height: viewHeight + offset * 2,
      width: viewWidth + offset * 2,
      x: bounds.x - (viewWidth - bounds.width) / 2 - offset,
      y: bounds.y - (viewHeight - bounds.height) / 2 - offset,
    },
    visible,
  };
};

/** A position clamped to the inside of the parent, when the node asks for it; unchanged otherwise. */
export const clampToParent = (
  nodes: readonly FlowNode[],
  node: FlowNode,
  position: XY
): XY => {
  const parent = Option.flatMap(Option.fromNullishOr(node.parentId), (id) =>
    Array.findFirst(nodes, (candidate) => candidate.id === id)
  );

  if (!node.isClampedToParent || Option.isNone(parent)) {
    return position;
  }

  return {
    x: Math.min(
      Math.max(0, position.x),
      Math.max(0, parent.value.width - node.width)
    ),
    y: Math.min(
      Math.max(0, position.y),
      Math.max(0, parent.value.height - node.height)
    ),
  };
};
