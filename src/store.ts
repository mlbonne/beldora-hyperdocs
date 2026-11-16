import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type { JSONContent } from '@tiptap/react';
import { HOME_TAB, type Category, type CategoryGroup, type Chapter, type EntryType, type Project, type TabRef, type WikiEntry, type WikiTab } from './types';
import { TYPE_META } from './wikiTypes';
import { LINK_MARKS, stripEntryMarks, transformMarks, uid } from './utils';
import { forgetTab } from './viewMemory';
import * as Tabs from './tabs';
import { tabKey, type ProjectTabs } from './tabs';
import { mapMembers, missingRef, resolveRedLinks } from './categoryRefs';
import { DEFAULT_GEMINI_MODEL } from './ai/gemini';
import { KOOFR_DAV, type CloudAccount } from './cloud/webdav';

// Writes are debounced: the editor updates the store on every keystroke.
const pending = new Map<string, string>();
let flushTimer: number | undefined;
/** Writes any debounced changes now; resolves once they are on disk. */
export async function flush(): Promise<void> {
  window.clearTimeout(flushTimer);
  flushTimer = undefined;
  const writes = [...pending].map(([k, v]) => idbSet(k, v));
  pending.clear();
  await Promise.all(writes);
}
const idbStorage: StateStorage = {
  getItem: async (name) => (await idbGet<string>(name)) ?? null,
  setItem: (name, value) => {
    pending.set(name, value);
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(flush, 400);
  },
  removeItem: (name) => idbDel(name),
};
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
window.addEventListener('pagehide', () => flush());

export { tabKey, parseTabKey } from './tabs';

export interface NewEntryInput {
  projectId: string;
  type: EntryType;
  title: string;
  summary?: string;
  aliases?: string[];
  participants?: string[];
}

export interface ProjectExport {
  app: 'beldora-hyperdocs';
  version: 1;
  project: Project;
  chapters: Chapter[];
  entries: WikiEntry[];
  /** Absent in exports made before categories existed. */
  categories?: Category[];
}

export interface NewCategoryInput {
  projectId: string;
  name: string;
  description?: JSONContent | null;
  entryIds?: string[];
  groups?: CategoryGroup[];
  source?: Category['source'];
}

/** Removes a member from a category's list and its navbox rows. */
function withoutMember(c: Category, ref: string): Pick<Category, 'entryIds' | 'groups'> {
  return {
    entryIds: c.entryIds.filter((x) => x !== ref),
    groups: c.groups.map((g) => ({ ...g, entryIds: g.entryIds.filter((x) => x !== ref) })),
  };
}

interface State {
  projects: Record<string, Project>;
  chapters: Record<string, Chapter>;
  entries: Record<string, WikiEntry>;
  categories: Record<string, Category>;
  activeProjectId: string | null;
  tabs: Record<string, ProjectTabs>;
  theme: 'light' | 'dark';
  showSuggestions: boolean;
  spellcheck: boolean;
  focusMode: boolean;
  /** Stored only on this computer; never part of a project export. */
  geminiKey: string;
  geminiModel: string;
  /** Stored only on this computer, like the Gemini key. */
  cloudAccount: CloudAccount;
  /** Where each project is saved in the cloud. */
  cloudLinks: Record<string, CloudLink>;
  /** 0 turns autosave off. */
  autosaveMinutes: number;
  /** Bumped when a project is replaced wholesale (a load from the cloud), so open editors remount. */
  revision: number;

  createProject: (name?: string) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setActiveProject: (id: string) => void;

  createChapter: (projectId: string, title?: string, content?: JSONContent | null) => string;
  updateChapter: (id: string, patch: Partial<Chapter>) => void;
  deleteChapter: (id: string) => void;
  moveChapter: (projectId: string, id: string, beforeId: string | null) => void;

  createEntry: (input: NewEntryInput) => WikiEntry;
  updateEntry: (id: string, patch: Partial<WikiEntry>) => void;
  updateEntryTab: (entryId: string, tabId: string, patch: Partial<WikiTab>) => void;
  setEntryType: (id: string, type: EntryType) => void;
  deleteEntry: (id: string) => void;

