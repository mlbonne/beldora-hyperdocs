import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BubbleMenu, EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import {
  Bold,
  BookPlus,
  ExternalLink,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
  Unlink,
} from 'lucide-react';
import type { Transaction } from '@tiptap/pm/state';
import { documentExtensions } from './extensions';
import { FormatToolbar } from './FormatToolbar';
import { buildTerms, getMentions, linkMentions, markFor, mentionKey, refreshMentions, WikiMentions, type Mention, type Term } from './mentions';
import { useStore } from '../store';
import { countWords, imageFiles, readImage } from '../utils';
import { recall, remember } from '../viewMemory';
import { CreateEntryDialog, type DialogResult } from '../components/CreateEntryDialog';
import { EntryAvatar } from '../components/EntryAvatar';

export interface EditorStats {
  words: number;
  mentions: number;
}

interface Props {
  content: JSONContent | null | undefined;
  onChange: (json: JSONContent) => void;
  projectId: string;
  placeholder?: string;
  className?: string;
  /** Don't suggest links to this entry (used on the entry's own wiki page). */
  excludeEntryId?: string;
  onHoverEntry?: (id: string | null, rect: DOMRect | null) => void;
  /** `newTab` is set for Ctrl/Cmd-click and middle-click. */
  onOpenEntry: (id: string, newTab?: boolean) => void;
  onReady?: (editor: Editor) => void;
  onStats?: (stats: EditorStats) => void;
  /** Show the formatting toolbar above the text. */
  toolbar?: boolean;
  /** Remembers the caret under this key while the tab stays open. */
  memoryKey?: string;
}

interface DialogState {
  from: number;
  to: number;
  text: string;
  participants: string[];
}

interface SuggestState extends Mention {
  rect: DOMRect;
}

