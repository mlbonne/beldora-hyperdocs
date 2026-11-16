import { ArrowLeft, ArrowRight, BookOpen, FileText, LibraryBig, X } from 'lucide-react';
import { useStore } from '../store';
import { activeTab, currentPage, HOME_TAB_ID, withHome } from '../tabs';
import { HOME_TAB, type TabRef } from '../types';
import { TYPE_META } from '../wikiTypes';

export function TabBar() {
  const pid = useStore((s) => s.activeProjectId);
  const saved = useStore((s) => (pid ? s.tabs[pid] : undefined));
  const chapters = useStore((s) => s.chapters);
  const entries = useStore((s) => s.entries);
  const categories = useStore((s) => s.categories);
  const project = useStore((s) => (pid ? s.projects[pid] : undefined));
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const openTab = useStore((s) => s.openTab);
  const stepHistory = useStore((s) => s.stepHistory);

  const pt = withHome(saved);
  const active = activeTab(pt);

  const describe = (ref: TabRef): { label: string; icon: React.ReactNode; cls: string } => {
    if (ref.kind === 'home') return { label: 'Wiki', icon: <BookOpen size={14} />, cls: '' };
    if (ref.kind === 'chapter') {
      const n = (project?.chapterOrder.indexOf(ref.id) ?? 0) + 1;
      return { label: chapters[ref.id]?.title || `Chapter ${n}`, icon: <FileText size={14} />, cls: '' };
    }
    if (ref.kind === 'category') {
      return { label: categories[ref.id]?.name || 'Untitled category', icon: <LibraryBig size={14} />, cls: 'category' };
    }
    const e = entries[ref.id];
    if (!e) return { label: 'Missing page', icon: <FileText size={14} />, cls: '' };
    const Icon = TYPE_META[e.type].icon;
    return { label: e.title || 'Untitled', icon: <Icon size={14} />, cls: `t-${e.type} wiki` };
  };

  return (
    <div className="tabbar">
      <div className="tab-nav">
        <button
          className="icon-btn sm"
          disabled={active.index === 0}
          onClick={() => stepHistory(-1)}
          title="Back (Alt+←)"
          aria-label="Back"
        >
          <ArrowLeft size={15} />
        </button>
        <button
          className="icon-btn sm"
          disabled={active.index >= active.history.length - 1}
          onClick={() => stepHistory(1)}
          title="Forward (Alt+→)"
          aria-label="Forward"
        >
          <ArrowRight size={15} />
        </button>
      </div>
      {pt.tabs.map((tab) => {
        const page = currentPage(tab);
        const isHome = tab.id === HOME_TAB_ID;
        const { label, icon, cls } = describe(page);
        const browsing = isHome && page.kind !== 'home';
        return (
          <div
            key={tab.id}
            className={`tab ${isHome ? 'home' : cls} ${pt.active === tab.id ? 'active' : ''}`}
            // Clicking the Wiki tab while it shows another page goes back to the Wiki home.
            onClick={() => (isHome && pt.active === tab.id && browsing ? openTab(HOME_TAB) : setActiveTab(tab.id))}
            onAuxClick={(e) => e.button === 1 && !isHome && closeTab(tab.id)}
            title={isHome ? (browsing ? `${label}: click to return to the Wiki home` : `${project?.name ?? ''} Wiki`) : label}
          >
            <span className="tab-icon">{isHome ? <BookOpen size={14} /> : icon}</span>
            <span className="tab-label">
              {isHome ? (
                <>
                  Wiki
                  {browsing && <span className="tab-sub"> · {label}</span>}
                </>
              ) : (
                label
              )}
            </span>
            {!isHome && (
              <button
                className="tab-x"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label={`Close ${label}`}
              >
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
