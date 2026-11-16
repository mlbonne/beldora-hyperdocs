import { Fragment, useMemo, useState } from 'react';
import { LibraryBig, RefreshCw } from 'lucide-react';
import { useOpenPage, useStore } from '../store';
import type { WikiEntry, WikiTab } from '../types';
import { readTabAsCategory } from '../wikiTools';
import { refForName } from '../categoryRefs';
import { Navbox } from './Navbox';
import { NameDialog } from './NameDialog';

/** Offers to turn a tab that lists wiki pages into a category, or to update the category made from it. */
export function TabCategoryBar({ entry, tab }: { entry: WikiEntry; tab: WikiTab }) {
  const categories = useStore((s) => s.categories);
  const entries = useStore((s) => s.entries);
  const createCategory = useStore((s) => s.createCategory);
  const updateCategory = useStore((s) => s.updateCategory);
  const openTab = useStore((s) => s.openTab);
  const [naming, setNaming] = useState(false);
  const [updated, setUpdated] = useState(false);

  const read = useMemo(
    () => readTabAsCategory(tab.content, (name) => refForName(name, entry.projectId, entries)),
    [tab.content, entries, entry.projectId],
  );
  const linked = Object.values(categories).find((c) => c.source?.entryId === entry.id && c.source.tabId === tab.id);
  if (!read && !linked) return null;

  const count = read?.entryIds.length ?? 0;
  const missing = read?.missing ?? 0;
  const pages = `${count} ${count === 1 ? 'page' : 'pages'}`;

  return (
    <div className="tab-category-bar">
      <LibraryBig size={15} />
      {linked ? (
        <>
          <span>
            This tab is the source of the category <strong>{linked.name}</strong>.
            {updated && <em> Updated.</em>}
          </span>
          <button
            className="btn ghost sm"
            disabled={!read}
            onClick={() => {
              if (!read) return;
              updateCategory(linked.id, { entryIds: read.entryIds, groups: read.groups, description: read.description });
              setUpdated(true);
            }}
            title="Copy this tab’s text and list to the category again"
          >
            <RefreshCw size={13} /> Update category
          </button>
          <button className="btn soft sm" onClick={() => openTab({ kind: 'category', id: linked.id })}>
            Open
          </button>
        </>
      ) : (
        <>
          <span>
            This tab lists {pages}
            {missing > 0 && ` (${missing} without an article yet, shown in red)`}.
          </span>
          <button className="btn soft sm" onClick={() => setNaming(true)}>
            Make it a category
          </button>
        </>
      )}
      {naming && read && (
        <NameDialog
          title="Make a category"
          label="Category name"
          initial={`${entry.title} ${tab.title}`.trim()}
          hint={`The tab’s text becomes the description and its ${pages} become the members. The category’s box will appear at the bottom of each of them.`}
          confirm="Create category"
          onClose={() => setNaming(false)}
          onConfirm={(name) => {
            setNaming(false);
            const c = createCategory({
              projectId: entry.projectId,
              name,
              description: read.description,
              entryIds: read.entryIds,
              groups: read.groups,
              source: { entryId: entry.id, tabId: tab.id },
            });
            openTab({ kind: 'category', id: c.id });
          }}
        />
      )}
    </div>
  );
}

/** The navboxes of every category this page belongs to, then the classic "Categories:" line. */
export function EntryCategories({ entry }: { entry: WikiEntry }) {
  const allCategories = useStore((s) => s.categories);
  const setEntryInCategory = useStore((s) => s.setEntryInCategory);
  const openTab = useStore((s) => s.openTab);
  const inProject = Object.values(allCategories)
    .filter((c) => c.projectId === entry.projectId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const mine = inProject.filter((c) => c.entryIds.includes(entry.id));
  const others = inProject.filter((c) => !c.entryIds.includes(entry.id));
  const openPage = useOpenPage();
  const openEntry = (id: string, inNewTab = false) => openPage({ kind: 'wiki', id }, inNewTab);
  const openCategory = (id: string) => openTab({ kind: 'category', id });

  return (
    <section className="entry-categories">
      {mine.map((c) => (
        <Navbox key={c.id} category={c} currentEntryId={entry.id} onOpenEntry={openEntry} onOpenCategory={openCategory} />
      ))}
      <div className="catlinks">
        <span className="catlinks-label">Categories:</span>
        {mine.length === 0 && <span className="muted"> none</span>}
        {mine.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 && <span className="catlinks-sep"> | </span>}
            <button className="catlinks-link" onClick={() => openCategory(c.id)}>
              {c.name}
            </button>
          </Fragment>
        ))}
        {others.length > 0 && (
          <select className="catlinks-add" value="" onChange={(e) => e.target.value && setEntryInCategory(e.target.value, entry.id, true)}>
            <option value="">+ Add to category…</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </section>
  );
}
