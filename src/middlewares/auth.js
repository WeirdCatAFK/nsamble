import { verifyToken, AuthError } from "../access/modules/common/auth.js";
import { findOrCreateDemoUser } from "../access/resources/db/users.js";
import { env } from "../env.js";

export async function authenticate(request, response, next) {
  try {
    const header = request.headers.authorization;

    if (header && header.startsWith("Bearer ")) {
      const token = header.slice(7);
      request.user = await verifyToken(token);
      return next();
    }

    if (env.nodeEnv === "development" && !header) {
      request.user = await findOrCreateDemoUser();
      return next();
    }

    return response.status(401).json({ error: "Authorization header is required." });
  } catch (error) {
    if (error instanceof AuthError) {
      return response.status(error.status).json({
        error: error.message,
        code: error.code,
      });
    }
    next(error);
  }
}
