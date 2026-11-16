import { useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  Cloud,
  Download,
  FolderOpen,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCurrentPage, useStore, type ProjectExport } from '../store';
import { downloadJSON } from '../utils';
import { SettingsDialog } from './SettingsDialog';
import { CloudDialog, StatusIcon } from './CloudDialog';
import { useCloudIndicator } from '../cloud/sync';

export function Sidebar() {
  const s = useStore();
  const pid = s.activeProjectId;
  const project = pid ? s.projects[pid] : undefined;
  const activeRef = useCurrentPage();

  const [query, setQuery] = useState('');
  const [projectMenu, setProjectMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const cloud = useCloudIndicator(pid);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<string | null | undefined>(undefined);
  const importRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const chapters = (project?.chapterOrder ?? [])
    .map((id, i) => ({ c: s.chapters[id], n: i + 1 }))
    .filter(({ c }) => c && (!q || (c.title || '').toLowerCase().includes(q)));

  if (!project || !pid) return <aside className="sidebar" />;

  const newChapter = () => {
    const id = s.createChapter(pid);
    s.openTab({ kind: 'chapter', id });
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ProjectExport;
      if (data.app !== 'beldora-hyperdocs' || !data.project) throw new Error('Not a HyperDocs project file.');
      if (s.projects[data.project.id] && !confirm(`Replace the existing project “${data.project.name}”?`)) return;
      s.importProject(data);
    } catch (err) {
      alert(`Could not import: ${(err as Error).message}`);
    }
  };

  const drop = () => {
    if (dragId && dropBefore !== undefined && dragId !== dropBefore) s.moveChapter(pid, dragId, dropBefore);
    setDragId(null);
    setDropBefore(undefined);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <BookOpen size={16} />
        <span>HyperDocs</span>
      </div>

      <div className="project-switch">
        <button className="project-btn" onClick={() => setProjectMenu(!projectMenu)}>
          <span className="project-mark">{project.name.slice(0, 1).toUpperCase() || 'P'}</span>
          <input
            className="project-name"
            value={project.name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => s.updateProject(pid, { name: e.target.value })}
            aria-label="Project name"
          />
          <ChevronDown size={14} />
        </button>
        {projectMenu && (
          <div className="menu project-menu" onMouseLeave={() => setProjectMenu(false)}>
            {Object.values(s.projects).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  s.setActiveProject(p.id);
                  setProjectMenu(false);
                }}
              >
                <FolderOpen size={14} /> <span className="grow">{p.name}</span> {p.id === pid && <Check size={14} />}
              </button>
            ))}
            <div className="menu-sep" />
            <button
              onClick={() => {
                s.createProject();
                setProjectMenu(false);
              }}
            >
              <Plus size={14} /> New project
            </button>
            <button onClick={() => downloadJSON(`${project.name || 'project'}.hyperdocs.json`, s.exportProject(pid))}>
              <Download size={14} /> Export project
            </button>
            <button onClick={() => importRef.current?.click()}>
              <Upload size={14} /> Import project…
            </button>
            <button
              onClick={() => {
                setCloudOpen(true);
                setProjectMenu(false);
              }}
            >
              <Cloud size={14} /> Save or open in the cloud…
            </button>
            <div className="menu-sep" />
            <button
              className="danger"
              onClick={() => {
                if (confirm(`Delete “${project.name}” with all its chapters and wiki entries? This cannot be undone.`)) {
                  s.deleteProject(pid);
                  setProjectMenu(false);
                }
              }}
            >
              <Trash2 size={14} /> Delete project
            </button>
          </div>
        )}
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            onImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <label className="search">
        <Search size={14} />
        <input value={query} placeholder="Search chapters" onChange={(e) => setQuery(e.target.value)} />
      </label>

      <div className="side-scroll">
        <div className="side-section">
          <div className="side-head">
            <span>Chapters</span>
            <button className="icon-btn sm" onClick={newChapter} title="New chapter">
              <Plus size={15} />
            </button>
          </div>
          <div onDragOver={(e) => e.preventDefault()} onDrop={drop}>
            {chapters.map(({ c, n }) => (
              <div
                key={c.id}
                className={`side-item chapter-item ${activeRef?.kind === 'chapter' && activeRef.id === c.id ? 'active' : ''} ${
                  dropBefore === c.id && dragId !== c.id ? 'drop-before' : ''
                }`}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragEnter={() => setDropBefore(c.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setDropBefore(undefined);
                }}
                onClick={() => s.openTab({ kind: 'chapter', id: c.id })}
              >
                <span className="chapter-n">{n}</span>
                <span className="side-label">{c.title || 'Untitled chapter'}</span>
                <button
                  className="side-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete “${c.title || 'Untitled chapter'}”?`)) s.deleteChapter(c.id);
                  }}
                  aria-label="Delete chapter"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {dragId && (
              <div className={`drop-end ${dropBefore === null ? 'drop-before' : ''}`} onDragEnter={() => setDropBefore(null)} />
            )}
          </div>
          {!chapters.length && !q && (
            <button className="side-empty" onClick={newChapter}>
              <Plus size={14} /> Write your first chapter
            </button>
          )}
        </div>
      </div>

      <div className="side-foot">
        <button
          className={`foot-toggle ${s.showSuggestions ? 'on' : ''}`}
          onClick={() => s.setShowSuggestions(!s.showSuggestions)}
          title="Underline names from the Wiki that are not linked yet"
        >
          <Sparkles size={14} /> Detect names
        </button>
        <span className="grow" />
        <button
          className={`icon-btn cloud-btn ${cloud?.state ?? ''}`}
          onClick={() => setCloudOpen(true)}
          title={
            !cloud
              ? 'Cloud: save this project to Koofr'
              : cloud.state === 'busy'
                ? cloud.doing
                : cloud.state === 'changed'
                  ? 'Cloud: changes not uploaded yet'
                  : cloud.state === 'synced'
                    ? 'Cloud: up to date'
                    : `Cloud: ${cloud.message}`
          }
        >
          <StatusIcon state={cloud?.state} size={16} />
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings — spelling, theme">
          <Settings size={16} />
        </button>
        <button
          className="icon-btn"
          onClick={() => s.setTheme(s.theme === 'dark' ? 'light' : 'dark')}
          title={s.theme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {s.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {cloudOpen && <CloudDialog onClose={() => setCloudOpen(false)} />}
    </aside>
  );
}
