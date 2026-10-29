import { Schema } from "effect";

import { Attribution, defaultAttribution } from "./attribution.ts";
import { identityViewport } from "./geometry.ts";
import { FlowEdge, FlowNode, Interaction, Size, Viewport } from "./types.ts";

// MODEL

/**
 * The Flow Submodel's Model: the graph (nodes, edges), the viewport, the pane size, what the pointer is doing and the
 * text the live region announces. The application owns it as a field of its own Model and may change `nodes` and
 * `edges` directly (add a node, add the edge a `Connected` out-message describes).
 */
export const Model = Schema.Struct({
  announcement: Schema.String,
  attribution: Attribution,
  edges: Schema.Array(FlowEdge),
  hasControls: Schema.Boolean,
  hasFitted: Schema.Boolean,
  hasMinimap: Schema.Boolean,
  id: Schema.NonEmptyString,
  interaction: Interaction,
  isFitOnInit: Schema.Boolean,
  maxZoom: Schema.Finite,
  minZoom: Schema.Finite,
  nodes: Schema.Array(FlowNode),
  size: Size,
  viewport: Viewport,
});

export type Model = typeof Model.Type;

export interface InitConfig {
  readonly attribution?: Attribution;
  readonly edges: readonly FlowEdge[];
  readonly hasControls?: boolean;
  readonly hasMinimap?: boolean;
  /** Unique among the flows of one page; it names the DOM ids the controllers look handles up by. */
  readonly id: string;
  readonly isFitOnInit?: boolean;
  readonly maxZoom?: number;
  readonly minZoom?: number;
  readonly nodes: readonly FlowNode[];
}

export const init = (config: InitConfig): Model => ({
  announcement: "",
  attribution: config.attribution ?? defaultAttribution,
  edges: config.edges,
  hasControls: config.hasControls ?? true,
  hasFitted: false,
  hasMinimap: config.hasMinimap ?? true,
  id: config.id,
  interaction: Interaction.Idle(),
  isFitOnInit: config.isFitOnInit ?? true,
  maxZoom: config.maxZoom ?? 4,
  minZoom: config.minZoom ?? 0.1,
  nodes: config.nodes,
  size: { height: 0, width: 0 },
  viewport: identityViewport,
});
