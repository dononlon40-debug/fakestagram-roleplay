import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { addCustomCategory, getAllCategories } from '@/lib/store';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

const CategoryPicker = ({ value, onChange, placeholder = 'Category (e.g. Digital Creator)' }: Props) => {
  const [focused, setFocused] = useState(false);
  const [, bump] = useState(0);
  const categories = useMemo(() => getAllCategories(), [focused]);
  const q = value.trim().toLowerCase();
  const filtered = q
    ? categories.filter(c => c.toLowerCase().includes(q)).slice(0, 8)
    : categories.slice(0, 8);
  const exact = categories.some(c => c.toLowerCase() === q);

  const commit = (val: string) => {
    onChange(val);
    addCustomCategory(val);
    bump(n => n + 1);
  };

  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && (filtered.length > 0 || (q && !exact)) && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {q && !exact && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commit(value.trim()); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b border-border"
            >
              Create "<strong>{value.trim()}</strong>" as a new category
            </button>
          )}
          {filtered.map(cat => (
            <button
              key={cat}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(cat); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
            >
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoryPicker;
