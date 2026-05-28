import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Clock } from 'lucide-react';
import { getAccounts } from '@/lib/store';
import { fuzzyMatch } from '@/lib/fuzzy';

const RECENT_KEY = 'ig_recent_searches';
const MAX_RECENT = 10;

interface Props {
  open: boolean;
  onClose: () => void;
}

const getRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
};
const saveRecent = (ids: string[]) => localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));

const SearchPanel = ({ open, onClose }: Props) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const accounts = getAccounts();

  useEffect(() => { if (open) { setRecent(getRecent()); setQuery(''); } }, [open]);

  const filtered = query.trim()
    ? accounts.filter(a => fuzzyMatch(`${a.username} ${a.displayName}`, query))
    : [];

  const recentAccounts = recent.map(id => accounts.find(a => a.id === id)).filter(Boolean) as ReturnType<typeof getAccounts>;

  const goTo = (id: string) => {
    const next = [id, ...recent.filter(r => r !== id)].slice(0, MAX_RECENT);
    saveRecent(next);
    setRecent(next);
    navigate(`/profile/${id}`);
    onClose();
  };

  const removeRecent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = recent.filter(r => r !== id);
    saveRecent(next);
    setRecent(next);
  };

  const clearAll = () => { saveRecent([]); setRecent([]); };

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-transparent" onClick={onClose} />}
      <aside
        className={`fixed top-0 left-[72px] h-full w-[397px] bg-background border-r border-border z-40 transform transition-transform duration-300 ease-out ${
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-[470px]'
        }`}
      >
        <div className="p-6 pb-4">
          <h2 className="text-2xl font-semibold mb-6">Search</h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus={open}
              type="text"
              placeholder="Search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full bg-secondary rounded-lg pl-9 pr-9 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-border" />

        <div className="flex-1 overflow-y-auto" style={{ height: 'calc(100% - 140px)' }}>
          {query.trim() ? (
            <div className="py-2">
              {filtered.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No results</p>
              ) : (
                filtered.map(a => (
                  <button
                    key={a.id}
                    onClick={() => goTo(a.id)}
                    className="w-full flex items-center gap-3 px-6 py-2 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="w-11 h-11 rounded-full bg-secondary overflow-hidden shrink-0">
                      {a.profilePicture && <img src={a.profilePicture} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{a.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.displayName}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="py-4">
              <div className="flex items-center justify-between px-6 mb-3">
                <h3 className="text-sm font-semibold">Recent</h3>
                {recentAccounts.length > 0 && (
                  <button onClick={clearAll} className="text-xs text-primary font-semibold hover:opacity-70">Clear all</button>
                )}
              </div>
              {recentAccounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-12 gap-2">
                  <Clock size={28} className="opacity-40" />
                  <p className="text-sm">No recent searches.</p>
                </div>
              ) : (
                recentAccounts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => goTo(a.id)}
                    className="w-full flex items-center gap-3 px-6 py-2 hover:bg-secondary/50 transition-colors text-left group"
                  >
                    <div className="w-11 h-11 rounded-full bg-secondary overflow-hidden shrink-0">
                      {a.profilePicture && <img src={a.profilePicture} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{a.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.displayName}</p>
                    </div>
                    <button onClick={(e) => removeRecent(a.id, e)} className="text-muted-foreground hover:text-foreground p-1">
                      <X size={14} />
                    </button>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default SearchPanel;
