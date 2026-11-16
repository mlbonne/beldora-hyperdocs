import { useEffect, useReducer } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  BookPlus,
  Columns3,
  Highlighter,
  ImagePlus,
  Italic,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Minus,
  Redo2,
  RemoveFormatting,
  Rows3,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { imageFiles, readImage } from '../utils';

type BlockStyle = 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'code';

function currentBlock(editor: Editor): BlockStyle {
  if (editor.isActive('heading', { level: 1 })) return 'h1';
  if (editor.isActive('heading', { level: 2 })) return 'h2';
  if (editor.isActive('heading', { level: 3 })) return 'h3';
  if (editor.isActive('codeBlock')) return 'code';
  if (editor.isActive('blockquote')) return 'quote';
  return 'p';
}

function setBlock(editor: Editor, style: BlockStyle) {
  const chain = editor.chain().focus();
  if (editor.isActive('blockquote') && style !== 'quote') chain.lift('blockquote');
  switch (style) {
    case 'p':
      chain.setParagraph();
      break;
    case 'h1':
    case 'h2':
    case 'h3':
      chain.setHeading({ level: Number(style[1]) as 1 | 2 | 3 });
      break;
    case 'quote':
      if (!editor.isActive('blockquote')) chain.setParagraph().setBlockquote();
      break;
    case 'code':
      chain.setCodeBlock();
      break;
  }
  chain.run();
}

export async function pickAndInsertFigures(editor: Editor) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    for (const file of imageFiles(input.files)) {
      editor.chain().focus().insertFigure({ src: await readImage(file) }).run();
    }
  };
  input.click();
}

/** Always-visible formatting bar, grouped like MediaWiki's editing toolbar. */
export function FormatToolbar({ editor, onWiki }: { editor: Editor | null; onWiki?: () => void }) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  if (!editor) return null;

  const b = (active: boolean, run: () => boolean, icon: React.ReactNode, label: string, disabled = false) => (
    <button
      className={active ? 'on' : ''}
      onClick={run}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
  const c = () => editor.chain().focus();
  const inTable = editor.isActive('table');
  const inList = editor.isActive('bulletList') || editor.isActive('orderedList');

  return (
    <div className="format-toolbar" onMouseDown={(e) => e.target instanceof HTMLSelectElement || e.preventDefault()}>
      <div className="ft-group">
        {b(false, () => c().undo().run(), <Undo2 size={16} />, 'Undo (Ctrl+Z)', !editor.can().undo())}
        {b(false, () => c().redo().run(), <Redo2 size={16} />, 'Redo (Ctrl+Shift+Z)', !editor.can().redo())}
      </div>

      <div className="ft-group">
        <select
          className="ft-select"
          value={currentBlock(editor)}
          onChange={(e) => setBlock(editor, e.target.value as BlockStyle)}
          title="Paragraph style"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="quote">Quote</option>
          <option value="code">Code</option>
        </select>
      </div>

      <div className="ft-group">
        {b(editor.isActive('bold'), () => c().toggleBold().run(), <Bold size={16} />, 'Bold (Ctrl+B)')}
        {b(editor.isActive('italic'), () => c().toggleItalic().run(), <Italic size={16} />, 'Italic (Ctrl+I)')}
        {b(editor.isActive('underline'), () => c().toggleUnderline().run(), <Underline size={16} />, 'Underline (Ctrl+U)')}
        {b(editor.isActive('strike'), () => c().toggleStrike().run(), <Strikethrough size={16} />, 'Strikethrough')}
        {b(editor.isActive('superscript'), () => c().toggleSuperscript().run(), <Superscript size={16} />, 'Superscript')}
        {b(editor.isActive('subscript'), () => c().toggleSubscript().run(), <Subscript size={16} />, 'Subscript')}
        {b(editor.isActive('highlight'), () => c().toggleHighlight().run(), <Highlighter size={16} />, 'Highlight')}
        {b(false, () => c().unsetAllMarks().clearNodes().run(), <RemoveFormatting size={16} />, 'Clear formatting')}
      </div>

      <div className="ft-group">
        {b(editor.isActive({ textAlign: 'left' }), () => c().setTextAlign('left').run(), <TextAlignStart size={16} />, 'Align left')}
        {b(editor.isActive({ textAlign: 'center' }), () => c().setTextAlign('center').run(), <TextAlignCenter size={16} />, 'Centre')}
        {b(editor.isActive({ textAlign: 'right' }), () => c().setTextAlign('right').run(), <TextAlignEnd size={16} />, 'Align right')}
        {b(editor.isActive({ textAlign: 'justify' }), () => c().setTextAlign('justify').run(), <TextAlignJustify size={16} />, 'Justify')}
      </div>

      <div className="ft-group">
        {b(editor.isActive('bulletList'), () => c().toggleBulletList().run(), <List size={16} />, 'Bulleted list')}
        {b(editor.isActive('orderedList'), () => c().toggleOrderedList().run(), <ListOrdered size={16} />, 'Numbered list')}
        {b(false, () => c().liftListItem('listItem').run(), <ListIndentDecrease size={16} />, 'Outdent (Shift+Tab)', !inList)}
        {b(false, () => c().sinkListItem('listItem').run(), <ListIndentIncrease size={16} />, 'Indent (Tab)', !inList)}
      </div>

      <div className="ft-group">
        {b(false, () => (pickAndInsertFigures(editor), true), <ImagePlus size={16} />, 'Insert image with caption')}
        {b(false, () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), <Table2 size={16} />, 'Insert table')}
        {b(false, () => c().setHorizontalRule().run(), <Minus size={16} />, 'Scene break')}
        {onWiki && (
          <button className="ft-wiki" onClick={onWiki} title="Create a wiki entry from the selection (Ctrl+K)" disabled={editor.state.selection.empty}>
            <BookPlus size={15} /> Wiki
          </button>
        )}
      </div>

      {inTable && (
        <div className="ft-group ft-table">
          <span className="ft-label">Table</span>
          {b(false, () => c().addRowAfter().run(), <Rows3 size={16} />, 'Add row below')}
          {b(false, () => c().addColumnAfter().run(), <Columns3 size={16} />, 'Add column right')}
          <button className="txt" onClick={() => c().toggleHeaderRow().run()} title="Toggle header row">
            Header
          </button>
          <button className="txt" onClick={() => c().mergeOrSplit().run()} title="Merge or split cells">
            Merge
          </button>
          <button className="txt" onClick={() => c().deleteRow().run()} title="Delete row">
            −Row
          </button>
          <button className="txt" onClick={() => c().deleteColumn().run()} title="Delete column">
            −Col
          </button>
          {b(false, () => c().deleteTable().run(), <Trash2 size={15} />, 'Delete table')}
        </div>
      )}
    </div>
  );
}
