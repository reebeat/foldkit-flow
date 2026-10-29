import type { Update } from "foldkit";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { expect, given, role, scene } from "foldkit/scene";
import { describe, expect as vitestExpect, test } from "vite-plus/test";

import {
  Attribution,
  attributionHref,
  attributionLabel,
  attributionView,
  defaultAttribution,
} from "./attribution.ts";

// A host application whose whole Model is the attribution option.
const Message = defineMessageUnion({ Noop: {} });

type Message = typeof Message.Type;

const update = (
  model: Attribution,
  _message: Message
): Update.Return<Attribution, Message> => ({
  model,
});

const view = (model: Attribution, h: HtmlBuilder<Message>): Document => ({
  body: h.div([], [attributionView(model, h)]),
  title: "host",
});

const linkName = `${attributionLabel} (opens xyflow.com)`;

describe("attribution", () => {
  test("is visible by default", () => {
    vitestExpect(defaultAttribution).toStrictEqual(Attribution.Visible());
  });

  test("a visible attribution renders a link to xyflow", () => {
    scene(
      { update, view },
      given(defaultAttribution),
      expect(role("link", { name: linkName })).toExist(),
      expect(role("link", { name: linkName })).toHaveAttr(
        "href",
        attributionHref
      )
    );
  });

  test("a hidden attribution renders nothing", () => {
    scene(
      { update, view },
      given(Attribution.Hidden()),
      expect(role("link", { name: linkName })).toBeAbsent()
    );
  });
});
