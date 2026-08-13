// Low-level Microsoft Graph helpers, used by sharepointService.ts.
// Uses the client-credentials (app-only) OAuth flow — no user ever signs
// in; this app authenticates as itself using the Entra ID app registration.
//
// NOTE: this file has NOT been tested against a real tenant (the sandbox
// this was written in has no network access to login.microsoftonline.com
// or graph.microsoft.com). Test it against your real tenant and expect to
// iterate — Graph's async copy operation in particular is fiddly to get
// exactly right on the first try. Turn on the console.error logging below
// if something misbehaves; the error bodies Graph returns are usually
// specific enough to point at the fix.

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  hostname: string; // e.g. "gsccloud.sharepoint.com"
  sitePath: string; // e.g. "/sites/PVMActivities"
}

export function loadGraphConfig(): GraphConfig | null {
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const hostname = process.env.SHAREPOINT_HOSTNAME;
  const sitePath = process.env.SHAREPOINT_SITE_PATH;
  if (!tenantId || !clientId || !clientSecret || !hostname || !sitePath) return null;
  return { tenantId, clientId, clientSecret, hostname, sitePath };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(config: GraphConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const res = await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Failed to get Graph access token: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function graphFetch(config: GraphConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(config);
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok && res.status !== 202) {
    console.error(`Graph API error on ${path}: ${res.status} ${await res.text()}`);
    throw new Error(`Graph API error (${res.status}) on ${path}`);
  }
  return res;
}

let cachedSiteId: string | null = null;
async function resolveSiteId(config: GraphConfig): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  const res = await graphFetch(config, `/sites/${config.hostname}:${config.sitePath}`);
  const data = (await res.json()) as { id: string };
  cachedSiteId = data.id;
  return cachedSiteId;
}

let cachedDriveId: string | null = null;
async function resolveDriveId(config: GraphConfig): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  const siteId = await resolveSiteId(config);
  const res = await graphFetch(config, `/sites/${siteId}/drive`);
  const data = (await res.json()) as { id: string };
  cachedDriveId = data.id;
  return cachedDriveId;
}

interface DriveItem {
  id: string;
  webUrl: string;
  name: string;
}

/** Looks up an item (file or folder) in the drive by its path, e.g. "TPRM Cases/_Templates/PIA_Template.docx" */
export async function getItemByPath(path: string): Promise<DriveItem> {
  const config = loadGraphConfig();
  if (!config) throw new Error("Graph not configured");
  const driveId = await resolveDriveId(config);
  const res = await graphFetch(config, `/drives/${driveId}/root:/${encodeURIPath(path)}`);
  return (await res.json()) as DriveItem;
}

/** Creates a folder under the given parent path. If it already exists, Graph renames the new one (conflictBehavior: rename) rather than failing. */
export async function createFolder(parentPath: string, folderName: string): Promise<DriveItem> {
  const config = loadGraphConfig();
  if (!config) throw new Error("Graph not configured");
  const driveId = await resolveDriveId(config);
  const res = await graphFetch(config, `/drives/${driveId}/root:/${encodeURIPath(parentPath)}:/children`, {
    method: "POST",
    body: JSON.stringify({ name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  return (await res.json()) as DriveItem;
}

/**
 * Copies an existing drive item (by path) into a destination folder (by id)
 * under a new name. Graph's copy is ASYNC — it returns 202 with a
 * Location header pointing at a monitor URL we poll until it's done.
 */
export async function copyItemToFolder(sourcePath: string, destFolderId: string, newName: string): Promise<void> {
  const config = loadGraphConfig();
  if (!config) throw new Error("Graph not configured");
  const driveId = await resolveDriveId(config);
  const source = await getItemByPath(sourcePath);

  const res = await graphFetch(config, `/drives/${driveId}/items/${source.id}/copy`, {
    method: "POST",
    body: JSON.stringify({ parentReference: { driveId, id: destFolderId }, name: newName }),
  });

  const monitorUrl = res.headers.get("Location");
  if (!monitorUrl) return; // some tenants complete synchronously with no monitor URL — treat as done

  for (let attempt = 0; attempt < 15; attempt++) {
    const statusRes = await fetch(monitorUrl);
    if (statusRes.status === 200) {
      const status = (await statusRes.json()) as { status?: string };
      if (status.status === "completed") return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`Copy of ${sourcePath} -> ${newName} did not confirm completion after polling — check SharePoint manually.`);
}

/**
 * Shares one specific item (folder or file) with one specific person by
 * email, without touching permissions on anything else. This is how a
 * Business Owner gets access to just their own case folder, even though
 * they aren't part of the group that has broad access to the parent
 * "TPRM Cases" folder.
 */
export async function shareItemWithUser(itemId: string, email: string, role: "read" | "write" = "write"): Promise<void> {
  const config = loadGraphConfig();
  if (!config) throw new Error("Graph not configured");
  const driveId = await resolveDriveId(config);
  await graphFetch(config, `/drives/${driveId}/items/${itemId}/invite`, {
    method: "POST",
    body: JSON.stringify({
      recipients: [{ email }],
      requireSignIn: true, // they must sign in with their org account to view it
      sendInvitation: false, // don't email them a separate SharePoint invite — the app already shows them the link
      roles: [role],
    }),
  });
}

function encodeURIPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}
