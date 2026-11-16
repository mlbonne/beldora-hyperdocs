import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useStore, type ProjectExport } from '../store';
import { baseName, readText, stat, writeText, type DavItem } from './webdav';

export type CloudState = 'busy' | 'synced' | 'changed' | 'conflict' | 'error';

export interface CloudStatus {
  state: CloudState;
  message?: string;
  /** What is being done while busy ("Saving…", "Loading…"). */
  doing?: string;
}

/** Live sync status per project; not persisted. */
export const useCloudStatus = create<Record<string, CloudStatus>>(() => ({}));
const setStatus = (pid: string, status: CloudStatus) => useCloudStatus.setState({ [pid]: status });

// cyrb53: a fast 53-bit string hash, enough to tell whether a project changed.
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const projectText = (pid: string) => JSON.stringify(useStore.getState().exportProject(pid));
const account = () => useStore.getState().cloudAccount;
export const cloudFileName = (projectName: string) => `${projectName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Project'}.hyperdocs.json`;

/** True when the project changed on this computer since it was last saved to or loaded from the cloud. */
export function hasLocalChanges(pid: string): boolean {
  const link = useStore.getState().cloudLinks[pid];
  return !!link && useStore.getState().projects[pid] !== undefined && hash(projectText(pid)) !== link.hash;
}

