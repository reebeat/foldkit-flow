// The browser gate of spec 0001: it drives the built example in headless Chromium through the journey (pan and zoom,
// drag, connect, reconnect, box select, keyboard only, controls, minimap) and measures the performance budget on the
// 500-node, 700-edge graph. It reads the DOM the way a person sees it (probe.ts); it imports nothing from the library.
//
// Usage: `bun run build && bun run journey` (needs a Chromium on PATH or FLOW_CHROMIUM). It is not part of CI, which
// has no browser. Evidence (screenshots, results.json) goes to ~/.local/state/foldkit-flow-verify/journey/.
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
  Array as Arr,
  Config,
  DateTime,
  Effect,
  FileSystem,
  Option,
  Order,
  Path,
  Schedule,
  Schema,
  String as Str,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { launch } from "puppeteer-core";
import type {
  Browser,
  CDPSession,
  EvaluateFunc,
  KeyInput,
  Page,
} from "puppeteer-core";

import * as probe from "./probe.ts";
import type { Point } from "./probe.ts";
import { shareAtMost, summarise } from "./stats.ts";

/** J9: the p95 scripting time (update, view, patch) one pointer move costs, in milliseconds. */
const scriptBudgetMs = 8;

/** A pointer drag starts with a small move (xyflow takes the first move as the drag's reference), in pixels. */
const kickPx = 2;

/** J9: a frame interval of one frame plus one frame of tolerance (60 Hz), in milliseconds. */
const frameToleranceMs = 33.5;

/** J9: the number of pointer moves of the measured drag. */
const moveCount = 150;

/** J9: how many times the drag is measured; the gate is the median of the runs' p95. */
const runCount = 3;

class JourneyError extends Schema.TaggedError<
  JourneyError,
  { readonly brand: unique symbol }
>()("JourneyError", {
  message: Schema.String,
}) {}

interface Check {
  readonly detail: string;
  readonly id: string;
  readonly name: string;
  readonly ok: boolean;
}

const check = (
  id: string,
  name: string,
  ok: boolean,
  detail: string
): Check => ({ detail, id, name, ok });

