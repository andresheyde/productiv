import { Router } from "express";

import {
  handleGoogleCallback,
  redirectToGoogleAuth,
} from "./auth.controller.ts";

export const authRouter = Router();

authRouter.get("/auth/google", redirectToGoogleAuth);
authRouter.get("/auth/google/callback", handleGoogleCallback);
