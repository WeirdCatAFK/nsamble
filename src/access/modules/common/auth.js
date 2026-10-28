import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { env } from "../../../env.js";
import {
  findUserByEmail,
  findUserByGoogleId,
  linkGoogleId,
  createUser,
  findUserById,
} from "../../resources/db/users.js";

const googleClient = new OAuth2Client();

const errLevel = "Error at module level in access:";
const SALT_ROUNDS = 12;

export class AuthError extends Error {
  constructor(message, code, status = 401) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

export async function registerUser({ email, name, password }) {
  try {
    if (!email || typeof email !== "string") {
      throw new AuthError("Email is required.", "EEMAIL", 400);
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      throw new AuthError(
        "Password must be at least 8 characters.",
        "EPASSWORD",
        400,
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      throw new AuthError("Email is already registered.", "EDUPLICATE", 409);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await createUser({ email, name, passwordHash });

    return { user, token: signToken(user) };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export async function loginUser({ email, password }) {
  try {
    if (!email || !password) {
      throw new AuthError("Email and password are required.", "ECREDENTIALS", 400);
    }

    const user = await findUserByEmail(email);
    if (!user || !user.passwordHash) {
      throw new AuthError("Invalid email or password.", "ECREDENTIALS");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AuthError("Invalid email or password.", "ECREDENTIALS");
    }

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, token: signToken(safeUser) };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export async function verifyToken(token) {
  try {
    const secret = env.auth.jwtSecret;
    if (!secret) {
      throw new AuthError("JWT secret is not configured.", "ECONFIG", 500);
    }

    const payload = jwt.verify(token, secret);
    const user = await findUserById(payload.sub);

    if (!user) {
      throw new AuthError("User no longer exists.", "EUSER");
    }

    return user;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error.name === "JsonWebTokenError") {
      throw new AuthError("Invalid token.", "ETOKEN");
    }
    if (error.name === "TokenExpiredError") {
      throw new AuthError("Token has expired.", "EEXPIRED");
    }
    throw new Error(errLevel + " " + error.message, { cause: error });
  }
}

export async function googleLogin({ credential }) {
  try {
    const clientId = env.auth.googleClientId;
    if (!clientId) {
      throw new AuthError("Google OAuth is not configured.", "ECONFIG", 500);
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const { sub: googleId, email, name, email_verified } = ticket.getPayload();

    let user = await findUserByGoogleId(googleId);
    if (user) return { user, token: signToken(user) };

    if (email_verified && email) {
      user = await findUserByEmail(email);
      if (user) {
        const { passwordHash: _, ...linked } = await linkGoogleId({ userId: user.id, googleId });
        return { user: linked, token: signToken(linked) };
      }
    }

    user = await createUser({ email: email_verified ? email : undefined, name, googleId });
    return { user, token: signToken(user) };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError("Google authentication failed.", "EGOOGLE", 401);
  }
}

function signToken(user) {
  const secret = env.auth.jwtSecret;
  if (!secret) {
    throw new AuthError("JWT secret is not configured.", "ECONFIG", 500);
  }

  return jwt.sign(
    { sub: user.id, email: user.email },
    secret,
    { expiresIn: env.auth.tokenExpiresIn },
  );
}
