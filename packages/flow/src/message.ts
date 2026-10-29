import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { Connection, XY } from "./types.ts";

// MESSAGE

const MovedItem = Schema.Struct({
  id: Schema.NonEmptyString,
  x: Schema.Finite,
  y: Schema.Finite,
});

const DraftFields = {
  fromHandle: Schema.optional(Schema.NonEmptyString),
  fromKind: Schema.Literals(["source", "target"]),
  fromNodeId: Schema.NonEmptyString,
  fromPoint: XY,
  pointer: XY,
  reconnecting: Schema.optional(Schema.NonEmptyString),
  toHandle: Schema.optional(Schema.NonEmptyString),
  toNodeId: Schema.optional(Schema.NonEmptyString),
  toPosition: Schema.optional(XY),
};

/**
 * Everything the Flow Submodel reacts to. The Mounts that own the xyflow controllers produce the pane, node and
 * handle Messages; the view produces the key and button Messages.
 */
export const Message = defineMessageUnion({
  ChangedPanning: { isPanning: Schema.Boolean },
  ClickedFitView: {},
  ClickedZoomIn: {},
  ClickedZoomOut: {},
  CompletedMinimapMount: {},
  ConnectedHandles: { connection: Connection },
  DraggedNodes: { items: Schema.Array(MovedItem) },
  EndedBoxSelect: {},
  EndedConnection: {},
  MovedBoxSelect: { point: XY },
  PanZoomed: { x: Schema.Finite, y: Schema.Finite, zoom: Schema.Finite },
  PressedCanvasKey: { key: Schema.String },
  PressedEdge: { id: Schema.NonEmptyString },
  PressedNode: { id: Schema.NonEmptyString, isAdditive: Schema.Boolean },
  PressedNodeKey: {
    id: Schema.NonEmptyString,
    isShift: Schema.Boolean,
    key: Schema.String,
  },
  PressedPane: {},
  ReconnectedHandles: {
    connection: Connection,
    edgeId: Schema.NonEmptyString,
  },
  ResizedPane: { height: Schema.Finite, width: Schema.Finite },
  StartedBoxSelect: { point: XY },
  StartedNodeDrag: { id: Schema.NonEmptyString },
  StoppedNodeDrag: {},
  UpdatedConnection: DraftFields,
});

export type Message = typeof Message.Type;

// OUT MESSAGE

/**
 * What the application is told. The Flow does not add an edge for `Connected`: the application decides (and may add
 * it with `addEdge`).
 */
export const OutMessage = defineMessageUnion({
  ChangedSelection: {
    edgeIds: Schema.Array(Schema.NonEmptyString),
    nodeIds: Schema.Array(Schema.NonEmptyString),
  },
  Connected: { connection: Connection },
  Deleted: {
    edgeIds: Schema.Array(Schema.NonEmptyString),
    nodeIds: Schema.Array(Schema.NonEmptyString),
  },
  Moved: { nodeIds: Schema.Array(Schema.NonEmptyString) },
  Reconnected: { connection: Connection, edgeId: Schema.NonEmptyString },
});

export type OutMessage = typeof OutMessage.Type;
