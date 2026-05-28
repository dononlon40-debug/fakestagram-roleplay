import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Account, AccountFolder } from '@/lib/types';
import {
  saveAccount, uid, deleteAccount, setMainAccountId as storeSetMain, getMainAccountId,
  getPostsByAccount, getReelsByAccount, getStoriesByAccount, getHighlights,
  exportSessionBlob, importSessionFile,
  reorderAccounts, setAccountFolder, setAccountTags, getAllAccountTags,
  getAccountFolders, saveAccountFolder, deleteAccountFolder, reorderFolders,
  getTagColors, setTagColor, removeTagColor,
  isFileLinkSupported, getLinkedFileName, linkSessionFile, unlinkSessionFile,
  saveToLinkedFile, loadFromLinkedFile,
} from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { Plus, Trash2, Star, Pencil, Settings, Download, Upload, Search, FolderPlus, GripVertical, Folder, ArrowLeft, Palette, Link2, Link2Off, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import ImageCropper from '@/components/ImageCropper';
import JsonImportDropzone from '@/components/JsonImportDropzone';
import CategoryPicker from '@/components/CategoryPicker';
import TagInput from '@/components/TagInput';
import { fuzzyMatch } from '@/lib/fuzzy';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

// Palette used for folders and tag colors. Direct hex is intentional —
// these are user-customizable per-item colors, not theme tokens.
const COLOR_PALETTE = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#6366f1', '#a855f7', '#94a3b8',
];

const DEFAULT_FOLDER_COLOR = '#3b82f6';

