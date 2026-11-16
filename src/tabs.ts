import { HOME_TAB, type TabRef } from './types';
import { uid } from './utils';

/** A tab works like a browser tab: it shows one page and remembers where it has been. */
export interface BrowserTab {
  id: string;
  history: TabRef[];
  index: number;
}

export interface ProjectTabs {
  /** The first tab is always the Wiki tab. */
  tabs: BrowserTab[];
  /** Id of the active tab. */
  active: string;
}

export const HOME_TAB_ID = 'home';
const MAX_HISTORY = 50;

export const tabKey = (t: TabRef) => `${t.kind}:${t.id}`;
export function parseTabKey(key: string): TabRef {
  const i = key.indexOf(':');
  return { kind: key.slice(0, i) as TabRef['kind'], id: key.slice(i + 1) };
}

const same = (a: TabRef, b: TabRef) => a.kind === b.kind && a.id === b.id;
export const currentPage = (t: BrowserTab) => t.history[t.index];
const homeTab = (): BrowserTab => ({ id: HOME_TAB_ID, history: [HOME_TAB], index: 0 });

/** Valid tabs for a project, with the Wiki tab first. */
export function withHome(pt: ProjectTabs | undefined): ProjectTabs {
  if (pt?.tabs?.[0]?.id === HOME_TAB_ID) return pt;
  return { tabs: [homeTab(), ...(pt?.tabs ?? []).filter((t) => t.id !== HOME_TAB_ID)], active: pt?.active ?? HOME_TAB_ID };
}

export function activeTab(pt: ProjectTabs): BrowserTab {
  return pt.tabs.find((t) => t.id === pt.active) ?? pt.tabs[0];
}

function push(pt: ProjectTabs, tab: BrowserTab, ref: TabRef): ProjectTabs {
  if (same(currentPage(tab), ref)) return { ...pt, active: tab.id };
  const history = [...tab.history.slice(0, tab.index + 1), ref].slice(-MAX_HISTORY);
  return {
    tabs: pt.tabs.map((t) => (t.id === tab.id ? { ...t, history, index: history.length - 1 } : t)),
    active: tab.id,
  };
}

export function openInNewTab(pt: ProjectTabs, ref: TabRef): ProjectTabs {
  const tab: BrowserTab = { id: uid(), history: [ref], index: 0 };
  const at = pt.tabs.findIndex((t) => t.id === pt.active);
  const tabs = [...pt.tabs];
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab);
  return { tabs, active: tab.id };
}

/**
 * Shows a page in the current tab, adding it to that tab's history. Exceptions: the Wiki home
 * always opens in the Wiki tab, and a chapter switches to the tab already showing it (or gets
 * its own tab when coming from the Wiki tab).
 */
export function navigate(pt: ProjectTabs, ref: TabRef): ProjectTabs {
  if (ref.kind === 'home') return push(pt, pt.tabs[0], ref);
  const tab = activeTab(pt);
  if (ref.kind === 'chapter') {
    const showing = pt.tabs.find((t) => same(currentPage(t), ref));
    if (showing) return { ...pt, active: showing.id };
    if (tab.id === HOME_TAB_ID) return openInNewTab(pt, ref);
  }
  return push(pt, tab, ref);
}

/** Back (-1) or forward (+1) in the active tab. */
export function step(pt: ProjectTabs, delta: number): ProjectTabs {
  const tab = activeTab(pt);
  const index = tab.index + delta;
  if (index < 0 || index >= tab.history.length) return pt;
  return { ...pt, tabs: pt.tabs.map((t) => (t.id === tab.id ? { ...t, index } : t)) };
}

export function closeTab(pt: ProjectTabs, tabId: string): ProjectTabs {
  if (tabId === HOME_TAB_ID) return pt;
  const at = pt.tabs.findIndex((t) => t.id === tabId);
  if (at < 0) return pt;
  const tabs = pt.tabs.filter((t) => t.id !== tabId);
  const active = pt.active === tabId ? (tabs[at] ?? tabs[at - 1] ?? tabs[0]).id : pt.active;
  return { tabs, active };
}

/** Removes a deleted page from every history; tabs left with nothing to show close. */
export function dropPage(pt: ProjectTabs, ref: TabRef): ProjectTabs {
  if (!pt.tabs.some((t) => t.history.some((r) => same(r, ref)))) return pt;
  const tabs: BrowserTab[] = [];
  for (const tab of pt.tabs) {
    const history: TabRef[] = [];
    let index = 0;
    tab.history.forEach((r, i) => {
      const keep = !same(r, ref) && !(history.length && same(history[history.length - 1], r));
      if (keep) history.push(r);
      if (i <= tab.index) index = Math.max(0, history.length - 1);
    });
    if (history.length) tabs.push({ ...tab, history, index });
    else if (tab.id === HOME_TAB_ID) tabs.push(homeTab());
  }
  const stillThere = tabs.some((t) => t.id === pt.active);
  const at = pt.tabs.findIndex((t) => t.id === pt.active);
  return { tabs, active: stillThere ? pt.active : (tabs[Math.min(at, tabs.length - 1)] ?? tabs[0]).id };
}

/** Converts the tabs saved by earlier versions (one page per tab, no history). */
export function migrateTabs(old: { tabs?: TabRef[]; active?: string | null } | undefined): ProjectTabs {
  const pages = (old?.tabs ?? []).filter((r) => r.kind !== 'home');
  const tabs = pages.map((r) => ({ id: uid(), history: [r], index: 0 }));
  const activeAt = pages.findIndex((r) => tabKey(r) === old?.active);
  return { tabs: [homeTab(), ...tabs], active: activeAt >= 0 ? tabs[activeAt].id : HOME_TAB_ID };
}
