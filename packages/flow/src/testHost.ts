import { Array, Effect, Option, Schema } from "effect";
import { Runtime, Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { modifyFields } from "foldkit/struct";

import { defineFlow } from "./flow.ts";
import { Message, OutMessage } from "./message.ts";
import { Model } from "./model.ts";
import { eventually } from "./testing.ts";
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

/** A fresh wrapper around a container with an id: the runtime replaces the container, never the wrapper. */
export const mountPoint = () => {
  const wrapper = document.createElement("section");
  const container = document.createElement("div");

  // wrappers are never removed, so the number of children of the body is unique per host
  container.id = `flow-host-${document.body.childElementCount}`;
  wrapper.append(container);
  document.body.append(wrapper);

  return { container, wrapper };
};

/** Boots the host with `Runtime.run` in a fresh wrapper and waits until its first node is rendered. */
export const runHost = (flow: Model) =>
  Effect.gen(function* run() {
    const { container, wrapper } = mountPoint();

    Runtime.run(hostApplication(container, flow));

    yield* eventually(
      () => wrapper.querySelector(".foldkit-flow__node"),
      (found) => found !== null
    );

    return wrapper;
  });

/**
 * Boots the host with `Runtime.embed` for the surrounding scope (disposed when it closes), and returns its wrapper once
 * the nodes are rendered and the Mounts have had time to acquire their controllers.
 */
export const embedHost = (flow: Model) =>
  Effect.gen(function* embed() {
    const { container, wrapper } = mountPoint();

    yield* Effect.acquireRelease(
      Effect.sync(() => Runtime.embed(hostApplication(container, flow))),
      (handle) =>
        Effect.sync(() => {
          handle.dispose();
        })
    );

    yield* eventually(
      () => wrapper.querySelectorAll(".foldkit-flow__node").length,
      (count) => count === flow.nodes.length
    );

    yield* Effect.sleep("150 millis");

    return wrapper;
  });
