import { useLayoutEffect, useRef } from 'react';
import { useStore } from '../store';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** If given, Enter calls this instead of inserting a newline. */
  onEnter?: () => void;
  rows?: number;
}

/** A textarea that grows with its content. */
export function AutoTextarea({ value, onChange, placeholder, className, onEnter, rows = 1 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const spellcheck = useStore((s) => s.spellcheck);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={`auto-textarea ${className ?? ''}`}
      value={value}
      rows={rows}
      spellCheck={spellcheck}
      placeholder={placeholder}
      onChange={(e) => onChange(onEnter ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
      onKeyDown={(e) => {
        if (onEnter && e.key === 'Enter') {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}
