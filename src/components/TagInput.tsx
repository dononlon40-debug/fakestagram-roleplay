import { KeyboardEvent, useState, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TagInputProps {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  /** Suggestions to show below the input when typing. */
  suggestions?: string[];
  /** Optional left-side icon node (rendered absolutely inside the input area). */
  leftIcon?: React.ReactNode;
  /** Resolve a color (hex) for a given tag name. */
  getTagColor?: (tag: string) => string | undefined;
}

/**
 * Bubble-style tag input. Press comma or Enter to commit the current token
 * as a tag. Backspace on empty input removes the last tag. Click X to remove.
 */
const TagInput = ({ tags, onChange, placeholder, className, suggestions, leftIcon, getTagColor }: TagInputProps) => {

  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, '');
    if (!t) return;
    if (tags.includes(t)) { setValue(''); return; }
    onChange([...tags, t]);
    setValue('');
  };

  const removeTag = (tag: string) => onChange(tags.filter(t => t !== tag));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ',' || e.key === 'Enter') {
      if (value.trim()) { e.preventDefault(); addTag(value); }
    } else if (e.key === 'Backspace' && !value && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const filteredSuggestions = (suggestions || [])
    .filter(s => !tags.includes(s) && (!value.trim() || s.toLowerCase().includes(value.toLowerCase())))
    .slice(0, 6);

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 min-h-10 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background transition-shadow',
          leftIcon && 'pl-8',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {leftIcon && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {leftIcon}
          </span>
        )}
        {tags.map(tag => {
          const c = getTagColor?.(tag);
          const style = c ? { backgroundColor: `${c}26`, color: c, borderColor: `${c}66` } : undefined;
          return (
            <span
              key={tag}
              style={style}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
                !c && 'bg-primary/15 text-primary border-transparent',
              )}
            >
              #{tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                className="hover:opacity-70"
                aria-label={`Remove tag ${tag}`}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}

        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => { setTimeout(() => setFocused(false), 120); if (value.trim()) addTag(value); }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-0.5"
        />
      </div>
      {focused && filteredSuggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {filteredSuggestions.map(s => {
            const c = getTagColor?.(s);
            return (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c || 'hsl(var(--muted-foreground))' }} />
                #{s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TagInput;

