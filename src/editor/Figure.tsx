import { useEffect, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { ImageUp, PanelLeft, PanelRight, Square, TextAlignCenter, Trash2 } from 'lucide-react';
import { imageFiles, readImage } from '../utils';

/** Placement, after MediaWiki's left / right / center / none. */
export type FigureAlign = 'left' | 'center' | 'right' | 'none';
/**
 * Frame style, after MediaWiki's thumb / frameless / border:
 * thumb = boxed with caption, plain = caption without a box, frameless and border hide the caption.
 */
export type FigureFrame = 'thumb' | 'plain' | 'frameless' | 'border';

export interface FigureAttrs {
  src: string;
  alt: string;
  align: FigureAlign;
  frame: FigureFrame;
  /** Width in px; null fills the text column. */
  width: number | null;
}

export const FIGURE_DEFAULTS: Omit<FigureAttrs, 'src'> = { alt: '', align: 'right', frame: 'thumb', width: 280 };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figure: {
      /** Inserts a figure as its own block at `at` (default: the cursor), never leaving empty paragraphs behind. */
      insertFigure: (attrs: Partial<FigureAttrs> & { src: string }, at?: number) => ReturnType;
    };
  }
}

/** An image with a caption box that text flows around, like a wiki thumbnail. */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'inline*',
  marks: '_',
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      align: { default: FIGURE_DEFAULTS.align },
      frame: { default: FIGURE_DEFAULTS.frame },
      width: { default: FIGURE_DEFAULTS.width },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-figure]',
        contentElement: 'figcaption',
        getAttrs: (el) => {
          const img = el.querySelector('img');
          const width = el.getAttribute('data-width');
          return {
            src: img?.getAttribute('src'),
            alt: img?.getAttribute('alt') ?? '',
            align: el.getAttribute('data-align') ?? FIGURE_DEFAULTS.align,
            frame: el.getAttribute('data-frame') ?? FIGURE_DEFAULTS.frame,
            width: width ? Number(width) : null,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, align, frame, width } = node.attrs as FigureAttrs;
    return [
      'figure',
      {
        'data-figure': '',
        'data-align': align,
        'data-frame': frame,
        'data-width': width ?? '',
        class: `figure align-${align} frame-${frame}`,
        style: width ? `width: ${width}px` : '',
      },
      ['img', { src, alt }],
      ['figcaption', 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },

  addCommands() {
    return {
      insertFigure:
        (attrs, at) =>
        ({ tr, dispatch }) => {
          const node = this.type.create({ ...FIGURE_DEFAULTS, ...attrs });
          const pos = at ?? tr.selection.from;
          const $pos = tr.doc.resolve(pos);
          if (!dispatch) return true;
          if (!$pos.parent.isTextblock) {
            tr.insert(pos, node);
          } else if ($pos.parent.content.size === 0) {
            tr.replaceWith($pos.before(), $pos.after(), node);
          } else if ($pos.parentOffset === 0) {
            tr.insert($pos.before(), node);
          } else if ($pos.parentOffset === $pos.parent.content.size) {
            tr.insert($pos.after(), node);
          } else {
            tr.split(pos);
            tr.insert(tr.doc.resolve(tr.mapping.map(pos)).before(), node);
          }
          return true;
        },
    };
  },
});

const SIZES: { label: string; width: number | null }[] = [
  { label: 'S', width: 180 },
  { label: 'M', width: 280 },
  { label: 'L', width: 400 },
  { label: 'Full', width: null },
];

const FRAMES: { value: FigureFrame; label: string }[] = [
  { value: 'thumb', label: 'Thumbnail' },
  { value: 'plain', label: 'Plain + caption' },
  { value: 'frameless', label: 'Frameless' },
  { value: 'border', label: 'Border' },
];

