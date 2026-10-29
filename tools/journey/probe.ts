// Functions that run INSIDE the page (Puppeteer serialises each one with `toString()` and evaluates it there). They are
// the journey's eyes: plain DOM reads that see what a person sees. Each is self-contained: it may not use an import, a
// module-level constant or another function of this file, because none of them exist in the page. They use loops
// rather than Effect's Array helpers for the same reason.

export interface Rect {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface Roles {
  readonly application: string;
  readonly attribution: boolean;
  readonly live: string;
  readonly nodeRole: string;
}

export interface Seen {
  readonly edges: number;
  readonly nodes: number;
  readonly other: number;
  readonly total: number;
}

interface Watch {
  readonly edges: Set<string>;
  readonly nodes: Set<string>;
  other: number;
  total: number;
}

declare global {
  interface Window {
    __flowFrames?: number[];
    __flowRun?: boolean;
    __flowSeen?: Watch;
    __flowWatch?: MutationObserver;
  }
}

const nodeSelector = ".foldkit-flow__node";

export const rectOf = (query: string): Rect | null => {
  const element = document.querySelector(query);

  if (element === null) {
    return null;
  }

  const box = element.getBoundingClientRect();

  return { height: box.height, width: box.width, x: box.x, y: box.y };
};

export const nodePosition = (query: string): Point | null => {
  const style = document.querySelector(query)?.getAttribute("style") ?? "";

  const match = /translate\((?<x>-?[\d.]+)px,\s*(?<y>-?[\d.]+)px\)/u.exec(
    style
  );

  return match?.groups === undefined
    ? null
    : { x: Number(match.groups.x), y: Number(match.groups.y) };
};

export const viewportOf = (): Viewport | null => {
  const style =
    document.querySelector(".foldkit-flow__viewport")?.getAttribute("style") ??
    "";

  const match =
    /translate\((?<x>-?[\d.e-]+)px,\s*(?<y>-?[\d.e-]+)px\)\s*scale\((?<zoom>-?[\d.e-]+)\)/u.exec(
      style
    );

  return match?.groups === undefined
    ? null
    : {
        x: Number(match.groups.x),
        y: Number(match.groups.y),
        zoom: Number(match.groups.zoom),
      };
};

export const countOf = (query: string): number =>
  document.querySelectorAll(query).length;

export const textOf = (query: string): string =>
  document.querySelector(query)?.textContent ?? "";

export const selectedIds = (): string[] => {
  const ids: string[] = [];

  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-selected='true']"
  )) {
    ids.push(element.dataset.id ?? "");
  }

  return ids;
};

export const rolesOf = (): Roles => ({
  application:
    document.querySelector(".foldkit-flow__pane")?.getAttribute("role") ?? "",
  attribution: document.querySelector("a[href='https://xyflow.com']") !== null,
  live:
    document.querySelector("[role='status']")?.getAttribute("aria-live") ?? "",
  nodeRole:
    document.querySelector(".foldkit-flow__node")?.getAttribute("role") ?? "",
});

export const firstEdgePath = (): string =>
  document
    .querySelector(".foldkit-flow__edge .foldkit-flow__edge-path")
    ?.getAttribute("d") ?? "";

export const hasEdgeLabelled = (label: string): boolean => {
  for (const element of document.querySelectorAll(".foldkit-flow__edge")) {
    if (element.getAttribute("aria-label") === label) {
      return true;
    }
  }

  return false;
};

/** The screen point halfway along the edge with the given label (a point that is on the edge's line). */
export const edgeMidpoint = (label: string): Point | null => {
  for (const edge of document.querySelectorAll(".foldkit-flow__edge")) {
    const path = edge.querySelector<SVGPathElement>(".foldkit-flow__edge-hit");
    const matrix = path?.getScreenCTM() ?? null;

    if (
      path !== null &&
      matrix !== null &&
      edge.getAttribute("aria-label") === label
    ) {
      const point = path.getPointAtLength(path.getTotalLength() / 2);

      return {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      };
    }
  }

  return null;
};

