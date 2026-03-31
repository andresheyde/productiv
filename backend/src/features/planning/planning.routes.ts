import { Router } from "express";

import { postPlanningTurn } from "./planning.controller.ts";

export const planningRouter = Router();

planningRouter.post("/planning/turn", postPlanningTurn);
