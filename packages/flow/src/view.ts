import { Position, getBezierPath, rendererPointToPoint } from "@xyflow/system";
import { Array, Match, Option, Result, String } from "effect";
import { createKeyedLazy } from "foldkit/html";
import type { Html, HtmlBuilder } from "foldkit/html";
import { defineView } from "foldkit/submodel";

import { attributionView } from "./attribution.ts";
import {
  absolutePositions,
  edgeGeometry,
  handleLayout,
  minimapGeometry,
  minimapSize,
} from "./geometry.ts";
import type { EdgeEnd } from "./geometry.ts";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";
import {
  FlowHandle,
  FlowMinimap,
  FlowNodeMount,
  FlowPane,
  FlowReconnect,
} from "./mounts.ts";
import {
  FlowSnapshot,
  handleClass,
  nodeClass,
  paneClass,
  paneElement,
  viewportClass,
} from "./snapshot.ts";
import { Interaction } from "./types.ts";
import type { ConnectionDraft, FlowEdge, FlowNode, XY } from "./types.ts";
import type { FlowOptions } from "./update.ts";

// VIEW
//
// A pure function of the Model. Nodes and edges are keyed and memoised: an unchanged node (same object, same absolute
// position, same content) renders nothing, so dragging one node of a large graph renders that node and its edges.

/** What the embedding application supplies to the view. */
export interface ViewInputs {
  /** The accessible name of the canvas. */
  readonly ariaLabel: string;
  /**
   * The content of a node, in the application's own boundary (its Messages and its Model). It runs for every node on
   * each render: return a memoised VNode (`createKeyedLazy`) for large graphs, so unchanged nodes cost nothing.
   */
  readonly renderNode: (node: FlowNode) => Html;
}

const hiddenStyle = {
  clip: "rect(0 0 0 0)",
  height: "1px",
  overflow: "hidden",
  position: "absolute",
  whiteSpace: "nowrap",
  width: "1px",
};

const instructions =
  "Focus a node, then press Enter or Space to select it, an arrow key to move it (Shift for larger steps) and Delete to remove it. Press Escape to clear the selection.";

const sideOf = (
  node: FlowNode,
  handleId: string | undefined,
  kind: "source" | "target"
) =>
  Option.getOrElse(
    Option.map(
      Array.findFirst(
        node.handles,
        (handle) =>
          handle.kind === kind &&
          (handleId === undefined || handle.id === handleId)
      ),
      (handle) => handle.side
    ),
    () => (kind === "source" ? "Right" : "Left")
  );

const positionOf = (side: string) =>
  Match.value(side).pipe(
    Match.when("Left", () => Position.Left),
    Match.when("Top", () => Position.Top),
    Match.when("Bottom", () => Position.Bottom),
    Match.orElse(() => Position.Right)
  );

// HANDLES

const handleView = (h: HtmlBuilder<Message>, flowId: string, node: FlowNode) =>
  Array.map(handleLayout(node), (handle) =>
    h.keyed("div")(`${handle.id}-${handle.type}`, [
      h.Class(
        `${handleClass} nodrag nopan ${handle.type} connectable connectableend foldkit-flow__handle-${handle.position}`
      ),
      h.AriaHidden(true),
      h.DataAttribute("nodeid", node.id),
      h.DataAttribute("handleid", handle.id ?? ""),
      h.DataAttribute("handlepos", handle.position),
      h.DataAttribute("id", `${flowId}-${node.id}-${handle.id}-${handle.type}`),
      h.Style({
        height: `${handle.height}px`,
        left: `${handle.x}px`,
        position: "absolute",
        top: `${handle.y}px`,
        width: `${handle.width}px`,
      }),
      h.OnMount(
        FlowHandle({
          handleId: handle.id ?? undefined,
          kind: handle.type,
          nodeId: node.id,
        })
      ),
    ])
  );

// NODES

const nodeLazy = createKeyedLazy();

const handledKeys = [
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backspace",
  "Delete",
  "Enter",
  "Escape",
  " ",
];

