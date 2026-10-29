import {
  ConnectionMode,
  PanOnScrollMode,
  XYDrag,
  XYHandle,
  XYMinimap,
  XYPanZoom,
} from "@xyflow/system";
import type {
  Connection as XyConnection,
  ConnectionInProgress,
  Handle,
  PanZoomInstance,
  XYPosition,
} from "@xyflow/system";
import { select } from "d3-selection";
import type { Cause } from "effect";
import { Array, Effect, Option, Queue, Schedule, Schema, Stream } from "effect";
import { constVoid, flow as compose } from "effect/Function";
import * as Mount from "foldkit/mount";

import { lookupsOf, minimapGeometry, minimapSize } from "./geometry.ts";
import { Message } from "./message.ts";
import {
  nextNodeSelection,
  selectedNodeIds,
  withNodeSelection,
} from "./selection.ts";
import {
  boundsOf,
  handleClass,
  paneOf,
  readSnapshot,
  viewportClass,
} from "./snapshot.ts";
import type { FlowSnapshot } from "./snapshot.ts";
import type { Connection, FlowEdge, FlowNode, Viewport, XY } from "./types.ts";

// MOUNTS
//
// Each xyflow controller is created and destroyed by a Mount: `Mount.defineStream` runs when the element enters the DOM
// and its scope closes when the element leaves it. The controller is the success value of `Effect.acquireRelease`'s
// acquire, and the release destroys it, so nothing outlives its element. Callbacks of a controller dispatch Messages
// through the stream's queue. A controller reads the Model through the snapshot the view publishes on the pane.

type Send<A> = (message: A) => void;

// The sender of a stream's queue: callbacks of a controller call it with Messages.
const sendTo =
  <A>(queue: Queue.Queue<A, Cause.Done>): Send<A> =>
  (message) => {
    Queue.offerUnsafe(queue, message);
  };

const lib = "foldkit";

const unbounded: [[number, number], [number, number]] = [
  [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
];

const identity: Viewport = { x: 0, y: 0, zoom: 1 };

const panZooms = new WeakMap<Element, PanZoomInstance>();

const viewportOf = (element: Element) =>
  Option.match(readSnapshot(element), {
    onNone: () => identity,
    onSome: (snapshot) => snapshot.flow.viewport,
  });

const transformOf = (element: Element): [number, number, number] => {
  const { x, y, zoom } = viewportOf(element);

  return [x, y, zoom];
};

// Adds a listener for the lifetime of the surrounding scope; the same options remove it.
const listen = (
  target: EventTarget,
  type: string,
  handler: (event: Event) => void,
  options: AddEventListenerOptions
) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      target.addEventListener(type, handler, options);
    }),
    () =>
      Effect.sync(() => {
        target.removeEventListener(type, handler, options);
      })
  );

const isMouse = (event: Event): event is MouseEvent =>
  event instanceof MouseEvent;

const isTouch = (event: Event): event is TouchEvent => "touches" in event;

