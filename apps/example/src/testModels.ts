import { Attribution } from "foldkit-flow";

import type { Model } from "./main.ts";

export const visible: Model = { attribution: Attribution.Visible() };

export const hidden: Model = { attribution: Attribution.Hidden() };
