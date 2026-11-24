import { EventType, PublicClientApplication } from "@azure/msal-browser";
import { msalConfig } from "./msalConfig";

/** The one MSAL instance for the app (shared by the React provider and the API client). */
export const msalInstance = new PublicClientApplication(msalConfig);

// If a redirect sign-in just completed, make that account the "active" one.
msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload && "account" in event.payload && event.payload.account) {
    msalInstance.setActiveAccount(event.payload.account);
  }
});