const relativeTo = (element: Element, event: MouseEvent): XY => {
  const box = element.getBoundingClientRect();

  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

const isPaneTarget = (pane: Element, target: EventTarget | null) =>
  target === pane ||
  (target instanceof Element && target.classList.contains(viewportClass));

const isAdditive = (event: MouseEvent) =>
  event.shiftKey || event.ctrlKey || event.metaKey;

const toXyConnection = (connection: XyConnection): Connection => ({
  source: connection.source,
  sourceHandle: connection.sourceHandle ?? undefined,
  target: connection.target,
  targetHandle: connection.targetHandle ?? undefined,
});

// Starting the move is synchronous: d3 applies the transform at once and `setViewport`'s promise settles after, so the
// promise is not awaited (`void`).
const panEffect = (pane: Element, delta: XYPosition) =>
  Option.match(Option.fromNullishOr(panZooms.get(pane)), {
    onNone: () => Effect.succeed(false),
    onSome: (controller) => {
      const viewport = viewportOf(pane);

      return Effect.sync(() => {
        void controller.setViewport({
          x: viewport.x + delta.x,
          y: viewport.y + delta.y,
          zoom: viewport.zoom,
        });

        return true;
      });
    },
  });

// XYDrag and XYHandle ask for a function returning a Promise (`PanBy`); the Effect is run here, at the foreign callback.
const panByOf = (pane: Element) =>
  compose((delta: XYPosition) => panEffect(pane, delta), Effect.runPromise);

// PANE: pan, zoom (XYPanZoom), the size of the pane, box select and a press on the empty pane.

type PaneMessage = Extract<
  Message,
  {
    readonly _tag:
      | "ChangedPanning"
      | "EndedBoxSelect"
      | "MovedBoxSelect"
      | "PanZoomed"
      | "PressedPane"
      | "ResizedPane"
      | "StartedBoxSelect";
  }
>;

const startPanZoom = (element: Element, send: Send<PaneMessage>) => {
  const initial = viewportOf(element);

  const flow = Option.map(readSnapshot(element), (snapshot) => snapshot.flow);

  const controller = XYPanZoom({
    domNode: element,
    maxZoom: Option.match(flow, { onNone: () => 4, onSome: (f) => f.maxZoom }),
    minZoom: Option.match(flow, {
      onNone: () => 0.1,
      onSome: (f) => f.minZoom,
    }),
    onDraggingChange: (isPanning) => {
      send(Message.ChangedPanning({ isPanning }));
    },
    translateExtent: unbounded,
    viewport: initial,
  });

  controller.update({
    connectionInProgress: false,
    lib,
    noPanClassName: "nopan",
    noWheelClassName: "nowheel",
    onTransformChange: ([x, y, zoom]) => {
      send(Message.PanZoomed({ x, y, zoom }));
    },
    panOnDrag: true,
    panOnScroll: false,
    panOnScrollMode: PanOnScrollMode.Free,
    panOnScrollSpeed: 0.5,
    paneClickDistance: 0,
    preventScrolling: true,
    userSelectionActive: false,
    zoomActivationKeyPressed: false,
    zoomOnDoubleClick: true,
    zoomOnPinch: true,
    zoomOnScroll: true,
  });

  panZooms.set(element, controller);

  return controller;
};

const stopPanZoom = (element: Element, controller: PanZoomInstance) =>
  Effect.sync(() => {
    controller.destroy();
    // `destroy` only detaches the `zoom` handler: d3-zoom's own listeners stay on the element until removed.
    select(element).on(".zoom", null);
    panZooms.delete(element);
  });

// The box gesture lives in the Mount, like d3's own gesture state; the Model sees only Messages.
interface BoxGesture {
  hasMoved: boolean;
  isActive: boolean;
}

export const FlowPane = Mount.defineStream("FlowPane", {
  execute: ({ element }) =>
    Stream.callback<PaneMessage>((queue) =>
      Effect.gen(function* pane() {
        const send = sendTo(queue);

        const controller = yield* Effect.acquireRelease(
          Effect.sync(() => startPanZoom(element, send)),
          (started) => stopPanZoom(element, started)
        );

        const box: BoxGesture = { hasMoved: false, isActive: false };

        // Before d3-zoom handles a gesture it must know the viewport the Model holds (fit view, zoom buttons and
        // keys change the Model without a gesture).
        const syncViewport = () => {
          controller.syncViewport(viewportOf(element));
        };

        const startBox = (event: Event) => {
          if (
            isMouse(event) &&
            event.shiftKey &&
            event.button === 0 &&
            isPaneTarget(element, event.target)
          ) {
            // Shift+drag on the pane selects; d3-zoom must not pan.
            event.stopImmediatePropagation();
            box.isActive = true;
            box.hasMoved = false;
            send(
              Message.StartedBoxSelect({ point: relativeTo(element, event) })
            );
          } else {
            syncViewport();
          }
        };

        for (const type of ["wheel", "touchstart", "dblclick"]) {
          yield* listen(element, type, syncViewport, {
            capture: true,
            passive: true,
          });
        }

        yield* listen(element, "mousedown", startBox, { capture: true });

        yield* listen(
          element.ownerDocument,
          "mousemove",
          (event) => {
            if (box.isActive && isMouse(event)) {
              box.hasMoved = true;
              send(
                Message.MovedBoxSelect({ point: relativeTo(element, event) })
              );
            }
          },
          {}
        );

        yield* listen(
          element.ownerDocument,
          "mouseup",
          () => {
            if (box.isActive) {
              box.isActive = false;
              send(Message.EndedBoxSelect());
            }
          },
          {}
        );

        yield* listen(
          element,
          "click",
          (event) => {
            const isEmptyPane = isPaneTarget(element, event.target);

            if (isEmptyPane && !box.hasMoved) {
              send(Message.PressedPane());
            }

            box.hasMoved = false;
          },
          {}
        );

        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const created = new ResizeObserver(([entry]) => {
              if (entry !== undefined) {
                send(
                  Message.ResizedPane({
                    height: entry.contentRect.height,
                    width: entry.contentRect.width,
                  })
                );
              }
            });

            created.observe(element);

            const initial = element.getBoundingClientRect();

            send(
              Message.ResizedPane({
                height: initial.height,
                width: initial.width,
              })
            );

            return created;
          }),
          (created) =>
            Effect.sync(() => {
              created.disconnect();
            })
        );

        return yield* Effect.never;
      })
    ),
  messages: [
    Message.ChangedPanning,
    Message.EndedBoxSelect,
    Message.MovedBoxSelect,
    Message.PanZoomed,
    Message.PressedPane,
    Message.ResizedPane,
    Message.StartedBoxSelect,
  ],
});

