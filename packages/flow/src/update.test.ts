import { Option } from "effect";
import {
  Command,
  expectNoOutMessage,
  expectOutMessage,
  given,
  message,
  model,
  story,
} from "foldkit/story";
import { describe, expect, test } from "vite-plus/test";

import { defineFlow } from "./flow.ts";
import { Message, OutMessage } from "./message.ts";
import { init } from "./model.ts";
import type { Model } from "./model.ts";
import { selectedEdgeIds, selectedNodeIds } from "./selection.ts";
import {
  abc,
  compound,
  edgeNamed,
  idsOf,
  nodeAt,
  nodeNamed,
} from "./testFlows.ts";
import { Interaction } from "./types.ts";
import { addEdge, reconnectEdge } from "./update.ts";

const { update } = defineFlow({
  // a node may not connect to itself
  isValidConnection: ({ source, target }) => source !== target,
});

const sized = (width: number, height: number) =>
  Message.ResizedPane({ height, width });

const position = (flow: Model, id: string) =>
  nodeNamed(flow.nodes, id).position;

const draft = (toNodeId?: string) =>
  Message.UpdatedConnection({
    fromHandle: "out",
    fromKind: "source",
    fromNodeId: "a",
    fromPoint: { x: 105, y: 25 },
    pointer: { x: 200, y: 20 },
    reconnecting: undefined,
    toHandle: toNodeId === undefined ? undefined : "in",
    toNodeId,
    toPosition: toNodeId === undefined ? undefined : { x: 295, y: 25 },
  });

const validityOf = (flow: Model) =>
  Interaction.matchOrElse(
    flow.interaction,
    { Connecting: ({ draft: current }) => current.validity },
    () => "none"
  );

const key = (id: string, pressed: string, isShift = false) =>
  Message.PressedNodeKey({ id, isShift, key: pressed });

const pressNode = (id: string, isAdditive = false) =>
  message(Message.PressedNode({ id, isAdditive }));

describe("viewport", () => {
  test("PanZoomed sets the viewport and runs no Command", () => {
    story(
      update,
      given(abc()),
      message(Message.PanZoomed({ x: 12, y: -4, zoom: 2 })),
      Command.expectNone(),
      expectNoOutMessage(),
      model((next) => {
        expect(next.viewport).toStrictEqual({ x: 12, y: -4, zoom: 2 });
      })
    );
  });

  test("the first size fits the flow into view, once", () => {
    const fitted = init({
      edges: [],
      id: "f",
      nodes: [nodeAt("a", 0, 0), nodeAt("b", 600, 400)],
    });

    story(
      update,
      given(fitted),
      message(sized(800, 600)),
      model((next) => {
        expect(next.hasFitted).toBe(true);
        expect(next.viewport.zoom).not.toBe(1);
      }),
      message(Message.PanZoomed({ x: 5, y: 5, zoom: 1 })),
      message(sized(900, 600)),
      model((next) => {
        expect(next.viewport).toStrictEqual({ x: 5, y: 5, zoom: 1 });
      })
    );
  });

  test("a pane without a size, or a flow that does not ask to fit, keeps the identity viewport", () => {
    story(
      update,
      given(init({ edges: [], id: "f", nodes: [nodeAt("a", 0, 0)] })),
      message(sized(0, 0)),
      model((next) => {
        expect(next.viewport).toStrictEqual({ x: 0, y: 0, zoom: 1 });
        expect(next.hasFitted).toBe(false);
      })
    );

    story(
      update,
      given(abc()),
      message(sized(800, 600)),
      model((next) => {
        expect(next.viewport).toStrictEqual({ x: 0, y: 0, zoom: 1 });
      })
    );
  });

  test("the zoom buttons zoom around the centre and stop at the limits", () => {
    story(
      update,
      given({ ...abc(), size: { height: 400, width: 800 } }),
      message(Message.ClickedZoomIn()),
      model((next) => {
        expect(next.viewport.zoom).toBeCloseTo(1.2);
      }),
      message(Message.ClickedZoomOut()),
      message(Message.ClickedZoomOut()),
      model((next) => {
        expect(next.viewport.zoom).toBeCloseTo(1 / 1.2);
      })
    );

    story(
      update,
      given({ ...abc(), maxZoom: 1.1, size: { height: 400, width: 800 } }),
      message(Message.ClickedZoomIn()),
      model((next) => {
        expect(next.viewport.zoom).toBe(1.1);
      })
    );
  });

  test("fit view frames the nodes", () => {
    story(
      update,
      given({ ...abc(), size: { height: 400, width: 800 } }),
      message(Message.ClickedFitView()),
      model((next) => {
        expect(next.viewport.zoom).toBeGreaterThan(1);
      })
    );
  });

  test("panning is recorded only while the pointer does nothing else", () => {
    story(
      update,
      given(abc()),
      message(Message.ChangedPanning({ isPanning: true })),
      model((next) => {
        expect(next.interaction).toStrictEqual(Interaction.Panning());
      }),
      message(Message.ChangedPanning({ isPanning: false })),
      model((next) => {
        expect(next.interaction).toStrictEqual(Interaction.Idle());
      })
    );

    const dragging = {
      ...abc(),
      interaction: Interaction.Dragging({ ids: ["a"] }),
    };

    story(
      update,
      given(dragging),
      message(Message.ChangedPanning({ isPanning: true })),
      model((next) => {
        expect(next.interaction).toStrictEqual(
          Interaction.Dragging({ ids: ["a"] })
        );
      })
    );
  });
});