/** The centre of the last reconnect anchor (the target end) of the edge with the given label. */
export const targetAnchorOf = (label: string): Point | null => {
  for (const edge of document.querySelectorAll(".foldkit-flow__edge")) {
    if (edge.getAttribute("aria-label") === label) {
      const ends = edge.querySelectorAll(".foldkit-flow__reconnect");
      const box = ends.item(ends.length - 1)?.getBoundingClientRect() ?? null;

      return box === null
        ? null
        : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
  }

  return null;
};

export const clickButtonText = (text: string): boolean => {
  for (const button of document.querySelectorAll("button")) {
    if (button.textContent === text) {
      button.click();

      return true;
    }
  }

  return false;
};

/** A point on the pane's own background (no node, edge, control, minimap or attribution under it), or none. */
export const emptyPoint = (): Point | null => {
  const pane = document.querySelector(".foldkit-flow__pane");

  if (pane === null) {
    return null;
  }

  const bounds = pane.getBoundingClientRect();

  for (let y = bounds.top + 30; y < bounds.bottom - 30; y += 30) {
    for (let x = bounds.left + 30; x < bounds.right - 30; x += 30) {
      const hit = document.elementFromPoint(x, y);

      const covered =
        hit?.closest(
          ".foldkit-flow__node, .foldkit-flow__edge, .foldkit-flow__controls, .foldkit-flow__minimap, .foldkit-flow__attribution"
        ) ?? null;

      if (hit !== null && covered === null && pane.contains(hit)) {
        return { x, y };
      }
    }
  }

  return null;
};

export const everyNodeInsidePane = (): boolean => {
  const pane = document.querySelector(".foldkit-flow__pane");

  if (pane === null) {
    return false;
  }

  const bounds = pane.getBoundingClientRect();

  for (const element of document.querySelectorAll(nodeSelector)) {
    const box = element.getBoundingClientRect();

    if (
      box.left < bounds.left ||
      box.right > bounds.right ||
      box.top < bounds.top ||
      box.bottom > bounds.bottom
    ) {
      return false;
    }
  }

  return true;
};

export const focusedNodeId = (): string => {
  const active = document.activeElement;

  return active instanceof HTMLElement &&
    active.classList.contains("foldkit-flow__node")
    ? (active.dataset.id ?? "")
    : "";
};

/** The id of the node whose centre is nearest to the given point. */
export const nearestNodeId = (x: number, y: number): string => {
  let best = "";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const element of document.querySelectorAll<HTMLElement>(
    ".foldkit-flow__node"
  )) {
    const box = element.getBoundingClientRect();

    const distance = Math.hypot(
      box.x + box.width / 2 - x,
      box.y + box.height / 2 - y
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      best = element.dataset.id ?? "";
    }
  }

  return best;
};

/** Counts every DOM change below the viewport element, by node and by edge, except the viewport element's own. */
export const watchMutations = (): boolean => {
  const viewport = document.querySelector(".foldkit-flow__viewport");

  const seen: Watch = {
    edges: new Set<string>(),
    nodes: new Set<string>(),
    other: 0,
    total: 0,
  };

  window.__flowWatch?.disconnect();
  window.__flowSeen = seen;

  const note = (target: Node) => {
    const element = target instanceof Element ? target : target.parentElement;
    const owner = element?.closest<HTMLElement>(".foldkit-flow__node") ?? null;
    const edge = element?.closest(".foldkit-flow__edge") ?? null;

    seen.total += 1;

    if (owner !== null) {
      seen.nodes.add(owner.dataset.id ?? "");
    } else if (edge === null) {
      seen.other += 1;
    } else {
      seen.edges.add(edge.getAttribute("aria-label") ?? "");
    }
  };

  const watch = new MutationObserver((records) => {
    for (const record of records) {
      if (record.target !== viewport) {
        note(record.target);
      }
    }
  });

  window.__flowWatch = watch;

  if (viewport !== null) {
    watch.observe(viewport, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
  }

  return viewport !== null;
};

export const readMutations = (): Seen => {
  // the observer queues its records: deliver them before reading
  window.__flowWatch?.takeRecords();

  const seen = window.__flowSeen;

  return {
    edges: seen?.edges.size ?? 0,
    nodes: seen?.nodes.size ?? 0,
    other: seen?.other ?? 0,
    total: seen?.total ?? 0,
  };
};

/** Records the interval between animation frames until `stopFrames` is called. */
export const startFrames = (): boolean => {
  const frames: number[] = [];

  window.__flowFrames = frames;
  window.__flowRun = true;

  let last: number | undefined = undefined;

  const tick = (time: number) => {
    if (last !== undefined) {
      frames.push(time - last);
    }

    last = time;

    if (window.__flowRun === true) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);

  return true;
};

export const stopFrames = (): number[] => {
  window.__flowRun = false;

  return window.__flowFrames ?? [];
};

/** Resolves after two animation frames: the page has laid out and painted what the last input changed. */
export const settled = (): Promise<boolean> => {
  const { promise, resolve } = Promise.withResolvers<boolean>();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resolve(true);
    });
  });

  return promise;
};