function FigureView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const { src, alt, align, frame, width } = node.attrs as FigureAttrs;
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [inside, setInside] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);

  // Keep the toolbar open while the caret is in the caption, not only when the image itself is selected.
  useEffect(() => {
    const check = () => {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const { from, to } = editor.state.selection;
      setInside(editor.isFocused && from > pos && to < pos + node.nodeSize);
    };
    editor.on('selectionUpdate', check);
    editor.on('focus', check);
    editor.on('blur', check);
    return () => {
      editor.off('selectionUpdate', check);
      editor.off('focus', check);
      editor.off('blur', check);
    };
  }, [editor, getPos, node.nodeSize]);

  const active = editor.isEditable && (selected || inside || editingAlt);
  const showCaption = frame === 'thumb' || frame === 'plain';
  const shownWidth = liveWidth ?? width;

  // Put the caret in the caption rather than selecting the node: inside a node-selected draggable node,
  // the browser treats the next click as a drag and the caret never lands in the caption.
  const select = () => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    if (showCaption) editor.chain().focus().setTextSelection(pos + 1 + node.content.size).run();
    else editor.commands.setNodeSelection(pos);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const figure = (e.currentTarget as HTMLElement).closest('figure')!;
    const startX = e.clientX;
    const startW = figure.getBoundingClientRect().width;
    const max = editor.view.dom.clientWidth;
    const dir = align === 'right' ? -1 : 1;
    let current = startW;
    const move = (ev: PointerEvent) => {
      current = Math.round(Math.min(max, Math.max(120, startW + dir * (ev.clientX - startX))));
      setLiveWidth(current);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLiveWidth(null);
      updateAttributes({ width: current >= max - 4 ? null : current });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const replace = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = imageFiles(input.files)[0];
      if (file) updateAttributes({ src: await readImage(file) });
    };
    input.click();
  };

  const alignBtn = (value: FigureAlign, icon: React.ReactNode, label: string) => (
    <button className={align === value ? 'on' : ''} onClick={() => updateAttributes({ align: value })} title={label}>
      {icon}
    </button>
  );

  return (
    <NodeViewWrapper
      as="figure"
      className={`figure align-${align} frame-${frame} ${active ? 'is-active' : ''} ${shownWidth ? '' : 'is-full'}`}
      style={{ width: shownWidth ? `${shownWidth}px` : undefined }}
    >
      {active && (
        <div className="figure-toolbar" contentEditable={false} onMouseDown={(e) => e.preventDefault()}>
          {alignBtn('left', <PanelLeft size={15} />, 'Float left — text wraps on the right')}
          {alignBtn('center', <TextAlignCenter size={15} />, 'Centre')}
          {alignBtn('right', <PanelRight size={15} />, 'Float right — text wraps on the left')}
          {alignBtn('none', <Square size={15} />, 'Inline, no wrapping')}
          <span className="bubble-sep" />
          {SIZES.map((s) => (
            <button
              key={s.label}
              className={`txt ${width === s.width ? 'on' : ''}`}
              onClick={() => updateAttributes(s.width ? { width: s.width } : { width: null, align: 'center' })}
              title={s.width ? `${s.width}px wide` : 'Full column width'}
            >
              {s.label}
            </button>
          ))}
          <span className="bubble-sep" />
          <select
            value={frame}
            onChange={(e) => updateAttributes({ frame: e.target.value })}
            title="Frame style"
          >
            {FRAMES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button className={`txt ${alt ? 'on' : ''}`} onClick={() => setEditingAlt(!editingAlt)} title="Alternative text">
            Alt
          </button>
          <span className="bubble-sep" />
          <button onClick={replace} title="Replace image">
            <ImageUp size={15} />
          </button>
          <button className="danger" onClick={() => deleteNode()} title="Remove image">
            <Trash2 size={15} />
          </button>
        </div>
      )}
      {editingAlt && (
        <div className="figure-alt" contentEditable={false}>
          <input
            autoFocus
            defaultValue={alt}
            placeholder="Describe the image for screen readers"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
            onBlur={(e) => {
              updateAttributes({ alt: e.target.value });
              setEditingAlt(false);
            }}
          />
        </div>
      )}
      <div className="figure-media" contentEditable={false} data-drag-handle onClick={select}>
        <img src={src} alt={alt} draggable={false} />
        {active && <span className={`figure-resize ${align === 'right' ? 'left' : 'right'}`} onPointerDown={startResize} />}
      </div>
      <div className={`figure-caption-wrap ${showCaption ? '' : 'hidden'}`}>
        {node.content.size === 0 && (
          <span className="figure-caption-ph" contentEditable={false}>
            Add a caption…
          </span>
        )}
        <NodeViewContent as="div" className="figure-caption" />
      </div>
    </NodeViewWrapper>
  );
}
