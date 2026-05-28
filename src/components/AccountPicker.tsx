import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Search } from 'lucide-react';

interface Account {
  id: string;
  username: string;
  profilePicture: string;
}

interface Props {
  accounts: Account[];
  selectedId: string;
  onSelect: (id: string) => void;
  label?: string;
  size?: 'sm' | 'md';
}

const AccountPicker = ({ accounts, selectedId, onSelect, label, size = 'md' }: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = accounts.find(a => a.id === selectedId);
  const filtered = accounts.filter(a =>
    a.username.toLowerCase().includes(query.trim().toLowerCase())
  );
  const avatarSize = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
  const padding = size === 'sm' ? 'px-2 py-1' : 'px-3 py-2';

  return (
    <div className="space-y-1">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`w-full flex items-center justify-between gap-2 ${padding} rounded-md border border-input bg-background hover:bg-secondary/40 transition-colors text-left`}
          >
            {selected ? (
              <span className="flex items-center gap-2 min-w-0">
                {selected.profilePicture ? (
                  <img src={selected.profilePicture} alt="" className={`${avatarSize} rounded-full object-cover flex-shrink-0`} />
                ) : (
                  <span className={`${avatarSize} rounded-full bg-secondary flex-shrink-0`} />
                )}
                <span className="text-xs font-medium truncate">@{selected.username}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Select persona</span>
            )}
            <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-[var(--radix-popover-trigger-width)] bg-popover border-border z-[230]"
          align="start"
          sideOffset={6}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search size={14} className="text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search personas..."
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center text-muted-foreground">No personas match</div>
            ) : (
              filtered.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onSelect(a.id); setOpen(false); setQuery(''); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary transition-colors text-left"
                >
                  {a.profilePicture ? (
                    <img src={a.profilePicture} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-secondary" />
                  )}
                  <span className="flex-1 text-sm truncate">@{a.username}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default AccountPicker;
