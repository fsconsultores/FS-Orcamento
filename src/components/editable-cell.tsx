'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface Props {
  value: string;
  display?: string;
  type?: 'text' | 'number' | 'date';
  align?: 'left' | 'right';
  onSave: (value: string) => Promise<void>;
  className?: string;
  min?: string;
  step?: string;
}

export function EditableCell({
  value,
  display,
  type = 'text',
  align = 'left',
  onSave,
  className = '',
  min,
  step,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const ref = useRef<HTMLInputElement>(null);
  const guard = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  async function commit() {
    if (guard.current) return;
    guard.current = true;
    setEditing(false);
    if (draft === value) { guard.current = false; return; }
    setStatus('saving');
    try {
      await onSave(draft);
      setStatus('idle');
    } catch {
      setDraft(value);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    } finally {
      guard.current = false;
    }
  }

  const ta = align === 'right' ? 'text-right' : 'text-left';
  const shown = display ?? value;

  if (editing) {
    return (
      <input
        ref={ref}
        type={type}
        value={draft}
        min={min}
        step={step ?? (type === 'number' ? 'any' : undefined)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        className={`block w-full rounded border border-blue-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-blue-400/20 ${ta}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`block w-full rounded px-1 py-0.5 ${ta} hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-colors ${status === 'saving' ? 'opacity-50 cursor-wait' : 'cursor-pointer'} ${status === 'error' ? 'ring-1 ring-red-400' : ''} ${className}`}
      title={status === 'error' ? 'Erro — clique para tentar novamente' : 'Clique para editar'}
    >
      {shown || <span className="text-gray-300 font-normal">—</span>}
    </button>
  );
}