  createCategory: (input: NewCategoryInput) => Category;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  setEntryInCategory: (categoryId: string, entryId: string, member: boolean) => void;
  /** Points every category member `from` (e.g. a red link) at `to` instead. */
  replaceCategoryMember: (projectId: string, from: string, to: string) => void;

  /** Shows a page in the current tab (see Tabs.navigate for the exceptions). */
  openTab: (ref: TabRef) => void;
  openInNewTab: (ref: TabRef) => void;
  /** Back (-1) or forward (+1) in the current tab's history. */
  stepHistory: (delta: number) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;

  setTheme: (theme: 'light' | 'dark') => void;
  setShowSuggestions: (on: boolean) => void;
  setSpellcheck: (on: boolean) => void;
  setGemini: (patch: { geminiKey?: string; geminiModel?: string }) => void;
  setFocusMode: (on: boolean) => void;

  setCloudAccount: (patch: Partial<CloudAccount>) => void;
  setCloudLink: (projectId: string, link: CloudLink | null) => void;
  setAutosaveMinutes: (minutes: number) => void;

  exportProject: (id: string) => ProjectExport;
  /** Adds the project, or replaces every chapter, entry and category of the one with the same id. */
  importProject: (data: ProjectExport) => void;
}

export interface CloudLink {
  /** Path of the project file below the WebDAV address. */
  path: string;
  /** The cloud file's version when it last matched this computer. */
  version: string;
  /** Hash of the project as last saved or loaded, to tell whether it changed since. */
  hash: string;
  syncedAt: number;
}

export function newTab(title: string, kind: WikiTab['kind'] = 'text'): WikiTab {
  return kind === 'text' ? { id: uid(), title, kind, content: null } : { id: uid(), title, kind, images: [] };
}

/** Applies fn to the content of every chapter and wiki tab of a project. */
function mapProjectDocs(
  s: Pick<State, 'chapters' | 'entries' | 'categories'>,
  projectId: string,
  fn: (json: JSONContent) => JSONContent,
) {
  const chapters = { ...s.chapters };
  for (const c of Object.values(chapters)) {
    if (c.projectId === projectId && c.content) chapters[c.id] = { ...c, content: fn(c.content) };
  }
  const entries = { ...s.entries };
  for (const e of Object.values(entries)) {
    if (e.projectId !== projectId) continue;
    entries[e.id] = { ...e, tabs: e.tabs.map((t) => (t.content ? { ...t, content: fn(t.content) } : t)) };
  }
  const categories = { ...s.categories };
  for (const c of Object.values(categories)) {
    if (c.projectId === projectId && c.description) categories[c.id] = { ...c, description: fn(c.description) };
  }
  return { chapters, entries, categories };
}

/** Applies a change to the active project's tabs. */
function updateTabs(s: Pick<State, 'tabs' | 'activeProjectId'>, fn: (pt: ProjectTabs) => ProjectTabs) {
  const pid = s.activeProjectId;
  if (!pid) return {};
  return { tabs: { ...s.tabs, [pid]: fn(Tabs.withHome(s.tabs[pid])) } };
}

/** A deleted page leaves every tab's history; tabs left with nothing close. */
function dropPage(ref: TabRef) {
  forgetTab(tabKey(ref));
  useStore.setState((s) => ({
    tabs: Object.fromEntries(Object.entries(s.tabs).map(([pid, pt]) => [pid, Tabs.dropPage(Tabs.withHome(pt), ref)])),
  }));
}