const nodeView = (
  h: HtmlBuilder<Message>,
  flowId: string,
  node: FlowNode,
  absolute: XY,
  content: Html
) =>
  h.keyed("div")(
    node.id,
    [
      h.Class(
        `${nodeClass} ${node.selected ? "selected" : ""} ${node.draggable ? "" : "nopan"}`
      ),
      h.Role("group"),
      h.AriaRoleDescription("node"),
      h.AriaLabel(node.label),
      h.AriaDescribedBy(`${flowId}-instructions`),
      h.DataAttribute("id", node.id),
      h.DataAttribute("selected", node.selected ? "true" : "false"),
      h.Tabindex(0),
      h.Style({
        height: `${node.height}px`,
        position: "absolute",
        transform: `translate(${absolute.x}px, ${absolute.y}px)`,
        width: `${node.width}px`,
        zIndex: `${(node.parentId === undefined ? 0 : 10) + (node.selected ? 1 : 0)}`,
      }),
      h.OnMount(FlowNodeMount({ id: node.id })),
      h.OnKeyDownSelfPreventDefault((key, modifiers) =>
        Array.contains(handledKeys, key)
          ? Option.some(
              Message.PressedNodeKey({
                id: node.id,
                isShift: modifiers.shiftKey,
                key,
              })
            )
          : Option.none()
      ),
    ],
    [content, ...handleView(h, flowId, node)]
  );

// EDGES

const edgeLazy = createKeyedLazy();

const anchorView = (
  h: HtmlBuilder<Message>,
  edge: FlowEdge,
  end: "source" | "target",
  at: XY
) =>
  h.keyed("circle")(`${edge.id}-${end}`, [
    h.Class("foldkit-flow__reconnect nopan"),
    h.Cx(`${at.x}`),
    h.Cy(`${at.y}`),
    h.R("6"),
    h.OnMount(FlowReconnect({ edgeId: edge.id, end })),
  ]);

const arrowAttribute = (
  h: HtmlBuilder<Message>,
  edge: FlowEdge,
  flowId: string
) => (edge.hasArrow ? [h.MarkerEnd(`url(#${flowId}-arrow)`)] : []);

const labelView = (h: HtmlBuilder<Message>, edge: FlowEdge, at: XY) =>
  edge.label === ""
    ? h.empty
    : h.text(
        [
          h.Class("foldkit-flow__edge-label"),
          h.X(`${at.x}`),
          h.Y(`${at.y}`),
          h.TextAnchor("middle"),
        ],
        [edge.label]
      );

const edgeView = (
  h: HtmlBuilder<Message>,
  flowId: string,
  edge: FlowEdge,
  sourceNode: FlowNode,
  sourceX: number,
  sourceY: number,
  targetNode: FlowNode,
  targetX: number,
  targetY: number
) => {
  const source: EdgeEnd = {
    absolute: { x: sourceX, y: sourceY },
    node: sourceNode,
  };

  const target: EdgeEnd = {
    absolute: { x: targetX, y: targetY },
    node: targetNode,
  };

  return Option.match(edgeGeometry(edge, source, target), {
    onNone: () => h.keyed("g")(edge.id),
    onSome: (geometry) =>
      h.keyed("g")(
        edge.id,
        [
          h.Class(`foldkit-flow__edge ${edge.selected ? "selected" : ""}`),
          h.Role("group"),
          h.AriaLabel(
            `${edge.label === "" ? "Edge" : edge.label} from ${sourceNode.label} to ${targetNode.label}`
          ),
        ],
        [
          h.path([
            h.Class("foldkit-flow__edge-path"),
            h.D(geometry.path),
            h.Fill("none"),
            ...arrowAttribute(h, edge, flowId),
          ]),
          h.path([
            h.Class("foldkit-flow__edge-hit"),
            h.D(geometry.path),
            h.Fill("none"),
            h.OnClick(Message.PressedEdge({ id: edge.id })),
          ]),
          labelView(h, edge, { x: geometry.labelX, y: geometry.labelY }),
          ...(edge.selected
            ? [
                anchorView(h, edge, "source", {
                  x: geometry.sourceX,
                  y: geometry.sourceY,
                }),
                anchorView(h, edge, "target", {
                  x: geometry.targetX,
                  y: geometry.targetY,
                }),
              ]
            : []),
        ]
      ),
  });
};

const arrowMarker = (h: HtmlBuilder<Message>, flowId: string) =>
  h.defs(
    [],
    [
      h.marker(
        [
          h.Id(`${flowId}-arrow`),
          h.ViewBox("0 0 10 10"),
          h.RefX("9"),
          h.RefY("5"),
          h.MarkerWidth("8"),
          h.MarkerHeight("8"),
          h.Orient("auto-start-reverse"),
        ],
        [h.path([h.D("M0,0 L10,5 L0,10 z"), h.Class("foldkit-flow__arrow")])]
      ),
    ]
  );

