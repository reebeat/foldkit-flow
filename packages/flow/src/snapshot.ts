import { Option, Predicate, Schema } from "effect";
import * as CustomElement from "foldkit/customElement";

import type {
  Connection,
  FlowEdge,
  FlowNode,
  Size,
  Viewport,
} from "./types.ts";
import type { Controllers } from "./xyflow.ts";
import { xyflowControllers } from "./xyflow.ts";

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

/** What a controller may read: the flow's data, the static validation rule and the controller factories to call. */
export class FlowSnapshot {
  readonly controllers: Controllers;
  readonly flow: SnapshotFlow;
  readonly isValidConnection: (connection: Connection) => boolean;

  constructor(
    flow: SnapshotFlow,
    isValidConnection: (connection: Connection) => boolean,
    controllers: Controllers
  ) {
    this.controllers = controllers;
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

/** An empty block that fills the pane: xyflow's connection controller types its container as a `div`. */
export const boundsClass = "foldkit-flow__bounds";

/** The root element of a flow; the view gives it this class. */
export const rootClass = "foldkit-flow";

/** The pane that holds `element`, or that sits beside it in the same flow (the minimap and the controls are siblings). */
export const paneOf = (element: Element): Element =>
  element.closest(`.${paneClass}`) ??
  element.closest(`.${rootClass}`)?.querySelector(`.${paneClass}`) ??
  element;

/** The `div` with the pane's bounds, which XYHandle measures the pointer against. */
export const boundsOf = (element: Element): Option.Option<HTMLDivElement> => {
  const bounds = paneOf(element).querySelector(`.${boundsClass}`);

  return bounds instanceof HTMLDivElement ? Option.some(bounds) : Option.none();
};

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

/** The controller factories of the flow that holds `element`; the real xyflow ones before the first render. */
export const controllersOf = (element: Element): Controllers =>
  Option.match(readSnapshot(element), {
    onNone: () => xyflowControllers,
    onSome: (snapshot) => snapshot.controllers,
  });