// NODE: drag (XYDrag) and the press that selects.

type NodeMessage = Extract<
  Message,
  {
    readonly _tag:
      | "DraggedNodes"
      | "PressedNode"
      | "StartedNodeDrag"
      | "StoppedNodeDrag";
  }
>;

interface Press {
  readonly id: string;
  readonly isAdditive: boolean;
}

interface PressRef {
  current: Option.Option<Press>;
}

// The press is dispatched, and d3-drag starts, on the same mousedown; the snapshot still shows the selection of the
// frame before. The controller therefore reads the nodes with the press applied (the same function `update` uses).
const nodesAfterPress = (snapshot: FlowSnapshot, press: Option.Option<Press>) =>
  Option.match(press, {
    onNone: () => snapshot.flow.nodes,
    onSome: ({ id, isAdditive: additive }) =>
      withNodeSelection(
        snapshot.flow.nodes,
        nextNodeSelection(selectedNodeIds(snapshot.flow.nodes), id, additive)
      ),
  });

const startDrag = (
  element: Element,
  send: Send<NodeMessage>,
  press: PressRef
) => {
  const pane = paneOf(element);

  const controller = XYDrag({
    getStoreItems: () => {
      const nodes: readonly FlowNode[] = Option.match(readSnapshot(element), {
        onNone: () => [],
        onSome: (snapshot) => nodesAfterPress(snapshot, press.current),
      });

      const { nodeLookup } = lookupsOf(nodes);

      return {
        autoPanOnNodeDrag: true,
        domNode: pane,
        edges: [],
        multiSelectionActive: false,
        nodeDragThreshold: 1,
        nodeExtent: unbounded,
        nodeLookup,
        nodeOrigin: [0, 0],
        nodes: Array.map(
          Array.fromIterable(nodeLookup.values()),
          (node) => node.internals.userNode
        ),
        nodesDraggable: true,
        panBy: panByOf(pane),
        selectNodesOnDrag: true,
        snapGrid: [1, 1],
        snapToGrid: false,
        transform: transformOf(element),
        unselectNodesAndEdges: constVoid,
        updateNodePositions: (items) => {
          send(
            Message.DraggedNodes({
              items: Array.map(Array.fromIterable(items.values()), (item) => ({
                id: item.id,
                x: item.position.x,
                y: item.position.y,
              })),
            })
          );
        },
      };
    },
    onDragStart: (_event, _items, node) => {
      send(Message.StartedNodeDrag({ id: node.id }));
    },
    onDragStop: () => {
      press.current = Option.none();
      send(Message.StoppedNodeDrag());
    },
  });

  return controller;
};

export const FlowNodeMount = Mount.defineStream("FlowNode", {
  args: { id: Schema.NonEmptyString },
  execute: ({ element, id }) =>
    Stream.callback<NodeMessage>((queue) =>
      Effect.gen(function* node() {
        const send = sendTo(queue);
        const press: PressRef = { current: Option.none() };

        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const controller = startDrag(element, send, press);

            controller.update({
              domNode: element,
              isSelectable: true,
              noDragClassName: "nodrag",
              nodeId: id,
            });

            return controller;
          }),
          (controller) =>
            Effect.sync(() => {
              controller.destroy();
            })
        );

        yield* listen(
          element,
          "mousedown",
          (event) => {
            const isOnHandle =
              event.target instanceof Element &&
              event.target.closest(`.${handleClass}`) !== null;

            if (isMouse(event) && !isOnHandle && event.button === 0) {
              press.current = Option.some({
                id,
                isAdditive: isAdditive(event),
              });
              send(Message.PressedNode({ id, isAdditive: isAdditive(event) }));
            }
          },
          { capture: true }
        );

        return yield* Effect.never;
      })
    ),
  messages: [
    Message.DraggedNodes,
    Message.PressedNode,
    Message.StartedNodeDrag,
    Message.StoppedNodeDrag,
  ],
});

