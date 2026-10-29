import { Button } from "@foldkit/ui";
import { Schema } from "effect";
import type { Runtime, Update } from "foldkit";
import { Attribution, attributionView } from "foldkit-flow";
import type { Document, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";
import { modifyFields } from "foldkit/struct";

// MODEL

export const Model = Schema.Struct({ attribution: Attribution });

export type Model = typeof Model.Type;

// MESSAGE

export const Message = defineMessageUnion({ ClickedToggleAttribution: {} });

export type Message = typeof Message.Type;

// INIT

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: { attribution: Attribution.Visible() },
});

// UPDATE

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedToggleAttribution: () => ({
      model: modifyFields(model, {
        attribution: (attribution) =>
          Attribution.match(attribution, {
            Hidden: () => Attribution.Visible(),
            Visible: () => Attribution.Hidden(),
          }),
      }),
    }),
  });

// VIEW

const buttonStyle =
  "bg-black text-white hover:bg-gray-700 px-3 py-1 transition";

const attributionToggle = (attribution: Attribution, h: HtmlBuilder<Message>) =>
  Button.view(
    {
      onClick: Message.ClickedToggleAttribution(),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.Class(buttonStyle),
            h.AriaPressed(
              Attribution.match(attribution, {
                Hidden: () => "true",
                Visible: () => "false",
              })
            ),
          ],
          ["Hide attribution"]
        ),
    },
    h
  );

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  body: h.div(
    [h.Class("min-h-screen flex flex-col gap-4 bg-white p-4")],
    [
      h.header(
        [h.Class("flex items-center justify-between")],
        [
          h.div(
            [],
            [
              h.h1([h.Class("text-2xl font-bold")], ["foldkit-flow"]),
              h.p(
                [h.Class("text-gray-600")],
                ["Scaffold: the canvas arrives with spec 0001."]
              ),
            ]
          ),
          attributionToggle(model.attribution, h),
        ]
      ),
      h.main(
        [h.Class("flex flex-1 flex-col gap-4")],
        [
          h.section(
            [
              h.AriaLabel("Canvas"),
              h.Class(
                "flex-1 rounded border border-gray-300 p-4 text-gray-700"
              ),
            ],
            [
              h.h2([h.Class("font-semibold")], ["Canvas"]),
              h.p([], ["Nodes and edges will appear here."]),
            ]
          ),
          attributionView(model.attribution, h),
        ]
      ),
    ]
  ),
  title: "foldkit-flow",
});
