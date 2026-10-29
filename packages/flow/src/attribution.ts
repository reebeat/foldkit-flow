import type { HtmlBuilder } from "foldkit/html";
import { defineTaggedUnion } from "foldkit/schema";

// foldkit-flow stands on `@xyflow/system` (MIT). xyflow asks its users to keep the attribution or to support the
// project; React Flow offers the same choice through `proOptions.hideAttribution`. The link is visible by default and
// an application turns it off by passing `Attribution.Hidden()` (see NOTICE).

export const Attribution = defineTaggedUnion({
  Hidden: {},
  Visible: {},
});

export type Attribution = typeof Attribution.Type;

export const defaultAttribution: Attribution = Attribution.Visible();

export const attributionHref = "https://xyflow.com";

export const attributionLabel = "Built with xyflow";

export const attributionView = <Message>(
  attribution: Attribution,
  h: HtmlBuilder<Message>
) =>
  Attribution.match(attribution, {
    Hidden: () => h.empty,
    Visible: () =>
      h.a(
        [
          h.Href(attributionHref),
          h.Rel("noopener noreferrer"),
          h.Target("_blank"),
          h.AriaLabel(`${attributionLabel} (opens xyflow.com)`),
          h.Class("foldkit-flow-attribution"),
        ],
        [attributionLabel]
      ),
  });