// HANDLE and RECONNECT ANCHOR: connect (XYHandle).

type ConnectMessage = Extract<
  Message,
  {
    readonly _tag:
      | "ConnectedHandles"
      | "EndedConnection"
      | "ReconnectedHandles"
      | "UpdatedConnection";
  }
>;

// The options of a connection gesture; xyflow does not export the type, so it is read off the controller.
type HandleParams = Parameters<typeof XYHandle.onPointerDown>[1];

interface ActiveConnection {
  fromHandle: Handle | null;
}

interface ConnectFrom {
  readonly edgeId: string | undefined;
  readonly handleId: string | undefined;
  readonly nodeId: string;
  readonly type: "source" | "target";
}

const draftMessage = (
  state: ConnectionInProgress,
  edgeId: string | undefined
) =>
  Message.UpdatedConnection({
    fromHandle: state.fromHandle.id ?? undefined,
    fromKind: state.fromHandle.type,
    fromNodeId: state.fromHandle.nodeId,
    fromPoint: state.from,
    pointer: state.pointer,
    reconnecting: edgeId,
    toHandle: state.toHandle?.id ?? undefined,
    toNodeId: state.toNode?.id,
    toPosition: state.toHandle === null ? undefined : state.to,
  });

const beginConnection = (
  element: Element,
  event: MouseEvent | TouchEvent,
  from: ConnectFrom,
  send: Send<ConnectMessage>,
  active: ActiveConnection
) => {
  const snapshot = readSnapshot(element);
  const pane = paneOf(element);
  const bounds = boundsOf(element);

  if (Option.isNone(snapshot) || Option.isNone(bounds)) {
    return;
  }

  const { flow, isValidConnection } = snapshot.value;

  const params: HandleParams = {
    autoPanOnConnect: true,
    autoPanSpeed: 15,
    cancelConnection: () => {
      active.fromHandle = null;
      send(Message.EndedConnection());
    },
    connectionMode: ConnectionMode.Strict,
    connectionRadius: 20,
    domNode: bounds.value,
    flowId: flow.id,
    getFromHandle: () => active.fromHandle,
    getTransform: () => transformOf(element),
    handleDomNode: element,
    handleId: from.handleId ?? null,
    isTarget: from.type === "target",
    isValidConnection: (candidate) =>
      isValidConnection({
        source: candidate.source,
        sourceHandle: candidate.sourceHandle ?? undefined,
        target: candidate.target,
        targetHandle: candidate.targetHandle ?? undefined,
      }),
    lib,
    nodeId: from.nodeId,
    nodeLookup: lookupsOf(flow.nodes).nodeLookup,
    onConnect: (connection) => {
      const mapped = toXyConnection(connection);

      send(
        from.edgeId === undefined
          ? Message.ConnectedHandles({ connection: mapped })
          : Message.ReconnectedHandles({
              connection: mapped,
              edgeId: from.edgeId,
            })
      );
    },
    panBy: panByOf(pane),
    updateConnection: (state) => {
      if (state.inProgress) {
        active.fromHandle = state.fromHandle;
        send(draftMessage(state, from.edgeId));
      }
    },
  };

  XYHandle.onPointerDown(
    event,
    from.edgeId === undefined
      ? params
      : { ...params, edgeUpdaterType: from.type }
  );
};

// A connection gesture ends on the mouseup that XYHandle listens for on the document. If the Mount is released first,
// that mouseup is sent here so the controller removes its document listeners and the Model leaves `Connecting`.
const endGesture = (element: Element, active: ActiveConnection) =>
  Effect.sync(() => {
    if (active.fromHandle !== null) {
      element.ownerDocument.dispatchEvent(new MouseEvent("mouseup"));
    }
  });