const edgesLayer = (h: HtmlBuilder<Message>, model: Model) => {
  const absolutes = absolutePositions(model.nodes);

  const byId = new Map(
    Array.map(model.nodes, (node) => [node.id, node] as const)
  );

  const drawn = Array.filterMap(model.edges, (edge) => {
    const sourceNode = byId.get(edge.source);
    const targetNode = byId.get(edge.target);
    const sourceAbsolute = absolutes.get(edge.source);
    const targetAbsolute = absolutes.get(edge.target);

    if (
      sourceNode === undefined ||
      targetNode === undefined ||
      sourceAbsolute === undefined ||
      targetAbsolute === undefined
    ) {
      return Result.failVoid;
    }

    return Result.succeed(
      edgeLazy(edge.id, edgeView, [
        h,
        model.id,
        edge,
        sourceNode,
        sourceAbsolute.x,
        sourceAbsolute.y,
        targetNode,
        targetAbsolute.x,
        targetAbsolute.y,
      ])
    );
  });

  return h.svg(
    [
      h.Class("foldkit-flow__edges"),
      h.Style({
        height: "1px",
        overflow: "visible",
        position: "absolute",
        width: "1px",
      }),
    ],
    [arrowMarker(h, model.id), ...drawn]
  );
};

// CONNECTION DRAFT

const draftPath = (model: Model, draft: ConnectionDraft) => {
  const fromNode = Array.findFirst(
    model.nodes,
    (node) => node.id === draft.from.nodeId
  );

  const start = rendererPointToPoint(draft.from.point, [
    model.viewport.x,
    model.viewport.y,
    model.viewport.zoom,
  ]);

  const end = draft.to?.position ?? draft.pointer;

  const [path] = getBezierPath({
    sourcePosition: positionOf(
      Option.match(fromNode, {
        onNone: () => "Right",
        onSome: (node) => sideOf(node, draft.from.handle, draft.from.kind),
      })
    ),
    sourceX: start.x,
    sourceY: start.y,
    targetPosition:
      draft.from.kind === "source" ? Position.Left : Position.Right,
    targetX: end.x,
    targetY: end.y,
  });

  return path;
};

const draftView = (h: HtmlBuilder<Message>, model: Model) =>
  Interaction.matchOrElse(
    model.interaction,
    {
      Connecting: ({ draft }) =>
        h.svg(
          [
            h.Class("foldkit-flow__draft"),
            h.AriaHidden(true),
            h.Style({
              height: "100%",
              left: "0",
              pointerEvents: "none",
              position: "absolute",
              top: "0",
              width: "100%",
            }),
          ],
          [
            h.path([
              h.Class(
                `foldkit-flow__draft-path ${String.toLowerCase(draft.validity)}`
              ),
              h.D(draftPath(model, draft)),
              h.Fill("none"),
            ]),
          ]
        ),
    },
    () => h.empty
  );

// BOX SELECT

const boxView = (h: HtmlBuilder<Message>, model: Model) =>
  Interaction.matchOrElse(
    model.interaction,
    {
      BoxSelecting: ({ current, origin }) =>
        h.div([
          h.Class("foldkit-flow__box"),
          h.AriaHidden(true),
          h.Style({
            height: `${Math.abs(current.y - origin.y)}px`,
            left: `${Math.min(current.x, origin.x)}px`,
            pointerEvents: "none",
            position: "absolute",
            top: `${Math.min(current.y, origin.y)}px`,
            width: `${Math.abs(current.x - origin.x)}px`,
          }),
        ]),
    },
    () => h.empty
  );

// CONTROLS and MINIMAP

const controlButton = (
  h: HtmlBuilder<Message>,
  label: string,
  text: string,
  message: Message
) =>
  h.button(
    [
      h.Type("button"),
      h.Class("foldkit-flow__control nopan"),
      h.AriaLabel(label),
      h.OnClick(message),
    ],
    [text]
  );

const controlsView = (h: HtmlBuilder<Message>, model: Model) =>
  model.hasControls
    ? h.div(
        [
          h.Class("foldkit-flow__controls nopan"),
          h.Role("group"),
          h.AriaLabel("Canvas controls"),
        ],
        [
          controlButton(h, "Zoom in", "+", Message.ClickedZoomIn()),
          controlButton(h, "Zoom out", "\u2212", Message.ClickedZoomOut()),
          controlButton(h, "Fit view", "\u2610", Message.ClickedFitView()),
        ]
      )
    : h.empty;

const minimapNodeLazy = createKeyedLazy();

const minimapNode = (
  h: HtmlBuilder<Message>,
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  selected: boolean
) =>
  h.keyed("rect")(id, [
    h.Class(`foldkit-flow__minimap-node ${selected ? "selected" : ""}`),
    h.X(`${x}`),
    h.Y(`${y}`),
    h.Width(`${width}`),
    h.Height(`${height}`),
  ]);

