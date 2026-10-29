import { attributionLabel } from "foldkit-flow";
import { click, expect, given, role, scene } from "foldkit/scene";
import { describe, test } from "vite-plus/test";

import { update, view } from "./main.ts";
import { hidden, visible } from "./testModels.ts";

const link = role("link", { name: `${attributionLabel} (opens xyflow.com)` });

describe("view", () => {
  test("renders the canvas region and the xyflow attribution by default", () => {
    scene(
      { update, view },
      given(visible),
      expect(role("heading", { name: "foldkit-flow" })).toExist(),
      expect(role("region", { name: "Canvas" })).toExist(),
      expect(link).toExist()
    );
  });

  test("clicking the toggle hides and shows the attribution", () => {
    scene(
      { update, view },
      given(visible),
      click(role("button", { name: "Hide attribution" })),
      expect(link).toBeAbsent(),
      click(role("button", { name: "Hide attribution" })),
      expect(link).toExist()
    );
  });

  test("a hidden attribution starts without the link", () => {
    scene({ update, view }, given(hidden), expect(link).toBeAbsent());
  });
});
