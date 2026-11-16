import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, FileText, Images, Plus, Trash2, X } from 'lucide-react';
import { newTab, useOpenPage, useStore } from '../store';
import { ENTRY_TYPES, TYPE_META } from '../wikiTypes';
import type { EntryType, WikiEntry, WikiTab } from '../types';
import { collectEntryIds, imageFiles, readImage, uid } from '../utils';
import { RichEditor } from '../editor/RichEditor';
import { AutoTextarea } from './AutoTextarea';
import { EntryAvatar } from './EntryAvatar';
import { EntryCard, useHoverCard } from './EntryCard';
import { Gallery } from './Gallery';
import { EntryCategories, TabCategoryBar } from './EntryCategories';
import { recall, remember, useScrollMemory } from '../viewMemory';

export function WikiView({ entryId }: { entryId: string }) {
  const entry = useStore((s) => s.entries[entryId]);
  const updateEntry = useStore((s) => s.updateEntry);
  const updateEntryTab = useStore((s) => s.updateEntryTab);
  const setEntryType = useStore((s) => s.setEntryType);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const openTab = useStore((s) => s.openTab);
  const openPage = useOpenPage();
  const [activeTabId, setActiveTabIdState] = useState<string | undefined>(
    () => recall<string>(`wiki:${entryId}#section`) ?? entry?.tabs[0]?.id,
  );
  const setActiveTabId = (id: string | undefined) => {
    remember(`wiki:${entryId}#section`, id);
    setActiveTabIdState(id);
  };
  const [renaming, setRenaming] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const hover = useHoverCard();
  const scrollRef = useScrollMemory<HTMLDivElement>(`wiki:${entryId}`);

  if (!entry) return <div className="empty-view">This wiki entry no longer exists.</div>;

  const meta = TYPE_META[entry.type];
  const Icon = meta.icon;
  const tab = entry.tabs.find((t) => t.id === activeTabId) ?? entry.tabs[0];
  const openEntry = (id: string, inNewTab = false) => openPage({ kind: 'wiki', id }, inNewTab);

  const addTab = (kind: WikiTab['kind']) => {
    const t = newTab(kind === 'gallery' ? 'Gallery' : 'New tab', kind);
    updateEntry(entry.id, { tabs: [...entry.tabs, t] });
    setActiveTabId(t.id);
    setRenaming(t.id);
    setAddMenu(false);
  };

  const removeTab = (t: WikiTab) => {
    const hasContent = t.kind === 'gallery' ? !!t.images?.length : !!t.content?.content?.some((n) => n.content?.length);
    if (hasContent && !confirm(`Delete the “${t.title}” tab and its content?`)) return;
    const tabs = entry.tabs.filter((x) => x.id !== t.id);
    updateEntry(entry.id, { tabs });
    if (tab?.id === t.id) setActiveTabId(tabs[0]?.id);
  };

  const hoverEntry = hover.card ? useStore.getState().entries[hover.card.id] : undefined;

  return (
    <div className={`wiki-view t-${entry.type}`}>
      <div className="scroll" ref={scrollRef}>
        <div className="wiki-page">
          <header className="wiki-head">
            <div className="wiki-kicker">
              <label className="type-chip select">
                <Icon size={12} strokeWidth={2.2} />
                <select value={entry.type} onChange={(e) => setEntryType(entry.id, e.target.value as EntryType)}>
                  {ENTRY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_META[t].label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="wiki-kicker-label">Wiki</span>
            </div>
            <AutoTextarea
              className="wiki-title"
              value={entry.title}
              placeholder="Untitled"
              onChange={(title) => updateEntry(entry.id, { title })}
              onEnter={() => {}}
            />
            <AliasEditor entry={entry} onChange={(aliases) => updateEntry(entry.id, { aliases })} />
          </header>

          <div className="wiki-body">
            <section className="wiki-article">
              <nav className="wiki-tabs">
                {entry.tabs.map((t) => (
                  <div key={t.id} className={`wiki-tab ${t.id === tab?.id ? 'active' : ''}`}>
                    {renaming === t.id ? (
                      <input
                        autoFocus
                        className="wiki-tab-rename"
                        defaultValue={t.title}
                        onFocus={(e) => e.target.select()}
                        onBlur={(e) => {
                          updateEntryTab(entry.id, t.id, { title: e.target.value.trim() || t.title });
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => setActiveTabId(t.id)}
                        onDoubleClick={() => setRenaming(t.id)}
                        title="Double-click to rename"
                      >
                        {t.kind === 'gallery' && <Images size={13} />}
                        {t.title}
                      </button>
                    )}
                    {entry.tabs.length > 1 && renaming !== t.id && (
                      <button className="wiki-tab-x" onClick={() => removeTab(t)} aria-label={`Delete ${t.title}`}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
                <div className="wiki-tab-add">
                  <button className="icon-btn sm" onClick={() => setAddMenu(!addMenu)} title="Add tab">
                    <Plus size={15} />
                  </button>
                  {addMenu && (
                    <div className="menu" onMouseLeave={() => setAddMenu(false)}>
                      <button onClick={() => addTab('text')}>
                        <FileText size={14} /> Text tab
                      </button>
                      <button onClick={() => addTab('gallery')}>
                        <Images size={14} /> Gallery tab
                      </button>
                    </div>
                  )}
                </div>
              </nav>

              {tab?.kind === 'gallery' ? (
                <Gallery
                  images={tab.images ?? []}
                  onChange={(images) => updateEntryTab(entry.id, tab.id, { images })}
                  onSetCover={(image) => updateEntry(entry.id, { image })}
                />
              ) : tab ? (
                <>
                  <TabCategoryBar entry={entry} tab={tab} />
                  <RichEditor
                    key={tab.id}
                    className="wiki-editor"
                    content={tab.content}
                    projectId={entry.projectId}
                    excludeEntryId={entry.id}
                    placeholder={`Write the ${tab.title.toLowerCase()} of ${entry.title || 'this entry'}…`}
                    onChange={(content) => updateEntryTab(entry.id, tab.id, { content })}
                    onHoverEntry={hover.onHover}
                    onOpenEntry={openEntry}
                    toolbar
                    memoryKey={`wiki:${entry.id}:${tab.id}`}
                  />
                </>
              ) : (
                <p className="muted">Add a tab to start writing.</p>
              )}
            </section>

            <Infobox entry={entry} onOpenEntry={openEntry} />
          </div>

          <EntryCategories entry={entry} />

          <footer className="wiki-foot">
            <button
              className="btn danger-ghost sm"
              onClick={() => {
                if (confirm(`Delete “${entry.title}”? Links to it in your chapters will be removed.`)) deleteEntry(entry.id);
              }}
            >
              <Trash2 size={14} /> Delete entry
            </button>
          </footer>
        </div>
      </div>

      {hover.card &&
        hoverEntry &&
        createPortal(
          <div
            className="floating-card"
            style={floatingPosition(hover.card.rect)}
            onMouseEnter={hover.keep}
            onMouseLeave={hover.leave}
          >
            <EntryCard
              entry={hoverEntry}
              onOpen={() => openEntry(hoverEntry.id)}
              onOpenNewTab={() => openEntry(hoverEntry.id, true)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

function floatingPosition(rect: DOMRect): React.CSSProperties {
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - 300 - 8);
  return rect.bottom + 380 > window.innerHeight
    ? { left, bottom: window.innerHeight - rect.top + 8 }
    : { left, top: rect.bottom + 8 };
}

function AliasEditor({ entry, onChange }: { entry: WikiEntry; onChange: (aliases: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim();
    if (v && !entry.aliases.includes(v)) onChange([...entry.aliases, v]);
    setDraft('');
  };
  return (
    <div className="aliases">
      <span className="aliases-label">Also known as</span>
      {entry.aliases.map((a) => (
        <span key={a} className="alias">
          {a}
          <button onClick={() => onChange(entry.aliases.filter((x) => x !== a))} aria-label={`Remove ${a}`}>
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={entry.aliases.length ? 'Add…' : 'Add a nickname, title or short name…'}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Backspace' && !draft && entry.aliases.length) onChange(entry.aliases.slice(0, -1));
        }}
      />
    </div>
  );
}

function Infobox({ entry, onOpenEntry }: { entry: WikiEntry; onOpenEntry: (id: string) => void }) {
  const updateEntry = useStore((s) => s.updateEntry);
  const entries = useStore((s) => s.entries);
  const chapters = useStore((s) => s.chapters);
  const project = useStore((s) => s.projects[entry.projectId]);
  const openTab = useStore((s) => s.openTab);
  const meta = TYPE_META[entry.type];

  const appearsIn = useMemo(
    () =>
      (project?.chapterOrder ?? [])
        .map((id, i) => ({ chapter: chapters[id], n: i + 1 }))
        .filter(({ chapter }) => chapter && collectEntryIds(chapter.content).has(entry.id)),
    [chapters, project, entry.id],
  );

  const related = useMemo(() => {
    const out: WikiEntry[] = [];
    for (const e of Object.values(entries)) {
      if (e.projectId !== entry.projectId || e.id === entry.id) continue;
      const linksHere = e.tabs.some((t) => collectEntryIds(t.content).has(entry.id));
      const linkedFromHere = entry.tabs.some((t) => collectEntryIds(t.content).has(e.id));
      const sharesDynamic = e.type === 'dynamic' && e.participants.includes(entry.id);
      if (linksHere || linkedFromHere || sharesDynamic) out.push(e);
    }
    return out;
  }, [entries, entry]);

  const setField = (id: string, patch: { label?: string; value?: string }) =>
    updateEntry(entry.id, { fields: entry.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });

  const candidates = Object.values(entries).filter(
    (e) => e.projectId === entry.projectId && e.type !== 'dynamic' && !entry.participants.includes(e.id),
  );

  return (
    <aside className={`infobox t-${entry.type}`}>
      <div className="ib-card">
        <div className="ib-title">{entry.title || 'Untitled'}</div>
        <ImageSlot
          src={entry.image}
          icon={<meta.icon size={42} strokeWidth={1.2} />}
          onChange={(image) => updateEntry(entry.id, { image })}
        />
        <input
          className="ib-caption"
          value={entry.imageCaption}
          placeholder="Image caption"
          onChange={(e) => updateEntry(entry.id, { imageCaption: e.target.value })}
        />

        <div className="ib-section">Brief description</div>
        <AutoTextarea
          className="ib-summary"
          value={entry.summary}
          placeholder="Shown when you hover this name in a chapter."
          onChange={(summary) => updateEntry(entry.id, { summary })}
          rows={2}
        />

        {entry.type === 'dynamic' && (
          <>
            <div className="ib-section">Between</div>
            <div className="ib-participants">
              {entry.participants.map((id) =>
                entries[id] ? (
                  <span key={id} className={`chip t-${entries[id].type}`}>
                    <button className="chip-link" onClick={() => onOpenEntry(id)}>
                      <EntryAvatar entry={entries[id]} size={18} />
                      {entries[id].title}
                    </button>
                    <button
                      onClick={() => updateEntry(entry.id, { participants: entry.participants.filter((p) => p !== id) })}
                      aria-label="Remove"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ) : null,
              )}
              {candidates.length > 0 && (
                <select
                  className="chip-add"
                  value=""
                  onChange={(e) =>
                    e.target.value && updateEntry(entry.id, { participants: [...entry.participants, e.target.value] })
                  }
                >
                  <option value="">+ Add…</option>
                  {candidates.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}

        <div className="ib-section">{meta.label} details</div>
        <div className="ib-fields">
          {entry.fields.map((f) => (
            <div key={f.id} className="ib-row">
              <input className="ib-label" value={f.label} placeholder="Field" onChange={(e) => setField(f.id, { label: e.target.value })} />
              <AutoTextarea className="ib-value" value={f.value} placeholder="—" onChange={(value) => setField(f.id, { value })} />
              <button
                className="ib-row-x"
                onClick={() => updateEntry(entry.id, { fields: entry.fields.filter((x) => x.id !== f.id) })}
                aria-label={`Remove ${f.label}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className="ib-add"
            onClick={() => updateEntry(entry.id, { fields: [...entry.fields, { id: uid(), label: '', value: '' }] })}
          >
            <Plus size={13} /> Add field
          </button>
        </div>
      </div>

      <div className="ib-links">
        <div className="ib-links-title">
          <BookOpen size={13} /> Appears in
        </div>
        {appearsIn.length ? (
          appearsIn.map(({ chapter, n }) => (
            <button key={chapter.id} className="ib-link" onClick={() => openTab({ kind: 'chapter', id: chapter.id })}>
              <span className="ib-link-n">{n}</span>
              {chapter.title || `Chapter ${n}`}
            </button>
          ))
        ) : (
          <p className="muted small">Not linked in any chapter yet.</p>
        )}

        {related.length > 0 && (
          <>
            <div className="ib-links-title">Connected entries</div>
            {related.map((e) => (
              <button key={e.id} className="ib-link" onClick={() => onOpenEntry(e.id)}>
                <EntryAvatar entry={e} size={20} />
                {e.title}
              </button>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

function ImageSlot({ src, icon, onChange }: { src: string | null; icon: React.ReactNode; onChange: (src: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const take = async (files: FileList | null) => {
    const f = imageFiles(files)[0];
    if (f) onChange(await readImage(f));
  };
  return (
    <div
      className={`ib-image ${drag ? 'drag' : ''} ${src ? '' : 'empty'}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        take(e.dataTransfer.files);
      }}
      title="Click or drop an image"
    >
      {src ? (
        <img src={src} alt="" />
      ) : (
        <div className="ib-placeholder">
          {icon}
          <span>Add image</span>
        </div>
      )}
      {src && (
        <button
          className="ib-remove"
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
          }}
          aria-label="Remove image"
        >
          <X size={14} />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
