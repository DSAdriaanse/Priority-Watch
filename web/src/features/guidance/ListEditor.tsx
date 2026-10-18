import React, { useRef, useEffect, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

// Textarea that grows with its content.
type AutoTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & { value: string; minRows?: number };

export const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(function AutoTextarea({ value, onChange, className = "", minRows = 1, ...props }, outerRef) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const setRef = (el: HTMLTextAreaElement | null) => {
    ref.current = el;
    if (typeof outerRef === "function") outerRef(el);
    else if (outerRef) (outerRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [value]);
  return (
    <textarea
      ref={setRef}
      rows={minRows}
      value={value}
      onChange={onChange}
      className={`w-full resize-none rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500 ${className}`}
      {...props}
    />
  );
});

// An ordered list of text rows. Enter adds a row below, Backspace on an empty row removes it.
// Numbered, auto-growing list of text rows (steps, key questions). Enter adds a row below,
// Backspace on an empty row removes it, Alt+Up and Alt+Down reorder.
interface ListEditorProps {
  items: string[] | undefined;
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  numbered?: boolean;
  emptyText?: string;
}

export default function ListEditor({ items, onChange, placeholder = "Type here…", addLabel = "Add item", numbered = true, emptyText }: ListEditorProps) {
  const list = Array.isArray(items) ? items : [];
  const refs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const focusNext = useRef<number | null>(null);

  useEffect(() => {
    if (focusNext.current != null) {
      refs.current[focusNext.current]?.focus();
      focusNext.current = null;
    }
  });

  const set = (i: number, v: string) => onChange(list.map((x, idx) => (idx === i ? v : x)));
  const insertAfter = (i: number) => { focusNext.current = i + 1; onChange([...list.slice(0, i + 1), "", ...list.slice(i + 1)]); };
  const remove = (i: number) => { focusNext.current = Math.max(0, i - 1); onChange(list.filter((_, idx) => idx !== i)); };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    focusNext.current = j;
    onChange(next);
  };
  const add = () => { focusNext.current = list.length; onChange([...list, ""]); };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); insertAfter(i); }
    else if (e.key === "Backspace" && list[i] === "" ) { e.preventDefault(); remove(i); }
    else if (e.key === "ArrowUp" && e.altKey) { e.preventDefault(); move(i, -1); }
    else if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); move(i, 1); }
  };

  return (
    <div className="space-y-2">
      {list.length === 0 && emptyText && <p className="text-xs text-gray-500">{emptyText}</p>}
      {list.map((item, i) => (
        <div key={i} className="group flex items-start gap-2">
          {numbered && <span className="mt-2 w-6 shrink-0 text-right text-xs font-mono text-gray-500">{i + 1}.</span>}
          <AutoTextarea
            ref={(el) => { refs.current[i] = el; }}
            value={item}
            placeholder={placeholder}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          />
          <div className="flex shrink-0 flex-col gap-0.5 opacity-60 group-hover:opacity-100 sm:flex-row">
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-gray-400" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ChevronUp className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-gray-400" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ChevronDown className="h-3.5 w-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => remove(i)} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add} className="bg-gray-900 border-gray-700 text-gray-200">
        <Plus className="mr-1 h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}