describe("selection", () => {
  test("pressing a node selects it alone and tells the application", () => {
    story(
      update,
      given(abc()),
      pressNode("a"),
      expectOutMessage(
        OutMessage.ChangedSelection({ edgeIds: [], nodeIds: ["a"] })
      ),
      pressNode("b"),
      expectOutMessage(
        OutMessage.ChangedSelection({ edgeIds: [], nodeIds: ["b"] })
      ),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["b"]);
        expect(next.announcement).toBe("Selected Node b");
      })
    );
  });

  test("pressing with a modifier toggles the node in the selection", () => {
    story(
      update,
      given(abc()),
      pressNode("a"),
      pressNode("c", true),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["a", "c"]);
      }),
      pressNode("a", true),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["c"]);
        expect(next.announcement).toBe("Deselected Node a");
      })
    );
  });

  test("pressing a member of the selection keeps the group, so it can be dragged", () => {
    story(
      update,
      given(abc()),
      pressNode("a"),
      pressNode("b", true),
      pressNode("a"),
      expectNoOutMessage(),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["a", "b"]);
      })
    );
  });

  test("a press that changes nothing keeps the node objects, so memoised views stay valid", () => {
    const start = abc();

    story(
      update,
      given(start),
      pressNode("a"),
      model((next) => {
        expect(next.nodes[1]).toBe(start.nodes[1]);
        expect(next.nodes[0]).not.toBe(start.nodes[0]);
      })
    );
  });

  test("pressing the empty pane clears the selection", () => {
    story(
      update,
      given(abc()),
      pressNode("a"),
      message(Message.PressedPane()),
      expectOutMessage(
        OutMessage.ChangedSelection({ edgeIds: [], nodeIds: [] })
      ),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual([]);
        expect(next.announcement).toBe("Selection cleared");
      })
    );
  });

  test("pressing an edge selects it alone", () => {
    story(
      update,
      given(abc()),
      pressNode("a"),
      message(Message.PressedEdge({ id: "bc" })),
      model((next) => {
        expect(selectedEdgeIds(next.edges)).toStrictEqual(["bc"]);
        expect(selectedNodeIds(next.nodes)).toStrictEqual([]);
      })
    );
  });
});

describe("box select", () => {
  const sized800 = { ...abc(), size: { height: 400, width: 800 } };

  test("the box selects the nodes it touches while it is dragged and tells the application when it ends", () => {
    story(
      update,
      given(sized800),
      message(Message.StartedBoxSelect({ point: { x: -10, y: -10 } })),
      model((next) => {
        expect(next.interaction._tag).toBe("BoxSelecting");
      }),
      message(Message.MovedBoxSelect({ point: { x: 150, y: 120 } })),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["a"]);
      }),
      message(Message.MovedBoxSelect({ point: { x: 450, y: 120 } })),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["a", "b"]);
      }),
      message(Message.EndedBoxSelect()),
      expectOutMessage(
        OutMessage.ChangedSelection({ edgeIds: [], nodeIds: ["a", "b"] })
      ),
      model((next) => {
        expect(next.interaction).toStrictEqual(Interaction.Idle());
        expect(next.announcement).toBe("2 nodes selected");
      })
    );
  });

  test("a box drawn through the viewport transform selects by flow position", () => {
    story(
      update,
      given({ ...sized800, viewport: { x: 100, y: 0, zoom: 2 } }),
      message(Message.StartedBoxSelect({ point: { x: 0, y: 0 } })),
      message(Message.MovedBoxSelect({ point: { x: 50, y: 50 } })),
      model((next) => {
        // a is at 100..300 on the pane, so the box (0..50) misses it
        expect(selectedNodeIds(next.nodes)).toStrictEqual([]);
      }),
      message(Message.MovedBoxSelect({ point: { x: 150, y: 50 } })),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["a"]);
      })
    );
  });

  test("a box message outside a box select does nothing", () => {
    story(
      update,
      given(sized800),
      message(Message.MovedBoxSelect({ point: { x: 500, y: 500 } })),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual([]);
      })
    );
  });
});

