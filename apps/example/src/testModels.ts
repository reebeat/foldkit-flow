import { init } from "./main.ts";
import type { Model } from "./main.ts";

/** The model the example starts from: the small graph, the attribution visible, an empty log. */
export const { model: start }: { model: Model } = init();
