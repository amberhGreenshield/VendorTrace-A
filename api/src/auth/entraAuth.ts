import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

/**
 * Microsoft Entra ID access-token checks for the VendorTrace API.
 *
 * The web app signs users in through the "VendorTrace Web" app registration
 * and sends an access token for the "VendorTrace API" registration
 * (scope `access_as_user`) on every call. This middleware checks that token:
 *
 *   - signature  — signed by Microsoft (keys from the tenant's JWKS endpoint)
 *   - issuer     — https://login.microsoftonline.com/<tenant>/v2.0
 *   - audience   — the VendorTrace API client ID (or api://<client ID>)
 *   - tenant     — `tid` is GreenShield's tenant
 *   - scope      — `scp` includes access_as_user
 *   - expiry     — `exp` / `nbf` (checked by jose)
 *
 * Settings (App Service → Environment variables):
 *   ENTRA_TENANT_ID       GreenShield tenant ID
 *   ENTRA_API_CLIENT_ID   "VendorTrace API" app registration's client ID
 *   AUTH_REQUIRED         "true" = every call needs a valid token (go-live).
 *                         Anything else = calls without a token still work
 *                         (demo sign-in, before the registrations exist), but a
 *                         token that IS sent must still be valid.
 *
 * Once a caller has a valid token, routes take their identity from it and
 * ignore any name/email sent in the request.
 */

export interface AuthUser {
  /** Entra object ID — stable per person. */
  oid: string;
  /** Work email / UPN from `preferred_username`, lower-cased. */
  email: string;
  name: string;
  /** App roles (from the `roles` claim) — used once Saviynt manages access. */
  roles: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export const REQUIRED_SCOPE = "access_as_user";

export interface AuthConfig {
  tenantId?: string;
  apiClientId?: string;
  required: boolean;
}

export function authConfigFromEnv(env = process.env): AuthConfig {
  return {
    tenantId: env.ENTRA_TENANT_ID?.trim() || undefined,
    apiClientId: env.ENTRA_API_CLIENT_ID?.trim() || undefined,
    required: env.AUTH_REQUIRED?.trim().toLowerCase() === "true",
  };
}

export class AuthError extends Error {}

/** Verifies one access token against the config; throws AuthError when it isn't acceptable. */
export async function verifyAccessToken(token: string, cfg: AuthConfig, getKey: JWTVerifyGetKey): Promise<AuthUser> {
  if (!cfg.tenantId || !cfg.apiClientId) throw new AuthError("Sign-in isn't configured on the server");
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getKey, {
      issuer: `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`,
      audience: [cfg.apiClientId, `api://${cfg.apiClientId}`],
      algorithms: ["RS256"],
      clockTolerance: 60,
    }));
  } catch {
    throw new AuthError("Invalid or expired sign-in token");
  }
  if (payload.tid !== cfg.tenantId) throw new AuthError("Token is from another organization");
  const scopes = typeof payload.scp === "string" ? payload.scp.split(" ") : [];
  if (!scopes.includes(REQUIRED_SCOPE)) throw new AuthError("Token is missing the VendorTrace scope");
  const email = String(payload.preferred_username ?? payload.email ?? payload.upn ?? "").trim().toLowerCase();
  if (typeof payload.oid !== "string" || !email) throw new AuthError("Token is missing the user's identity");
  return {
    oid: payload.oid,
    email,
    name: String(payload.name ?? email).trim(),
    roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
  };
}

/**
 * Express middleware. `getKey` can be swapped in tests; in production it's
 * Microsoft's published signing keys for the tenant (cached by jose).
 */
export function entraAuth(cfg: AuthConfig = authConfigFromEnv(), getKey?: JWTVerifyGetKey) {
  const keys =
    getKey ??
    (cfg.tenantId
      ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${cfg.tenantId}/discovery/v2.0/keys`))
      : undefined);

  if (cfg.required && (!cfg.tenantId || !cfg.apiClientId)) {
    // Fail closed: "required" without the settings to check tokens would lock
    // everyone out silently, so say why loudly in the log.
    console.error("AUTH_REQUIRED is true but ENTRA_TENANT_ID / ENTRA_API_CLIENT_ID are not set — every API call will be refused.");
  } else if (!cfg.required) {
    console.warn("AUTH_REQUIRED is not \"true\": API calls without a sign-in token are still accepted. Turn it on for go-live.");
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      if (cfg.required) return res.status(401).json({ error: "Please sign in to VendorTrace." });
      return next();
    }
    try {
      if (!keys) throw new AuthError("Sign-in isn't configured on the server");
      req.auth = await verifyAccessToken(match[1], cfg, keys);
      next();
    } catch (err) {
      const message = err instanceof AuthError ? err.message : "Couldn't verify your sign-in";
      res.status(401).json({ error: `${message}. Please sign in again.` });
    }
  };
}

/** Allowed browser origins for CORS (comma-separated ALLOWED_ORIGINS, or the VendorTrace site + local dev). */
export function allowedOrigins(env = process.env): string[] {
  const configured = env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return configured?.length
    ? configured
    : ["https://red-tree-07300420f.7.azurestaticapps.net", "http://localhost:5173"];
}
