/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MSAL_CLIENT_ID?: string;
  readonly VITE_MSAL_TENANT_ID?: string;
  readonly VITE_MSAL_API_SCOPE?: string;
  readonly VITE_API_BASE_URL?: string;
  /** "true" only for local/demo builds — shows the no-SSO demo sign-in. Never set in production. */
  readonly VITE_ENABLE_DEMO_LOGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
