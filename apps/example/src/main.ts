import { Array, Match, Option, Schema } from "effect";
import { Update } from "foldkit";
import type { Runtime } from "foldkit";
import * as Flow from "foldkit-flow";
import { createKeyedLazy } from "foldkit/html";
import type { Document, Html, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { modifyFields } from "foldkit/struct";

import { compound, large, small } from "./graphs.ts";
import type { Graph } from "./graphs.ts";

// MODEL

export const GraphChoice = Schema.Literals(["Small", "Compound", "Large"]);

export type GraphChoice = typeof GraphChoice.Type;

const LogEntry = Schema.Struct({
  id: Schema.Finite,
  text: Schema.String,
});

export const Model = Schema.Struct({
  flow: Flow.Model,
  graph: GraphChoice,
  log: Schema.Array(LogEntry),
  logCount: Schema.Finite,
});

export type Model = typeof Model.Type;

// MESSAGE

export const Message = defineMessageUnion({
  ClickedGraph: { graph: GraphChoice },
  ClickedToggleAttribution: {},
  GotFlowMessage: { message: Flow.Message },
});

export type Message = typeof Message.Type;

// FLOW

// The rule is code, declared once: a node cannot connect to itself.
const flow = Flow.defineFlow({
  isValidConnection: (connection) => connection.source !== connection.target,
});

const graphOf = (choice: GraphChoice): Graph =>
  Match.value(choice).pipe(
    Match.when("Small", () => small),
    Match.when("Compound", () => compound),
    Match.when("Large", () => large),
    Match.exhaustive
  );

const initFlow = (choice: GraphChoice, attribution = Flow.defaultAttribution) =>
  Flow.init({
    attribution,
    ...graphOf(choice),
    id: "flow",
  });

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { flow: initFlow("Small"), graph: "Small", log: [], logCount: 0 },
});

// UPDATE

const logLimit = 6;

const withLog = (model: Model, text: string): Model =>
  modifyFields(model, {
    log: (log) =>
      Array.takeRight([...log, { id: model.logCount, text }], logLimit),
    logCount: (count) => count + 1,
  });

const withFlow = (model: Model, next: Flow.Model): Model =>
  modifyFields(model, { flow: () => next });

const foldOutMessage = (
  outMessage: Flow.OutMessage
): Update.Step<Model, Message> =>
  Flow.OutMessage.match<Update.Step<Model, Message>>(outMessage, {
    ChangedSelection:
      ({ edgeIds, nodeIds }) =>
      (model) => ({
        model: withLog(
          model,
          `Selection: ${nodeIds.length} nodes, ${edgeIds.length} edges`
        ),
      }),
    Connected:
      ({ connection }) =>
      (model) => ({
        model: withLog(
          withFlow(
            model,
            Flow.addEdge(model.flow, connection, {
              hasArrow: true,
              id: `${connection.source}-${connection.target}-${model.flow.edges.length}`,
              kind: "Bezier",
              label: "",
            })
          ),
          `Connected ${connection.source} to ${connection.target}`
        ),
      }),
    Deleted:
      ({ edgeIds, nodeIds }) =>
      (model) => ({
        model: withLog(
          model,
          `Deleted ${nodeIds.length} nodes, ${edgeIds.length} edges`
        ),
      }),
    Moved:
      ({ nodeIds }) =>
      (model) => ({
        model: withLog(model, `Moved ${Array.join(nodeIds, ", ")}`),
      }),
    Reconnected:
      ({ connection, edgeId }) =>
      (model) => ({
        model: withLog(
          withFlow(model, Flow.reconnectEdge(model.flow, edgeId, connection)),
          `Reconnected ${edgeId}`
        ),
      }),
  });

const foldFlow = Update.foldChild({
  foldOutMessage,
  read: (model: Model) => Option.some(model.flow),
  toParentMessage: (message) => Message.GotFlowMessage({ message }),
  update: flow.update,
  write: withFlow,
});

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedGraph: ({ graph }) => ({
      model: modifyFields(model, {
        flow: () => initFlow(graph, model.flow.attribution),
        graph: () => graph,
        log: () => [],
      }),
    }),
    ClickedToggleAttribution: () => ({
      model: withFlow(
        model,
        modifyFields(model.flow, {
          attribution: (attribution) =>
            Flow.Attribution.match(attribution, {
              Hidden: () => Flow.Attribution.Visible(),
              Visible: () => Flow.Attribution.Hidden(),
            }),
        })
      ),
    }),
    GotFlowMessage: ({ message: flowMessage }) => foldFlow(model, flowMessage),
  });

// VIEW

const contentLazy = createKeyedLazy();

// The content of a node. It is memoised by node id with the node's type and label as the arguments, so a node that
// moved or was selected does not render again here.
const nodeContent = (
  h: HtmlBuilder<Message>,
  type: string,
  label: string
): Html =>
  h.div([h.Class(type === "scene" ? "scene-title" : "state-title")], [label]);

const button = (
  h: HtmlBuilder<Message>,
  text: string,
  message: Message,
  isPressed: boolean
) =>
  h.button(
    [
      h.Type("button"),
      h.Class(
        `px-3 py-1 border border-gray-400 ${isPressed ? "bg-black text-white" : "bg-white text-gray-800"}`
      ),
      h.AriaPressed(isPressed ? "true" : "false"),
      h.OnClick(message),
    ],
    [text]
  );

const graphButtons = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [h.Role("group"), h.AriaLabel("Graph"), h.Class("flex gap-1")],
    Array.map(GraphChoice.literals, (choice) =>
      button(
        h,
        choice,
        Message.ClickedGraph({ graph: choice }),
        model.graph === choice
      )
    )
  );

const logView = (model: Model, h: HtmlBuilder<Message>) =>
  h.ul(
    [h.Role("log"), h.AriaLabel("Event log"), h.Class("text-sm text-gray-700")],
    Array.map(model.log, (entry) => h.keyed("li")(entry.id, [], [entry.text]))
  );

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  body: h.div(
    [h.Class("h-screen flex flex-col gap-3 bg-white p-4")],
    [
      h.header(
        [h.Class("flex items-center justify-between gap-4")],
        [
          h.div(
            [],
            [
              h.h1([h.Class("text-2xl font-bold")], ["foldkit-flow"]),
              h.p(
                [h.Class("text-gray-600")],
                [
                  "Pan and zoom, drag nodes, connect handles, Shift+drag to select. Tab to a node and use the arrow keys.",
                ]
              ),
            ]
          ),
          graphButtons(model, h),
          button(
            h,
            "Hide attribution",
            Message.ClickedToggleAttribution(),
            Flow.Attribution.match(model.flow.attribution, {
              Hidden: () => true,
              Visible: () => false,
            })
          ),
        ]
      ),
      h.main(
        [h.Class("min-h-0 flex-1 rounded border border-gray-300")],
        [
          h.submodel({
            model: model.flow,
            slotId: "flow",
            toParentMessage: (message) => Message.GotFlowMessage({ message }),
            view: flow.view,
            viewInputs: {
              ariaLabel: "Example graph",
              renderNode: (node) =>
                contentLazy(node.id, nodeContent, [h, node.type, node.label]),
            },
          }),
        ]
      ),
      logView(model, h),
    ]
  ),
  title: "foldkit-flow",
});