const attempt = <A>(label: string, thunk: () => Promise<A>) =>
  Effect.tryPromise({
    catch: (cause) =>
      new JourneyError({
        message: `${label}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
    try: thunk,
  });

/** Everything a step needs: the page and where the evidence goes. */
interface Session {
  readonly directory: string;
  readonly page: Page;
}

const centre = (rect: probe.Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

const node = (id: string) => `.foldkit-flow__node[data-id='${id}']`;

const handle = (nodeId: string, kind: "source" | "target") =>
  `.foldkit-flow__handle[data-nodeid='${nodeId}'].${kind}`;

// READS: each runs a probe function in the page

const inPage = <Args extends unknown[], Fn extends EvaluateFunc<Args>>(
  { page }: Session,
  label: string,
  fn: Fn,
  ...args: Args
) => attempt(label, () => page.evaluate<Args, Fn>(fn, ...args));

const rectOf = (session: Session, selector: string) =>
  inPage(session, `rect of ${selector}`, probe.rectOf, selector).pipe(
    Effect.filterOrFail(
      (rect): rect is probe.Rect => rect !== null,
      () => new JourneyError({ message: `no element ${selector}` })
    )
  );

const centreOf = (session: Session, selector: string) =>
  Effect.map(rectOf(session, selector), centre);

const zoomOf = (session: Session) =>
  Effect.map(
    inPage(session, "viewport", probe.viewportOf),
    (viewport) => viewport?.zoom ?? 1
  );

/** Two animation frames: whatever the page rendered for the last input has been laid out and painted. */
const settle = (session: Session) => inPage(session, "settle", probe.settled);

// POINTER AND KEYBOARD

const drag = (session: Session, from: Point, to: Point, steps = 12) =>
  Effect.gen(function* dragging() {
    const { mouse } = session.page;

    yield* attempt("move", () => mouse.move(from.x, from.y));
    yield* attempt("down", () => mouse.down());
    yield* attempt("kick", () => mouse.move(from.x + kickPx, from.y + kickPx));
    yield* attempt("drag", () => mouse.move(to.x, to.y, { steps }));
    yield* attempt("up", () => mouse.up());
    yield* settle(session);
  });

const dragBetween = (
  session: Session,
  fromSelector: string,
  toSelector: string
) =>
  Effect.gen(function* between() {
    const from = yield* centreOf(session, fromSelector);
    const to = yield* centreOf(session, toSelector);

    yield* drag(session, from, to);
  });

const press = (session: Session, key: KeyInput) =>
  attempt(`press ${key}`, () => session.page.keyboard.press(key)).pipe(
    Effect.andThen(settle(session))
  );

/** A control animates the viewport: wait for the animation (200 ms) to end before reading it. */
const clickButton = (session: Session, label: string) =>
  attempt(`click ${label}`, () =>
    session.page.click(`button[aria-label='${label}']`)
  ).pipe(
    Effect.andThen(Effect.sleep("400 millis")),
    Effect.andThen(settle(session))
  );

const shot = (session: Session, name: string) =>
  Effect.gen(function* shooting() {
    const path = yield* Path.Path;

    yield* attempt(`screenshot ${name}`, () =>
      session.page.screenshot({
        path: path.join(session.directory, `${name}.png`),
      })
    );
  });

// SMALL GRAPH: J1 to J6, J10

const roles = (session: Session) =>
  Effect.gen(function* rolesStep() {
    yield* settle(session);
    yield* shot(session, "01-initial");

    const found = yield* inPage(session, "roles", probe.rolesOf);

    return [
      check(
        "J10",
        "attribution link is visible by default",
        found.attribution,
        `link present: ${found.attribution}`
      ),
      check(
        "J5",
        "canvas is role application, nodes role group, a live region exists",
        found.application === "application" &&
          found.nodeRole === "group" &&
          found.live === "polite",
        `application=${found.application} node=${found.nodeRole} live=${found.live} attribution=${found.attribution}`
      ),
    ];
  });

const panZoom = (session: Session) =>
  Effect.gen(function* panZoomStep() {
    const pane = yield* rectOf(session, ".foldkit-flow__pane");
    const middle = centre(pane);
    const before = yield* inPage(session, "viewport", probe.viewportOf);

    yield* inPage(session, "watch", probe.watchMutations);
    yield* attempt("move", () => session.page.mouse.move(middle.x, middle.y));
    yield* attempt("wheel", () => session.page.mouse.wheel({ deltaY: -240 }));
    yield* settle(session);

    const zoomed = yield* inPage(session, "viewport", probe.viewportOf);

    const empty = yield* inPage(session, "empty point", probe.emptyPoint);
    const from = empty ?? { x: pane.x + 40, y: pane.y + 40 };

    yield* drag(session, from, { x: from.x + 100, y: from.y + 30 });

    const panned = yield* inPage(session, "viewport", probe.viewportOf);
    const touched = yield* inPage(session, "mutations", probe.readMutations);

    yield* shot(session, "02-panned-zoomed");

    const zoomChanged = (zoomed?.zoom ?? 0) > (before?.zoom ?? 0);
    const panChanged = panned?.x !== zoomed?.x || panned?.y !== zoomed?.y;

    return check(
      "J1",
      "wheel zooms, a pane drag pans, and no node or edge is touched in the DOM",
      zoomChanged && panChanged && touched.total === 0,
      `zoom ${before?.zoom} -> ${zoomed?.zoom}; pan (${zoomed?.x}, ${zoomed?.y}) -> (${panned?.x}, ${panned?.y}); mutations below the viewport element: ${touched.total}`
    );
  });

const dragNode = (session: Session) =>
  Effect.gen(function* dragNodeStep() {
    yield* clickButton(session, "Fit view");

    const before = yield* inPage(
      session,
      "position",
      probe.nodePosition,
      node("load")
    );

    const edgeBefore = yield* inPage(session, "edge path", probe.firstEdgePath);
    const zoom = yield* zoomOf(session);
    const from = yield* centreOf(session, node("load"));

    yield* drag(session, from, {
      x: from.x + 60 * zoom,
      y: from.y + 40 * zoom,
    });

    const after = yield* inPage(
      session,
      "position",
      probe.nodePosition,
      node("load")
    );

    const edgeAfter = yield* inPage(session, "edge path", probe.firstEdgePath);
    const log = yield* inPage(session, "log", probe.textOf, "[role='log']");

    yield* shot(session, "03-dragged");

    // the pointer travelled (60, 40) flow units from the press, less the kick that started the drag (screen pixels)
    const expected = 60 - kickPx / zoom;
    const dx = (after?.x ?? 0) - (before?.x ?? 0);
    const dy = (after?.y ?? 0) - (before?.y ?? 0);

    return check(
      "J2",
      "dragging a node moves it by the pointer delta, its edge follows, the app is told",
      Math.abs(dx - expected) < 1 &&
        Math.abs(dy - (expected - 20)) < 1 &&
        edgeBefore !== edgeAfter &&
        Str.includes("Moved")(log),
      `Load (${before?.x}, ${before?.y}) -> (${after?.x}, ${after?.y}); edge path changed: ${edgeBefore !== edgeAfter}; log: ${log}`
    );
  });

const edgeCount = (session: Session) =>
  inPage(session, "edges", probe.countOf, ".foldkit-flow__edge");

const connect = (session: Session) =>
  Effect.gen(function* connectStep() {
    const before = yield* edgeCount(session);

    yield* dragBetween(
      session,
      handle("spare", "source"),
      handle("done", "target")
    );

    const added = yield* edgeCount(session);

    yield* dragBetween(
      session,
      handle("spare", "source"),
      handle("spare", "target")
    );

    const afterSelfLoop = yield* edgeCount(session);

    yield* shot(session, "04-connected");

    const midpoint = yield* inPage(
      session,
      "midpoint",
      probe.edgeMidpoint,
      "Edge from Spare to Done"
    );

    // the reconnect anchors appear on a selected edge: click the edge first
    if (midpoint !== null) {
      yield* attempt("select the edge", () =>
        session.page.mouse.click(midpoint.x, midpoint.y)
      );
      yield* settle(session);
    }

    const anchor = yield* inPage(
      session,
      "anchor",
      probe.targetAnchorOf,
      "Edge from Spare to Done"
    );

    const checkIn = yield* centreOf(session, handle("check", "target"));

    if (anchor !== null) {
      yield* drag(session, anchor, checkIn);
    }

    const reconnected = yield* inPage(
      session,
      "reconnected",
      probe.hasEdgeLabelled,
      "Edge from Spare to Check"
    );

    const log = yield* inPage(session, "log", probe.textOf, "[role='log']");

    yield* shot(session, "05-reconnected");

    return check(
      "J3",
      "a valid drag from handle to handle adds an edge, a self-loop adds none, reconnecting moves an edge end",
      added === before + 1 &&
        afterSelfLoop === added &&
        reconnected &&
        Str.includes("Connected")(log) &&
        Str.includes("Reconnected")(log),
      `edges ${before} -> ${added} -> ${afterSelfLoop} after a self-loop; the edge now ends on Check: ${reconnected}; log: ${log}`
    );
  });

const boxSelect = (session: Session) =>
  Effect.gen(function* boxSelectStep() {
    yield* clickButton(session, "Fit view");

    const first = yield* rectOf(session, node("start"));
    const second = yield* rectOf(session, node("load"));
    const { keyboard } = session.page;

    yield* attempt("shift down", () => keyboard.down("Shift"));
    yield* drag(
      session,
      { x: first.x - 12, y: Math.min(first.y, second.y) - 12 },
      {
        x: second.x + second.width + 12,
        y: Math.max(first.y + first.height, second.y + second.height) + 12,
      }
    );
    yield* attempt("shift up", () => keyboard.up("Shift"));

    const selected = yield* inPage(session, "selected", probe.selectedIds);

    yield* shot(session, "06-box-selected");

    return check(
      "J4",
      "Shift+drag selects the nodes inside the box and no others",
      Arr.join(Arr.sort(selected, Order.String), ",") === "load,start",
      `selected: ${Arr.join(selected, ",")}`
    );
  });

const controls = (session: Session) =>
  Effect.gen(function* controlsStep() {
    const start = yield* zoomOf(session);

    yield* clickButton(session, "Zoom in");

    const zoomedIn = yield* zoomOf(session);

    yield* clickButton(session, "Zoom out");

    const zoomedOut = yield* zoomOf(session);

    const miniNodes = yield* inPage(
      session,
      "minimap",
      probe.countOf,
      ".foldkit-flow__minimap-node"
    );

    const nodes = yield* inPage(
      session,
      "nodes",
      probe.countOf,
      ".foldkit-flow__node"
    );

    const minimap = yield* centreOf(session, ".foldkit-flow__minimap");
    const before = yield* inPage(session, "viewport", probe.viewportOf);

    yield* drag(session, minimap, { x: minimap.x + 20, y: minimap.y + 10 }, 6);

    const after = yield* inPage(session, "viewport", probe.viewportOf);

    yield* clickButton(session, "Fit view");

    const fitted = yield* inPage(session, "fitted", probe.everyNodeInsidePane);
    const panned = before?.x !== after?.x || before?.y !== after?.y;

    yield* shot(session, "07-controls-minimap");

    return check(
      "J6",
      "controls zoom, fit view frames every node, the minimap shows every node and pans",
      zoomedIn > start &&
        zoomedOut < zoomedIn &&
        fitted &&
        miniNodes === nodes &&
        panned,
      `zoom ${start} -> ${zoomedIn} -> ${zoomedOut}; fitted: ${fitted}; minimap nodes ${miniNodes}/${nodes}; a minimap drag moved the viewport: ${panned}`
    );
  });

// KEYBOARD: J5, no pointer

/** Tab until a node has focus. */
const tabToNode = (
  session: Session,
  remaining: number
): Effect.Effect<string, JourneyError> =>
  Effect.gen(function* tabbing() {
    const id = yield* inPage(session, "focus", probe.focusedNodeId);

    if (id !== "" || remaining === 0) {
      return id;
    }

    yield* press(session, "Tab");

    return yield* tabToNode(session, remaining - 1);
  });

const moveByKeys = (session: Session) =>
  Effect.gen(function* moveStep() {
    const focused = yield* tabToNode(session, 40);

    yield* press(session, "Enter");

    const selected = yield* inPage(session, "selected", probe.selectedIds);

    const origin = yield* inPage(
      session,
      "position",
      probe.nodePosition,
      node(focused)
    );

    const { keyboard } = session.page;

    yield* press(session, "ArrowRight");
    yield* press(session, "ArrowRight");
    yield* attempt("shift down", () => keyboard.down("Shift"));
    yield* press(session, "ArrowDown");
    yield* attempt("shift up", () => keyboard.up("Shift"));

    const moved = yield* inPage(
      session,
      "position",
      probe.nodePosition,
      node(focused)
    );

    const stillFocused = yield* inPage(session, "focus", probe.focusedNodeId);

    const announced = yield* inPage(
      session,
      "status",
      probe.textOf,
      "[role='status']"
    );

    yield* shot(session, "08-keyboard-moved");

    const dx = (moved?.x ?? 0) - (origin?.x ?? 0);
    const dy = (moved?.y ?? 0) - (origin?.y ?? 0);

    return check(
      "J5",
      "keyboard only: Tab reaches a node, Enter selects, arrows move it (Shift: four times), focus stays, the live region says so",
      focused !== "" &&
        selected.length === 1 &&
        dx === 20 &&
        dy === 40 &&
        stillFocused === focused &&
        Str.includes("Moved")(announced),
      `focused ${focused}; moved by (${dx}, ${dy}); announced: ${announced}`
    );
  });

const clearAndDelete = (session: Session) =>
  Effect.gen(function* deleteStep() {
    yield* press(session, "Escape");

    const cleared = yield* inPage(session, "selected", probe.selectedIds);

    yield* press(session, "Enter");

    const nodesBefore = yield* inPage(
      session,
      "nodes",
      probe.countOf,
      ".foldkit-flow__node"
    );

    const edgesBefore = yield* edgeCount(session);

    yield* press(session, "Delete");

    const nodesAfter = yield* inPage(
      session,
      "nodes",
      probe.countOf,
      ".foldkit-flow__node"
    );

    const edgesAfter = yield* edgeCount(session);

    const announced = yield* inPage(
      session,
      "status",
      probe.textOf,
      "[role='status']"
    );

    yield* shot(session, "09-keyboard-deleted");

    return check(
      "J5",
      "keyboard only: Escape clears the selection, Delete removes the node and its edges",
      cleared.length === 0 &&
        nodesAfter === nodesBefore - 1 &&
        edgesAfter < edgesBefore &&
        Str.includes("Deleted")(announced),
      `nodes ${nodesBefore} -> ${nodesAfter}; edges ${edgesBefore} -> ${edgesAfter}; announced: ${announced}`
    );
  });

// PERFORMANCE: J9, the 500-node, 700-edge graph

// (the main-thread counters Chromium reports are read in `busyNow` below)

/** The node nearest the pane centre is the one that is dragged. */
const prepareLarge = (session: Session) =>
  Effect.gen(function* prepareStep() {
    yield* inPage(session, "choose Large", probe.clickButtonText, "Large");
    yield* attempt("wait for 500 nodes", () =>
      session.page.waitForFunction(
        "document.querySelectorAll('.foldkit-flow__node').length === 500",
        { timeout: 20_000 }
      )
    );
    yield* clickButton(session, "Fit view");
    yield* shot(session, "10-large");
  });

/** Ten wheel steps over the large graph: nothing below the viewport element may change. */
const zoomLarge = (session: Session) =>
  Effect.gen(function* zoomStep() {
    const middle = yield* centreOf(session, ".foldkit-flow__pane");

    yield* inPage(session, "watch", probe.watchMutations);
    yield* attempt("move", () => session.page.mouse.move(middle.x, middle.y));
    yield* Effect.forEach(
      Arr.range(1, 10),
      () =>
        attempt("wheel", () => session.page.mouse.wheel({ deltaY: -60 })).pipe(
          Effect.andThen(settle(session))
        ),
      { discard: true }
    );

    const touched = yield* inPage(session, "mutations", probe.readMutations);

    yield* clickButton(session, "Fit view");

    return touched;
  });

/** The main thread's time over one step, in milliseconds, split the way Chromium reports it. */
interface Busy {
  readonly layout: number;
  readonly script: number;
  readonly style: number;
  readonly task: number;
}

interface Measured {
  readonly frames: readonly number[];
  readonly idle: readonly Busy[];
  readonly moves: readonly Busy[];
  readonly touched: probe.Seen;
  readonly travelled: number;
}

const metricOf = (
  metrics: readonly { readonly name: string; readonly value: number }[],
  name: string
) =>
  Option.match(
    Arr.findFirst(metrics, (metric) => metric.name === name),
    { onNone: () => 0, onSome: (metric) => metric.value }
  );

/** Chromium's cumulative main-thread counters (seconds). */
const busyNow = (cdp: CDPSession) =>
  attempt("metrics", () => cdp.send("Performance.getMetrics")).pipe(
    Effect.map(({ metrics }) => ({
      layout: metricOf(metrics, "LayoutDuration"),
      script: metricOf(metrics, "ScriptDuration"),
      style: metricOf(metrics, "RecalcStyleDuration"),
      task: metricOf(metrics, "TaskDuration"),
    }))
  );

/** Runs `step`, waits for the frames it caused, and returns what the main thread spent (milliseconds). */
const timed = (
  session: Session,
  cdp: CDPSession,
  step: Effect.Effect<unknown, JourneyError>
) =>
  Effect.gen(function* timedStep() {
    const before = yield* busyNow(cdp);

    yield* step;
    yield* settle(session);

    const after = yield* busyNow(cdp);

    return {
      layout: (after.layout - before.layout) * 1000,
      script: (after.script - before.script) * 1000,
      style: (after.style - before.style) * 1000,
      task: (after.task - before.task) * 1000,
    } satisfies Busy;
  });

const measureDrag = (session: Session, cdp: CDPSession) =>
  Effect.gen(function* measureStep() {
    const middle = yield* centreOf(session, ".foldkit-flow__pane");

    const target = yield* inPage(
      session,
      "nearest",
      probe.nearestNodeId,
      middle.x,
      middle.y
    );

    const start = yield* centreOf(session, node(target));

    const origin = yield* inPage(
      session,
      "position",
      probe.nodePosition,
      node(target)
    );

    const zoom = yield* zoomOf(session);
    const { mouse } = session.page;

    // what an idle page costs over the same two frames: the floor of the numbers below
    const idle = yield* Effect.forEach(Arr.range(1, 20), () =>
      timed(session, cdp, Effect.void)
    );

    yield* attempt("move", () => mouse.move(start.x, start.y));
    yield* attempt("down", () => mouse.down());
    yield* inPage(session, "watch", probe.watchMutations);
    yield* inPage(session, "frames", probe.startFrames);

    const moves = yield* Effect.forEach(Arr.range(1, moveCount), (index) =>
      timed(
        session,
        cdp,
        attempt("move", () =>
          mouse.move(start.x + index * 1.5, start.y + index * 0.5)
        )
      )
    );

    const frames = yield* inPage(session, "frames", probe.stopFrames);
    const touched = yield* inPage(session, "mutations", probe.readMutations);

    yield* attempt("up", () => mouse.up());
    yield* settle(session);
    yield* shot(session, "11-large-dragged");

    const finish = yield* inPage(
      session,
      "position",
      probe.nodePosition,
      node(target)
    );

    return {
      frames,
      idle,
      moves,
      touched,
      travelled: Math.round(((finish?.x ?? 0) - (origin?.x ?? 0)) * zoom),
    } satisfies Measured;
  });

/** The distribution of each column of main-thread time. */
const columns = (list: readonly Busy[]) => ({
  layout: summarise(Arr.map(list, (entry) => entry.layout)),
  script: summarise(Arr.map(list, (entry) => entry.script)),
  style: summarise(Arr.map(list, (entry) => entry.style)),
  task: summarise(Arr.map(list, (entry) => entry.task)),
});

const ms = (value: number) => value.toFixed(2);

const performanceJourney = (session: Session, cdp: CDPSession) =>
  Effect.gen(function* performanceStep() {
    yield* prepareLarge(session);

    const nodes = yield* inPage(
      session,
      "nodes",
      probe.countOf,
      ".foldkit-flow__node"
    );

    const edges = yield* edgeCount(session);
    const zoomTouched = yield* zoomLarge(session);

    // The host is shared and other work shows up as an outlier: the drag is measured `runCount` times and the gate is
    // the median of the runs' p95, so one disturbed run cannot fail it and one lucky run cannot pass it.
    const drags = yield* Effect.forEach(Arr.range(1, runCount), () =>
      clickButton(session, "Fit view").pipe(
        Effect.andThen(measureDrag(session, cdp))
      )
    );

    const runs = Arr.map(drags, (measured) => columns(measured.moves));
    const scriptP95s = Arr.map(runs, (run) => run.script.p95);
    const gate = summarise(scriptP95s).p50;
    const moves = columns(Arr.flatMap(drags, (measured) => measured.moves));
    const idle = columns(Arr.flatMap(drags, (measured) => measured.idle));
    const allFrames = Arr.flatMap(drags, (measured) => measured.frames);
    const frames = summarise(allFrames);
    const smooth = shareAtMost(allFrames, frameToleranceMs);

    const touchedNodes = Math.max(
      ...Arr.map(drags, (measured) => measured.touched.nodes)
    );

    const touchedEdges = Math.max(
      ...Arr.map(drags, (measured) => measured.touched.edges)
    );

    const travelled = Math.min(
      ...Arr.map(drags, (measured) => measured.travelled)
    );

    const checks = [
      check(
        "J9",
        `dragging one node of ${nodes} nodes and ${edges} edges: median of ${runCount} runs of the p95 scripting time (update, view, patch) per pointer move under ${scriptBudgetMs} ms, and 95% of frames within ${frameToleranceMs} ms`,
        nodes === 500 &&
          edges === 700 &&
          gate < scriptBudgetMs &&
          smooth >= 0.95 &&
          travelled > 100,
        `p95 scripting per run: ${Arr.join(Arr.map(scriptP95s, ms), ", ")} ms, median ${ms(gate)}; all ${moves.script.count} moves (ms, p50/p95/max): scripting ${ms(moves.script.p50)}/${ms(moves.script.p95)}/${ms(moves.script.max)}, style ${ms(moves.style.p50)}/${ms(moves.style.p95)}/${ms(moves.style.max)}, layout ${ms(moves.layout.p50)}/${ms(moves.layout.p95)}/${ms(moves.layout.max)}, all main-thread tasks ${ms(moves.task.p50)}/${ms(moves.task.p95)}/${ms(moves.task.max)}; the same two frames idle: tasks p50 ${ms(idle.task.p50)} ms; frame interval p50 ${frames.p50.toFixed(1)} ms, p95 ${frames.p95.toFixed(1)} ms, max ${frames.max.toFixed(1)} ms (${frames.count} frames), ${(smooth * 100).toFixed(1)}% within ${frameToleranceMs} ms; the node travelled at least ${travelled} px on screen`
      ),
      check(
        "J9",
        "memoisation holds: a drag touches the dragged node (and the node that was selected before it) and its own edges only, a zoom touches nothing",
        touchedNodes <= 2 && touchedEdges <= 12 && zoomTouched.total === 0,
        `drag: ${touchedNodes} nodes and ${touchedEdges} edges mutated of ${nodes} and ${edges}; ten wheel steps: ${zoomTouched.total} mutations`
      ),
    ];

    return {
      checks,
      summaries: { frames, idle, moves, runs: scriptP95s, smooth },
    };
  });

// MAIN

const chromiumBrowser = (executablePath: string) =>
  Effect.acquireRelease(
    attempt("launch Chromium", () =>
      launch({
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
        executablePath,
        headless: true,
      })
    ),
    (browser: Browser) =>
      attempt("close Chromium", () => browser.close()).pipe(Effect.orDie)
  );

const report = (checks: readonly Check[]) =>
  Effect.forEach(
    checks,
    (entry) =>
      Effect.log(
        `${entry.ok ? "PASS" : "FAIL"} ${entry.id} ${entry.name}\n     ${entry.detail}`
      ),
    { discard: true }
  );

const main = Effect.gen(function* journey() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const home = yield* Config.String("HOME");

  const port = yield* Config.withDefault(
    Config.Number("FLOW_JOURNEY_PORT"),
    47_833
  );

  // Puppeteer needs a path, not a name: FLOW_CHROMIUM, else the `chromium` on PATH
  const chromium = yield* Option.match(
    yield* Config.option(Config.String("FLOW_CHROMIUM")),
    {
      onNone: () =>
        Effect.map(
          spawner.string(ChildProcess.make("which", ["chromium"])),
          Str.trim
        ),
      onSome: Effect.succeed,
    }
  );

  const directory = path.join(
    home,
    ".local",
    "state",
    "foldkit-flow-verify",
    "journey"
  );

  const app = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "apps",
    "example"
  );

  yield* fs.makeDirectory(directory, { recursive: true });

  if (!(yield* fs.exists(path.join(app, "dist", "index.html")))) {
    return yield* new JourneyError({
      message: "apps/example/dist is missing: run `bun run build` first",
    });
  }

  const loadBefore = yield* fs.readFileString("/proc/loadavg");

  yield* spawner.spawn(
    ChildProcess.make(
      "bunx",
      [
        "vp",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        `${port}`,
        "--strictPort",
      ],
      {
        cwd: app,
      }
    )
  );

  const browser = yield* chromiumBrowser(chromium);
  const page = yield* attempt("new page", () => browser.newPage());
  const session: Session = { directory, page };
  const errors: string[] = [];

  page.on("pageerror", (error) => {
    errors.push(String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  yield* attempt("viewport", () =>
    page.setViewport({ height: 800, width: 1280 })
  );

  // vp preview needs a moment to listen; waiting for the first node is the readiness probe
  const open = attempt("open the example", () =>
    page.goto(`http://127.0.0.1:${port}/`)
  ).pipe(
    Effect.retry({ schedule: Schedule.spaced("500 millis"), times: 40 }),
    Effect.andThen(
      attempt("wait for the nodes", () =>
        page.waitForSelector(node("start"), { timeout: 10_000 })
      )
    )
  );

  yield* open;

  const rolesChecks = yield* roles(session);

  const small = [
    yield* panZoom(session),
    yield* dragNode(session),
    yield* connect(session),
    yield* boxSelect(session),
    yield* controls(session),
  ];

  yield* open;

  const keys = [yield* moveByKeys(session), yield* clearAndDelete(session)];

  yield* open;

  const cdp = yield* attempt("CDP session", () => page.createCDPSession());

  yield* attempt("enable metrics", () => cdp.send("Performance.enable"));

  const perf = yield* performanceJourney(session, cdp);
  const loadAfter = yield* fs.readFileString("/proc/loadavg");
  const version = yield* attempt("version", () => browser.version());

  const checks = [
    ...rolesChecks,
    ...small,
    ...keys,
    ...perf.checks,
    check(
      "J0",
      "no page error or console error during the journey",
      errors.length === 0,
      errors.length === 0 ? "none" : Arr.join(errors, " | ")
    ),
  ];

  const when = yield* DateTime.now;

  const results = yield* Schema.encodeUnknownEffect(
    Schema.fromJsonString(Schema.Unknown)
  )({
    browser: version,
    checks,
    date: DateTime.formatIso(when),
    loadAfter: Str.trim(loadAfter),
    loadBefore: Str.trim(loadBefore),
    summaries: perf.summaries,
  });

  yield* fs.writeFileString(path.join(directory, "results.json"), results);

  yield* report(checks);
  yield* Effect.log(
    `browser ${version}; load before ${Str.trim(loadBefore)}; after ${Str.trim(loadAfter)}`
  );

  const failed = Arr.filter(checks, (entry) => !entry.ok);

  if (Arr.isReadonlyArrayNonEmpty(failed)) {
    return yield* new JourneyError({
      message: `${failed.length} checks failed: ${Arr.join(
        Arr.map(failed, (entry) => entry.id),
        ", "
      )}`,
    });
  }

  return yield* Effect.log("The journey held.");
});

NodeRuntime.runMain(
  main.pipe(Effect.scoped, Effect.provide(NodeServices.layer))
);
