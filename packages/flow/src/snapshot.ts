import { Option, Predicate, Schema } from "effect";
import * as CustomElement from "foldkit/customElement";

import type {
  Connection,
  FlowEdge,
  FlowNode,
  Size,
  Viewport,
} from "./types.ts";

// A Mount captures its arguments once, when its element is inserted, so a controller cannot learn that the Model
// changed through them. The pure view therefore publishes what the controllers read as a property of the pane element,
// which the runtime re-applies on every render (Foldkit's `CustomElement` binds typed properties declaratively). A
// controller reads it when an event arrives. It is a view of the Model, never a second copy: nothing writes to it.

export interface SnapshotFlow {
  readonly edges: readonly FlowEdge[];
  readonly id: string;
  readonly maxZoom: number;
  readonly minZoom: number;
  readonly nodes: readonly FlowNode[];
  readonly size: Size;
  readonly viewport: Viewport;
}

/** What a controller may read: the flow's data and the static validation rule. */
export class FlowSnapshot {
  readonly flow: SnapshotFlow;
  readonly isValidConnection: (connection: Connection) => boolean;

  constructor(
    flow: SnapshotFlow,
    isValidConnection: (connection: Connection) => boolean
  ) {
    this.flow = flow;
    this.isValidConnection = isValidConnection;
  }
}

/** The pane: a block element that carries the snapshot as its `snapshot` property. */
export const paneElement = CustomElement.define({
  events: {},
  properties: { snapshot: Schema.instanceOf(FlowSnapshot) },
  tag: "foldkit-flow-pane",
});

/** Class names of the elements the controllers look for; `foldkit` is the library prefix xyflow's handle lookup uses. */
export const paneClass = "foldkit-flow__pane";

export const viewportClass = "foldkit-flow__viewport";

export const nodeClass = "foldkit-flow__node";

export const handleClass = "foldkit-flow__handle";

export const paneOf = (element: Element): Element =>
  element.closest(`.${paneClass}`) ?? element;

/** The snapshot the view last rendered onto the pane that holds `element`, or none before the first render. */
export const readSnapshot = (element: Element): Option.Option<FlowSnapshot> => {
  const pane = paneOf(element);

  if (!Predicate.hasProperty(pane, "snapshot")) {
    return Option.none();
  }

  const { snapshot } = pane;

  return snapshot instanceof FlowSnapshot
    ? Option.some(snapshot)
    : Option.none();
};
