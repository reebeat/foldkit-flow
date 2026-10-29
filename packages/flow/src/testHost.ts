import { Array, Option, Schema } from "effect";
import { Runtime, Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { modifyFields } from "foldkit/struct";

import { defineFlow } from "./flow.ts";
import { Message, OutMessage } from "./message.ts";
import { Model } from "./model.ts";
import { addEdge, reconnectEdge } from "./update.ts";

// A minimal application that embeds the Flow Submodel, as an application does: it is the host the runtime tests boot.
// It records the tags of the out-messages it receives, adds the edge a `Connected` describes, and moves the end of an
// edge a `Reconnected` describes.

const HostModel = Schema.Struct({
  events: Schema.Array(Schema.String),
  flow: Model,
});

type HostModel = typeof HostModel.Type;

const HostMessage = defineMessageUnion({
  GotFlowMessage: { message: Message },
});

type HostMessage = typeof HostMessage.Type;

const { update: updateFlow, view: viewFlow } = defineFlow({
  isValidConnection: ({ source, target }) => source !== target,
});

const withEvent = (model: HostModel, outMessage: OutMessage): HostModel =>
  modifyFields(model, { events: (events) => [...events, outMessage._tag] });

const foldOutMessage = (
  outMessage: OutMessage
): Update.Step<HostModel, HostMessage> =>
  OutMessage.match<Update.Step<HostModel, HostMessage>>(outMessage, {
    Connected:
      ({ connection }) =>
      (model) => ({
        model: withEvent(
          modifyFields(model, {
            flow: (flow) =>
              addEdge(flow, connection, {
                hasArrow: true,
                id: `${connection.source}-${connection.target}`,
                kind: "Bezier",
                label: "",
              }),
          }),
          outMessage
        ),
      }),
    Deleted: () => (model) => ({ model: withEvent(model, outMessage) }),
    Moved: () => (model) => ({ model: withEvent(model, outMessage) }),
    Reconnected:
      ({ connection, edgeId }) =>
      (model) => ({
        model: withEvent(
          modifyFields(model, {
            flow: (flow) => reconnectEdge(flow, edgeId, connection),
          }),
          outMessage
        ),
      }),
    UpdatedSelection: () => (model) => ({
      model: withEvent(model, outMessage),
    }),
  });

const foldFlow = Update.foldChild({
  foldOutMessage,
  read: (model: HostModel) => Option.some(model.flow),
  toParentMessage: (message) => HostMessage.GotFlowMessage({ message }),
  update: updateFlow,
  write: (model, flow) => modifyFields(model, { flow: () => flow }),
});

const hostUpdate = (model: HostModel, message: HostMessage) =>
  HostMessage.match<Update.Return<HostModel, HostMessage>>(message, {
    GotFlowMessage: ({ message: flowMessage }) => foldFlow(model, flowMessage),
  });

const hostView = (model: HostModel, h: HtmlBuilder<HostMessage>): Document => ({
  body: h.div(
    [h.Style({ height: "600px", width: "800px" })],
    [
      h.submodel({
        model: model.flow,
        slotId: "flow",
        toParentMessage: (message) => HostMessage.GotFlowMessage({ message }),
        view: viewFlow,
        viewInputs: {
          ariaLabel: "Test graph",
          renderNode: (node) => h.div([], [node.label]),
        },
      }),
    ]
  ),
  title: "host",
});

/** The application the runtime tests boot, with its Model starting from `flow`. */
export const hostApplication = (container: HTMLElement, flow: Model) =>
  Runtime.makeApplication({
    Model: HostModel,
    container,
    init: () => ({ model: { events: Array.empty<string>(), flow } }),
    update: hostUpdate,
    view: hostView,
  });
