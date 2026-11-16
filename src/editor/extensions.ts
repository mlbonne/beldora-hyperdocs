import { getSchema, type Extensions } from '@tiptap/core';
import type { JSONContent } from '@tiptap/react';
import type { Schema } from '@tiptap/pm/model';
import { Node as PMNode } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { DynamicLink, WikiLink } from './marks';
import { Figure } from './Figure';
import { findMentions, markFor, type Term } from './mentions';

/** Every extension that defines the document format (the editor adds name detection on top). */
export function documentExtensions(placeholder = ''): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Placeholder.configure({ placeholder }),
    Typography,
    Underline,
    Highlight,
    Image.configure({ allowBase64: true }),
    Figure,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Superscript,
    Subscript,
    Table.configure({ resizable: true, HTMLAttributes: { class: 'wikitable' } }),
    TableRow,
    TableHeader,
    TableCell,
    WikiLink,
    DynamicLink,
  ];
}

let schema: Schema | null = null;
/** The document schema, for working on saved documents without an editor open. */
export function documentSchema(): Schema {
  return (schema ??= getSchema(documentExtensions()));
}

/** Links every unlinked mention of a wiki name in a saved document. */
export function linkNamesInDoc(json: JSONContent, terms: Term[]): { json: JSONContent; count: number } {
  const s = documentSchema();
  const doc = PMNode.fromJSON(s, json);
  const mentions = findMentions(doc, terms);
  if (!mentions.length) return { json, count: 0 };
  const tr = new Transform(doc);
  for (const m of mentions) tr.addMark(m.from, m.to, s.marks[markFor(m.type)].create({ entryId: m.entryId, type: m.type }));
  return { json: tr.doc.toJSON(), count: mentions.length };
}
