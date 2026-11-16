import { useEffect, useState } from 'react';
import { useCurrentPage, useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { ChapterView } from './components/ChapterView';
import { WikiView } from './components/WikiView';
import { WikiHome } from './components/WikiHome';
import { CategoryView } from './components/CategoryView';
import { seedDemoProject } from './seed';
import { useCloudAutosave } from './cloud/sync';

function useHydrated() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useStore.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}

export default function App() {
  const hydrated = useHydrated();
  const theme = useStore((s) => s.theme);
  const focusMode = useStore((s) => s.focusMode);
  const setFocusMode = useStore((s) => s.setFocusMode);
  useCloudAutosave(hydrated);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!hydrated) return;
    const s = useStore.getState();
    if (!Object.keys(s.projects).length) seedDemoProject();
    else if (!s.activeProjectId || !s.projects[s.activeProjectId]) s.setActiveProject(Object.keys(s.projects)[0]);
  }, [hydrated]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFocusMode(!useStore.getState().focusMode);
      }
      // Alt+← / Alt+→ move through the current tab's history, like a browser.
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        useStore.getState().stepHistory(e.key === 'ArrowLeft' ? -1 : 1);
      }
      if (e.key === 'Escape' && useStore.getState().focusMode && !document.querySelector('.modal, .lightbox')) setFocusMode(false);
    };
    // The mouse's back and forward side buttons.
    const mouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      useStore.getState().stepHistory(e.button === 3 ? -1 : 1);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('mouseup', mouse);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('mouseup', mouse);
    };
  }, [setFocusMode]);

  if (!hydrated) return <div className="boot" />;

  return (
    <div className={`app ${focusMode ? 'focus' : ''}`}>
      <Sidebar />
      <main className="main">
        <TabBar />
        <Workspace />
      </main>
    </div>
  );
}

function Workspace() {
  const pid = useStore((s) => s.activeProjectId);
  const ref = useCurrentPage();
  const chapters = useStore((s) => s.chapters);
  const entries = useStore((s) => s.entries);
  const categories = useStore((s) => s.categories);
  // Editors read their content once, so a project loaded from the cloud remounts them.
  const revision = useStore((s) => s.revision);

  if (ref?.kind === 'chapter' && chapters[ref.id]) return <ChapterView key={`${ref.id}@${revision}`} chapterId={ref.id} />;
  if (ref?.kind === 'wiki' && entries[ref.id]) return <WikiView key={`${ref.id}@${revision}`} entryId={ref.id} />;
  if (ref?.kind === 'category' && categories[ref.id]) return <CategoryView key={`${ref.id}@${revision}`} categoryId={ref.id} />;
  if (!pid) return <div className="empty-view" />;
  // The Wiki home is the fixed first tab, and also what shows when nothing else is open.
  return <WikiHome key={`${pid}@${revision}`} projectId={pid} />;
}
