import { createRoot } from 'react-dom/client';
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';

import App from './App';
import { msalConfig } from './lib/msalConfig';

import './index.css';

const msalInstance = new PublicClientApplication(msalConfig);

// If a redirect sign-in just completed, make sure that account becomes the
// "active" one MSAL hands back to useMsal() everywhere else in the app.
msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload && 'account' in event.payload) {
    msalInstance.setActiveAccount((event.payload as any).account);
  }
});

msalInstance.initialize().then(() => {
  // Finishes processing the redirect response (if the user was just sent
  // back here from Microsoft's login page) before the app renders.
  return msalInstance.handleRedirectPromise();
}).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  );
});
