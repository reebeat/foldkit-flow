import { Option } from "effect";
import { describe, expect, test } from "vite-plus/test";

import {
  absolutePositions,
  clampToParent,
  edgeGeometry,
  fitViewport,
  handleLayout,
  handleSize,
  minimapGeometry,
  minimapSize,
  nodeIdsInBox,
  zoomBy,
} from "./geometry.ts";
import { abc, compound, edgeNamed, nodeAt, nodeNamed } from "./testFlows.ts";

const size = { height: 400, width: 800 };

describe("handleLayout", () => {
  test("puts a left handle on the left edge and a right handle on the right edge, centred vertically", () => {
    const [source, target] = handleLayout(nodeAt("a", 0, 0));
    const half = handleSize / 2;

    expect(target).toMatchObject({ id: "in", x: -half, y: 25 - half });
    expect(source).toMatchObject({ id: "out", x: 100 - half, y: 25 - half });
  });

  test("spreads the handles of one side evenly", () => {
    const node = nodeAt("a", 0, 0, {
      handles: [
        { id: "one", kind: "source", side: "Bottom" },
        { id: "two", kind: "source", side: "Bottom" },
      ],
    });

    const [first, second] = handleLayout(node);
    const half = handleSize / 2;

    expect(first?.x).toBeCloseTo(100 / 3 - half);
    expect(second?.x).toBeCloseTo((100 * 2) / 3 - half);
    expect(first?.y).toBe(50 - half);
  });
});

describe("absolutePositions", () => {
  test("adds the parent's position to a child's, through any depth", () => {
    const nodes = [
      nodeAt("root", 10, 10),
      nodeAt("middle", 5, 5, { parentId: "root" }),
      nodeAt("leaf", 1, 2, { parentId: "middle" }),
    ];

    const absolute = absolutePositions(nodes);

    expect(absolute.get("leaf")).toStrictEqual({ x: 16, y: 17 });
  });

  test("is memoised on the node list", () => {
    const { nodes } = compound();

    expect(absolutePositions(nodes)).toBe(absolutePositions(nodes));
  });

  test("survives a parent cycle without looping", () => {
    const nodes = [
      nodeAt("a", 1, 1, { parentId: "b" }),
      nodeAt("b", 2, 2, { parentId: "a" }),
    ];

    expect(absolutePositions(nodes).size).toBe(2);
  });
});

describe("edgeGeometry", () => {
  test("runs from the source's right handle to the target's left handle", () => {
    const flow = abc();
    const a = nodeNamed(flow.nodes, "a");
    const b = nodeNamed(flow.nodes, "b");
    const edge = edgeNamed(flow, "ab");

    const geometry = edgeGeometry(
      edge,
      { absolute: a.position, node: a },
      { absolute: b.position, node: b }
    );

    expect(Option.isSome(geometry)).toBe(true);
    expect(Option.getOrThrow(geometry)).toMatchObject({
      sourceX: 105,
      sourceY: 25,
      targetX: 295,
      targetY: 25,
    });
  });

  test("has no shape when the edge names a handle the node does not have", () => {
    const { nodes } = abc();
    const a = nodeNamed(nodes, "a");
    const b = nodeNamed(nodes, "b");

    const geometry = edgeGeometry(
      {
        hasArrow: false,
        id: "x",
        kind: "Straight",
        label: "",
        selected: false,
        source: "a",
        sourceHandle: "missing",
        target: "b",
        targetHandle: "in",
      },
      { absolute: a.position, node: a },
      { absolute: b.position, node: b }
    );

    expect(Option.isNone(geometry)).toBe(true);
  });

  test("draws each edge kind as a different path", () => {
    const flow = abc();
    const a = nodeNamed(flow.nodes, "a");
    const b = nodeNamed(flow.nodes, "b");
    const base = edgeNamed(flow, "ab");

    const pathOf = (kind: "Bezier" | "SmoothStep" | "Straight") =>
      Option.getOrThrow(
        edgeGeometry(
          { ...base, kind },
          { absolute: a.position, node: a },
          { absolute: { x: 300, y: 80 }, node: b }
        )
      ).path;

    const paths = new Set([
      pathOf("Bezier"),
      pathOf("SmoothStep"),
      pathOf("Straight"),
    ]);

    expect(paths.size).toBe(3);
  });
});

