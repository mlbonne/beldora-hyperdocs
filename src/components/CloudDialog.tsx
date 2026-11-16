import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudDownload,
  CloudUpload,
  Eye,
  EyeOff,
  FileJson,
  Folder,
  FolderPlus,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Unlink,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { recall, remember } from '../viewMemory';
import {
  baseName,
  joinPath,
  KOOFR_DAV,
  listFolder,
  makeFolder,
  parentPath,
  testConnection,
  type DavItem,
} from '../cloud/webdav';
import {
  cloudFileName,
  hasLocalChanges,
  loadCloudVersion,
  openProjectFile,
  saveProject,
  saveProjectAs,
  useCloudStatus,
} from '../cloud/sync';

const APP_PASSWORDS_URL = 'https://app.koofr.net/app/admin/preferences/password';

export function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString();
}

async function openExternal(url: string) {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/** Email + app password for Koofr's WebDAV access, with a connection test. */
export function CloudAccountForm({ onConnected }: { onConnected?: () => void }) {
  const account = useStore((s) => s.cloudAccount);
  const setAccount = useStore((s) => s.setCloudAccount);
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const run = async () => {
    setTesting(true);
    setTest(null);
    try {
      await testConnection(account);
      setTest({ ok: true, text: 'Connected to Koofr.' });
      onConnected?.();
    } catch (e) {
      setTest({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="cloud-account">
      <p className="hint settings-lead">
        HyperDocs saves to Koofr over WebDAV. Use your Koofr email and an <strong>app password</strong>: in Koofr, open{' '}
        <button className="inline-link" onClick={() => openExternal(APP_PASSWORDS_URL)}>
          Preferences › Password › App passwords
        </button>
        , type a name such as “HyperDocs” and click Generate. The password is stored only on this computer.
      </p>
      <label className="settings-field">
        <span>Koofr email</span>
        <div className="settings-input-row">
          <input
            type="email"
            value={account.email}
            placeholder="you@example.com"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setAccount({ email: e.target.value.trim() })}
          />
        </div>
      </label>
      <label className="settings-field">
        <span>App password</span>
        <div className="settings-input-row">
          <input
            type={show ? 'text' : 'password'}
            value={account.password}
            placeholder="Paste the generated app password"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setAccount({ password: e.target.value.trim() })}
          />
          <button className="icon-btn" onClick={() => setShow(!show)} title={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      <details className="cloud-advanced">
        <summary>WebDAV address</summary>
        <div className="settings-input-row">
          <input
            value={account.server}
            spellCheck={false}
            onChange={(e) => setAccount({ server: e.target.value.trim() })}
            onBlur={(e) => !e.target.value.trim() && setAccount({ server: KOOFR_DAV })}
          />
        </div>
        <small className="hint">Koofr’s is {KOOFR_DAV}. Any WebDAV server works too.</small>
      </details>
      <div className="cloud-test">
        <button className="btn ghost sm" disabled={!account.email || !account.password || testing} onClick={run}>
          {testing ? <LoaderCircle size={14} className="spin" /> : <Cloud size={14} />} Test connection
        </button>
        {test && <small className={test.ok ? 'cloud-ok' : 'settings-error'}>{test.text}</small>}
      </div>
    </div>
  );
}

/** Autosave interval, in Settings. */
export function AutosavePicker() {
  const minutes = useStore((s) => s.autosaveMinutes);
  const setMinutes = useStore((s) => s.setAutosaveMinutes);
  return (
    <label className="switch-row">
      <span>
        <strong>Sync automatically</strong>
        <small>Saves changes to the cloud and picks up changes made on other computers.</small>
      </span>
      <select className="cloud-select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
        <option value={0}>Off</option>
        <option value={1}>Every minute</option>
        <option value={5}>Every 5 minutes</option>
        <option value={15}>Every 15 minutes</option>
        <option value={30}>Every 30 minutes</option>
      </select>
    </label>
  );
}

/** Save the open project to a Koofr folder, open projects from there, and keep them in sync. */
export function CloudDialog({ onClose }: { onClose: () => void }) {
  const pid = useStore((s) => s.activeProjectId)!;
  const project = useStore((s) => s.projects[pid]);
  const account = useStore((s) => s.cloudAccount);
  const link = useStore((s) => s.cloudLinks[pid]);
  const setCloudLink = useStore((s) => s.setCloudLink);
  const status = useCloudStatus((s) => s[pid]);
  const [connected, setConnected] = useState(!!account.email && !!account.password);
  const [folder, setFolder] = useState(() => (link ? parentPath(link.path) : (recall<string>('cloud:folder') ?? '/')));
  const [items, setItems] = useState<DavItem[] | null>(null);
  const [listError, setListError] = useState('');
  const [fileName, setFileName] = useState(() => (link ? baseName(link.path) : cloudFileName(project?.name ?? '')));
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    setItems(null);
    setListError('');
    try {
      setItems(await listFolder(useStore.getState().cloudAccount, folder));
      remember('cloud:folder', folder);
    } catch (e) {
      setListError((e as Error).message);
      setItems([]);
    }
  }, [folder]);

  useEffect(() => {
    if (connected) refresh();
  }, [connected, refresh]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    const timer = window.setInterval(() => tick((n) => n + 1), 20_000);
    return () => {
      window.removeEventListener('keydown', key);
      window.clearInterval(timer);
    };
  }, [onClose]);

  const act = async (job: () => Promise<unknown>) => {
    setError('');
    try {
      await job();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const busy = status?.state === 'busy';
  const target = joinPath(folder, fileName.trim());
  const exists = items?.find((i) => !i.isDir && i.path === target);
  const saveHere = () =>
    act(async () => {
      if (!fileName.trim()) return;
      if (exists && link?.path !== target && !confirm(`Replace ${exists.name} in this folder with “${project.name}”?`)) return;
      await saveProjectAs(pid, target);
      await refresh();
    });
  const open = (item: DavItem) =>
    act(async () => {
      const opened = await openProjectFile(item.path, (name) =>
        confirm(`“${name}” is already on this computer. Replace it with the version in ${item.name}?`),
      );
      if (opened) onClose();
    });
  const createFolder = () =>
    act(async () => {
      const name = newFolder?.trim();
      if (!name) return;
      await makeFolder(account, joinPath(folder, name));
      setNewFolder(null);
      setFolder(joinPath(folder, name));
    });

  const crumbs = folder.split('/').filter(Boolean);
  const changedHere = link && status?.state !== 'busy' && hasLocalChanges(pid);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal cloud-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>
            <Cloud size={20} /> Cloud
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {!connected ? (
          <CloudAccountForm onConnected={() => setConnected(true)} />
        ) : (
          <>
            <section className="cloud-project">
              <div className="cloud-project-head">
                <StatusIcon state={link ? (changedHere && status?.state === 'synced' ? 'changed' : status?.state) : undefined} />
                <div className="grow">
                  <strong>{project.name}</strong>
                  {link ? (
                    <small>
                      {link.path} · {status?.state === 'busy' ? status.doing : `synced ${timeAgo(link.syncedAt)}`}
                      {changedHere && status?.state !== 'conflict' && ' · unsaved changes'}
                    </small>
                  ) : (
                    <small>Not in the cloud yet. Pick a folder below and save it there.</small>
                  )}
                </div>
                {link && (
                  <div className="cloud-project-actions">
                    <button className="btn soft sm" disabled={busy} onClick={() => act(() => saveProject(pid))} title="Upload this computer’s version">
                      <CloudUpload size={14} /> Save now
                    </button>
                    <button
                      className="btn ghost sm"
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          if (changedHere && !confirm('Replace this computer’s version with the one in the cloud? Unsaved changes here are lost.')) return;
                          await loadCloudVersion(pid);
                        })
                      }
                      title="Replace this computer’s version with the cloud’s"
                    >
                      <CloudDownload size={14} /> Load from cloud
                    </button>
                    <button
                      className="icon-btn sm"
                      onClick={() => confirm('Stop syncing this project? The cloud file stays where it is.') && setCloudLink(pid, null)}
                      title="Stop syncing this project"
                    >
                      <Unlink size={14} />
                    </button>
                  </div>
                )}
              </div>
              {status?.state === 'conflict' && (
                <div className="cloud-conflict">
                  <p>{status.message}</p>
                  <div>
                    <button className="btn primary sm" onClick={() => act(() => saveProject(pid, { force: true }))}>
                      Keep this computer’s version
                    </button>
                    <button className="btn ghost sm" onClick={() => act(() => loadCloudVersion(pid))}>
                      Use the cloud version
                    </button>
                  </div>
                </div>
              )}
              {status?.state === 'error' && !error && <p className="settings-error">{status.message}</p>}
              {error && <p className="settings-error">{error}</p>}
            </section>

            <section className="cloud-browser">
              <div className="cloud-crumbs">
                <button onClick={() => setFolder('/')} className={crumbs.length ? '' : 'here'}>
                  <HardDrive size={14} /> Koofr
                </button>
                {crumbs.map((c, i) => (
                  <span key={i} className="cloud-crumb">
                    <ChevronRight size={13} />
                    <button
                      className={i === crumbs.length - 1 ? 'here' : ''}
                      onClick={() => setFolder('/' + crumbs.slice(0, i + 1).join('/'))}
                    >
                      {c}
                    </button>
                  </span>
                ))}
                <span className="grow" />
                <button className="icon-btn sm" onClick={() => setNewFolder('')} title="New folder">
                  <FolderPlus size={15} />
                </button>
                <button className="icon-btn sm" onClick={refresh} title="Refresh">
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="cloud-list">
                {newFolder !== null && (
                  <div className="cloud-item new-folder">
                    <Folder size={16} />
                    <input
                      autoFocus
                      value={newFolder}
                      placeholder="Folder name"
                      onChange={(e) => setNewFolder(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') createFolder();
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setNewFolder(null);
                        }
                      }}
                    />
                    <button className="btn soft sm" disabled={!newFolder.trim()} onClick={createFolder}>
                      Create
                    </button>
                  </div>
                )}
                {!items && (
                  <div className="cloud-empty">
                    <LoaderCircle size={16} className="spin" /> Loading…
                  </div>
                )}
                {listError && <div className="cloud-empty settings-error">{listError}</div>}
                {items && !listError && items.length === 0 && newFolder === null && <div className="cloud-empty">This folder is empty.</div>}
                {items?.map((item) =>
                  item.isDir ? (
                    <button key={item.path} className="cloud-item" onClick={() => setFolder(item.path)}>
                      <Folder size={16} className="cloud-folder-icon" />
                      <span className="grow">{item.name}</span>
                      <ChevronRight size={14} className="muted" />
                    </button>
                  ) : (
                    <div
                      key={item.path}
                      className={`cloud-item file ${item.path === link?.path ? 'linked' : ''} ${item.name.endsWith('.json') ? '' : 'other'}`}
                      onClick={() => item.name.endsWith('.json') && setFileName(item.name)}
                    >
                      <FileJson size={16} />
                      <span className="grow">{item.name}</span>
                      {item.path === link?.path ? (
                        <small className="muted">this project</small>
                      ) : (
                        item.modified > 0 && <small className="muted">{timeAgo(item.modified)}</small>
                      )}
                      {item.name.endsWith('.json') && item.path !== link?.path && (
                        <button
                          className="btn ghost sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(item);
                          }}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  ),
                )}
              </div>
            </section>

            <footer className="modal-foot cloud-foot">
              <div className="settings-input-row grow">
                <input value={fileName} onChange={(e) => setFileName(e.target.value)} spellCheck={false} aria-label="File name" />
              </div>
              <button className="btn primary" disabled={busy || !fileName.trim() || !!listError} onClick={saveHere}>
                <CloudUpload size={15} /> {link?.path === target ? 'Save' : 'Save here'}
              </button>
            </footer>
            <p className="hint cloud-who">
              Signed in as {account.email}.{' '}
              <button className="inline-link" onClick={() => setConnected(false)}>
                Change account
              </button>
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function StatusIcon({ state, size = 18 }: { state?: string; size?: number }) {
  if (state === 'busy') return <LoaderCircle size={size} className="spin" />;
  if (state === 'conflict' || state === 'error') return <CloudAlert size={size} className="cloud-bad" />;
  if (state === 'synced') return <CloudCheck size={size} className="cloud-good" />;
  if (state === 'changed') return <CloudUpload size={size} className="cloud-pending" />;
  return <Cloud size={size} className="muted" />;
}