const ColorSwatchPicker = ({ value, onChange }: { value?: string; onChange: (c: string) => void }) => (
  <div className="grid grid-cols-6 gap-1.5">
    {COLOR_PALETTE.map(c => (
      <button
        key={c}
        type="button"
        onClick={() => onChange(c)}
        style={{ backgroundColor: c }}
        className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
          value === c ? 'border-foreground ring-2 ring-foreground/40' : 'border-transparent'
        }`}
        aria-label={`Pick color ${c}`}
      />
    ))}
  </div>
);

const AccountsPage = () => {
  const { accounts, activeAccountId, mainAccountId, switchAccount, setMainAccount, refresh } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [editForm, setEditForm] = useState<{ displayName: string; bio: string; website: string; location: string; pronouns: string; category: string; followers: number; following: number; profilePicture: string; tags: string[] }>({ displayName: '', bio: '', website: '', location: '', pronouns: '', category: '', followers: 0, following: 0, profilePicture: '', tags: [] });
  const [editCropImage, setEditCropImage] = useState<string | null>(null);
  const [storageInfoAccount, setStorageInfoAccount] = useState<Account | null>(null);
  const [search, setSearch] = useState('');
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(DEFAULT_FOLDER_COLOR);
  const [editFolder, setEditFolder] = useState<AccountFolder | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [sessionImportProgress, setSessionImportProgress] = useState<{ loaded: number; total: number; label: string } | null>(null);

  // DnD state — accounts
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null | 'unfiled'>(null);
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  // DnD state — folders
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [folderOrderPreview, setFolderOrderPreview] = useState<string[] | null>(null);

  const [form, setForm] = useState({
    username: '', displayName: '', bio: '', website: '',
    profilePicture: '', followers: 0, following: 0,
  });

  const folders = getAccountFolders();
  const allTags = getAllAccountTags();
  const tagColors = getTagColors();
  const getTagColor = (t: string) => tagColors[t];

  // Pick up to 3 tags to display on each card. When an account has >3 tags we
  // randomly sample 3 (re-rolled every full page load / mount) so the small
  // chip strip stays visually varied without changing on every re-render.
  const displayedTagsByAccount = useMemo(() => {
    const map = new Map<string, string[]>();
    accounts.forEach(a => {
      const tags = a.tags || [];
      if (tags.length <= 3) { map.set(a.id, tags); return; }
      const pool = [...tags];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      map.set(a.id, pool.slice(0, 3));
    });
    return map;
    // We intentionally only re-roll when the account set itself changes
    // (additions/removals), not on every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map(a => a.id + ':' + (a.tags || []).join(',')).join('|')]);

  const isFirstAccount = accounts.length === 0;
  const currentFolder = openFolderId ? folders.find(f => f.id === openFolderId) : null;

  // ---------- Filtering ----------
  const filteredAccounts = useMemo(() => {
    const q = search.trim();
    return accounts.filter(a => {
      if (activeTagFilters.length > 0) {
        const tags = a.tags || [];
        if (!activeTagFilters.every(t => tags.includes(t))) return false;
      }
      if (!q) return true;
      const haystack = `${a.username} ${a.displayName} ${a.bio} ${(a.tags || []).join(' ')}`;
      return fuzzyMatch(haystack, q);
    });
  }, [accounts, search, activeTagFilters]);

  // ---------- Drag and Drop ----------
  const onDragStartAccount = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  };

  const onDragEndAccount = () => {
    setDraggingId(null);
    setPreviewOrder(null);
    setDragOverFolder(null);
  };

  // Preview reorder: while dragging over another card in the same section,
  // move the dragged id to that card's position so the grid slides
  // immediately (framer-motion `layout` handles the animation). We use
  // onDragOver so the event keeps firing reliably and we throttle by only
  // updating when the target index actually changes.
  const onDragOverAccount = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggingId || draggingId === targetId) return;
    const dragged = accounts.find(a => a.id === draggingId);
    const target = accounts.find(a => a.id === targetId);
    if (!dragged || !target) return;
    if ((dragged.folderId || null) !== (target.folderId || null)) return; // different section
    const base = (previewOrder || accounts.map(a => a.id)).slice();
    const from = base.indexOf(draggingId);
    const to = base.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    base.splice(from, 1);
    base.splice(to, 0, draggingId);
    // Skip update if nothing changed (prevents render thrash)
    if (previewOrder && previewOrder.every((id, i) => id === base[i])) return;
    setPreviewOrder(base);
  };

  const onDropOnAccount = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
    if (!draggedId) { onDragEndAccount(); return; }
    const dragged = accounts.find(a => a.id === draggedId);
    const target = accounts.find(a => a.id === targetId);
    // Same-section drop = reorder. Cross-section = ignore (use folder drop).
    if (dragged && target && (dragged.folderId || null) === (target.folderId || null)) {
      const order = previewOrder || accounts.map(a => a.id);
      reorderAccounts(order);
      refresh();
    }
    onDragEndAccount();
  };

  const onDropOnFolder = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain') || draggingId;
    setDragOverFolder(null);
    if (!draggedId) { onDragEndAccount(); return; }
    if (previewOrder) reorderAccounts(previewOrder);
    setAccountFolder(draggedId, folderId);
    refresh();
    onDragEndAccount();
  };

  // ---------- Folder CRUD ----------
  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder: AccountFolder = {
      id: uid(),
      name,
      color: newFolderColor,
      createdAt: new Date().toISOString(),
    };
    saveAccountFolder(folder);
    setNewFolderName('');
    setNewFolderColor(DEFAULT_FOLDER_COLOR);
    setNewFolderOpen(false);
    refresh();
  };

  const handleSaveFolderEdit = () => {
    if (!editFolder) return;
    saveAccountFolder(editFolder);
    setEditFolder(null);
    refresh();
  };

  const handleDeleteFolder = (id: string) => {
    if (!confirm('Delete this folder? Accounts inside will be moved to Unfiled.')) return;
    deleteAccountFolder(id);
    if (openFolderId === id) setOpenFolderId(null);
    refresh();
  };

  // ---------- Account CRUD ----------
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropDone = (croppedImage: string) => {
    setForm(f => ({ ...f, profilePicture: croppedImage }));
    setCropImage(null);
  };

  const handleCreate = () => {
    if (!form.username.trim()) return;
    const account: Account = {
      id: uid(),
      username: form.username.trim().toLowerCase().replace(/\s/g, ''),
      displayName: form.displayName.trim() || form.username.trim(),
      bio: form.bio,
      profilePicture: form.profilePicture,
      website: form.website,
      followers: form.followers,
      following: form.following,
      isPrivate: false,
      createdAt: new Date().toISOString(),
      folderId: openFolderId || undefined,
    };
    saveAccount(account);
    if (isFirstAccount || !getMainAccountId()) storeSetMain(account.id);
    if (!activeAccountId) switchAccount(account.id);
    refresh();
    setOpen(false);
    setForm({ username: '', displayName: '', bio: '', website: '', profilePicture: '', followers: 0, following: 0 });
  };

  const handleDelete = (id: string) => { deleteAccount(id); refresh(); };

  const openEditAccount = (acc: Account) => {
    setEditForm({
      displayName: acc.displayName,
      bio: acc.bio,
      website: acc.website,
      location: acc.location || '',
      pronouns: acc.pronouns || '',
      category: acc.category || '',
      followers: acc.followers,
      following: acc.following,
      profilePicture: acc.profilePicture,
      tags: acc.tags || [],
    });
    setEditAccount(acc);
  };

  const handleEditPicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditCropImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleEditSave = () => {
    if (!editAccount) return;
    const { tags, ...rest } = editForm;
    saveAccount({ ...editAccount, ...rest });
    setAccountTags(editAccount.id, tags);
    refresh();
    setEditAccount(null);
  };

  const formatNum = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && cropImage) return;
    setOpen(next);
  };

  // ---------- Onboarding gate ----------
  if (!mainAccountId && accounts.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <h1 className="text-2xl font-bold mb-3 ig-gradient-text">Welcome to Fakestagram</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Start by creating your <strong>main profile</strong>. This is the identity you'll be roleplaying as. Once it's set up, you can create as many side personas as you want.
        </p>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2"><Plus size={18} /> Create main profile</Button>
          </DialogTrigger>
          <DialogContent
            className="bg-card border-border"
            onPointerDownOutside={(e) => { if (cropImage) e.preventDefault(); }}
            onInteractOutside={(e) => { if (cropImage) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (cropImage) e.preventDefault(); }}
          >
            <DialogHeader>
              <DialogTitle>Create your main profile</DialogTitle>
            </DialogHeader>
            {renderForm()}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  function renderForm() {
    return (
      <div className="space-y-4 mt-4">
        <JsonImportDropzone onImported={() => setOpen(false)} />
        <div className="relative my-1">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center"><span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">or fill manually</span></div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
            {form.profilePicture ? (
              <img src={form.profilePicture} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-muted-foreground text-xs">Photo</span>
            )}
          </div>
          <label className="text-sm text-primary cursor-pointer font-semibold hover:opacity-80">
            Upload Photo
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </label>
        </div>
        <Input placeholder="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        <Input placeholder="Display Name (real name)" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
        <Textarea placeholder="Bio" value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3} />
        <Input placeholder="Website" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Follower count</label>
            <Input type="number" placeholder="e.g. 1200" value={form.followers} onChange={e => setForm(f => ({ ...f, followers: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Following count</label>
            <Input type="number" placeholder="e.g. 300" value={form.following} onChange={e => setForm(f => ({ ...f, following: parseInt(e.target.value) || 0 }))} />
          </div>
        </div>
        <Button onClick={handleCreate} className="w-full">Create Account</Button>
      </div>
    );
  }

  const handleExportSession = async () => {
    const blob = exportSessionBlob();
    const filename = `fakestagram-session-${new Date().toISOString().slice(0, 10)}.json`;
    // Prefer the File System Access save dialog so users pick a destination.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (typeof w.showSaveFilePicker === 'function') {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Fakestagram session', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        // User cancelled the picker — stop silently. Any other error falls through to download.
        if ((err as DOMException)?.name === 'AbortError') return;
        console.warn('showSaveFilePicker failed, falling back to download', err);
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---------- Linked session file ----------
  const [linkedName, setLinkedName] = useState<string | null>(getLinkedFileName());
  const fileLinkSupported = isFileLinkSupported();

  const handleLinkFile = async () => {
    try {
      const name = await linkSessionFile();
      setLinkedName(name);
      alert(`Linked! Your session is now backed by "${name}". Open Fakestagram in another Chromium browser and click "Link file" → pick the same file to sync.`);
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      alert('Could not link file: ' + (err as Error).message);
    }
  };
  const handleUnlinkFile = async () => {
    await unlinkSessionFile();
    setLinkedName(null);
  };
  const handleSyncFromFile = async () => {
    try {
      const ok = await loadFromLinkedFile('replace');
      if (ok) refresh();
      else alert('Nothing to load (no permission or empty file).');
    } catch (err) {
      alert('Sync failed: ' + (err as Error).message);
    }
  };
  const handlePushToFile = async () => {
    try {
      const ok = await saveToLinkedFile();
      if (!ok) alert('Permission denied — could not write to the linked file.');
    } catch (err) {
      alert('Save failed: ' + (err as Error).message);
    }
  };

  const handleImportSession = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (accounts.length > 0 && !confirm('Replace current session with the imported one? All current data will be lost.')) return;
    try {
      setSessionImportProgress({ loaded: 0, total: file.size, label: 'Starting import' });
      await importSessionFile(file, 'replace', setSessionImportProgress);
      refresh();
    } catch (err) {
      alert('Failed to import session: ' + (err as Error).message);
    } finally {
      setSessionImportProgress(null);
    }
  };

  const toggleTagFilter = (tag: string) =>
    setActiveTagFilters(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  // Apply preview order (drag preview) on top of filteredAccounts so cards
  // slide while dragging.
  const orderedFiltered = useMemo(() => {
    if (!previewOrder) return filteredAccounts;
    const pos = new Map(previewOrder.map((id, i) => [id, i]));
    return [...filteredAccounts].sort(
      (a, b) => (pos.get(a.id) ?? 9e9) - (pos.get(b.id) ?? 9e9)
    );
  }, [filteredAccounts, previewOrder]);

  const accountsByFolder = (folderId: string | null) =>
    orderedFiltered.filter(a => (a.folderId || null) === folderId);

  // ---------- Card renderers ----------
  const renderAccountCard = (account: Account) => {
    const isMain = account.id === mainAccountId;
    const isActive = account.id === activeAccountId;
    const isDragging = draggingId === account.id;
    return (
      <motion.div
        key={account.id}
        layout="position"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{
          opacity: isDragging ? 0.4 : 1,
          scale: isDragging ? 1.06 : 1,
          rotate: isDragging ? 1.5 : 0,
          boxShadow: isDragging ? '0 12px 32px hsl(var(--primary) / 0.35)' : '0 0 0 transparent',
          zIndex: isDragging ? 20 : 1,
        }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.6 }}
        draggable
        onDragStart={(e) => onDragStartAccount(e as unknown as React.DragEvent, account.id)}
        onDragEnd={onDragEndAccount}
        onDragOver={(e) => onDragOverAccount(e as unknown as React.DragEvent, account.id)}
        onDrop={(e) => onDropOnAccount(e as unknown as React.DragEvent, account.id)}
        className={`relative aspect-square rounded-xl border bg-card p-3 flex flex-col items-center text-center cursor-grab active:cursor-grabbing ${
          isActive ? 'border-primary' : 'border-border'
        } ${draggingId && draggingId !== account.id ? 'ring-1 ring-transparent hover:ring-primary/60' : ''}`}
      >
        {isMain && (
          <div className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            <Star size={10} className="fill-current" /> MAIN
          </div>
        )}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <GripVertical size={12} className="text-muted-foreground/60" aria-hidden />
          <button onClick={() => openEditAccount(account)} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit profile">
            <Pencil size={14} />
          </button>
          <button onClick={() => setStorageInfoAccount(account)} className="text-muted-foreground hover:text-foreground transition-colors" title="Account storage settings">
            <Settings size={14} />
          </button>
          <button onClick={() => handleDelete(account.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>

        <button
          onClick={() => { switchAccount(account.id); navigate(`/profile/${account.id}`); }}
          className="flex flex-col items-center w-full mt-3 group"
        >
          <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary mb-2 group-hover:opacity-80 transition-opacity">
            {account.profilePicture ? (
              <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
                {account.username[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <p className="text-sm font-semibold truncate w-full">@{account.username}</p>
          <p className="text-xs text-muted-foreground truncate w-full">{account.displayName}</p>
          <p className="text-xs mt-1"><strong>{formatNum(account.followers)}</strong> <span className="text-muted-foreground">followers</span></p>
        </button>

        {account.tags && account.tags.length > 0 && (() => {
          const shown = displayedTagsByAccount.get(account.id) || account.tags.slice(0, 3);
          const overflow = account.tags.length - shown.length;
          return (
            <div className="flex flex-wrap gap-1 justify-center mt-1.5 w-full">
              {shown.map(t => {
                const c = getTagColor(t);
                const style = c ? { backgroundColor: `${c}26`, color: c } : undefined;
                return (
                  <span
                    key={t}
                    style={style}
                    className={`text-[9px] px-1.5 py-0.5 rounded-full truncate max-w-full ${!c ? 'bg-secondary text-muted-foreground' : ''}`}
                  >#{t}</span>
                );
              })}
              {overflow > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">+{overflow}</span>
              )}
            </div>
          );
        })()}

        <div className="flex gap-1 mt-auto pt-2 w-full">
          <Button
            variant={isActive ? 'default' : 'secondary'}
            size="sm"
            className="flex-1 text-xs h-7"
            onClick={() => switchAccount(account.id)}
            disabled={isActive}
          >
            {isActive ? 'In use' : 'Use'}
          </Button>
          {!isMain && (
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setMainAccount(account.id)} title="Set as main">
              <Star size={12} />
            </Button>
          )}
        </div>
      </motion.div>
    );
  };

  // ---------- Folder drag-and-drop (reorder) ----------
  const onFolderDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('application/x-folder', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingFolderId(id);
  };
  const onFolderDragEnd = () => {
    setDraggingFolderId(null);
    setFolderOrderPreview(null);
  };
  const onFolderDragOverFolder = (e: React.DragEvent, targetId: string) => {
    if (!draggingFolderId || draggingFolderId === targetId) return;
    e.preventDefault();
    const base = (folderOrderPreview || folders.map(f => f.id)).slice();
    const from = base.indexOf(draggingFolderId);
    const to = base.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    base.splice(from, 1);
    base.splice(to, 0, draggingFolderId);
    if (folderOrderPreview && folderOrderPreview.every((id, i) => id === base[i])) return;
    setFolderOrderPreview(base);
  };
  const onFolderReorderDrop = () => {
    if (folderOrderPreview) reorderFolders(folderOrderPreview);
    refresh();
    onFolderDragEnd();
  };

  const orderedFolders = useMemo(() => {
    if (!folderOrderPreview) return folders;
    const pos = new Map(folderOrderPreview.map((id, i) => [id, i]));
    return [...folders].sort((a, b) => (pos.get(a.id) ?? 9e9) - (pos.get(b.id) ?? 9e9));
  }, [folders, folderOrderPreview]);

  const renderFolderCard = (folder: AccountFolder) => {
    const count = accounts.filter(a => a.folderId === folder.id).length;
    const isAccountOver = !draggingFolderId && dragOverFolder === folder.id;
    const isFolderDragging = draggingFolderId === folder.id;
    const color = folder.color || DEFAULT_FOLDER_COLOR;
    return (
      <motion.div
        key={`folder-${folder.id}`}
        layout="position"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{
          opacity: isFolderDragging ? 0.4 : 1,
          scale: isFolderDragging ? 1.06 : (isAccountOver ? 1.04 : 1),
          rotate: isFolderDragging ? 1.5 : 0,
          boxShadow: isFolderDragging ? '0 12px 32px hsl(var(--primary) / 0.35)' : '0 0 0 transparent',
          zIndex: isFolderDragging ? 20 : 1,
        }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={{ type: 'spring', stiffness: 500, damping: 38, mass: 0.6 }}
        draggable
        onDragStart={(e) => onFolderDragStart(e as unknown as React.DragEvent, folder.id)}
        onDragEnd={onFolderDragEnd}
        onDragOver={(e) => {
          if (draggingFolderId) {
            onFolderDragOverFolder(e as unknown as React.DragEvent, folder.id);
          } else {
            e.preventDefault();
            setDragOverFolder(folder.id);
          }
        }}
        onDragLeave={() => { if (!draggingFolderId) setDragOverFolder(prev => prev === folder.id ? null : prev); }}
        onDrop={(e) => {
          if (draggingFolderId) {
            e.preventDefault();
            e.stopPropagation();
            onFolderReorderDrop();
          } else {
            onDropOnFolder(e as unknown as React.DragEvent, folder.id);
          }
        }}
        style={isAccountOver ? { borderColor: color, backgroundColor: `${color}1a` } : undefined}
        className={`relative aspect-square rounded-xl border bg-card p-3 flex flex-col items-center text-center cursor-grab active:cursor-grabbing ${
          isAccountOver ? '' : 'border-border hover:border-primary/40'
        }`}
        onClick={() => { if (!draggingFolderId) setOpenFolderId(folder.id); }}
      >
        <div className="absolute top-2 left-2 text-muted-foreground/60 pointer-events-none">
          <GripVertical size={12} aria-hidden />
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditFolder(folder)} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit folder">
            <Pencil size={14} />
          </button>
          <button onClick={() => handleDeleteFolder(folder.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Delete folder">
            <Trash2 size={14} />
          </button>
        </div>
        <div className="flex flex-col items-center w-full mt-3">
          <div
            className="w-16 h-16 rounded-full mb-2 flex items-center justify-center ring-2"
            style={{ backgroundColor: `${color}33`, color, boxShadow: `0 0 0 2px ${color}` }}
          >
            <Folder size={28} className="fill-current" />
          </div>
          <p className="text-sm font-semibold truncate w-full" style={{ color }}>{folder.name}</p>
          <p className="text-xs text-muted-foreground truncate w-full">Folder</p>
          <p className="text-xs mt-1"><strong>{count}</strong> <span className="text-muted-foreground">{count === 1 ? 'account' : 'accounts'}</span></p>
        </div>
      </motion.div>
    );
  };

  // ---------- Tag color helpers ----------
  const handleSetTagColor = (tag: string, color: string) => {
    setTagColor(tag, color);
    refresh();
  };
  const handleClearTagColor = (tag: string) => {
    removeTagColor(tag);
    refresh();
  };

  // ---------- Layout ----------
  const unfiledItems = accountsByFolder(null);
  const folderContents = currentFolder ? accountsByFolder(currentFolder.id) : [];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Manage Accounts</h1>
          <p className="text-xs text-muted-foreground mt-1">
            <Star size={11} className="inline -mt-0.5 mr-1 fill-current text-primary" />
            marks your main profile — your real identity. Other accounts are roleplay personas.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" size="sm" className="gap-2" onClick={() => setManageTagsOpen(true)} title="Manage tag colors">
            <Palette size={14} /> Tags
          </Button>
          <Button variant="secondary" size="sm" className="gap-2" onClick={handleExportSession} title="Download the current session as a JSON backup">
            <Download size={14} /> Export
          </Button>
          <label className="inline-flex">
            <Button variant="secondary" size="sm" className="gap-2 cursor-pointer" asChild>
              <span><Upload size={14} /> Import</span>
            </Button>
            <input type="file" accept="application/json" className="hidden" onChange={handleImportSession} />
          </label>
          {fileLinkSupported && (
            linkedName ? (
              <>
                <Button variant="secondary" size="sm" className="gap-2" onClick={handleSyncFromFile} title={`Reload session from "${linkedName}"`}>
                  <RefreshCw size={14} /> Sync
                </Button>
                <Button variant="secondary" size="sm" className="gap-2" onClick={handlePushToFile} title={`Overwrite "${linkedName}" with current session`}>
                  <Download size={14} /> Save to file
                </Button>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleUnlinkFile} title={`Unlink "${linkedName}"`}>
                  <Link2Off size={14} /> {linkedName}
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" className="gap-2" onClick={handleLinkFile} title="Link a session file on your disk for auto cross-browser sync">
                <Link2 size={14} /> Link file
              </Button>
            )
          )}
          <Button variant="secondary" size="sm" className="gap-2" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus size={14} /> New folder
          </Button>
          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus size={18} /> New Persona</Button>
            </DialogTrigger>
            <DialogContent
              className="bg-card border-border"
              onPointerDownOutside={(e) => { if (cropImage) e.preventDefault(); }}
              onInteractOutside={(e) => { if (cropImage) e.preventDefault(); }}
              onEscapeKeyDown={(e) => { if (cropImage) e.preventDefault(); }}
            >
              <DialogHeader><DialogTitle>Create Fake Account</DialogTitle></DialogHeader>
              {renderForm()}
            </DialogContent>
          </Dialog>
          {sessionImportProgress && (
            <div className="basis-full text-xs text-muted-foreground">
              {sessionImportProgress.label} · {Math.round((sessionImportProgress.loaded / Math.max(1, sessionImportProgress.total)) * 100)}%
            </div>
          )}
        </div>
      </div>

      {!currentFolder && (
        <p className="text-xs text-muted-foreground mb-4">
          Tip: drag and drop account cards to reorder or move between folders. Click a folder to open it.
        </p>
      )}

      {/* Search + tag filters */}
      <div className="mb-4 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Fuzzy search by name, username, bio..."
              className="pl-8"
            />
          </div>
          <TagInput
            tags={activeTagFilters}
            onChange={setActiveTagFilters}
            placeholder="Filter by tag (type & press comma)"
            suggestions={allTags}
            getTagColor={getTagColor}
            leftIcon={<Search size={14} />}
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Quick tags:</span>
            {allTags.map(tag => {
              const active = activeTagFilters.includes(tag);
              const c = getTagColor(tag);
              const activeStyle = active && c ? { backgroundColor: c, borderColor: c, color: '#fff' } : undefined;
              const idleStyle = !active && c ? { color: c, borderColor: `${c}66` } : undefined;
              return (
                <button
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  style={activeStyle || idleStyle}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    active && !c ? 'bg-primary text-primary-foreground border-primary' : !c ? 'bg-secondary border-border hover:border-primary/60' : 'bg-transparent'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <LayoutGroup>
        <AnimatePresence mode="wait" initial={false}>
          {currentFolder ? (
            <motion.div
              key={`folder-view-${currentFolder.id}`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <div
                onDragOver={(e) => {
                  if (draggingId) { e.preventDefault(); setDragOverFolder('unfiled'); }
                }}
                onDragLeave={() => setDragOverFolder(prev => prev === 'unfiled' ? null : prev)}
                onDrop={(e) => { if (draggingId) onDropOnFolder(e, null); }}
                className={`flex items-center justify-between mb-3 px-2 py-1.5 rounded-lg border border-dashed transition-colors ${
                  dragOverFolder === 'unfiled' ? 'border-primary bg-primary/10' : 'border-transparent'
                }`}
              >
                <Button variant="ghost" size="sm" className="gap-2" onClick={() => setOpenFolderId(null)}>
                  <ArrowLeft size={14} /> Back to all accounts
                </Button>
                <div className="flex items-center gap-2">
                  {draggingId ? (
                    <span className="text-xs text-primary font-medium">Drop here to remove from folder</span>
                  ) : (
                    <>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: `${currentFolder.color || DEFAULT_FOLDER_COLOR}33`, color: currentFolder.color || DEFAULT_FOLDER_COLOR }}
                      >
                        <Folder size={14} className="fill-current" />
                      </div>
                      <h2 className="text-lg font-semibold" style={{ color: currentFolder.color }}>{currentFolder.name}</h2>
                      <span className="text-xs text-muted-foreground">({folderContents.length})</span>
                    </>
                  )}
                </div>
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverFolder(currentFolder.id); }}
                onDragLeave={() => setDragOverFolder(prev => prev === currentFolder.id ? null : prev)}
                onDrop={(e) => onDropOnFolder(e, currentFolder.id)}
                className="min-h-[200px] rounded-xl border border-dashed border-border p-3"
                style={dragOverFolder === currentFolder.id ? { borderColor: currentFolder.color, backgroundColor: `${currentFolder.color}11` } : undefined}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  <AnimatePresence>
                    {folderContents.map(renderAccountCard)}
                  </AnimatePresence>
                </div>
                {folderContents.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-10">
                    No accounts in this folder yet. Go back and drag accounts onto the folder.
                  </p>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="all-accounts"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {/* Unfiled section with folder cards interleaved at top */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverFolder('unfiled'); }}
                onDragLeave={() => setDragOverFolder(prev => prev === 'unfiled' ? null : prev)}
                onDrop={(e) => onDropOnFolder(e, null)}
                className={`mb-4 flex items-center justify-between px-3 py-2 rounded-lg border border-dashed transition-colors ${
                  dragOverFolder === 'unfiled' ? 'border-primary bg-primary/10' : 'border-border bg-secondary/20'
                }`}
              >
                <span className="text-sm font-semibold flex items-center gap-2">
                  All accounts
                  <span className="text-xs text-muted-foreground font-normal">({unfiledItems.length} unfiled · {folders.length} folder{folders.length === 1 ? '' : 's'})</span>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <AnimatePresence>
                  {orderedFolders.map(renderFolderCard)}
                  {unfiledItems.map(renderAccountCard)}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>

      {filteredAccounts.length === 0 && (search.trim() || activeTagFilters.length > 0) && (
        <p className="text-center text-sm text-muted-foreground py-10">No accounts match your search.</p>
      )}

      {cropImage && (
        <ImageCropper image={cropImage} onCropDone={handleCropDone} onCancel={() => setCropImage(null)} aspectRatio={1} />
      )}

      {/* Edit profile dialog */}
      <Dialog open={!!editAccount} onOpenChange={(next) => { if (!next && editCropImage) return; if (!next) setEditAccount(null); }}>
        <DialogContent
          className="bg-card border-border max-h-[90vh] overflow-y-auto"
          onPointerDownOutside={(e) => { if (editCropImage) e.preventDefault(); }}
          onInteractOutside={(e) => { if (editCropImage) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (editCropImage) e.preventDefault(); }}
        >
          <DialogHeader><DialogTitle>Edit Profile</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-secondary overflow-hidden shrink-0">
                {editForm.profilePicture ? (
                  <img src={editForm.profilePicture} alt="" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full" />}
              </div>
              <label className="text-sm text-primary cursor-pointer font-semibold">
                Change photo
                <input type="file" accept="image/*" className="hidden" onChange={handleEditPicUpload} />
              </label>
            </div>
            <Input placeholder="Display Name" value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} />
            <Input placeholder="Pronouns (e.g. she/her)" value={editForm.pronouns} onChange={e => setEditForm(f => ({ ...f, pronouns: e.target.value }))} />
            <CategoryPicker value={editForm.category} onChange={(v) => setEditForm(f => ({ ...f, category: v }))} />
            <Textarea placeholder="Bio" value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={3} />
            <Input placeholder="Website" value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} />
            <Input placeholder="Location" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} />
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Private tags (press comma or Enter to add — existing tags suggested as you type)
              </label>
              <TagInput
                tags={editForm.tags}
                onChange={(tags) => setEditForm(f => ({ ...f, tags }))}
                placeholder="e.g. main, work, alt"
                suggestions={allTags}
                getTagColor={getTagColor}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Manage tag colors from the <Palette size={10} className="inline -mt-0.5" /> Tags button in the toolbar.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" placeholder="Followers" value={editForm.followers} onChange={e => setEditForm(f => ({ ...f, followers: parseInt(e.target.value) || 0 }))} />
              <Input type="number" placeholder="Following" value={editForm.following} onChange={e => setEditForm(f => ({ ...f, following: parseInt(e.target.value) || 0 }))} />
            </div>
            <Button onClick={handleEditSave} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {editCropImage && (
        <ImageCropper
          image={editCropImage}
          onCropDone={(img) => { setEditForm(f => ({ ...f, profilePicture: img })); setEditCropImage(null); }}
          onCancel={() => setEditCropImage(null)}
          aspectRatio={1}
        />
      )}

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
              autoFocus
            />
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Folder color</label>
              <ColorSwatchPicker value={newFolderColor} onChange={setNewFolderColor} />
            </div>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="w-full">Create folder</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit folder dialog */}
      <Dialog open={!!editFolder} onOpenChange={(next) => { if (!next) setEditFolder(null); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>Edit folder</DialogTitle></DialogHeader>
          {editFolder && (
            <div className="space-y-3 mt-2">
              <Input
                placeholder="Folder name"
                value={editFolder.name}
                onChange={e => setEditFolder({ ...editFolder, name: e.target.value })}
                autoFocus
              />
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Folder color</label>
                <ColorSwatchPicker
                  value={editFolder.color}
                  onChange={(c) => setEditFolder({ ...editFolder, color: c })}
                />
              </div>
              <Button onClick={handleSaveFolderEdit} disabled={!editFolder.name.trim()} className="w-full">Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage tag colors dialog */}
      <Dialog open={manageTagsOpen} onOpenChange={setManageTagsOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Tag colors</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-xs text-muted-foreground">
              Pick a color for each tag. Click a tag's swatch to change its color.
            </p>
            {allTags.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No tags yet. Open an account, edit it, and add tags in the "Private tags" field.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => {
                const c = getTagColor(tag) || '#94a3b8';
                const hasColor = !!getTagColor(tag);
                return (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full border bg-secondary/40"
                    style={{ borderColor: `${c}66` }}
                  >
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="w-5 h-5 rounded-full border border-border/60 hover:scale-110 transition-transform shrink-0"
                          style={{ backgroundColor: c }}
                          title="Change color"
                        />
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2 z-[230]" sideOffset={6}>
                        <ColorSwatchPicker value={getTagColor(tag)} onChange={(col) => handleSetTagColor(tag, col)} />
                        {hasColor && (
                          <button
                            className="mt-2 w-full text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => handleClearTagColor(tag)}
                          >
                            Reset color
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>
                    <span
                      className="text-xs font-medium"
                      style={{ color: c }}
                    >
                      #{tag}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Storage info dialog */}
      <Dialog open={!!storageInfoAccount} onOpenChange={(next) => { if (!next) setStorageInfoAccount(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Where this account's media lives</DialogTitle></DialogHeader>
          {storageInfoAccount && (() => {
            const acc = storageInfoAccount;
            const postsForAcc = getPostsByAccount(acc.id);
            const reelsForAcc = getReelsByAccount(acc.id);
            const storiesForAcc = getStoriesByAccount(acc.id);
            const highlightsForAcc = getHighlights().filter(h => h.accountId === acc.id);
            const sections: { key: string; label: string; data: unknown }[] = [
              { key: 'ig_accounts', label: 'Account record', data: acc },
              { key: 'ig_posts', label: `Posts (${postsForAcc.length})`, data: postsForAcc },
              { key: 'ig_reels', label: `Reels (${reelsForAcc.length})`, data: reelsForAcc },
              { key: 'ig_stories', label: `Stories (${storiesForAcc.length})`, data: storiesForAcc },
              { key: 'ig_highlights', label: `Highlights (${highlightsForAcc.length})`, data: highlightsForAcc },
            ];
            const copy = (txt: string) => navigator.clipboard?.writeText(txt);
            return (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground text-xs">
                  Fakestagram is offline-only — there's no folder on your disk. All media is stored as base64 / blob URLs inside this browser's IndexedDB. Open DevTools → Application → IndexedDB to inspect the raw keys, or copy the per-key JSON below.
                </p>
                <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Settings size={14} /> Account id</span>
                  <code className="text-xs">{acc.id}</code>
                </div>
                {sections.map(s => {
                  const json = JSON.stringify(s.data, null, 2);
                  return (
                    <div key={s.key} className="rounded-lg border border-border bg-secondary/20">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">{s.label}</span>
                          <code className="text-[10px] text-muted-foreground">storage["{s.key}"]</code>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => copy(json)}>Copy JSON</Button>
                      </div>
                      <pre className="text-[10px] leading-snug max-h-48 overflow-auto p-2 whitespace-pre-wrap break-all">{json}</pre>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsPage;
