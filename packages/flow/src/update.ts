import { Array, Match, Option } from "effect";
import type { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";

import {
  clampToParent,
  fitViewport,
  nodeIdsInBox,
  zoomBy,
  zoomStep,
} from "./geometry.ts";
import { Message, OutMessage } from "./message.ts";
import type { Model } from "./model.ts";
import {
  nextNodeSelection,
  selectedEdgeIds,
  selectedNodeIds,
  withEdgeSelection,
  withNodeSelection,
  preserving,
} from "./selection.ts";
import { Interaction } from "./types.ts";
import type {
  Connection,
  ConnectionDraft,
  FlowEdge,
  FlowNode,
  XY,
} from "./types.ts";

// UPDATE

/** The static rules of a flow: code, not data, so they are declared once where the Submodel is made. */
export interface FlowOptions {
  /** Whether a connection may exist. Called while a connection is dragged (to colour it) and when it is dropped. */
  readonly isValidConnection: (connection: Connection) => boolean;
  /** How far an arrow key moves a node, in flow units; Shift moves it four times as far. */
  readonly keyboardStep: number;
}

export const defaultOptions: FlowOptions = {
  isValidConnection: () => true,
  keyboardStep: 10,
};

type Return = Update.ReturnWithOutMessage<Model, Message, OutMessage>;

type Tagged<Tag extends Message["_tag"]> = Extract<Message, { _tag: Tag }>;

const shiftMultiplier = 4;

// SELECTION

const select = (
  model: Model,
  nodeIds: readonly string[],
  edgeIds: readonly string[]
): Model =>
  modifyFields(model, {
    edges: (edges) => withEdgeSelection(edges, edgeIds),
    nodes: (nodes) => withNodeSelection(nodes, nodeIds),
  });

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && Array.every(a, (id, index) => id === b[index]);

// A selection that changed tells the application (`ChangedSelection`) and the live region (`announcement`).
const withSelectionChange = (
  before: Model,
  after: Model,
  announcement: string
): Return => {
  const nodeIds = selectedNodeIds(after.nodes);
  const edgeIds = selectedEdgeIds(after.edges);

  const isChanged =
    !sameIds(selectedNodeIds(before.nodes), nodeIds) ||
    !sameIds(selectedEdgeIds(before.edges), edgeIds);

  return isChanged
    ? {
        model: modifyFields(after, { announcement: () => announcement }),
        outMessage: OutMessage.ChangedSelection({ edgeIds, nodeIds }),
      }
    : { model: after };
};

const labelOf = (model: Model, id: string) =>
  Option.getOrElse(
    Option.map(
      Array.findFirst(model.nodes, (node) => node.id === id),
      (node) => node.label
    ),
    () => id
  );

const pressNode = (model: Model, id: string, isAdditive: boolean): Return => {
  const nodeIds = nextNodeSelection(
    selectedNodeIds(model.nodes),
    id,
    isAdditive
  );

  const edgeIds = isAdditive ? selectedEdgeIds(model.edges) : [];
  const verb = Array.contains(nodeIds, id) ? "Selected" : "Deselected";

  return withSelectionChange(
    model,
    select(model, nodeIds, edgeIds),
    `${verb} ${labelOf(model, id)}`
  );
};

const clearSelection = (model: Model): Return =>
  withSelectionChange(model, select(model, [], []), "Selection cleared");

const pressEdge = (model: Model, id: string): Return =>
  withSelectionChange(model, select(model, [], [id]), "Selected edge");

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

// BOX SELECT

const boxSelect = (model: Model, origin: XY, current: XY): Model =>
  select(model, nodeIdsInBox(model.nodes, model.viewport, origin, current), []);

const moveBox = (model: Model, point: XY): Model =>
  Interaction.matchOrElse(
    model.interaction,
    {
      BoxSelecting: ({ origin }) =>
        modifyFields(boxSelect(model, origin, point), {
          interaction: () =>
            Interaction.BoxSelecting({ current: point, origin }),
        }),
    },
    () => model
  );

const endBox = (model: Model): Return =>
  withSelectionChange(
    model,
    modifyFields(model, { interaction: () => Interaction.Idle() }),
    `${plural(selectedNodeIds(model.nodes).length, "node")} selected`
  );

// DRAG

const idle = (model: Model): Model =>
  modifyFields(model, { interaction: () => Interaction.Idle() });

const startDrag = (model: Model): Model =>
  modifyFields(model, {
    interaction: () =>
      Interaction.Dragging({ ids: selectedNodeIds(model.nodes) }),
  });

interface MovedItem {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

const moved = (node: FlowNode, items: readonly MovedItem[]): FlowNode => {
  const item = Array.findFirst(items, (candidate) => candidate.id === node.id);

  return Option.match(item, {
    onNone: () => node,
    onSome: ({ x, y }) =>
      node.position.x === x && node.position.y === y
        ? node
        : { ...node, position: { x, y } },
  });
};

const dragNodes = (model: Model, items: readonly MovedItem[]): Model =>
  modifyFields(model, {
    nodes: (nodes) => preserving(nodes, (node) => moved(node, items)),
  });

const stopDrag = (model: Model): Return => ({
  model: idle(model),
  outMessage: OutMessage.Moved({
    nodeIds: Interaction.matchOrElse(
      model.interaction,
      { Dragging: ({ ids }) => ids },
      () => []
    ),
  }),
});

// CONNECT

const toConnection = (draft: ConnectionDraft): Option.Option<Connection> => {
  const { to } = draft;

  if (to === undefined) {
    return Option.none();
  }

  const from = { handle: draft.from.handle, node: draft.from.nodeId };
  const end = { handle: to.handle, node: to.nodeId };

  const [source, target] =
    draft.from.kind === "source" ? [from, end] : [end, from];

  return Option.some({
    source: source.node,
    sourceHandle: source.handle,
    target: target.node,
    targetHandle: target.handle,
  });
};

const draftFrom = (message: Tagged<"UpdatedConnection">): ConnectionDraft => ({
  from: {
    handle: message.fromHandle,
    kind: message.fromKind,
    nodeId: message.fromNodeId,
    point: message.fromPoint,
  },
  pointer: message.pointer,
  reconnecting: message.reconnecting,
  to:
    message.toNodeId === undefined || message.toPosition === undefined
      ? undefined
      : {
          handle: message.toHandle,
          nodeId: message.toNodeId,
          position: message.toPosition,
        },
  validity: "Unknown",
});

const validityOf = (options: FlowOptions, draft: ConnectionDraft) =>
  Option.match(toConnection(draft), {
    onNone: () => "Unknown" as const,
    onSome: (connection) =>
      options.isValidConnection(connection)
        ? ("Valid" as const)
        : ("Invalid" as const),
  });

const updateConnection = (
  model: Model,
  options: FlowOptions,
  message: Tagged<"UpdatedConnection">
): Model => {
  const draft = draftFrom(message);

  return modifyFields(model, {
    interaction: () =>
      Interaction.Connecting({
        draft: { ...draft, validity: validityOf(options, draft) },
      }),
  });
};

const dropped = (
  model: Model,
  options: FlowOptions,
  connection: Connection,
  verb: string,
  outMessage: OutMessage
): Return =>
  options.isValidConnection(connection)
    ? {
        model: modifyFields(idle(model), {
          announcement: () =>
            `${verb} ${labelOf(model, connection.source)} to ${labelOf(model, connection.target)}`,
        }),
        outMessage,
      }
    : { model: idle(model) };

// DELETE

const hasEndIn = (edge: FlowEdge, ids: readonly string[]) =>
  Array.contains(ids, edge.source) || Array.contains(ids, edge.target);

// Deletes the selected nodes and edges, or just the focused node when nothing is selected, and every edge that ends on
// a deleted node (and the children of a deleted parent).
const deleteSelection = (
  model: Model,
  focusedId: Option.Option<string>
): Return => {
  const selected = selectedNodeIds(model.nodes);
  const nodeIds = selected.length === 0 ? Option.toArray(focusedId) : selected;

  const edgeIds = Array.map(
    Array.filter(
      model.edges,
      (edge) => edge.selected || hasEndIn(edge, nodeIds)
    ),
    (edge) => edge.id
  );

  if (nodeIds.length === 0 && edgeIds.length === 0) {
    return { model };
  }

  const summary = `${plural(nodeIds.length, "node")} and ${plural(edgeIds.length, "edge")}`;

  return {
    model: modifyFields(model, {
      announcement: () => `Deleted ${summary}`,
      edges: (edges) =>
        Array.filter(edges, (edge) => !Array.contains(edgeIds, edge.id)),
      nodes: (nodes) =>
        Array.filter(
          nodes,
          (node) =>
            !Array.contains(nodeIds, node.id) &&
            !Array.contains(nodeIds, node.parentId ?? "")
        ),
    }),
    outMessage: OutMessage.Deleted({ edgeIds, nodeIds }),
  };
};

// KEYBOARD

const arrowDelta = (key: string, step: number): Option.Option<XY> =>
  Match.value(key).pipe(
    Match.when("ArrowLeft", () => Option.some({ x: -step, y: 0 })),
    Match.when("ArrowRight", () => Option.some({ x: step, y: 0 })),
    Match.when("ArrowUp", () => Option.some({ x: 0, y: -step })),
    Match.when("ArrowDown", () => Option.some({ x: 0, y: step })),
    Match.orElse(() => Option.none())
  );

const hasAncestorIn = (
  nodes: readonly FlowNode[],
  node: FlowNode,
  ids: readonly string[]
): boolean =>
  node.parentId !== undefined &&
  (Array.contains(ids, node.parentId) ||
    Option.exists(
      Array.findFirst(nodes, (candidate) => candidate.id === node.parentId),
      (parent) => hasAncestorIn(nodes, parent, ids)
    ));

// A child moves with its parent, so a selected child whose parent is also selected stays where it is.
const shifted = (
  nodes: readonly FlowNode[],
  node: FlowNode,
  ids: readonly string[],
  delta: XY
) =>
  Array.contains(ids, node.id) &&
  node.draggable &&
  !hasAncestorIn(nodes, node, ids)
    ? {
        ...node,
        position: clampToParent(nodes, node, {
          x: node.position.x + delta.x,
          y: node.position.y + delta.y,
        }),
      }
    : node;

const describeMove = (node: Option.Option<FlowNode>) =>
  Option.match(node, {
    onNone: () => "",
    onSome: (found) =>
      `Moved ${found.label} to ${Math.round(found.position.x)}, ${Math.round(found.position.y)}`,
  });

const moveByKey = (model: Model, focusedId: string, delta: XY): Return => {
  const selected = selectedNodeIds(model.nodes);
  const ids = Array.contains(selected, focusedId) ? selected : [focusedId];

  const nodes = preserving(model.nodes, (node) =>
    shifted(model.nodes, node, ids, delta)
  );

  const focused = Array.findFirst(nodes, (node) => node.id === focusedId);

  return {
    model: modifyFields(model, {
      announcement: () => describeMove(focused),
      nodes: () => nodes,
    }),
    outMessage: OutMessage.Moved({ nodeIds: ids }),
  };
};

const pressNodeKey = (
  model: Model,
  options: FlowOptions,
  message: Tagged<"PressedNodeKey">
): Return => {
  const step = options.keyboardStep * (message.isShift ? shiftMultiplier : 1);

  return Option.match(arrowDelta(message.key, step), {
    onNone: () =>
      Match.value(message.key).pipe(
        Match.withReturnType<Return>(),
        Match.whenOr("Enter", " ", () =>
          pressNode(model, message.id, message.isShift)
        ),
        Match.whenOr("Delete", "Backspace", () =>
          deleteSelection(model, Option.some(message.id))
        ),
        Match.when("Escape", () => clearSelection(model)),
        Match.orElse(() => ({ model }))
      ),
    onSome: (delta) => moveByKey(model, message.id, delta),
  });
};

// VIEWPORT

const refit = (model: Model): Model =>
  modifyFields(model, {
    viewport: () =>
      fitViewport(model.nodes, model.size, model.minZoom, model.maxZoom),
  });

const zoom = (model: Model, factor: number): Model =>
  modifyFields(model, {
    viewport: (viewport) =>
      zoomBy(viewport, model.size, factor, model.minZoom, model.maxZoom),
  });

// The first time the pane has a size and the flow has nodes, the flow is fitted into view.
const resized = (model: Model, width: number, height: number): Model => {
  const next = modifyFields(model, { size: () => ({ height, width }) });
  const isReady = width > 0 && height > 0 && model.nodes.length > 0;

  return model.isFitOnInit && !model.hasFitted && isReady
    ? modifyFields(refit(next), { hasFitted: () => true })
    : next;
};

const pressCanvasKey = (model: Model, key: string): Return =>
  Match.value(key).pipe(
    Match.withReturnType<Return>(),
    Match.whenOr("+", "=", () => ({ model: zoom(model, zoomStep) })),
    Match.whenOr("-", "_", () => ({ model: zoom(model, 1 / zoomStep) })),
    Match.when("0", () => ({ model: refit(model) })),
    Match.when("Escape", () => clearSelection(model)),
    Match.whenOr("Delete", "Backspace", () =>
      deleteSelection(model, Option.none())
    ),
    Match.orElse(() => ({ model }))
  );

// A pan gesture may start or end only while the pointer is doing nothing else.
const changePanning = (model: Model, isPanning: boolean): Model =>
  modifyFields(model, {
    interaction: (interaction) =>
      Interaction.matchOrElse(
        interaction,
        {
          Idle: () => (isPanning ? Interaction.Panning() : interaction),
          Panning: () => (isPanning ? interaction : Interaction.Idle()),
        },
        () => interaction
      ),
  });

/**
 * Makes the Flow's `update`, bound to its static rules. It is a pure function of the Model and the Message and returns
 * no Command: the work lives in the Mounts that own the xyflow controllers.
 */
export const flowUpdate =
  (options: FlowOptions) =>
  (model: Model, message: Message): Return =>
    Message.match<Return>(message, {
      ChangedPanning: ({ isPanning }) => ({
        model: changePanning(model, isPanning),
      }),
      ClickedFitView: () => ({ model: refit(model) }),
      ClickedZoomIn: () => ({ model: zoom(model, zoomStep) }),
      ClickedZoomOut: () => ({ model: zoom(model, 1 / zoomStep) }),
      CompletedMinimapMount: () => ({ model }),
      ConnectedHandles: ({ connection }) =>
        dropped(
          model,
          options,
          connection,
          "Connected",
          OutMessage.Connected({ connection })
        ),
      DraggedNodes: ({ items }) => ({ model: dragNodes(model, items) }),
      EndedBoxSelect: () => endBox(model),
      EndedConnection: () => ({ model: idle(model) }),
      MovedBoxSelect: ({ point }) => ({ model: moveBox(model, point) }),
      PanZoomed: ({ x, y, zoom: nextZoom }) => ({
        model: modifyFields(model, {
          viewport: () => ({ x, y, zoom: nextZoom }),
        }),
      }),
      PressedCanvasKey: ({ key }) => pressCanvasKey(model, key),
      PressedEdge: ({ id }) => pressEdge(model, id),
      PressedNode: ({ id, isAdditive }) => pressNode(model, id, isAdditive),
      PressedNodeKey: (keyMessage) => pressNodeKey(model, options, keyMessage),
      PressedPane: () => clearSelection(model),
      ReconnectedHandles: ({ connection, edgeId }) =>
        dropped(
          model,
          options,
          connection,
          "Reconnected",
          OutMessage.Reconnected({ connection, edgeId })
        ),
      ResizedPane: ({ height, width }) => ({
        model: resized(model, width, height),
      }),
      StartedBoxSelect: ({ point }) => ({
        model: modifyFields(model, {
          interaction: () =>
            Interaction.BoxSelecting({ current: point, origin: point }),
        }),
      }),
      StartedNodeDrag: () => ({ model: startDrag(model) }),
      StoppedNodeDrag: () => stopDrag(model),
      UpdatedConnection: (draftMessage) => ({
        model: updateConnection(model, options, draftMessage),
      }),
    });

/** What an application says about an edge it adds for a `Connected` out-message (the ends come from the connection). */
export interface NewEdge {
  readonly hasArrow: boolean;
  readonly id: string;
  readonly kind: FlowEdge["kind"];
  readonly label: string;
}

const joins = (edge: FlowEdge, connection: Connection) =>
  edge.source === connection.source &&
  edge.target === connection.target &&
  edge.sourceHandle === connection.sourceHandle &&
  edge.targetHandle === connection.targetHandle;

/** Adds the edge a `Connected` out-message describes, unless an edge already joins the same handles. */
export const addEdge = (
  model: Model,
  connection: Connection,
  edge: NewEdge
): Model =>
  Array.some(model.edges, (existing) => joins(existing, connection))
    ? model
    : modifyFields(model, {
        edges: (edges) => [
          ...edges,
          {
            ...edge,
            selected: false,
            source: connection.source,
            sourceHandle: connection.sourceHandle,
            target: connection.target,
            targetHandle: connection.targetHandle,
          },
        ],
      });

/** Moves the end of an edge a `Reconnected` out-message describes. */
export const reconnectEdge = (
  model: Model,
  edgeId: string,
  connection: Connection
): Model =>
  modifyFields(model, {
    edges: (edges) =>
      Array.map(edges, (edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              source: connection.source,
              sourceHandle: connection.sourceHandle,
              target: connection.target,
              targetHandle: connection.targetHandle,
            }
          : edge
      ),
  });
