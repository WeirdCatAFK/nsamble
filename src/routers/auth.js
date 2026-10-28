import { Router } from "express";
import {
  registerUser,
  loginUser,
  googleLogin,
  AuthError,
} from "../access/modules/common/auth.js";
import { authenticate } from "../middlewares/auth.js";

const router = Router();

router.post("/api/auth/register", async (request, response, next) => {
  try {
    const { email, name, password } = request.body;

    const result = await registerUser({ email, name, password });

    response.status(201).json({
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return response.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
});

router.post("/api/auth/login", async (request, response, next) => {
  try {
    const { email, password } = request.body;

    const result = await loginUser({ email, password });

    response.json({
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return response.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
});

router.post("/api/auth/google", async (request, response, next) => {
  try {
    const { credential } = request.body;
    const result = await googleLogin({ credential });
    response.json({ user: result.user, token: result.token });
  } catch (error) {
    if (error instanceof AuthError) {
      return response.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
});

router.get("/api/auth/me", authenticate, async (request, response) => {
  response.json(request.user);
});

export default router;
