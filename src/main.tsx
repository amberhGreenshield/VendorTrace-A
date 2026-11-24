import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';

import App from './App';
import { msalInstance } from './lib/msalInstance';

import './index.css';

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
