import type { Category, WikiEntry } from './types';

/**
 * A category member is either an entry id or "?Name" for a page that has no article yet.
 * Those are shown as red links, and become real members once an article with that name exists.
 */
const MISSING = '?';

export const isMissing = (ref: string) => ref.startsWith(MISSING);
export const missingRef = (name: string) => MISSING + name.trim();
export const missingName = (ref: string) => ref.slice(MISSING.length);

export function memberName(ref: string, entries: Record<string, WikiEntry>): string {
  return isMissing(ref) ? missingName(ref) : (entries[ref]?.title ?? '');
}

/** The member ref for a typed name: the matching article (by title or nickname), or a red link. */
export function refForName(name: string, projectId: string, entries: Record<string, WikiEntry>): string {
  const n = name.trim().toLowerCase();
  const match = Object.values(entries).find(
    (e) => e.projectId === projectId && [e.title, ...e.aliases].some((x) => x.trim().toLowerCase() === n),
  );
  return match ? match.id : missingRef(name);
}

/** Rewrites every member ref of a category (members and navbox rows), dropping duplicates. */
export function mapMembers(c: Category, fn: (ref: string) => string): Category {
  const map = (refs: string[]) => [...new Set(refs.map(fn))];
  return { ...c, entryIds: map(c.entryIds), groups: c.groups.map((g) => ({ ...g, entryIds: map(g.entryIds) })) };
}

/** Red links whose name matches this entry's title or a nickname now point to it. */
export function resolveRedLinks(categories: Record<string, Category>, entry: WikiEntry): Record<string, Category> | null {
  const names = new Set([entry.title, ...entry.aliases].map((n) => n.trim().toLowerCase()).filter(Boolean));
  const matches = (ref: string) => isMissing(ref) && names.has(missingName(ref).trim().toLowerCase());
  let changed = false;
  const out = { ...categories };
  for (const c of Object.values(categories)) {
    if (c.projectId !== entry.projectId) continue;
    if (![...c.entryIds, ...c.groups.flatMap((g) => g.entryIds)].some(matches)) continue;
    out[c.id] = { ...mapMembers(c, (ref) => (matches(ref) ? entry.id : ref)), updatedAt: Date.now() };
    changed = true;
  }
  return changed ? out : null;
}