const connectStream = (
  element: Element,
  resolve: () => Option.Option<ConnectFrom>
) =>
  Stream.callback<ConnectMessage>((queue) =>
    Effect.gen(function* connect() {
      const send = sendTo(queue);
      const active: ActiveConnection = { fromHandle: null };

      yield* Effect.addFinalizer(() => endGesture(element, active));

      const begin = (event: MouseEvent | TouchEvent) => {
        Option.map(resolve(), (from) => {
          beginConnection(element, event, from, send, active);
        });
      };

      const start = (event: Event) => {
        if (isMouse(event) && event.button === 0) {
          event.stopPropagation();
          begin(event);
        } else if (isTouch(event)) {
          begin(event);
        }
      };

      yield* listen(element, "mousedown", start, {});
      yield* listen(element, "touchstart", start, { passive: true });

      return yield* Effect.never;
    })
  );

const connectMessages = [
  Message.ConnectedHandles,
  Message.EndedConnection,
  Message.ReconnectedHandles,
  Message.UpdatedConnection,
] as const;

export const FlowHandle = Mount.defineStream("FlowHandle", {
  args: {
    handleId: Schema.optional(Schema.NonEmptyString),
    kind: Schema.Literals(["source", "target"]),
    nodeId: Schema.NonEmptyString,
  },
  execute: ({ element, handleId, kind, nodeId }) =>
    connectStream(element, () =>
      Option.some({ edgeId: undefined, handleId, nodeId, type: kind })
    ),
  messages: connectMessages,
});

/** Dragging one end of an edge starts a connection from the other end: xyflow's reconnect takes the opposite handle. */
const oppositeEnd = (edge: FlowEdge, end: "source" | "target"): ConnectFrom =>
  end === "source"
    ? {
        edgeId: edge.id,
        handleId: edge.targetHandle,
        nodeId: edge.target,
        type: "target",
      }
    : {
        edgeId: edge.id,
        handleId: edge.sourceHandle,
        nodeId: edge.source,
        type: "source",
      };

export const FlowReconnect = Mount.defineStream("FlowReconnect", {
  args: {
    edgeId: Schema.NonEmptyString,
    end: Schema.Literals(["source", "target"]),
  },
  // the edge is looked up when the gesture starts: the other end may have been reconnected since this Mount ran
  execute: ({ edgeId, element, end }) =>
    connectStream(element, () =>
      Option.map(
        Option.flatMap(readSnapshot(element), ({ flow }) =>
          Array.findFirst(flow.edges, (edge) => edge.id === edgeId)
        ),
        (edge) => oppositeEnd(edge, end)
      )
    ),
  messages: connectMessages,
});

// MINIMAP: pan and zoom the flow from the minimap (XYMinimap drives the pane's XYPanZoom).

const startMinimap = (element: Element, controller: PanZoomInstance) => {
  const instance = XYMinimap({
    domNode: element,
    getTransform: () => transformOf(element),
    getViewScale: () =>
      Option.match(readSnapshot(element), {
        onNone: () => 1,
        onSome: ({ flow }) =>
          minimapGeometry(flow.nodes, flow.viewport, flow.size).scale,
      }),
    panZoom: controller,
  });

  instance.update({
    height: minimapSize.height,
    pannable: true,
    translateExtent: unbounded,
    width: minimapSize.width,
    zoomStep: 1,
    zoomable: true,
  });

  return instance;
};

// A child's Mount runs before its parent's, so the pane's controller may not exist yet when the minimap mounts: wait for
// it a few milliseconds (it is created in the same patch), and run without one if the pane never gets a controller.
const panZoomOf = (pane: Element) =>
  Effect.suspend(() => Effect.fromNullishOr(panZooms.get(pane))).pipe(
    Effect.retry({ schedule: Schedule.spaced("5 millis"), times: 40 }),
    Effect.option
  );

export const FlowMinimap = Mount.defineStream("FlowMinimap", {
  execute: ({ element }) =>
    Stream.callback<
      Extract<Message, { readonly _tag: "CompletedMinimapMount" }>
    >((queue) =>
      Effect.gen(function* minimap() {
        yield* Effect.acquireRelease(
          Effect.map(
            panZoomOf(paneOf(element)),
            Option.map((controller) => startMinimap(element, controller))
          ),
          (instance) =>
            Effect.sync(() => {
              Option.map(instance, (started) => {
                started.destroy();
                // as for the pane: `destroy` detaches the `zoom` handler only
                select(element).on(".zoom", null);
              });
            })
        );

        Queue.offerUnsafe(queue, Message.CompletedMinimapMount());

        return yield* Effect.never;
      })
    ),
  messages: [Message.CompletedMinimapMount],
});
