import { Router } from "express";

import {
  getAuthSession,
  handleGoogleCallback,
  logout,
  redirectToGoogleAuth,
} from "./auth.controller.ts";

export const authRouter = Router();

authRouter.get("/auth/google", redirectToGoogleAuth);
authRouter.get("/auth/google/callback", handleGoogleCallback);
authRouter.get("/auth/session", getAuthSession);
authRouter.post("/auth/logout", logout);
