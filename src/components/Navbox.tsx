import { Fragment, useState } from 'react';
import { useStore } from '../store';
import type { Category, WikiEntry } from '../types';
import { ENTRY_TYPES, TYPE_META } from '../wikiTypes';
import { recall, remember } from '../viewMemory';
import { isMissing, missingName } from '../categoryRefs';
import { RedLink } from './RedLink';

interface Row {
  label: string;
  /** Entry ids, or red links for pages without an article. */
  refs: string[];
}

/** A category's rows: its labelled groups (plus the rest), or one row per entry type. */
export function navboxRows(category: Category, entries: Record<string, WikiEntry>): Row[] {
  const valid = (ref: string) => isMissing(ref) || !!entries[ref];
  const members = category.entryIds.filter(valid);
  if (category.groups.length) {
    const grouped = new Set(category.groups.flatMap((g) => g.entryIds));
    const rows = category.groups.map((g) => ({ label: g.label, refs: g.entryIds.filter(valid) }));
    const rest = members.filter((ref) => !grouped.has(ref));
    if (rest.length) rows.push({ label: 'Other', refs: rest });
    return rows.filter((r) => r.refs.length);
  }
  const rows = ENTRY_TYPES.map((t) => ({
    label: TYPE_META[t].plural,
    refs: members.filter((ref) => !isMissing(ref) && entries[ref].type === t),
  }));
  rows.push({ label: 'Other', refs: members.filter(isMissing) });
  return rows.filter((r) => r.refs.length);
}

/** The collapsible box at the foot of wiki pages, in the style of Fandom navboxes. */
export function Navbox({
  category,
  currentEntryId,
  onOpenEntry,
  onOpenCategory,
}: {
  category: Category;
  currentEntryId?: string;
  /** `newTab` is set for a middle click. */
  onOpenEntry: (id: string, newTab?: boolean) => void;
  onOpenCategory?: (id: string) => void;
}) {
  const entries = useStore((s) => s.entries);
  const memoryKey = `navbox:${category.id}#open`;
  const [open, setOpen] = useState(() => recall<boolean>(memoryKey) ?? true);
  const toggle = () => {
    remember(memoryKey, !open);
    setOpen(!open);
  };
  const rows = navboxRows(category, entries);

  return (
    <div className={`navbox ${open ? 'open' : ''}`}>
      <div className="navbox-title">
        <span />
        {onOpenCategory ? (
          <button className="navbox-name" onClick={() => onOpenCategory(category.id)}>
            {category.name}
          </button>
        ) : (
          <span className="navbox-name">{category.name}</span>
        )}
        <button className="navbox-toggle" onClick={toggle}>
          [{open ? 'Collapse' : 'Expand'}]
        </button>
      </div>
      {open && (
        <div className="navbox-rows">
          {rows.length === 0 && <div className="navbox-empty">No pages in this category yet.</div>}
          {rows.map((row) => (
            <div key={row.label} className="navbox-row">
              <div className="navbox-label">{row.label}</div>
              <div className="navbox-list">
                {row.refs.map((ref, i) => {
                  const e = entries[ref];
                  return (
                    <Fragment key={ref}>
                      {i > 0 && <span className="navbox-sep"> - </span>}
                      {isMissing(ref) ? (
                        <RedLink name={missingName(ref)} projectId={category.projectId} className="navbox-link" />
                      ) : ref === currentEntryId ? (
                        <strong className="navbox-current">{e.title}</strong>
                      ) : (
                        <button
                          className={`navbox-link t-${e.type}`}
                          onClick={() => onOpenEntry(e.id)}
                          onAuxClick={(ev) => ev.button === 1 && onOpenEntry(e.id, true)}
                        >
                          {e.title}
                        </button>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
