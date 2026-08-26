import { Configuration, LogLevel } from "@azure/msal-browser";

// ─── Fill these in once you register a SEPARATE app for sign-in ───────────
// This should be a different Entra ID app registration than the one used
// for Graph/SharePoint calls in api/ — that one is a confidential client
// (has a secret, used server-to-server). This one is a PUBLIC client (no
// secret — it runs in the browser where a secret can't be kept safe) used
// for interactive/silent user sign-in.
//
// When registering it in the Portal:
//   - Platform: "Single-page application (SPA)"
//   - Redirect URI: your Static Web App's URL (e.g. https://your-app.azurestaticapps.net)
//     — for local dev, also add http://localhost:5173
//   - API permissions: Microsoft Graph → Delegated → User.Read (this is
//     enough to read the signed-in person's name/email; no admin consent
//     needed for this one, delegated User.Read is pre-consented by default)

export const MSAL_CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID;
export const MSAL_TENANT_ID =
  import.meta.env.VITE_MSAL_TENANT_ID ?? "92c35dd7-ce82-4780-95b1-7a86113d755c";
  
if (!MSAL_CLIENT_ID) {
  throw new Error("VITE_MSAL_CLIENT_ID is not configured");
}

export const msalConfig: Configuration = {
  auth: {
    clientId: MSAL_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    // localStorage (not the default sessionStorage) so a sign-in survives
    // closing the tab — closer to "stay signed in" behavior people expect.
    cacheLocation: "localStorage",
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
  scopes: ["User.Read"],
};