describe("drag", () => {
  test("a drag selects the group, moves the items it reports and leaves the others as they were", () => {
    const start = abc();

    story(
      update,
      given(start),
      pressNode("a"),
      message(Message.StartedNodeDrag({ id: "a" })),
      model((next) => {
        expect(next.interaction).toStrictEqual(
          Interaction.Dragging({ ids: ["a"] })
        );
      }),
      message(Message.DraggedNodes({ items: [{ id: "a", x: 40, y: 30 }] })),
      model((next) => {
        expect(position(next, "a")).toStrictEqual({ x: 40, y: 30 });
        expect(next.nodes[1]).toBe(start.nodes[1]);
        expect(next.nodes[2]).toBe(start.nodes[2]);
      }),
      message(Message.StoppedNodeDrag()),
      expectOutMessage(OutMessage.Moved({ nodeIds: ["a"] })),
      model((next) => {
        expect(next.interaction).toStrictEqual(Interaction.Idle());
      })
    );
  });

  test("moving a node to where it already is changes nothing", () => {
    const start = abc();

    story(
      update,
      given(start),
      message(Message.DraggedNodes({ items: [{ id: "a", x: 0, y: 0 }] })),
      model((next) => {
        expect(next.nodes).toBe(start.nodes);
      })
    );
  });
});

describe("connect", () => {
  test("a dragged connection is Unknown over nothing, Valid over a legal handle and Invalid over a refused one", () => {
    story(
      update,
      given(abc()),
      message(draft()),
      model((next) => {
        expect(validityOf(next)).toBe("Unknown");
      }),
      message(draft("b")),
      model((next) => {
        expect(validityOf(next)).toBe("Valid");
      }),
      message(draft("a")),
      model((next) => {
        expect(validityOf(next)).toBe("Invalid");
      }),
      message(Message.EndedConnection()),
      model((next) => {
        expect(next.interaction).toStrictEqual(Interaction.Idle());
      })
    );
  });

  test("dropping on a valid handle tells the application, which adds the edge", () => {
    const connection = {
      source: "a",
      sourceHandle: "out",
      target: "c",
      targetHandle: "in",
    };

    story(
      update,
      given({ ...abc(), interaction: Interaction.Idle() }),
      message(Message.ConnectedHandles({ connection })),
      expectOutMessage(OutMessage.Connected({ connection })),
      model((next) => {
        expect(next.edges).toHaveLength(2);
        expect(next.announcement).toBe("Connected Node a to Node c");
      })
    );
  });

  test("dropping on a handle the rule refuses yields nothing", () => {
    story(
      update,
      given(abc()),
      message(
        Message.ConnectedHandles({
          connection: {
            source: "a",
            sourceHandle: "out",
            target: "a",
            targetHandle: "in",
          },
        })
      ),
      expectNoOutMessage()
    );
  });

  test("dropping a reconnected edge end tells the application which edge moved", () => {
    const connection = {
      source: "a",
      sourceHandle: "out",
      target: "c",
      targetHandle: "in",
    };

    story(
      update,
      given(abc()),
      message(Message.ReconnectedHandles({ connection, edgeId: "ab" })),
      expectOutMessage(OutMessage.Reconnected({ connection, edgeId: "ab" }))
    );
  });

  test("addEdge adds the edge, and not a second one between the same handles", () => {
    const connection = {
      source: "a",
      sourceHandle: "out",
      target: "c",
      targetHandle: "in",
    };

    const edge = {
      hasArrow: true,
      id: "ac",
      kind: "Bezier" as const,
      label: "",
    };

    const once = addEdge(abc(), connection, edge);
    const twice = addEdge(once, connection, edge);

    expect(idsOf(once.edges)).toStrictEqual(["ab", "bc", "ac"]);
    expect(twice.edges).toBe(once.edges);
  });

  test("reconnectEdge moves the ends of one edge", () => {
    const next = reconnectEdge(abc(), "ab", {
      source: "a",
      sourceHandle: "out",
      target: "c",
      targetHandle: "in",
    });

    expect(edgeNamed(next, "ab").target).toBe("c");
    expect(edgeNamed(next, "bc").target).toBe("c");
  });
});

