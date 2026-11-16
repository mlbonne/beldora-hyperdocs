import type { JSONContent } from '@tiptap/react';
import { useStore } from '../store';
import type { InfoField, WikiEntry } from '../types';
import { uid } from '../utils';
import type { ExtractedEntry } from './gemini';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function findEntry(projectId: string, name: string): WikiEntry | undefined {
  if (!name.trim()) return undefined;
  return Object.values(useStore.getState().entries).find(
    (e) => e.projectId === projectId && [e.title, ...e.aliases].some((n) => same(n, name)),
  );
}

function newAliases(item: ExtractedEntry, title: string, current: string[]): string[] {
  const out: string[] = [];
  for (const a of [item.name, ...item.aliases]) {
    if (a.length < 2 || same(a, title) || [...current, ...out].some((c) => same(c, a))) continue;
    out.push(a);
  }
  return out;
}

/** Fills empty fields with the same label and appends fields that don't exist yet. */
function mergeFields(current: InfoField[], incoming: ExtractedEntry['fields']): { fields: InfoField[]; added: number } {
  const fields = current.map((f) => ({ ...f }));
  let added = 0;
  for (const { label, value } of incoming) {
    const match = fields.find((f) => same(f.label, label));
    if (match && !match.value.trim()) {
      match.value = value;
      added++;
    } else if (!match) {
      fields.push({ id: uid(), label, value });
      added++;
    }
  }
  return { fields, added };
}

function isBlankDoc(doc: JSONContent | null | undefined) {
  return !doc?.content?.some((n) => n.content?.length);
}

function articleDoc(text: string): JSONContent {
  return {
    type: 'doc',
    content: text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })),
  };
}

export interface Plan {
  /** Existing entry that will be updated, if any. */
  target?: WikiEntry;
  /** Human-readable list of what will change. */
  changes: string[];
}

/** What applying this item would do, without changing anything. */
export function planFor(projectId: string, item: ExtractedEntry): Plan {
  const target = findEntry(projectId, item.existing) ?? findEntry(projectId, item.name);
  if (!target) return { changes: [] };
  const changes: string[] = [];
  if (!target.summary.trim() && item.summary) changes.push('description');
  const { added } = mergeFields(target.fields, item.fields);
  if (added) changes.push(`${added} detail${added > 1 ? 's' : ''}`);
  const aliases = newAliases(item, target.title, target.aliases).length;
  if (aliases) changes.push(`${aliases} name${aliases > 1 ? 's' : ''}`);
  const firstText = target.tabs.find((t) => t.kind === 'text');
  if (item.article && firstText && isBlankDoc(firstText.content)) changes.push(firstText.title.toLowerCase());
  return { target, changes };
}

/** Creates new entries and fills gaps in existing ones. Returns the ids of every entry touched. */
export function applyExtraction(projectId: string, items: ExtractedEntry[]): string[] {
  const touched: string[] = [];
  // Dynamics last, so their participants exist by the time they are linked.
  const ordered = [...items.filter((i) => i.type !== 'dynamic'), ...items.filter((i) => i.type === 'dynamic')];

  for (const item of ordered) {
    const s = useStore.getState();
    const participants =
      item.type === 'dynamic'
        ? [...new Set(item.participants.map((p) => findEntry(projectId, p)?.id).filter((id): id is string => !!id))]
        : [];
    let entry = findEntry(projectId, item.existing) ?? findEntry(projectId, item.name);

    if (!entry) {
      entry = s.createEntry({ projectId, type: item.type, title: item.name, summary: item.summary, participants });
      s.updateEntry(entry.id, {
        aliases: newAliases(item, item.name, []),
        fields: mergeFields(entry.fields, item.fields).fields,
      });
    } else {
      s.updateEntry(entry.id, {
        summary: entry.summary.trim() ? entry.summary : item.summary,
        aliases: [...entry.aliases, ...newAliases(item, entry.title, entry.aliases)],
        fields: mergeFields(entry.fields, item.fields).fields,
        participants: [...new Set([...entry.participants, ...participants])],
      });
    }

    const firstText = useStore.getState().entries[entry.id].tabs.find((t) => t.kind === 'text');
    if (item.article && firstText && isBlankDoc(firstText.content)) {
      s.updateEntryTab(entry.id, firstText.id, { content: articleDoc(item.article) });
    }
    touched.push(entry.id);
  }
  return touched;
}
