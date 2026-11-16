import { isDesktop } from '../utils';

/** Koofr's WebDAV address for the user's main storage ("Koofr" in the web app). */
export const KOOFR_DAV = 'https://app.koofr.net/dav/Koofr';

export interface CloudAccount {
  server: string;
  email: string;
  /** A Koofr app password, not the account password. */
  password: string;
}

export interface DavItem {
  name: string;
  /** Path below the server address, starting with "/". */
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
  /** Changes whenever the file's content does. */
  version: string;
}

export class WebDavError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export const joinPath = (folder: string, name: string) => `${folder.replace(/\/+$/, '')}/${name}`;
export const parentPath = (path: string) => path.replace(/\/[^/]*\/?$/, '') || '/';
export const baseName = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? '';

// The desktop app goes through Tauri's HTTP client, which isn't bound by the browser's CORS rules.
async function fetchImpl(): Promise<typeof fetch> {
  if (!isDesktop) return window.fetch.bind(window);
  return (await import('@tauri-apps/plugin-http')).fetch;
}

function basicAuth({ email, password }: CloudAccount) {
  const bytes = new TextEncoder().encode(`${email}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

function urlFor(account: CloudAccount, path: string) {
  const encoded = path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return account.server.replace(/\/+$/, '') + (encoded.startsWith('/') ? encoded : `/${encoded}`);
}

async function request(account: CloudAccount, method: string, path: string, init: { body?: string; headers?: Record<string, string> } = {}) {
  if (!account.email || !account.password) throw new WebDavError('Enter your Koofr email and app password in Settings first.');
  const doFetch = await fetchImpl();
  let res: Response;
  try {
    res = await doFetch(urlFor(account, path), {
      method,
      body: init.body,
      headers: { Authorization: basicAuth(account), ...init.headers },
      cache: 'no-store',
    });
  } catch (e) {
    throw new WebDavError(`Could not reach ${new URL(account.server).host}. Check your internet connection. (${(e as Error).message || e})`);
  }
  if (res.status === 401 || res.status === 403)
    throw new WebDavError('Koofr refused the email or app password. Check them in Settings › Cloud.', res.status);
  return res;
}

const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop>' +
  '<d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop></d:propfind>';

function parseMultistatus(xml: string, account: CloudAccount): DavItem[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const basePath = decodeURIComponent(new URL(account.server).pathname).replace(/\/+$/, '');
  const text = (el: Element, tag: string) => el.getElementsByTagNameNS('DAV:', tag)[0]?.textContent?.trim() ?? '';
  return [...doc.getElementsByTagNameNS('DAV:', 'response')].map((r) => {
    const href = decodeURIComponent(new URL(text(r, 'href'), account.server).pathname);
    const path = href.startsWith(basePath) ? href.slice(basePath.length) || '/' : href;
    const isDir = r.getElementsByTagNameNS('DAV:', 'collection').length > 0;
    const size = Number(text(r, 'getcontentlength')) || 0;
    const modifiedText = text(r, 'getlastmodified');
    return {
      name: baseName(path),
      path: path.length > 1 ? path.replace(/\/+$/, '') : path,
      isDir,
      size,
      modified: modifiedText ? Date.parse(modifiedText) : 0,
      version: text(r, 'getetag') || `${modifiedText}|${size}`,
    };
  });
}

async function propfind(account: CloudAccount, path: string, depth: 0 | 1) {
  const res = await request(account, 'PROPFIND', path, {
    body: PROPFIND_BODY,
    headers: { Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8' },
  });
  if (res.status === 404) return null;
  if (res.status !== 207 && !res.ok) throw new WebDavError(`The cloud answered ${res.status} ${res.statusText}.`, res.status);
  return parseMultistatus(await res.text(), account);
}

/** The folders and files directly inside `folder`, folders first. */
export async function listFolder(account: CloudAccount, folder: string): Promise<DavItem[]> {
  const items = await propfind(account, folder, 1);
  if (!items) throw new WebDavError(`The folder ${folder} no longer exists.`, 404);
  const self = folder.replace(/\/+$/, '') || '/';
  return items
    .filter((i) => i.path !== self)
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** The file's details, or null when it doesn't exist. */
export async function stat(account: CloudAccount, path: string): Promise<DavItem | null> {
  const items = await propfind(account, path, 0);
  return items?.[0] ?? null;
}

export async function readText(account: CloudAccount, path: string): Promise<string> {
  const res = await request(account, 'GET', path);
  if (res.status === 404) throw new WebDavError(`${baseName(path)} is no longer in the cloud folder.`, 404);
  if (!res.ok) throw new WebDavError(`Could not download ${baseName(path)} (${res.status}).`, res.status);
  return res.text();
}

export async function writeText(account: CloudAccount, path: string, text: string): Promise<void> {
  const res = await request(account, 'PUT', path, { body: text, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  if (!res.ok) throw new WebDavError(`Could not upload ${baseName(path)} (${res.status} ${res.statusText}).`, res.status);
}

export async function makeFolder(account: CloudAccount, path: string): Promise<void> {
  const res = await request(account, 'MKCOL', path);
  if (res.status === 405) throw new WebDavError(`${baseName(path)} already exists.`, 405);
  if (!res.ok) throw new WebDavError(`Could not create the folder (${res.status}).`, res.status);
}

/** Lists the top folder to check the address and credentials. */
export async function testConnection(account: CloudAccount): Promise<number> {
  return (await listFolder(account, '/')).length;
}
