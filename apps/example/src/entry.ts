import { Runtime } from "foldkit";

import { exampleApplication } from "./application.ts";

Runtime.run(exampleApplication(document.querySelector("#root")));
