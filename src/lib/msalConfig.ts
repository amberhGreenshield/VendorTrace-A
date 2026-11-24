import { Configuration, LogLevel } from "@azure/msal-browser";

// ─── Microsoft sign-in (Entra ID) ───────────────────────────────────────────
// Two app registrations (approved by Security Architecture):
//   - "VendorTrace Web"  — this SPA signs users in with it (public client,
//     authorization code + PKCE, no secret). Its client ID is the GitHub
//     variable VITE_MSAL_CLIENT_ID.
//   - "VendorTrace API"  — exposes the delegated scope `access_as_user`. The
//     SPA asks for a token for that scope and sends it on every API call;
//     the API checks it (api/src/auth/entraAuth.ts). The full scope string
//     is the GitHub variable VITE_MSAL_API_SCOPE, e.g.
//     api://<VendorTrace API client ID>/access_as_user
// Redirect URIs registered on VendorTrace Web (SPA platform), trailing slash
// included: https://red-tree-07300420f.7.azurestaticapps.net/ and
// http://localhost:5173/

export const MSAL_CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID;
/** Scope for the VendorTrace API. Unset = no token is sent (before the registrations exist / demo). */
export const API_SCOPE: string | undefined = import.meta.env.VITE_MSAL_API_SCOPE?.trim() || undefined;
export const MSAL_TENANT_ID =
  import.meta.env.VITE_MSAL_TENANT_ID ?? "92c35dd7-ce82-4780-95b1-7a86113d755c";
  
if (!MSAL_CLIENT_ID) {
  throw new Error("VITE_MSAL_CLIENT_ID is not configured");
}

export const msalConfig: Configuration = {
  auth: {
    clientId: MSAL_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
    // Must match the registered redirect URIs exactly, including the "/".
    redirectUri: window.location.origin + "/",
    postLogoutRedirectUri: window.location.origin + "/",
  },
  cache: {
    // Tokens live only for this browser session, so they don't stay on a
    // shared computer. People already signed in to Microsoft 365 still get
    // straight back in through silent single sign-on.
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error(message);
      },
    },
  },
};

export const loginRequest = {
  // Asking for the API scope at sign-in too means one consent/sign-in covers both.
  scopes: ["openid", "profile", "email", ...(API_SCOPE ? [API_SCOPE] : [])],
};

/** Token request for calls to the VendorTrace API. */
export const apiTokenRequest = API_SCOPE ? { scopes: [API_SCOPE] } : null;