describe("keyboard", () => {
  test("an arrow key moves the focused node by the step, and Shift by four times the step", () => {
    story(
      update,
      given(abc()),
      message(key("a", "ArrowRight")),
      model((next) => {
        expect(position(next, "a")).toStrictEqual({ x: 10, y: 0 });
        expect(next.announcement).toBe("Moved Node a to 10, 0");
      }),
      message(key("a", "ArrowDown", true)),
      expectOutMessage(OutMessage.Moved({ nodeIds: ["a"] })),
      model((next) => {
        expect(position(next, "a")).toStrictEqual({ x: 10, y: 40 });
      })
    );
  });

  test("the key moves the whole selection when the focused node is part of it", () => {
    story(
      update,
      given(abc()),
      pressNode("a"),
      pressNode("b", true),
      message(key("a", "ArrowLeft")),
      model((next) => {
        expect(position(next, "a")).toStrictEqual({ x: -10, y: 0 });
        expect(position(next, "b")).toStrictEqual({ x: 290, y: 0 });
        expect(position(next, "c")).toStrictEqual({ x: 0, y: 200 });
      })
    );
  });

  test("a node that is not draggable stays where it is", () => {
    const fixed = init({
      edges: [],
      id: "f",
      isFitOnInit: false,
      nodes: [nodeAt("a", 5, 5, { draggable: false })],
    });

    story(
      update,
      given(fixed),
      message(key("a", "ArrowRight")),
      model((next) => {
        expect(next.nodes[0]?.position).toStrictEqual({ x: 5, y: 5 });
      })
    );
  });

  test("a child is clamped to its parent, and moves with it instead of twice", () => {
    story(
      update,
      given(compound()),
      message(key("child-a", "ArrowLeft", true)),
      model((next) => {
        expect(position(next, "child-a")).toStrictEqual({ x: 0, y: 30 });
      }),
      pressNode("scene"),
      pressNode("child-b", true),
      message(key("scene", "ArrowDown")),
      model((next) => {
        expect(position(next, "scene")).toStrictEqual({ x: 100, y: 110 });
        expect(position(next, "child-b")).toStrictEqual({ x: 150, y: 30 });
      })
    );
  });

  test("Enter and Space select the node, Shift adds to the selection, Escape clears it", () => {
    story(
      update,
      given(abc()),
      message(key("a", "Enter")),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["a"]);
      }),
      message(key("b", " ", true)),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual(["a", "b"]);
      }),
      message(key("b", "Escape")),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual([]);
      })
    );
  });

  test("Delete removes the selected nodes and the edges that end on them", () => {
    story(
      update,
      given(abc()),
      pressNode("b"),
      message(key("b", "Delete")),
      expectOutMessage(
        OutMessage.Deleted({ edgeIds: ["ab", "bc"], nodeIds: ["b"] })
      ),
      model((next) => {
        expect(idsOf(next.nodes)).toStrictEqual(["a", "c"]);
        expect(next.edges).toStrictEqual([]);
        expect(next.announcement).toBe("Deleted 1 node and 2 edges");
      })
    );
  });

  test("Delete on a focused node that is not selected removes just that node", () => {
    story(
      update,
      given(abc()),
      message(key("c", "Backspace")),
      model((next) => {
        expect(idsOf(next.nodes)).toStrictEqual(["a", "b"]);
        expect(idsOf(next.edges)).toStrictEqual(["ab"]);
      })
    );
  });

  test("deleting a parent removes its children", () => {
    story(
      update,
      given(compound()),
      message(key("scene", "Delete")),
      model((next) => {
        expect(idsOf(next.nodes)).toStrictEqual(["outside"]);
      })
    );
  });

  test("a key it does not know changes nothing", () => {
    const start = abc();

    story(
      update,
      given(start),
      message(key("a", "x")),
      expectNoOutMessage(),
      model((next) => {
        expect(next).toBe(start);
      })
    );
  });

  test("canvas keys zoom, fit, clear the selection and delete the selection", () => {
    story(
      update,
      given({ ...abc(), size: { height: 400, width: 800 } }),
      message(Message.PressedCanvasKey({ key: "+" })),
      model((next) => {
        expect(next.viewport.zoom).toBeCloseTo(1.2);
      }),
      message(Message.PressedCanvasKey({ key: "0" })),
      model((next) => {
        expect(next.viewport.zoom).toBeGreaterThan(1);
      }),
      pressNode("a"),
      message(Message.PressedCanvasKey({ key: "Escape" })),
      model((next) => {
        expect(selectedNodeIds(next.nodes)).toStrictEqual([]);
      }),
      pressNode("a"),
      message(Message.PressedCanvasKey({ key: "Delete" })),
      model((next) => {
        expect(idsOf(next.nodes)).toStrictEqual(["b", "c"]);
      })
    );
  });
});

describe("the update", () => {
  test("is total over the messages it handles and returns no Command", () => {
    const messages = [
      Message.ClickedFitView(),
      Message.CompletedMinimapMount(),
      Message.EndedBoxSelect(),
      Message.EndedConnection(),
      Message.PressedPane(),
      Message.StoppedNodeDrag(),
    ];

    for (const each of messages) {
      const result = update(abc(), each);

      expect(result.commands).toBeUndefined();
      expect(Option.isOption(result.model)).toBe(false);
    }
  });
});