function withResolved(s: Pick<State, 'categories'>, entry: WikiEntry) {
  const categories = resolveRedLinks(s.categories, entry);
  return categories ? { categories } : {};
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      projects: {},
      chapters: {},
      entries: {},
      categories: {},
      activeProjectId: null,
      tabs: {},
      theme: 'light',
      showSuggestions: true,
      spellcheck: true,
      focusMode: false,
      geminiKey: '',
      geminiModel: DEFAULT_GEMINI_MODEL,
      cloudAccount: { server: KOOFR_DAV, email: '', password: '' },
      cloudLinks: {},
      autosaveMinutes: 5,
      revision: 0,

      createProject: (name = 'Untitled Project') => {
        const now = Date.now();
        const p: Project = { id: uid(), name, chapterOrder: [], createdAt: now, updatedAt: now };
        set((s) => ({
          projects: { ...s.projects, [p.id]: p },
          activeProjectId: p.id,
          tabs: { ...s.tabs, [p.id]: Tabs.withHome(undefined) },
        }));
        return p.id;
      },
      updateProject: (id, patch) =>
        set((s) => ({ projects: { ...s.projects, [id]: { ...s.projects[id], ...patch, updatedAt: Date.now() } } })),
      deleteProject: (id) =>
        set((s) => {
          const projects = { ...s.projects };
          delete projects[id];
          const tabs = { ...s.tabs };
          delete tabs[id];
          const cloudLinks = { ...s.cloudLinks };
          delete cloudLinks[id];
          return {
            projects,
            tabs,
            cloudLinks,
            chapters: Object.fromEntries(Object.entries(s.chapters).filter(([, c]) => c.projectId !== id)),
            entries: Object.fromEntries(Object.entries(s.entries).filter(([, e]) => e.projectId !== id)),
            categories: Object.fromEntries(Object.entries(s.categories).filter(([, c]) => c.projectId !== id)),
            activeProjectId: s.activeProjectId === id ? (Object.keys(projects)[0] ?? null) : s.activeProjectId,
          };
        }),
      setActiveProject: (id) => set({ activeProjectId: id }),

      createChapter: (projectId, title = '', content = null) => {
        const now = Date.now();
        const c: Chapter = { id: uid(), projectId, title, content, createdAt: now, updatedAt: now };
        set((s) => {
          const p = s.projects[projectId];
          return {
            chapters: { ...s.chapters, [c.id]: c },
            projects: { ...s.projects, [projectId]: { ...p, chapterOrder: [...p.chapterOrder, c.id] } },
          };
        });
        return c.id;
      },
      updateChapter: (id, patch) =>
        set((s) =>
          s.chapters[id] ? { chapters: { ...s.chapters, [id]: { ...s.chapters[id], ...patch, updatedAt: Date.now() } } } : {},
        ),
      deleteChapter: (id) => {
        const c = get().chapters[id];
        if (!c) return;
        dropPage({ kind: 'chapter', id });
        set((s) => {
          const chapters = { ...s.chapters };
          delete chapters[id];
          const p = s.projects[c.projectId];
          return {
            chapters,
            projects: { ...s.projects, [p.id]: { ...p, chapterOrder: p.chapterOrder.filter((x) => x !== id) } },
          };
        });
      },
      moveChapter: (projectId, id, beforeId) =>
        set((s) => {
          const p = s.projects[projectId];
          const order = p.chapterOrder.filter((x) => x !== id);
          const at = beforeId ? order.indexOf(beforeId) : -1;
          order.splice(at < 0 ? order.length : at, 0, id);
          return { projects: { ...s.projects, [projectId]: { ...p, chapterOrder: order } } };
        }),

      createEntry: ({ projectId, type, title, summary = '', aliases = [], participants = [] }) => {
        const meta = TYPE_META[type];
        const now = Date.now();
        const entry: WikiEntry = {
          id: uid(),
          projectId,
          type,
          title,
          aliases,
          summary,
          image: null,
          imageCaption: '',
          fields: meta.defaultFields.map((label) => ({ id: uid(), label, value: '' })),
          tabs: [...meta.defaultTabs.map((t) => newTab(t)), newTab('Gallery', 'gallery')],
          participants,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ entries: { ...s.entries, [entry.id]: entry }, ...withResolved(s, entry) }));
        return entry;
      },
      updateEntry: (id, patch) =>
        set((s) => {
          if (!s.entries[id]) return {};
          const entry = { ...s.entries[id], ...patch, updatedAt: Date.now() };
          // A new title or nickname may match a red link in a category.
          const renamed = 'title' in patch || 'aliases' in patch;
          return { entries: { ...s.entries, [id]: entry }, ...(renamed ? withResolved(s, entry) : {}) };
        }),
      updateEntryTab: (entryId, tabId, patch) =>
        set((s) => {
          const e = s.entries[entryId];
          if (!e) return {};
          const tabs = e.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t));
          return { entries: { ...s.entries, [entryId]: { ...e, tabs, updatedAt: Date.now() } } };
        }),
      setEntryType: (id, type) =>
        set((s) => {
          const e = s.entries[id];
          if (!e || e.type === type) return {};
          // Keep existing links in sync: colour comes from the mark's type, and dynamics use their own mark.
          const docs = mapProjectDocs(s, e.projectId, (json) =>
            transformMarks(json, (m) =>
              LINK_MARKS.includes(m.type) && m.attrs?.entryId === id
                ? { type: type === 'dynamic' ? 'dynamicLink' : 'wikiLink', attrs: { ...m.attrs, type } }
                : m,
            ),
          );
          docs.entries[id] = { ...docs.entries[id], type, updatedAt: Date.now() };
          return docs;
        }),
      deleteEntry: (id) => {
        const e = get().entries[id];
        if (!e) return;
        dropPage({ kind: 'wiki', id });
        set((s) => {
          const docs = mapProjectDocs(s, e.projectId, (json) => stripEntryMarks(json, id));
          delete docs.entries[id];
          for (const o of Object.values(docs.entries)) {
            if (o.participants.includes(id)) docs.entries[o.id] = { ...o, participants: o.participants.filter((p) => p !== id) };
          }
          // Like a deleted wiki page, it stays in its categories as a red link.
          for (const c of Object.values(docs.categories)) {
            const fromThisEntry = c.source?.entryId === id;
            if (c.entryIds.includes(id) || fromThisEntry) {
              const red = mapMembers(c, (ref) => (ref === id ? missingRef(e.title || 'Untitled') : ref));
              docs.categories[c.id] = { ...red, source: fromThisEntry ? undefined : c.source };
            }
          }
          return docs;
        });
      },

      createCategory: ({ projectId, name, description = null, entryIds = [], groups = [], source }) => {
        const now = Date.now();
        const category: Category = {
          id: uid(),
          projectId,
          name,
          description,
          entryIds: [...new Set(entryIds)],
          groups,
          source,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ categories: { ...s.categories, [category.id]: category } }));
        return category;
      },
      updateCategory: (id, patch) =>
        set((s) =>
          s.categories[id] ? { categories: { ...s.categories, [id]: { ...s.categories[id], ...patch, updatedAt: Date.now() } } } : {},
        ),
      deleteCategory: (id) => {
        dropPage({ kind: 'category', id });
        set((s) => {
          const categories = { ...s.categories };
          delete categories[id];
          return { categories };
        });
      },
      setEntryInCategory: (categoryId, entryId, member) =>
        set((s) => {
          const c = s.categories[categoryId];
          if (!c || c.entryIds.includes(entryId) === member) return {};
          const patch = member ? { entryIds: [...c.entryIds, entryId] } : withoutMember(c, entryId);
          return { categories: { ...s.categories, [categoryId]: { ...c, ...patch, updatedAt: Date.now() } } };
        }),

      replaceCategoryMember: (projectId, from, to) =>
        set((s) => {
          const categories = { ...s.categories };
          for (const c of Object.values(categories)) {
            if (c.projectId !== projectId || ![...c.entryIds, ...c.groups.flatMap((g) => g.entryIds)].includes(from)) continue;
            categories[c.id] = { ...mapMembers(c, (ref) => (ref === from ? to : ref)), updatedAt: Date.now() };
          }
          return { categories };
        }),

      openTab: (ref) => set((s) => updateTabs(s, (pt) => Tabs.navigate(pt, ref))),
      openInNewTab: (ref) => set((s) => updateTabs(s, (pt) => Tabs.openInNewTab(pt, ref))),
      stepHistory: (delta) => set((s) => updateTabs(s, (pt) => Tabs.step(pt, delta))),
      closeTab: (tabId) =>
        set((s) =>
          updateTabs(s, (pt) => {
            const closing = pt.tabs.find((t) => t.id === tabId);
            const next = Tabs.closeTab(pt, tabId);
            // Forget scroll and caret positions of pages no other tab can return to.
            const elsewhere = new Set(next.tabs.flatMap((t) => t.history.map(tabKey)));
            closing?.history.forEach((r) => elsewhere.has(tabKey(r)) || forgetTab(tabKey(r)));
            return next;
          }),
        ),
      setActiveTab: (tabId) => set((s) => updateTabs(s, (pt) => ({ ...pt, active: tabId }))),

      setTheme: (theme) => set({ theme }),
      setShowSuggestions: (showSuggestions) => set({ showSuggestions }),
      setSpellcheck: (spellcheck) => set({ spellcheck }),
      setGemini: (patch) => set(patch),
      setFocusMode: (focusMode) => set({ focusMode }),

      exportProject: (id) => {
        const s = get();
        const project = s.projects[id];
        return {
          app: 'beldora-hyperdocs',
          version: 1,
          project,
          chapters: project.chapterOrder.map((c) => s.chapters[c]).filter(Boolean),
          entries: Object.values(s.entries).filter((e) => e.projectId === id),
          categories: Object.values(s.categories).filter((c) => c.projectId === id),
        };
      },
      setCloudAccount: (patch) => set((s) => ({ cloudAccount: { ...s.cloudAccount, ...patch } })),
      setCloudLink: (projectId, link) =>
        set((s) => {
          const cloudLinks = { ...s.cloudLinks };
          if (link) cloudLinks[projectId] = link;
          else delete cloudLinks[projectId];
          return { cloudLinks };
        }),
      setAutosaveMinutes: (autosaveMinutes) => set({ autosaveMinutes }),

      importProject: (data) =>
        set((s) => {
          const pid = data.project.id;
          const others = <T extends { projectId: string }>(items: Record<string, T>) =>
            Object.fromEntries(Object.entries(items).filter(([, x]) => x.projectId !== pid));
          const chapters = { ...others(s.chapters), ...Object.fromEntries(data.chapters.map((c) => [c.id, c])) };
          const entries = { ...others(s.entries), ...Object.fromEntries(data.entries.map((e) => [e.id, e])) };
          const categories = { ...others(s.categories), ...Object.fromEntries((data.categories ?? []).map((c) => [c.id, c])) };
          // Pages that are gone after the replacement leave the tab histories.
          let pt = Tabs.withHome(s.tabs[pid]);
          for (const tab of pt.tabs)
            for (const ref of tab.history) {
              const gone =
                (ref.kind === 'chapter' && !chapters[ref.id]) ||
                (ref.kind === 'wiki' && !entries[ref.id]) ||
                (ref.kind === 'category' && !categories[ref.id]);
              if (gone) pt = Tabs.dropPage(pt, ref);
            }
          return {
            projects: { ...s.projects, [pid]: data.project },
            chapters,
            entries,
            categories,
            activeProjectId: pid,
            tabs: { ...s.tabs, [pid]: Tabs.withHome(pt) },
            revision: s.revision + 1,
          };
        }),
    }),
    {
      name: 'beldora-hyperdocs',
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as { tabs?: Record<string, unknown> };
        // Version 1 kept one page per tab and no history.
        if (version < 2 && state?.tabs) {
          state.tabs = Object.fromEntries(
            Object.entries(state.tabs).map(([pid, pt]) => [pid, Tabs.migrateTabs(pt as Parameters<typeof Tabs.migrateTabs>[0])]),
          );
        }
        return state as State;
      },
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        projects: s.projects,
        chapters: s.chapters,
        entries: s.entries,
        categories: s.categories,
        activeProjectId: s.activeProjectId,
        tabs: s.tabs,
        theme: s.theme,
        showSuggestions: s.showSuggestions,
        spellcheck: s.spellcheck,
        geminiKey: s.geminiKey,
        geminiModel: s.geminiModel,
        cloudAccount: s.cloudAccount,
        cloudLinks: s.cloudLinks,
        autosaveMinutes: s.autosaveMinutes,
      }),
    },
  ),
);

export function useActiveProjectId() {
  return useStore((s) => s.activeProjectId);
}

/** The page shown by the active tab of the active project. */
export function useCurrentPage(): TabRef | null {
  return useStore((s) => {
    const pid = s.activeProjectId;
    if (!pid) return null;
    return Tabs.currentPage(Tabs.activeTab(Tabs.withHome(s.tabs[pid])));
  });
}

/** Opens a page in the current tab, or in a new tab when `newTab` is set. */
export function useOpenPage() {
  const openTab = useStore((s) => s.openTab);
  const openInNewTab = useStore((s) => s.openInNewTab);
  return (ref: TabRef, newTab = false) => (newTab ? openInNewTab(ref) : openTab(ref));
}
