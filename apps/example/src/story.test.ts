import { Attribution } from "foldkit-flow";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vite-plus/test";

import { Message, update } from "./main.ts";
import { hidden, visible } from "./testModels.ts";

describe("update", () => {
  test("ClickedToggleAttribution hides a visible attribution and runs no Command", () => {
    story(
      update,
      given(visible),
      message(Message.ClickedToggleAttribution()),
      Command.expectNone(),
      model((next) => {
        expect(next.attribution).toStrictEqual(Attribution.Hidden());
      })
    );
  });

  test("ClickedToggleAttribution shows a hidden attribution", () => {
    story(
      update,
      given(hidden),
      message(Message.ClickedToggleAttribution()),
      model((next) => {
        expect(next.attribution).toStrictEqual(Attribution.Visible());
      })
    );
  });

  test("two toggles return to the starting state", () => {
    story(
      update,
      given(visible),
      message(Message.ClickedToggleAttribution()),
      message(Message.ClickedToggleAttribution()),
      model((next) => {
        expect(next).toStrictEqual(visible);
      })
    );
  });
});