const minimapView = (h: HtmlBuilder<Message>, model: Model) => {
  if (!model.hasMinimap) {
    return h.empty;
  }

  const { viewBox, visible } = minimapGeometry(
    model.nodes,
    model.viewport,
    model.size
  );

  const absolutes = absolutePositions(model.nodes);

  const outer = `M${viewBox.x},${viewBox.y}h${viewBox.width}v${viewBox.height}h${-viewBox.width}z`;
  const inner = `M${visible.x},${visible.y}h${visible.width}v${visible.height}h${-visible.width}z`;

  return h.svg(
    [
      h.Class("foldkit-flow__minimap nopan nowheel"),
      h.Role("img"),
      h.AriaLabel("Minimap"),
      h.Width(`${minimapSize.width}`),
      h.Height(`${minimapSize.height}`),
      h.ViewBox(`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`),
      h.OnMount(FlowMinimap()),
    ],
    [
      ...Array.map(model.nodes, (node) => {
        const at = absolutes.get(node.id) ?? node.position;

        return minimapNodeLazy(node.id, minimapNode, [
          h,
          node.id,
          at.x,
          at.y,
          node.width,
          node.height,
          node.selected,
        ]);
      }),
      h.path([
        h.Class("foldkit-flow__minimap-mask"),
        h.D(`${outer}${inner}`),
        h.FillRule("evenodd"),
      ]),
    ]
  );
};

// ROOT

const canvasKeys = ["+", "-", "=", "_", "0", "Escape", "Delete", "Backspace"];

const paneClassFor = (model: Model) =>
  Interaction.matchOrElse(
    model.interaction,
    { Panning: () => `${paneClass} panning` },
    () => paneClass
  );

/** Makes the Flow's view, bound to its static rules (the snapshot carries `isValidConnection` to the controllers). */
export const flowView = (options: FlowOptions) =>
  defineView<Model, Message, ViewInputs>((model, viewInputs, h) => {
    const absolutes = absolutePositions(model.nodes);
    const pane = paneElement.withMessage(h);

    const nodes = Array.map(model.nodes, (node) => {
      const at = absolutes.get(node.id) ?? node.position;

      return nodeLazy(node.id, nodeView, [
        h,
        model.id,
        node,
        at,
        viewInputs.renderNode(node),
      ]);
    });

    const snapshot = new FlowSnapshot(
      {
        edges: model.edges,
        id: model.id,
        maxZoom: model.maxZoom,
        minZoom: model.minZoom,
        nodes: model.nodes,
        size: model.size,
        viewport: model.viewport,
      },
      options.isValidConnection
    );

    return h.div(
      [
        h.Id(model.id),
        h.Class("foldkit-flow"),
        h.Style({
          height: "100%",
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }),
      ],
      [
        h.div(
          [h.Id(`${model.id}-instructions`), h.Style(hiddenStyle)],
          [instructions]
        ),
        pane(
          [
            pane.Snapshot(snapshot),
            h.Class(paneClassFor(model)),
            h.Role("application"),
            h.AriaLabel(viewInputs.ariaLabel),
            h.AriaDescribedBy(`${model.id}-instructions`),
            h.Tabindex(0),
            h.Style({
              display: "block",
              inset: "0",
              overflow: "hidden",
              position: "absolute",
            }),
            h.OnMount(FlowPane()),
            h.OnKeyDownSelfPreventDefault((key) =>
              Array.contains(canvasKeys, key)
                ? Option.some(Message.PressedCanvasKey({ key }))
                : Option.none()
            ),
          ],
          [
            h.div(
              [
                h.Class(viewportClass),
                h.Style({
                  left: "0",
                  position: "absolute",
                  top: "0",
                  transform: `translate(${model.viewport.x}px, ${model.viewport.y}px) scale(${model.viewport.zoom})`,
                  transformOrigin: "0 0",
                }),
              ],
              [edgesLayer(h, model), ...nodes]
            ),
            draftView(h, model),
            boxView(h, model),
          ]
        ),
        minimapView(h, model),
        controlsView(h, model),
        h.div(
          [h.Class("foldkit-flow__attribution")],
          [attributionView(model.attribution, h)]
        ),
        h.div(
          [
            h.Role("status"),
            h.AriaLive("polite"),
            h.AriaAtomic(true),
            h.Style(hiddenStyle),
          ],
          [model.announcement]
        ),
      ]
    );
  });
