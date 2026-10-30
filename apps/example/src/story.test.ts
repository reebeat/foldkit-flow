import * as Flow from "@tsukuri/flow";
import { Array, Option } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vite-plus/test";

import type { Model } from "./main.ts";
import { Message, update } from "./main.ts";
import { start } from "./testModels.ts";

const flowMessage = (inner: Flow.Message) =>
  Message.GotFlowMessage({ message: inner });

const texts = (log: Model["log"]) => Array.map(log, (entry) => entry.text);

describe("update", () => {
  test("starts on the small graph with the attribution visible and an empty log", () => {
    expect(start.graph).toBe("Small");
    expect(start.flow.nodes).toHaveLength(5);
    expect(start.flow.attribution).toStrictEqual(Flow.defaultAttribution);
    expect(start.log).toStrictEqual([]);
  });

  test("ClickedGraph replaces the graph, clears the log and keeps the attribution choice", () => {
    story(
      update,
      given(start),
      message(Message.ClickedToggleAttribution()),
      message(Message.ClickedGraph({ graph: "Large" })),
      Command.expectNone(),
      model((next) => {
        expect(next.graph).toBe("Large");
        expect(next.flow.nodes).toHaveLength(500);
        expect(next.flow.edges).toHaveLength(700);
        expect(next.log).toStrictEqual([]);
        expect(next.flow.attribution).toStrictEqual(Flow.Attribution.Hidden());
      })
    );
  });

  test("ClickedGraph Compound has scenes holding states", () => {
    story(
      update,
      given(start),
      message(Message.ClickedGraph({ graph: "Compound" })),
      model((next) => {
        const children = Array.filter(
          next.flow.nodes,
          (node) => node.parentId !== undefined
        );

        expect(children.length).toBeGreaterThan(0);
        expect(Array.every(children, (node) => node.isClampedToParent)).toBe(
          true
        );
      })
    );
  });

  test("ClickedToggleAttribution hides and shows the attribution", () => {
    story(
      update,
      given(start),
      message(Message.ClickedToggleAttribution()),
      model((next) => {
        expect(next.flow.attribution).toStrictEqual(Flow.Attribution.Hidden());
      }),
      message(Message.ClickedToggleAttribution()),
      model((next) => {
        expect(next.flow.attribution).toStrictEqual(Flow.Attribution.Visible());
      })
    );
  });

  test("a flow Message is folded into the flow, and its out-message is logged", () => {
    story(
      update,
      given(start),
      message(
        flowMessage(Flow.Message.PressedNode({ id: "load", isAdditive: false }))
      ),
      model((next) => {
        expect(Flow.selectedNodeIds(next.flow.nodes)).toStrictEqual(["load"]);
        expect(texts(next.log)).toStrictEqual(["Selection: 1 nodes, 0 edges"]);
      })
    );
  });

  test("Connected adds the edge, and a refused connection adds none", () => {
    const connection = {
      source: "start",
      sourceHandle: "out",
      target: "done",
      targetHandle: "in",
    };

    story(
      update,
      given(start),
      message(flowMessage(Flow.Message.ConnectedHandles({ connection }))),
      model((next) => {
        expect(next.flow.edges).toHaveLength(start.flow.edges.length + 1);
        expect(texts(next.log)).toStrictEqual(["Connected start to done"]);
      }),
      message(
        flowMessage(
          Flow.Message.ConnectedHandles({
            connection: { ...connection, target: "start" },
          })
        )
      ),
      model((next) => {
        expect(next.flow.edges).toHaveLength(start.flow.edges.length + 1);
      })
    );
  });

  test("Reconnected moves the end of the edge", () => {
    story(
      update,
      given(start),
      message(
        flowMessage(
          Flow.Message.ReconnectedHandles({
            connection: {
              source: "start",
              sourceHandle: "out",
              target: "check",
              targetHandle: "in",
            },
            edgeId: "e1",
          })
        )
      ),
      model((next) => {
        expect(
          Option.map(
            Array.findFirst(next.flow.edges, (edge) => edge.id === "e1"),
            (edge) => edge.target
          )
        ).toStrictEqual(Option.some("check"));
        expect(texts(next.log)).toStrictEqual(["Reconnected e1"]);
      })
    );
  });

  test("the log keeps the last six entries with stable ids", () => {
    let current = start;

    for (let index = 0; index < 9; index += 1) {
      current = update(current, flowMessage(Flow.Message.PressedPane())).model;
      current = update(
        current,
        flowMessage(
          Flow.Message.PressedNode({
            id: index % 2 === 0 ? "load" : "check",
            isAdditive: false,
          })
        )
      ).model;
    }

    expect(current.log).toHaveLength(6);
    expect(new Set(Array.map(current.log, (entry) => entry.id)).size).toBe(6);
  });
});