function parseProject(text: string, name: string): ProjectExport {
  let data: ProjectExport;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${name} is not a HyperDocs project file.`);
  }
  if (data?.app !== 'beldora-hyperdocs' || !data.project) throw new Error(`${name} is not a HyperDocs project file.`);
  return data;
}

// One cloud operation per project at a time.
const running = new Map<string, Promise<unknown>>();
async function exclusive<T>(pid: string, doing: string, job: () => Promise<T>): Promise<T> {
  while (running.has(pid)) await running.get(pid)!.catch(() => {});
  setStatus(pid, { state: 'busy', doing });
  const p = job();
  running.set(pid, p);
  try {
    return await p;
  } catch (e) {
    setStatus(pid, { state: 'error', message: (e as Error).message });
    throw e;
  } finally {
    running.delete(pid);
  }
}

async function upload(pid: string, path: string) {
  const text = projectText(pid);
  await writeText(account(), path, text);
  const item = await stat(account(), path);
  useStore.getState().setCloudLink(pid, { path, version: item?.version ?? '', hash: hash(text), syncedAt: Date.now() });
  setStatus(pid, { state: 'synced' });
}

async function download(path: string, { known, open = false }: { known?: DavItem | null; open?: boolean } = {}): Promise<string> {
  const item = known ?? (await stat(account(), path));
  const data = parseProject(await readText(account(), path), baseName(path));
  const s = useStore.getState();
  const active = s.activeProjectId;
  s.importProject(data);
  const pid = data.project.id;
  // Background updates must not switch the project being worked on.
  if (!open && active && active !== pid && s.projects[active]) s.setActiveProject(active);
  s.setCloudLink(pid, { path, version: item?.version ?? '', hash: hash(projectText(pid)), syncedAt: Date.now() });
  setStatus(pid, { state: 'synced' });
  return pid;
}

/** Saves the project to `path` and keeps it linked there. */
export function saveProjectAs(pid: string, path: string) {
  return exclusive(pid, 'Saving…', () => upload(pid, path));
}

/**
 * Saves the project to its linked file. Unless `force` is set, refuses (and reports a conflict)
 * when the cloud copy changed since this computer last saw it.
 */
export function saveProject(pid: string, { force = false } = {}) {
  return exclusive(pid, 'Saving…', async () => {
    const link = useStore.getState().cloudLinks[pid];
    if (!link) throw new Error('This project is not saved to the cloud yet.');
    const remote = await stat(account(), link.path);
    if (remote && remote.version !== link.version && !force) return conflict(pid);
    await upload(pid, link.path);
  });
}

/**
 * Opens a project file from the cloud, replacing the local copy of the same project once
 * `replace` agrees. Returns its id, or null when cancelled.
 */
export async function openProjectFile(path: string, replace: (projectName: string) => boolean): Promise<string | null> {
  const data = parseProject(await readText(account(), path), baseName(path));
  const local = useStore.getState().projects[data.project.id];
  if (local && !replace(local.name)) return null;
  return exclusive(data.project.id, 'Loading…', () => download(path, { open: true }));
}

/** Replaces the local project with its cloud copy. */
export function loadCloudVersion(pid: string) {
  return exclusive(pid, 'Loading…', async () => {
    const link = useStore.getState().cloudLinks[pid];
    if (!link) throw new Error('This project is not saved to the cloud yet.');
    await download(link.path);
  });
}

function conflict(pid: string) {
  setStatus(pid, {
    state: 'conflict',
    message: 'The project changed both here and in the cloud (on another computer?). Choose which version to keep.',
  });
}

/**
 * Brings a linked project up to date in whichever direction is needed: uploads local changes,
 * downloads cloud changes, and stops at a conflict when both sides changed.
 */
export async function syncProject(pid: string) {
  if (!useStore.getState().cloudLinks[pid]) return;
  return exclusive(pid, 'Checking…', async () => {
    const link = useStore.getState().cloudLinks[pid];
    if (!link) return setStatus(pid, { state: 'synced' });
    const remote = await stat(account(), link.path);
    const local = hash(projectText(pid)) !== link.hash;
    if (!remote) {
      if (local) return upload(pid, link.path);
      return setStatus(pid, { state: 'error', message: `${baseName(link.path)} was moved or deleted in the cloud. Save again to pick a place.` });
    }
    const changed = remote.version !== link.version;
    if (local && changed) return conflict(pid);
    if (local) return upload(pid, link.path);
    if (changed) return void (await download(link.path, { known: remote }));
    setStatus(pid, { state: 'synced' });
  });
}

/** Uploads every linked project with unsaved changes (used before the window closes). */
export async function saveChangedProjects() {
  const s = useStore.getState();
  const changed = Object.keys(s.cloudLinks).filter(
    (pid) => s.projects[pid] && useCloudStatus.getState()[pid]?.state !== 'conflict' && hasLocalChanges(pid),
  );
  await Promise.allSettled(changed.map((pid) => saveProject(pid)));
}

const canSync = () => {
  const { email, password } = useStore.getState().cloudAccount;
  return !!email && !!password && navigator.onLine !== false;
};

/** Checks the open project when it opens, then keeps every linked project in sync on the autosave interval. */
export function useCloudAutosave(enabled: boolean) {
  const pid = useStore((s) => s.activeProjectId);
  const minutes = useStore((s) => s.autosaveMinutes);
  const linked = useStore((s) => (pid ? !!s.cloudLinks[pid] : false));

  useEffect(() => {
    if (!enabled || !pid || !linked || !canSync()) return;
    syncProject(pid).catch(() => {});
  }, [enabled, pid, linked]);

  useEffect(() => {
    if (!enabled || !minutes) return;
    const timer = window.setInterval(() => {
      if (!canSync()) return;
      const s = useStore.getState();
      for (const id of Object.keys(s.cloudLinks)) {
        if (!s.projects[id] || useCloudStatus.getState()[id]?.state === 'conflict') continue;
        syncProject(id).catch(() => {});
      }
    }, minutes * 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, minutes]);
}

/** The state to show for a project: its last cloud result, or "changed" once it is edited after a sync. */
export function useCloudIndicator(pid: string | null): CloudStatus | null {
  const link = useStore((s) => (pid ? s.cloudLinks[pid] : undefined));
  const status = useCloudStatus((s) => (pid ? s[pid] : undefined));
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!pid || !link) return;
    let timer: number | undefined;
    const check = () => setChanged(hasLocalChanges(pid));
    check();
    // Hashing the whole project on every keystroke would be wasteful; check once typing pauses.
    const unsub = useStore.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 1500);
    });
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [pid, link]);

  if (!pid || !link) return null;
  if (status && status.state !== 'synced') return status;
  return { state: changed ? 'changed' : 'synced' };
}
