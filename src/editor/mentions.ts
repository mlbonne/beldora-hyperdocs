import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EntryType, WikiEntry } from '../types';

export interface Term {
  entryId: string;
  type: EntryType;
  term: string;
}

export interface Mention {
  from: number;
  to: number;
  entryId: string;
  type: EntryType;
}

export const mentionKey = new PluginKey<DecorationSet>('wikiMentions');

let compiled: { terms: Term[]; re: RegExp | null; byTerm: Map<string, Term> } | null = null;

function compile(terms: Term[]) {
  if (compiled?.terms === terms) return compiled;
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  const byTerm = new Map<string, Term>();
  for (const t of sorted) if (!byTerm.has(t.term)) byTerm.set(t.term, t);
  const escaped = [...byTerm.keys()].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Whole words only, case-sensitive: names are proper nouns.
  const re = escaped.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`, 'gu') : null;
  compiled = { terms, re, byTerm };
  return compiled;
}

/** Finds occurrences of wiki names that are not linked yet. */
export function findMentions(doc: PMNode, terms: Term[]): Mention[] {
  const { re, byTerm } = compile(terms);
  if (!re) return [];
  const dynamicMark = doc.type.schema.marks.dynamicLink;
  const out: Mention[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        const s = child.text!;
        const linked = child.marks.some((m) => m.type.name === 'wikiLink');
        text += linked ? '\u0000'.repeat(s.length) : s;
        for (let i = 0; i < s.length; i++) positions.push(start + i);
      } else {
        text += '\u0000';
        positions.push(start);
      }
    });
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const term = byTerm.get(m[0]);
      if (!term) continue;
      const from = positions[m.index];
      const to = positions[m.index + m[0].length - 1] + 1;
      if (term.type === 'dynamic' && dynamicMark && doc.rangeHasMark(from, to, dynamicMark)) continue;
      out.push({ from, to, entryId: term.entryId, type: term.type });
    }
    return false;
  });
  return out;
}

function build(doc: PMNode, terms: Term[]) {
  return DecorationSet.create(
    doc,
    findMentions(doc, terms).map((m) =>
      Decoration.inline(
        m.from,
        m.to,
        { class: 'wiki-suggest', 'data-suggest-id': m.entryId, 'data-type': m.type, spellcheck: 'false' },
        { entryId: m.entryId, type: m.type },
      ),
    ),
  );
}

/** Underlines names from the Wiki that appear in the text but aren't linked yet. */
export const WikiMentions = Extension.create<{ getTerms: () => Term[] }>({
  name: 'wikiMentions',
  addOptions() {
    return { getTerms: () => [] };
  },
  addProseMirrorPlugins() {
    const getTerms = this.options.getTerms;
    return [
      new Plugin({
        key: mentionKey,
        state: {
          init: (_, state) => build(state.doc, getTerms()),
          apply: (tr, old, _old, state) => (tr.docChanged || tr.getMeta(mentionKey) ? build(state.doc, getTerms()) : old),
        },
        props: {
          decorations: (state) => mentionKey.getState(state),
        },
      }),
    ];
  },
});

export function refreshMentions(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setMeta(mentionKey, true).setMeta('addToHistory', false));
}

export function getMentions(editor: Editor): Mention[] {
  const set = mentionKey.getState(editor.state);
  return (set?.find() ?? []).map((d) => ({ from: d.from, to: d.to, entryId: d.spec.entryId, type: d.spec.type }));
}

export function markFor(type: EntryType) {
  return type === 'dynamic' ? 'dynamicLink' : 'wikiLink';
}

/** Turns suggested mentions into real links. */
export function linkMentions(editor: Editor, mentions: Mention[]) {
  if (!mentions.length) return;
  const { tr, schema } = editor.state;
  for (const m of mentions) {
    tr.addMark(m.from, m.to, schema.marks[markFor(m.type)].create({ entryId: m.entryId, type: m.type }));
  }
  editor.view.dispatch(tr);
}

/** Every name (titles and nicknames) of a project's wiki entries, for detection. */
export function buildTerms(entries: WikiEntry[], projectId: string, excludeEntryId?: string): Term[] {
  const list: Term[] = [];
  for (const e of entries) {
    if (e.projectId !== projectId || e.id === excludeEntryId) continue;
    for (const name of [e.title, ...e.aliases]) {
      if (name.trim().length >= 2) list.push({ entryId: e.id, type: e.type, term: name.trim() });
    }
  }
  return list;
}