export function RichEditor({
  content,
  onChange,
  projectId,
  placeholder = 'Start writing…',
  className,
  excludeEntryId,
  onHoverEntry,
  onOpenEntry,
  onReady,
  onStats,
  toolbar = false,
  memoryKey,
}: Props) {
  const entries = useStore((s) => s.entries);
  const showSuggestions = useStore((s) => s.showSuggestions);
  const updateEntry = useStore((s) => s.updateEntry);
  const spellcheck = useStore((s) => s.spellcheck);

  const terms = useMemo<Term[]>(
    () => (showSuggestions ? buildTerms(Object.values(entries), projectId, excludeEntryId) : []),
    [entries, projectId, showSuggestions, excludeEntryId],
  );

  const termsRef = useRef(terms);
  termsRef.current = terms;
  const callbacks = useRef({ onChange, onStats, onHoverEntry });
  callbacks.current = { onChange, onStats, onHoverEntry };
  const openDialogRef = useRef<() => void>(() => {});
  const dialogOpen = useRef(false);

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const hoverEl = useRef<HTMLElement | null>(null);
  dialogOpen.current = !!dialog;

  const editor = useEditor({
    extensions: [...documentExtensions(placeholder), WikiMentions.configure({ getTerms: () => termsRef.current })],
    content: content ?? '',
    editorProps: {
      attributes: { class: 'prose-doc', spellcheck: String(spellcheck) },
      handleKeyDown: (view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !view.state.selection.empty) {
          openDialogRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length) return false;
        insertImages(files, view.state.selection.from);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = imageFiles(event.dataTransfer?.files);
        if (moved || !files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        insertImages(files, pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => callbacks.current.onChange(editor.getJSON()),
  });

  async function insertImages(files: File[], pos: number) {
    for (const file of files) {
      const src = await readImage(file);
      editor?.chain().focus().insertFigure({ src }, pos).run();
    }
  }

  useEffect(() => {
    if (!editor) return;
    onReady?.(editor);
    // Put the caret back where it was before switching tabs (without scrolling; the view restores that).
    const caretKey = memoryKey && `${memoryKey}#caret`;
    const saved = caretKey ? recall<{ from: number; to: number; focused: boolean }>(caretKey) : undefined;
    if (saved) {
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(saved.from, max), to: Math.min(saved.to, max) });
      if (saved.focused) editor.view.focus();
    }
    const saveCaret = (focused = editor.isFocused) =>
      caretKey && remember(caretKey, { from: editor.state.selection.from, to: editor.state.selection.to, focused });
    const onSelection = () => saveCaret();
    // Clicking a tab or the sidebar blurs the editor on the way out; only another field
    // taking focus (relatedTarget) means the writer really left the text.
    const onBlur = ({ event }: { event: FocusEvent }) => saveCaret(!event.relatedTarget);
    editor.on('selectionUpdate', onSelection);
    editor.on('focus', onSelection);
    editor.on('blur', onBlur);
    const emit = () =>
      callbacks.current.onStats?.({
        words: countWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')),
        mentions: getMentions(editor).length,
      });
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.docChanged || transaction.getMeta(mentionKey)) emit();
      if (transaction.docChanged) setSuggest(null);
    };
    editor.on('transaction', onTransaction);
    emit();
    return () => {
      editor.off('transaction', onTransaction);
      editor.off('selectionUpdate', onSelection);
      editor.off('focus', onSelection);
      editor.off('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: { ...editor.options.editorProps, attributes: { class: 'prose-doc', spellcheck: String(spellcheck) } },
    });
  }, [editor, spellcheck]);

  // Re-scan for names whenever the Wiki changes.
  useEffect(() => {
    if (editor && !editor.isDestroyed) refreshMentions(editor);
  }, [editor, terms]);

  openDialogRef.current = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, ' ').trim();
    const ids = new Set<string>();
    editor.state.doc.nodesBetween(from, to, (node) => {
      node.marks.forEach((m) => m.type.name === 'wikiLink' && m.attrs.entryId && ids.add(m.attrs.entryId));
    });
    getMentions(editor).forEach((m) => m.from >= from && m.to <= to && ids.add(m.entryId));
    const state = useStore.getState().entries;
    setDialog({
      from,
      to,
      text,
      participants: [...ids].filter((id) => state[id] && state[id].type !== 'dynamic'),
    });
  };

  const onDialogDone = ({ entry, open, linkedExisting }: DialogResult) => {
    const d = dialog;
    setDialog(null);
    if (!d || !editor) return;
    if (entry.type === 'dynamic') {
      // Link the participants' names inside the selection too.
      linkMentions(editor, getMentions(editor).filter((m) => m.from >= d.from && m.to <= d.to && m.type !== 'dynamic'));
    }
    editor
      .chain()
      .focus()
      .setTextSelection({ from: d.from, to: d.to })
      .setMark(markFor(entry.type), { entryId: entry.id, type: entry.type })
      .setTextSelection(d.to)
      .run();
    const text = d.text;
    const known = [entry.title, ...entry.aliases].some((n) => n.toLowerCase() === text.toLowerCase());
    if (linkedExisting && text && !known && text.length <= 60) {
      // Remember this spelling so it's detected next time.
      updateEntry(entry.id, { aliases: [...entry.aliases, text] });
    }
    if (open) onOpenEntry(entry.id);
  };

  const onMouseOver = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-entry-id],[data-suggest-id]');
    if (el === hoverEl.current) return;
    hoverEl.current = el;
    const id = el ? (el.dataset.entryId ?? el.dataset.suggestId ?? null) : null;
    callbacks.current.onHoverEntry?.(id, el ? el.getBoundingClientRect() : null);
  };

  const onMouseLeave = () => {
    hoverEl.current = null;
    callbacks.current.onHoverEntry?.(null, null);
  };

  const onAuxClick = (e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest<HTMLElement>('[data-entry-id]');
    if (link && e.button === 1) {
      e.preventDefault();
      onOpenEntry(link.dataset.entryId!, true);
    }
  };

  const onClick = (e: React.MouseEvent) => {
    if (!editor) return;
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLElement>('[data-entry-id]');
    if (link && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onOpenEntry(link.dataset.entryId!, true);
      return;
    }
    const sug = target.closest<HTMLElement>('.wiki-suggest');
    if (sug && editor.state.selection.empty) {
      const pos = editor.view.posAtDOM(sug, 0);
      const deco = mentionKey.getState(editor.state)?.find(pos, pos + 1)[0];
      if (deco) {
        setSuggest({ from: deco.from, to: deco.to, entryId: deco.spec.entryId, type: deco.spec.type, rect: sug.getBoundingClientRect() });
      }
    }
  };

  const linkedId: string | undefined = editor?.getAttributes('wikiLink').entryId ?? editor?.getAttributes('dynamicLink').entryId;

  const btn = (active: boolean, onPress: () => void, icon: React.ReactNode, label: string) => (
    <button className={active ? 'on' : ''} onClick={onPress} title={label} aria-label={label}>
      {icon}
    </button>
  );

  return (
    <>
      <div className={`rich-editor ${className ?? ''}`} onMouseOver={onMouseOver} onMouseLeave={onMouseLeave} onClick={onClick} onAuxClick={onAuxClick}>
        {editor && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{ duration: 120, maxWidth: 'none', zIndex: 40 }}
            shouldShow={({ state, editor: ed }) =>
              !dialogOpen.current && !state.selection.empty && !ed.isActive('image') && !ed.isActive('figure')
            }
          >
            <div className="bubble" onMouseDown={(e) => e.preventDefault()}>
              {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold size={15} />, 'Bold')}
              {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic size={15} />, 'Italic')}
              {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <UnderlineIcon size={15} />, 'Underline')}
              {btn(editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <Strikethrough size={15} />, 'Strikethrough')}
              {btn(editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight().run(), <Highlighter size={15} />, 'Highlight')}
              <span className="bubble-sep" />
              {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={15} />, 'Heading')}
              {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 size={15} />, 'Subheading')}
              {btn(editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), <Quote size={15} />, 'Quote')}
              <span className="bubble-sep" />
              {linkedId ? (
                <>
                  {btn(false, () => onOpenEntry(linkedId), <ExternalLink size={15} />, 'Open wiki page')}
                  {btn(
                    false,
                    () => editor.chain().focus().unsetMark('wikiLink').unsetMark('dynamicLink').run(),
                    <Unlink size={15} />,
                    'Remove wiki link',
                  )}
                </>
              ) : null}
              <button className="bubble-wiki" onClick={() => openDialogRef.current()} title="Create wiki entry (Ctrl+K)">
                <BookPlus size={15} /> Wiki
              </button>
            </div>
          </BubbleMenu>
        )}
        {toolbar && <FormatToolbar editor={editor} onWiki={() => openDialogRef.current()} />}
        <EditorContent editor={editor} />
      </div>

      {suggest && entries[suggest.entryId] && editor && (
        <SuggestPopover
          suggest={suggest}
          total={getMentions(editor).filter((m) => m.entryId === suggest.entryId).length}
          onLink={(all) => {
            linkMentions(editor, all ? getMentions(editor).filter((m) => m.entryId === suggest.entryId) : [suggest]);
            setSuggest(null);
          }}
          onClose={() => setSuggest(null)}
        />
      )}

      {dialog && (
        <CreateEntryDialog
          projectId={projectId}
          initialText={dialog.text}
          initialParticipants={dialog.participants}
          allowExisting
          onDone={onDialogDone}
          onClose={() => {
            setDialog(null);
            editor?.commands.focus();
          }}
        />
      )}
    </>
  );
}

function SuggestPopover({
  suggest,
  total,
  onLink,
  onClose,
}: {
  suggest: SuggestState;
  total: number;
  onLink: (all: boolean) => void;
  onClose: () => void;
}) {
  const entry = useStore((s) => s.entries[suggest.entryId]);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close.current();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, []);

  const left = Math.min(Math.max(8, suggest.rect.left), window.innerWidth - 300);
  return createPortal(
    <div ref={ref} className="suggest-popover" style={{ left, top: suggest.rect.bottom + 8 }}>
      <div className="suggest-title">
        <EntryAvatar entry={entry} size={22} />
        <span>
          Link to <strong>{entry.title}</strong>?
        </span>
      </div>
      <div className="suggest-actions">
        <button className="btn primary sm" onClick={() => onLink(false)}>
          Link this
        </button>
        {total > 1 && (
          <button className="btn ghost sm" onClick={() => onLink(true)}>
            Link all {total}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
