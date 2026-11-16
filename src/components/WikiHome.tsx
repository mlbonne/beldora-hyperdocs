import { useMemo, useState } from 'react';
import { BookPlus, Clock, FolderPlus, LibraryBig, Link2, Search, Shuffle, X } from 'lucide-react';
import { useStore } from '../store';
import type { Category, WikiEntry } from '../types';
import { ENTRY_TYPES, TYPE_META } from '../wikiTypes';
import { recall, remember, useScrollMemory } from '../viewMemory';
import { linkNamesInWiki } from '../wikiTools';
import { AutoTextarea } from './AutoTextarea';
import { CreateEntryDialog } from './CreateEntryDialog';
import { EntryAvatar } from './EntryAvatar';
import { NameDialog } from './NameDialog';
import { RedLink } from './RedLink';
import { isMissing, missingName } from '../categoryRefs';

type View = 'home' | 'all' | 'categories';

const byTitle = (a: { title?: string; name?: string }, b: { title?: string; name?: string }) =>
  (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '', undefined, { sensitivity: 'base' });

function firstLetter(s: string) {
  const c = s.trim().charAt(0).toUpperCase();
  return /\p{L}/u.test(c) ? c.normalize('NFD').charAt(0) : '#';
}

/** The fixed "Wiki" tab: a Fandom-style front page for exploring every entry and category. */
export function WikiHome({ projectId }: { projectId: string }) {
  const project = useStore((s) => s.projects[projectId]);
  const allEntries = useStore((s) => s.entries);
  const allCategories = useStore((s) => s.categories);
  const chapterCount = project?.chapterOrder.length ?? 0;
  const updateProject = useStore((s) => s.updateProject);
  const openTab = useStore((s) => s.openTab);
  const createCategory = useStore((s) => s.createCategory);

  const [view, setViewState] = useState<View>(() => recall<View>('home:wiki#view') ?? 'home');
  const setView = (v: View) => {
    remember('home:wiki#view', v);
    setViewState(v);
  };
  const [query, setQuery] = useState('');
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const scrollRef = useScrollMemory<HTMLDivElement>('home:wiki');

  const entries = useMemo(
    () => Object.values(allEntries).filter((e) => e.projectId === projectId).sort(byTitle),
    [allEntries, projectId],
  );
  const categories = useMemo(
    () => Object.values(allCategories).filter((c) => c.projectId === projectId).sort(byTitle),
    [allCategories, projectId],
  );
  // Names listed in categories that have no article yet, most wanted first.
  const wanted = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of categories) {
      for (const ref of c.entryIds.filter(isMissing)) counts.set(missingName(ref), (counts.get(missingName(ref)) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [categories]);
  const recent = useMemo(() => [...entries].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8), [entries]);

  if (!project) return <div className="empty-view" />;

  const openEntry = (id: string) => openTab({ kind: 'wiki', id });
  const openCategory = (id: string) => openTab({ kind: 'category', id });
  const q = query.trim().toLowerCase();
  const results = q
    ? {
        entries: entries.filter((e) => [e.title, ...e.aliases, e.summary].some((t) => t.toLowerCase().includes(q))),
        categories: categories.filter((c) => c.name.toLowerCase().includes(q)),
      }
    : null;

  const linkAll = () => {
    const { links, pages } = linkNamesInWiki(projectId);
    setLinkResult(links ? `Linked ${links} name${links > 1 ? 's' : ''} on ${pages} page${pages > 1 ? 's' : ''}.` : 'Every name is already linked.');
  };

  return (
    <div className="wiki-home">
      <div className="scroll" ref={scrollRef}>
        <header className="wh-hero">
          <div className="wh-hero-inner">
            <div className="wh-crest">{project.name.slice(0, 1).toUpperCase() || 'W'}</div>
            <div className="wh-hero-text">
              <h1>{project.name} Wiki</h1>
              <p>
                {entries.length} {entries.length === 1 ? 'article' : 'articles'} · {categories.length}{' '}
                {categories.length === 1 ? 'category' : 'categories'} · {chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}
              </p>
            </div>
            <label className="wh-search">
              <Search size={16} />
              <input value={query} placeholder="Search this wiki" onChange={(e) => setQuery(e.target.value)} />
              {query && (
                <button onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
          <nav className="wh-nav">
            {(['home', 'all', 'categories'] as View[]).map((v) => (
              <button key={v} className={view === v && !q ? 'active' : ''} onClick={() => (setQuery(''), setView(v))}>
                {v === 'home' ? 'Home' : v === 'all' ? 'All pages' : 'Categories'}
              </button>
            ))}
          </nav>
        </header>

        <div className="wh-body">
          <main className="wh-main">
            {results ? (
              <SearchResults query={query} results={results} onOpenEntry={openEntry} onOpenCategory={openCategory} />
            ) : view === 'all' ? (
              <AllPages entries={entries} onOpenEntry={openEntry} />
            ) : view === 'categories' ? (
              <CategoryIndex categories={categories} onOpen={openCategory} onCreate={() => setCreatingCategory(true)} />
            ) : (
              <>
                <section className="wh-welcome">
                  <h2>
                    Welcome to {/^the\s/i.test(project.name) ? '' : 'the '}
                    {project.name} Wiki
                  </h2>
                  <AutoTextarea
                    className="wh-intro"
                    value={project.wikiIntro ?? ''}
                    placeholder="Introduce your world: what is this story about, and what will readers find here?"
                    onChange={(wikiIntro) => updateProject(projectId, { wikiIntro })}
                    rows={2}
                  />
                </section>

                <section className="wh-section">
                  <h2 className="wh-heading">Explore</h2>
                  <div className="wh-portals">
                    {ENTRY_TYPES.map((t) => {
                      const meta = TYPE_META[t];
                      const Icon = meta.icon;
                      const list = entries.filter((e) => e.type === t);
                      return (
                        <button
                          key={t}
                          className={`wh-portal t-${t}`}
                          onClick={() => document.getElementById(`wh-${t}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        >
                          <span className="wh-portal-icon">
                            <Icon size={22} strokeWidth={1.7} />
                          </span>
                          <strong>{meta.plural}</strong>
                          <span>
                            {list.length} {list.length === 1 ? 'page' : 'pages'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {ENTRY_TYPES.map((t) => {
                  const list = entries.filter((e) => e.type === t);
                  if (!list.length) return null;
                  return (
                    <section key={t} id={`wh-${t}`} className={`wh-section t-${t}`}>
                      <h2 className="wh-heading">{TYPE_META[t].plural}</h2>
                      <div className="wh-cards">
                        {list.map((e) => (
                          <EntryTile key={e.id} entry={e} onOpen={() => openEntry(e.id)} />
                        ))}
                      </div>
                    </section>
                  );
                })}

                {entries.length === 0 && (
                  <div className="wh-empty">
                    <p>This wiki has no pages yet. Create one here, or select a name in a chapter and press Ctrl+K.</p>
                    <button className="btn primary" onClick={() => setCreatingEntry(true)}>
                      <BookPlus size={16} /> Create the first page
                    </button>
                  </div>
                )}
              </>
            )}
          </main>

          <aside className="wh-rail">
            <div className="wh-box">
              <h3>Wiki tools</h3>
              <button className="wh-tool" onClick={() => setCreatingEntry(true)}>
                <BookPlus size={15} /> New page
              </button>
              <button className="wh-tool" onClick={() => setCreatingCategory(true)}>
                <FolderPlus size={15} /> New category
              </button>
              <button className="wh-tool" onClick={linkAll} title="Find wiki names in every page’s text and link them">
                <Link2 size={15} /> Link names in all pages
              </button>
              {entries.length > 0 && (
                <button className="wh-tool" onClick={() => openEntry(entries[Math.floor(Math.random() * entries.length)].id)}>
                  <Shuffle size={15} /> Random page
                </button>
              )}
              {linkResult && <p className="wh-tool-result">{linkResult}</p>}
            </div>

            {recent.length > 0 && (
              <div className="wh-box">
                <h3>
                  <Clock size={13} /> Recently edited
                </h3>
                {recent.map((e) => (
                  <button key={e.id} className="wh-rail-link" onClick={() => openEntry(e.id)}>
                    <EntryAvatar entry={e} size={22} />
                    <span>{e.title || 'Untitled'}</span>
                  </button>
                ))}
              </div>
            )}

            {wanted.length > 0 && (
              <div className="wh-box">
                <h3>Wanted pages</h3>
                <p className="muted small wh-box-note">Listed in categories, but not written yet.</p>
                {wanted.map(([name, n]) => (
                  <div key={name} className="wh-rail-link wanted">
                    <RedLink name={name} projectId={projectId} />
                    {n > 1 && <em>{n}</em>}
                  </div>
                ))}
              </div>
            )}

            <div className="wh-box">
              <h3>
                <LibraryBig size={13} /> Categories
              </h3>
              {categories.length ? (
                categories.map((c) => (
                  <button key={c.id} className="wh-rail-link" onClick={() => openCategory(c.id)}>
                    <span>{c.name}</span>
                    <em>{c.entryIds.length}</em>
                  </button>
                ))
              ) : (
                <p className="muted small">No categories yet.</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {creatingEntry && (
        <CreateEntryDialog
          projectId={projectId}
          onClose={() => setCreatingEntry(false)}
          onDone={({ entry, open }) => {
            setCreatingEntry(false);
            if (open) openEntry(entry.id);
          }}
        />
      )}
      {creatingCategory && (
        <NameDialog
          title="New category"
          label="Name"
          hint="You can describe the category and add pages to it on its page."
          confirm="Create category"
          onClose={() => setCreatingCategory(false)}
          onConfirm={(name) => {
            setCreatingCategory(false);
            openCategory(createCategory({ projectId, name }).id);
          }}
        />
      )}
    </div>
  );
}

function EntryTile({ entry, onOpen }: { entry: WikiEntry; onOpen: () => void }) {
  const Icon = TYPE_META[entry.type].icon;
  return (
    <button className={`wh-tile t-${entry.type}`} onClick={onOpen}>
      <span className="wh-tile-media">
        {entry.image ? <img src={entry.image} alt="" /> : <Icon size={30} strokeWidth={1.3} />}
      </span>
      <span className="wh-tile-title">{entry.title || 'Untitled'}</span>
      {entry.summary && <span className="wh-tile-summary">{entry.summary}</span>}
    </button>
  );
}

function AllPages({ entries, onOpenEntry }: { entries: WikiEntry[]; onOpenEntry: (id: string) => void }) {
  const groups = new Map<string, WikiEntry[]>();
  for (const e of entries) {
    const l = firstLetter(e.title);
    groups.set(l, [...(groups.get(l) ?? []), e]);
  }
  return (
    <section className="wh-section">
      <h2 className="wh-heading">All pages</h2>
      {entries.length === 0 && <p className="muted">No pages yet.</p>}
      <div className="wh-az">
        {[...groups].map(([letter, list]) => (
          <div key={letter} className="wh-az-group">
            <h3>{letter}</h3>
            {list.map((e) => (
              <button key={e.id} className={`wh-az-link t-${e.type}`} onClick={() => onOpenEntry(e.id)}>
                <EntryAvatar entry={e} size={18} />
                {e.title || 'Untitled'}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryIndex({ categories, onOpen, onCreate }: { categories: Category[]; onOpen: (id: string) => void; onCreate: () => void }) {
  return (
    <section className="wh-section">
      <div className="wh-heading-row">
        <h2 className="wh-heading">Categories</h2>
        <button className="btn ghost sm" onClick={onCreate}>
          <FolderPlus size={14} /> New category
        </button>
      </div>
      {categories.length === 0 ? (
        <p className="muted">
          No categories yet. Create one here, or write a list of wiki links in a page’s tab and turn it into a category.
        </p>
      ) : (
        <div className="wh-cat-list">
          {categories.map((c) => (
            <button key={c.id} className="wh-cat" onClick={() => onOpen(c.id)}>
              <LibraryBig size={18} />
              <span className="wh-cat-name">{c.name}</span>
              <span className="wh-cat-count">
                {c.entryIds.length} {c.entryIds.length === 1 ? 'page' : 'pages'}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SearchResults({
  query,
  results,
  onOpenEntry,
  onOpenCategory,
}: {
  query: string;
  results: { entries: WikiEntry[]; categories: Category[] };
  onOpenEntry: (id: string) => void;
  onOpenCategory: (id: string) => void;
}) {
  const total = results.entries.length + results.categories.length;
  return (
    <section className="wh-section">
      <h2 className="wh-heading">
        {total} {total === 1 ? 'result' : 'results'} for “{query.trim()}”
      </h2>
      {results.categories.map((c) => (
        <button key={c.id} className="wh-result" onClick={() => onOpenCategory(c.id)}>
          <LibraryBig size={18} />
          <span>
            <strong>Category: {c.name}</strong>
            <small>{c.entryIds.length} pages</small>
          </span>
        </button>
      ))}
      {results.entries.map((e) => (
        <button key={e.id} className={`wh-result t-${e.type}`} onClick={() => onOpenEntry(e.id)}>
          <EntryAvatar entry={e} size={34} />
          <span>
            <strong>{e.title}</strong>
            <small>
              {TYPE_META[e.type].label}
              {e.summary ? ` — ${e.summary}` : ''}
            </small>
          </span>
        </button>
      ))}
    </section>
  );
}
