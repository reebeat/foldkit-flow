import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

// The data the Flow Model holds. Everything here is plain, serialisable data: positions, sizes, ids, flags.

export const XY = Schema.Struct({ x: Schema.Finite, y: Schema.Finite });

export type XY = typeof XY.Type;

export const Viewport = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  zoom: Schema.Finite,
});

export type Viewport = typeof Viewport.Type;

export const Size = Schema.Struct({
  height: Schema.Finite,
  width: Schema.Finite,
});

export type Size = typeof Size.Type;

export const Side = Schema.Literals(["Top", "Right", "Bottom", "Left"]);

export type Side = typeof Side.Type;

const HandleKind = Schema.Literals(["source", "target"]);

type HandleKind = typeof HandleKind.Type;

/** A port on a node: where a connection starts (`source`) or ends (`target`), on which side of the node. */
export const HandleDef = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: HandleKind,
  side: Side,
});

export type HandleDef = typeof HandleDef.Type;

/**
 * A node. `width` and `height` are part of the node (the application, or a layout it ran, knows them), so edges can
 * be placed without measuring the DOM. `position` is relative to the parent node when `parentId` is set.
 */
export const FlowNode = Schema.Struct({
  data: Schema.Json,
  draggable: Schema.Boolean,
  handles: Schema.Array(HandleDef),
  height: Schema.Finite,
  id: Schema.NonEmptyString,
  isClampedToParent: Schema.Boolean,
  label: Schema.String,
  parentId: Schema.optional(Schema.NonEmptyString),
  position: XY,
  selected: Schema.Boolean,
  type: Schema.NonEmptyString,
  width: Schema.Finite,
});

export type FlowNode = typeof FlowNode.Type;

export const EdgeKind = Schema.Literals(["Bezier", "SmoothStep", "Straight"]);

export type EdgeKind = typeof EdgeKind.Type;

export const FlowEdge = Schema.Struct({
  hasArrow: Schema.Boolean,
  id: Schema.NonEmptyString,
  kind: EdgeKind,
  label: Schema.String,
  selected: Schema.Boolean,
  source: Schema.NonEmptyString,
  sourceHandle: Schema.optional(Schema.NonEmptyString),
  target: Schema.NonEmptyString,
  targetHandle: Schema.optional(Schema.NonEmptyString),
});

export type FlowEdge = typeof FlowEdge.Type;

/** The two ends of an edge that is about to exist: what `Connected` and `Reconnected` carry. */
export const Connection = Schema.Struct({
  source: Schema.NonEmptyString,
  sourceHandle: Schema.optional(Schema.NonEmptyString),
  target: Schema.NonEmptyString,
  targetHandle: Schema.optional(Schema.NonEmptyString),
});

export type Connection = typeof Connection.Type;

/** A connection being dragged from a handle: where it started, where the pointer is, and what is under it. */
export const ConnectionDraft = Schema.Struct({
  from: Schema.Struct({
    handle: Schema.optional(Schema.NonEmptyString),
    kind: HandleKind,
    nodeId: Schema.NonEmptyString,
    /** The handle's centre in flow coordinates. */
    point: XY,
  }),
  pointer: XY,
  /** The edge whose end is being moved, when the drag started on a reconnect anchor. */
  reconnecting: Schema.optional(Schema.NonEmptyString),
  to: Schema.optional(
    Schema.Struct({
      handle: Schema.optional(Schema.NonEmptyString),
      nodeId: Schema.NonEmptyString,
      position: XY,
    })
  ),
  validity: Schema.Literals(["Unknown", "Valid", "Invalid"]),
});

export type ConnectionDraft = typeof ConnectionDraft.Type;

/** What the pointer is doing on the canvas. Pan and zoom are the controller's; the Model records only the box. */
export const Interaction = defineTaggedUnion({
  BoxSelecting: { current: XY, origin: XY },
  Connecting: { draft: ConnectionDraft },
  Dragging: { ids: Schema.Array(Schema.NonEmptyString) },
  Idle: {},
  Panning: {},
});

export type Interaction = typeof Interaction.Type;
