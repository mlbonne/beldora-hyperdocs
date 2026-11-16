import type { JSONContent } from '@tiptap/react';

export const uid = () => crypto.randomUUID();

export const LINK_MARKS = ['wikiLink', 'dynamicLink'];

export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Reads an image file as a data URL, downscaling large photos so the local database stays small. */
export async function readImage(file: File, max = 1600): Promise<string> {
  const url = await readFileAsDataURL(file);
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return url;
  const img = await loadImage(url);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 500_000) return url;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.9);
}

export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}

/** All wiki entry ids linked anywhere inside a document. */
export function collectEntryIds(json: JSONContent | null | undefined, out = new Set<string>()): Set<string> {
  if (!json) return out;
  json.marks?.forEach((m) => {
    if (LINK_MARKS.includes(m.type) && m.attrs?.entryId) out.add(m.attrs.entryId);
  });
  json.content?.forEach((c) => collectEntryIds(c, out));
  return out;
}

type MarkJSON = NonNullable<JSONContent['marks']>[number];

/** Rewrites (or removes, by returning null) every mark in a document. */
export function transformMarks(json: JSONContent, fn: (mark: MarkJSON) => MarkJSON | null): JSONContent {
  const next: JSONContent = { ...json };
  if (json.marks) {
    const marks = json.marks.map(fn).filter((m): m is MarkJSON => m !== null);
    if (marks.length) next.marks = marks;
    else delete next.marks;
  }
  if (json.content) next.content = json.content.map((c) => transformMarks(c, fn));
  return next;
}

export function stripEntryMarks(json: JSONContent, entryId: string): JSONContent {
  return transformMarks(json, (m) => (LINK_MARKS.includes(m.type) && m.attrs?.entryId === entryId ? null : m));
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}'’-]+/gu)?.length ?? 0;
}

/** True when running inside the Tauri desktop shell. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Saves JSON via the native Save dialog on desktop, or as a browser download on the web. */
export async function downloadJSON(filename: string, data: unknown) {
  const text = JSON.stringify(data, null, 2);
  if (isDesktop) {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({ defaultPath: filename, filters: [{ name: 'HyperDocs project', extensions: ['json'] }] });
    if (path) await writeTextFile(path, text);
    return;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
