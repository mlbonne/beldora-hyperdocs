import { useMemo, useState } from 'react';
import { LibraryBig, Plus, Trash2, X } from 'lucide-react';
import { useOpenPage, useStore } from '../store';
import { uid } from '../utils';
import { useScrollMemory } from '../viewMemory';
import { RichEditor } from '../editor/RichEditor';
import { AutoTextarea } from './AutoTextarea';
import { EntryAvatar } from './EntryAvatar';
import { EntryCard, useHoverCard } from './EntryCard';
import { createPortal } from 'react-dom';
import { Navbox } from './Navbox';
import { RedLink } from './RedLink';
import { isMissing, memberName, refForName } from '../categoryRefs';

/** A category's own article: its description, its navbox and the list of its pages. */
export function CategoryView({ categoryId }: { categoryId: string }) {
  const category = useStore((s) => s.categories[categoryId]);
  const entries = useStore((s) => s.entries);
  const updateCategory = useStore((s) => s.updateCategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const setEntryInCategory = useStore((s) => s.setEntryInCategory);
  const openTab = useStore((s) => s.openTab);
  const openPage = useOpenPage();
  const scrollRef = useScrollMemory<HTMLDivElement>(`category:${categoryId}`);
  const hover = useHoverCard();
  const [newGroup, setNewGroup] = useState('');
  const [newMember, setNewMember] = useState('');

  // Member refs (articles and red links), sorted by name.
  const members = useMemo(
    () =>
      (category?.entryIds ?? [])
        .filter((ref) => isMissing(ref) || entries[ref])
        .sort((a, b) => memberName(a, entries).localeCompare(memberName(b, entries), undefined, { sensitivity: 'base' })),
    [category, entries],
  );

  if (!category) return <div className="empty-view">This category no longer exists.</div>;

  const openEntry = (id: string, inNewTab = false) => openPage({ kind: 'wiki', id }, inNewTab);
  const candidates = Object.values(entries)
    .filter((e) => e.projectId === category.projectId && !category.entryIds.includes(e.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  const source = category.source && entries[category.source.entryId];
  const sourceTab = source?.tabs.find((t) => t.id === category.source?.tabId);

  const byLetter = new Map<string, string[]>();
  for (const ref of members) {
    const l = memberName(ref, entries).trim().charAt(0).toUpperCase() || '#';
    byLetter.set(l, [...(byLetter.get(l) ?? []), ref]);
  }
  const missingCount = members.filter(isMissing).length;
  const addMember = () => {
    if (!newMember.trim()) return;
    setEntryInCategory(category.id, refForName(newMember, category.projectId, entries), true);
    setNewMember('');
  };
  const groupOf = (id: string) => category.groups.find((g) => g.entryIds.includes(id))?.id ?? '';
  const moveToGroup = (entryId: string, groupId: string) =>
    updateCategory(category.id, {
      groups: category.groups.map((g) => ({
        ...g,
        entryIds: g.id === groupId ? [...g.entryIds.filter((x) => x !== entryId), entryId] : g.entryIds.filter((x) => x !== entryId),
      })),
    });
  const hoverEntry = hover.card ? entries[hover.card.id] : undefined;

  return (
    <div className="wiki-view category-view">
      <div className="scroll" ref={scrollRef}>
        <div className="wiki-page category-page">
          <header className="wiki-head">
            <div className="wiki-kicker">
              <span className="type-chip category-chip">
                <LibraryBig size={12} strokeWidth={2.2} /> Category
              </span>
              {source && (
                <span className="wiki-kicker-label">
                  From the “{sourceTab?.title ?? 'deleted'}” tab of{' '}
                  <button className="inline-link" onClick={() => openEntry(source.id)}>
                    {source.title}
                  </button>
                </span>
              )}
            </div>
            <AutoTextarea
              className="wiki-title"
              value={category.name}
              placeholder="Untitled category"
              onChange={(name) => updateCategory(category.id, { name })}
              onEnter={() => {}}
            />
          </header>

          <section className="category-description">
            <RichEditor
              key={category.id}
              className="wiki-editor"
              content={category.description}
              projectId={category.projectId}
              placeholder="Describe this category: what do its pages have in common?"
              onChange={(description) => updateCategory(category.id, { description })}
              onHoverEntry={hover.onHover}
              onOpenEntry={openEntry}
              toolbar
              memoryKey={`category:${category.id}`}
            />
          </section>

          <section className="category-section">
            <h2 className="category-h2">Navbox</h2>
            <p className="hint">This box appears at the bottom of every page in the category.</p>
            <Navbox category={category} onOpenEntry={openEntry} />
          </section>

          <section className="category-section">
            <h2 className="category-h2">Pages in category “{category.name}”</h2>
            <p className="hint">
              The following {members.length} {members.length === 1 ? 'page is' : 'pages are'} in this category
              {missingCount > 0 && `; ${missingCount} ${missingCount === 1 ? 'has' : 'have'} no article yet and ${missingCount === 1 ? 'is' : 'are'} shown in red`}.
            </p>
            <div className="category-columns">
              {[...byLetter].map(([letter, list]) => (
                <div key={letter} className="category-letter">
                  <h3>{letter}</h3>
                  {list.map((ref) => (
                    <div key={ref} className="category-member">
                      {isMissing(ref) ? (
                        <RedLink name={memberName(ref, entries)} projectId={category.projectId} className="category-member-link" />
                      ) : (
                        <button className={`category-member-link t-${entries[ref].type}`} onClick={() => openEntry(ref)}>
                          <EntryAvatar entry={entries[ref]} size={20} />
                          {entries[ref].title || 'Untitled'}
                        </button>
                      )}
                      {category.groups.length > 0 && (
                        <select value={groupOf(ref)} onChange={(ev) => moveToGroup(ref, ev.target.value)} title="Navbox row">
                          <option value="">Other</option>
                          {category.groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="category-remove"
                        onClick={() => setEntryInCategory(category.id, ref, false)}
                        aria-label={`Remove ${memberName(ref, entries)} from the category`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="category-add-row">
              <input
                list={`category-candidates-${category.id}`}
                value={newMember}
                placeholder="Add a page: pick one, or type a name that has no article yet"
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMember()}
              />
              <datalist id={`category-candidates-${category.id}`}>
                {candidates.map((e) => (
                  <option key={e.id} value={e.title} />
                ))}
              </datalist>
              <button className="btn ghost sm" disabled={!newMember.trim()} onClick={addMember}>
                <Plus size={14} /> Add
              </button>
            </div>
          </section>

          <section className="category-section">
            <h2 className="category-h2">Navbox rows</h2>
            <p className="hint">
              Group pages into labelled rows. Without rows, the navbox groups pages by type (Characters, Locations…).
            </p>
            {category.groups.map((g) => (
              <div key={g.id} className="category-group-row">
                <input
                  value={g.label}
                  onChange={(e) =>
                    updateCategory(category.id, { groups: category.groups.map((x) => (x.id === g.id ? { ...x, label: e.target.value } : x)) })
                  }
                />
                <span className="muted small">{g.entryIds.length} pages</span>
                <button
                  className="icon-btn sm"
                  onClick={() => updateCategory(category.id, { groups: category.groups.filter((x) => x.id !== g.id) })}
                  aria-label={`Remove row ${g.label}`}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <div className="category-group-row">
              <input
                value={newGroup}
                placeholder="New row label"
                onChange={(e) => setNewGroup(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newGroup.trim()) {
                    updateCategory(category.id, { groups: [...category.groups, { id: uid(), label: newGroup.trim(), entryIds: [] }] });
                    setNewGroup('');
                  }
                }}
              />
              <button
                className="btn ghost sm"
                disabled={!newGroup.trim()}
                onClick={() => {
                  updateCategory(category.id, { groups: [...category.groups, { id: uid(), label: newGroup.trim(), entryIds: [] }] });
                  setNewGroup('');
                }}
              >
                <Plus size={14} /> Add row
              </button>
            </div>
          </section>

          <footer className="wiki-foot">
            <button
              className="btn danger-ghost sm"
              onClick={() => confirm(`Delete the category “${category.name}”? Its pages are kept.`) && deleteCategory(category.id)}
            >
              <Trash2 size={14} /> Delete category
            </button>
          </footer>
        </div>
      </div>
      {hover.card &&
        hoverEntry &&
        createPortal(
          <div
            className="floating-card"
            style={{ left: Math.min(hover.card.rect.left, window.innerWidth - 310), top: hover.card.rect.bottom + 8 }}
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
