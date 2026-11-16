import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Maximize2, Minimize2, Pin, PinOff, Sparkles, WandSparkles, X } from 'lucide-react';
import { useOpenPage, useStore } from '../store';
import { RichEditor, type EditorStats } from '../editor/RichEditor';
import { getMentions, linkMentions } from '../editor/mentions';
import { AutoTextarea } from './AutoTextarea';
import { useScrollMemory } from '../viewMemory';
import { EntryCard, useHoverCard } from './EntryCard';
import { ExtractDialog } from './ExtractDialog';

export function ChapterView({ chapterId }: { chapterId: string }) {
  const chapter = useStore((s) => s.chapters[chapterId]);
  const project = useStore((s) => (chapter ? s.projects[chapter.projectId] : undefined));
  const entries = useStore((s) => s.entries);
  const updateChapter = useStore((s) => s.updateChapter);
  const openTab = useStore((s) => s.openTab);
  const openPage = useOpenPage();
  const focusMode = useStore((s) => s.focusMode);
  const setFocusMode = useStore((s) => s.setFocusMode);

  const editorRef = useRef<Editor | null>(null);
  const [stats, setStats] = useState<EditorStats>({ words: 0, mentions: 0 });
  const [pinned, setPinned] = useState<string | null>(null);
  const [extractText, setExtractText] = useState<string | null>(null);
  const hover = useHoverCard();
  const scrollRef = useScrollMemory<HTMLDivElement>(`chapter:${chapterId}`);

  if (!chapter || !project) return <div className="empty-view">This chapter no longer exists.</div>;

  const index = project.chapterOrder.indexOf(chapterId) + 1;
  const openEntry = (id: string, inNewTab = false) => openPage({ kind: 'wiki', id }, inNewTab);
  const cardId = hover.card?.id ?? pinned;
  const cardEntry = cardId ? entries[cardId] : undefined;

  return (
    <div className="chapter-view">
      <div className="doc-toolbar">
        <div className="crumbs">
          <span>{project.name}</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-current">{chapter.title || `Chapter ${index}`}</span>
        </div>
        <div className="toolbar-actions">
          <span className="stat">{stats.words.toLocaleString()} words</span>
          {stats.mentions > 0 && (
            <button
              className="btn soft sm"
              onClick={() => editorRef.current && linkMentions(editorRef.current, getMentions(editorRef.current))}
              title="Link every unlinked name from the Wiki in this chapter"
            >
              <Sparkles size={14} /> Link {stats.mentions} {stats.mentions === 1 ? 'mention' : 'mentions'}
            </button>
          )}
          <button
            className="btn soft sm"
            onClick={() => editorRef.current && setExtractText(editorRef.current.getText({ blockSeparator: '\n\n' }))}
            disabled={stats.words === 0}
            title="Let Gemini find characters, places, items, concepts and relationships in this chapter"
          >
            <WandSparkles size={14} /> Extract wiki
          </button>
          <button className="icon-btn" onClick={() => setFocusMode(!focusMode)} title="Focus mode (Ctrl+Shift+F)">
            {focusMode ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </div>

      <div className="scroll" ref={scrollRef}>
        <article className="page chapter-page">
          <div className="eyebrow">Chapter {index}</div>
          <AutoTextarea
            className="chapter-title"
            value={chapter.title}
            placeholder="Untitled chapter"
            onChange={(title) => updateChapter(chapterId, { title })}
            onEnter={() => editorRef.current?.commands.focus('start')}
          />
          <div className="title-rule" />
          <RichEditor
            content={chapter.content}
            projectId={chapter.projectId}
            placeholder="Begin your chapter… Select a word and press Ctrl+K to give it a wiki page."
            onChange={(content) => updateChapter(chapterId, { content })}
            onReady={(ed) => (editorRef.current = ed)}
            onStats={setStats}
            onHoverEntry={hover.onHover}
            onOpenEntry={openEntry}
            toolbar
            memoryKey={`chapter:${chapterId}`}
          />
        </article>
      </div>

      {extractText !== null && (
        <ExtractDialog
          projectId={chapter.projectId}
          chapterTitle={chapter.title || `Chapter ${index}`}
          text={extractText}
          onClose={() => setExtractText(null)}
          onApplied={(ids, link) => {
            setExtractText(null);
            if (!link) return;
            // Wait for the editor to pick up the new names before linking them.
            setTimeout(() => {
              const ed = editorRef.current;
              if (ed && !ed.isDestroyed) linkMentions(ed, getMentions(ed).filter((m) => ids.includes(m.entryId)));
            }, 150);
          }}
        />
      )}

      <aside
        className={`codex-panel ${cardEntry ? 'open' : ''}`}
        onMouseEnter={hover.keep}
        onMouseLeave={hover.leave}
        aria-hidden={!cardEntry}
      >
        {cardEntry && (
          <>
            <div className="codex-actions">
              <button
                className="icon-btn sm"
                onClick={() => setPinned(pinned === cardEntry.id ? null : cardEntry.id)}
                title={pinned === cardEntry.id ? 'Unpin' : 'Keep this card open'}
              >
                {pinned === cardEntry.id ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              <button
                className="icon-btn sm"
                onClick={() => {
                  setPinned(null);
                  hover.close();
                }}
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
            <EntryCard
              entry={cardEntry}
              onOpen={() => openEntry(cardEntry.id)}
              onOpenNewTab={() => openEntry(cardEntry.id, true)}
            />
          </>
        )}
      </aside>
    </div>
  );
}
