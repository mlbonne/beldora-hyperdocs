import type { JSONContent } from '@tiptap/react';
import { useStore } from './store';
import type { CategoryGroup } from './types';
import { buildTerms } from './editor/mentions';
import { linkNamesInDoc } from './editor/extensions';
import { LINK_MARKS, uid } from './utils';
import { isMissing } from './categoryRefs';

/** Links every unlinked wiki name in all of a project's wiki pages and category descriptions. */
export function linkNamesInWiki(projectId: string): { links: number; pages: number } {
  const s = useStore.getState();
  const all = Object.values(s.entries);
  let links = 0;
  let pages = 0;
  for (const entry of all.filter((e) => e.projectId === projectId)) {
    // A page never links to itself.
    const terms = buildTerms(all, projectId, entry.id);
    let changed = false;
    const tabs = entry.tabs.map((t) => {
      if (!t.content) return t;
      const result = linkNamesInDoc(t.content, terms);
      if (!result.count) return t;
      links += result.count;
      changed = true;
      return { ...t, content: result.json };
    });
    if (changed) {
      pages++;
      s.updateEntry(entry.id, { tabs });
    }
  }
  const terms = buildTerms(all, projectId);
  for (const c of Object.values(s.categories)) {
    if (c.projectId !== projectId || !c.description) continue;
    const result = linkNamesInDoc(c.description, terms);
    if (!result.count) continue;
    links += result.count;
    pages++;
    s.updateCategory(c.id, { description: result.json });
  }
  return { links, pages };
}

const isList = (n: JSONContent) => n.type === 'bulletList' || n.type === 'orderedList';
const filler = /^[\s,;:·•\-–—/|.()]*$/;

/** Entry ids of a paragraph made only of wiki links (separators allowed), or null if it has other text. */
function linksOnly(paragraph: JSONContent | undefined): string[] | null {
  if (!paragraph?.content?.length) return null;
  const ids: string[] = [];
  for (const node of paragraph.content) {
    if (node.type !== 'text') continue;
    const link = node.marks?.find((m) => LINK_MARKS.includes(m.type) && m.attrs?.entryId);
    if (link) ids.push(link.attrs!.entryId);
    else if (!filler.test(node.text ?? '')) return null;
  }
  return ids.length ? [...new Set(ids)] : null;
}

function plainText(node: JSONContent | undefined): string {
  return (node?.content ?? []).map((n) => n.text ?? '').join('').trim();
}

export interface TabCategory {
  /** Member refs: entry ids, or red links for names without an article. */
  entryIds: string[];
  groups: CategoryGroup[];
  /** The tab's content without the list: becomes the category's description. */
  description: JSONContent;
  /** How many members have no article yet. */
  missing: number;
}

/**
 * Reads a tab as a category from its first list. Linked names are members; plain names become red
 * links (or match an article by name). An item that is a plain label with a nested list becomes a
 * labelled navbox row (like "Fool: Orpheus - Arsène").
 */
export function readTabAsCategory(
  doc: JSONContent | null | undefined,
  refForName: (name: string) => string,
): TabCategory | null {
  const blocks = doc?.content ?? [];
  const listIndex = blocks.findIndex(isList);
  if (listIndex < 0) return null;

  const entryIds: string[] = [];
  const groups: CategoryGroup[] = [];
  const add = (refs: string[]) => refs.forEach((r) => entryIds.includes(r) || entryIds.push(r));
  // A list item as member refs: its links, or its text as one name.
  const itemRefs = (paragraph: JSONContent | undefined): string[] => {
    const links = linksOnly(paragraph);
    if (links) return links;
    const name = plainText(paragraph).replace(/[.,;:]+$/, '').trim();
    return name ? [refForName(name)] : [];
  };

  for (const item of blocks[listIndex].content ?? []) {
    const [first, ...rest] = item.content ?? [];
    const nested = rest.find(isList);
    const isLabel = nested && !linksOnly(first) && plainText(first);
    if (isLabel) {
      const groupRefs: string[] = [];
      for (const sub of nested.content ?? []) {
        for (const r of itemRefs(sub.content?.[0])) if (!groupRefs.includes(r)) groupRefs.push(r);
      }
      if (groupRefs.length) {
        groups.push({ id: uid(), label: plainText(first), entryIds: groupRefs });
        add(groupRefs);
      }
      continue;
    }
    add(itemRefs(first));
    // Names nested under a member belong to the category too.
    for (const sub of nested?.content ?? []) add(itemRefs(sub.content?.[0]));
  }
  if (!entryIds.length) return null;
  return {
    entryIds,
    groups,
    description: { type: 'doc', content: blocks.filter((_, i) => i !== listIndex) },
    missing: entryIds.filter(isMissing).length,
  };
}