describe("fitViewport", () => {
  test("frames every node inside the pane with padding", () => {
    const { nodes } = abc();
    const viewport = fitViewport(nodes, size, 0.1, 4);

    // the content spans 400 by 250 flow units, from the origin
    const left = viewport.x;
    const right = 400 * viewport.zoom + viewport.x;
    const top = viewport.y;
    const bottom = 250 * viewport.zoom + viewport.y;

    expect(left).toBeGreaterThan(0);
    expect(right).toBeLessThan(size.width);
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(size.height);
  });

  test("is the identity for no nodes or an unmeasured pane", () => {
    expect(fitViewport([], size, 0.1, 4)).toStrictEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
    expect(
      fitViewport(abc().nodes, { height: 0, width: 0 }, 0.1, 4)
    ).toStrictEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });

  test("respects the zoom limits", () => {
    const viewport = fitViewport(
      [nodeAt("a", 0, 0, { height: 1, width: 1 })],
      size,
      0.1,
      2
    );

    expect(viewport.zoom).toBe(2);
  });
});

describe("zoomBy", () => {
  test("keeps the centre of the pane fixed", () => {
    const next = zoomBy({ x: 50, y: 30, zoom: 1 }, size, 2, 0.1, 4);
    const centre = { x: 400, y: 200 };

    const before = { x: (centre.x - 50) / 1, y: (centre.y - 30) / 1 };

    const after = {
      x: (centre.x - next.x) / next.zoom,
      y: (centre.y - next.y) / next.zoom,
    };

    expect(next.zoom).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test("stops at the limits", () => {
    expect(zoomBy({ x: 0, y: 0, zoom: 3.9 }, size, 2, 0.1, 4).zoom).toBe(4);
    expect(zoomBy({ x: 0, y: 0, zoom: 0.11 }, size, 0.1, 0.1, 4).zoom).toBe(
      0.1
    );
  });
});

describe("nodeIdsInBox", () => {
  const { nodes } = abc();

  test("selects the nodes a box on the pane touches, through the viewport transform", () => {
    // a is at 0..100 and b at 300..400 (flow); at zoom 2 and pan 10 they are at 10..210 and 610..810 on the pane
    const viewport = { x: 10, y: 10, zoom: 2 };

    expect(
      nodeIdsInBox(nodes, viewport, { x: 0, y: 0 }, { x: 250, y: 150 })
    ).toStrictEqual(["a"]);
    expect(
      nodeIdsInBox(nodes, viewport, { x: 600, y: 0 }, { x: 900, y: 150 })
    ).toStrictEqual(["b"]);
  });

  test("takes the corners in any order and selects nothing in an empty region", () => {
    const viewport = { x: 0, y: 0, zoom: 1 };

    expect(
      nodeIdsInBox(nodes, viewport, { x: 150, y: 150 }, { x: -10, y: -10 })
    ).toStrictEqual(["a"]);
    expect(
      nodeIdsInBox(nodes, viewport, { x: 500, y: 500 }, { x: 600, y: 600 })
    ).toStrictEqual([]);
  });
});

describe("clampToParent", () => {
  test("keeps a child that asks for it inside its parent", () => {
    const { nodes } = compound();
    const child = nodeNamed(nodes, "child-a");

    expect(clampToParent(nodes, child, { x: -50, y: -50 })).toStrictEqual({
      x: 0,
      y: 0,
    });
    expect(clampToParent(nodes, child, { x: 900, y: 900 })).toStrictEqual({
      x: 200,
      y: 150,
    });
  });

  test("leaves other nodes alone", () => {
    const { nodes } = compound();
    const outside = nodeNamed(nodes, "outside");

    expect(clampToParent(nodes, outside, { x: -50, y: -50 })).toStrictEqual({
      x: -50,
      y: -50,
    });
  });
});

describe("minimapGeometry", () => {
  test("shows every node and the visible area, with the scale of the larger side", () => {
    const { nodes } = abc();
    const geometry = minimapGeometry(nodes, { x: 0, y: 0, zoom: 1 }, size);

    expect(geometry.visible).toMatchObject({ height: 400, width: 800 });
    expect(geometry.scale).toBeCloseTo(800 / minimapSize.width);
    expect(geometry.viewBox.width).toBeGreaterThan(800);
  });
});
