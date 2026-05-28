import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAccount, getPostsByAccount, getReelsByAccount, saveAccount, getSavedPosts, getPosts, getReels, getFollowing, toggleFollow, getOrCreateConversation } from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { Grid3X3, Film, Bookmark, Settings, Pin } from 'lucide-react';
import { HeartIcon, CommentFilledIcon, CarouselBadgeIcon } from '@/components/icons/InstagramIcons';
import { formatCount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import PostModal from '@/components/PostModal';
import ReelModal from '@/components/ReelModal';
import ImageCropper from '@/components/ImageCropper';
import HighlightsRow from '@/components/HighlightsRow';
import CategoryPicker from '@/components/CategoryPicker';
import { Post, Reel } from '@/lib/types';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';


const ProfilePage = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const { activeAccountId, refresh } = useApp();
  const navigate = useNavigate();
  const account = accountId ? getAccount(accountId) : null;
  const [tab, setTab] = useState<'posts' | 'reels' | 'saved'>('posts');
  const [editOpen, setEditOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [reelQueue, setReelQueue] = useState<Reel[]>([]);
  const [editForm, setEditForm] = useState({ displayName: '', bio: '', website: '', location: '', pronouns: '', category: '', followers: 0, following: 0, profilePicture: '' });
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const sortByDateDesc = (a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  const rawPosts = account ? getPostsByAccount(account.id) : [];
  const pinnedPosts = rawPosts.filter(p => p.isPinned).sort(sortByDateDesc).slice(0, 3);
  const pinnedPostIds = new Set(pinnedPosts.map(p => p.id));
  const unpinnedPosts = rawPosts.filter(p => !pinnedPostIds.has(p.id)).sort(sortByDateDesc);
  const posts = [...pinnedPosts, ...unpinnedPosts];

  const rawReels = account ? getReelsByAccount(account.id) : [];
  const pinnedReels = rawReels.filter(r => r.isPinned).sort(sortByDateDesc).slice(0, 3);
  const pinnedReelIds = new Set(pinnedReels.map(r => r.id));
  const unpinnedReels = rawReels.filter(r => !pinnedReelIds.has(r.id)).sort(sortByDateDesc);
  const reels = [...pinnedReels, ...unpinnedReels];
  const gridTotal = posts.length + reels.length;
  const postsVisible = useInfiniteScroll(gridTotal, 15, 15);

  if (!account) return <div className="flex items-center justify-center h-full text-muted-foreground">Account not found</div>;

  const isOwn = account.id === activeAccountId;
  const isFollowing = activeAccountId ? getFollowing(activeAccountId).includes(account.id) : false;



  const handleFollow = () => {
    if (!activeAccountId || isOwn) return;
    toggleFollow(activeAccountId, account.id);
    refresh();
    setTick(t => t + 1);
  };

  const handleMessage = () => {
    if (!activeAccountId || isOwn) return;
    const conv = getOrCreateConversation(activeAccountId, account.id);
    navigate(`/messages?conv=${conv.id}`);
  };

  const handleOpenReel = (reel: Reel) => {
    const others = getReels().filter(r => r.id !== reel.id).sort(() => Math.random() - 0.5);
    setReelQueue([reel, ...others]);
    setSelectedReel(reel);
  };

  const handleNavigateReel = (direction: 'next' | 'previous') => {
    if (!selectedReel) return;
    const currentIndex = reelQueue.findIndex(r => r.id === selectedReel.id);
    const nextIndex = currentIndex + (direction === 'next' ? 1 : -1);
    const nextReel = reelQueue[nextIndex];
    if (!nextReel) {
      toast({ title: "that's all for now" });
      return;
    }
    setSelectedReel(nextReel);
  };

  // Saved posts
  const savedPostIds = activeAccountId ? getSavedPosts(activeAccountId) : [];
  const allPosts = getPosts();
  const savedPosts = savedPostIds.map(id => allPosts.find(p => p.id === id)).filter(Boolean) as Post[];

  const openEdit = () => {
    setEditForm({
      displayName: account.displayName,
      bio: account.bio,
      website: account.website,
      location: account.location || '',
      pronouns: account.pronouns || '',
      category: account.category || '',
      followers: account.followers,
      following: account.following,
      profilePicture: account.profilePicture,
    });
    setEditOpen(true);
  };

  const handleEditSave = () => {
    saveAccount({ ...account, ...editForm });
    refresh();
    setEditOpen(false);
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCropDone = (croppedImage: string) => {
    setEditForm(f => ({ ...f, profilePicture: croppedImage }));
    setCropImage(null);
  };

  const formatNum = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex gap-8 md:gap-20 mb-8">
        <div className="shrink-0">
          <div className="w-20 h-20 md:w-36 md:h-36 rounded-full overflow-hidden bg-secondary">
            {account.profilePicture ? (
              <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground">
                {account.username[0]?.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <h1 className="text-xl font-normal">{account.username}</h1>
            {isOwn ? (
              <>
                <Button variant="secondary" size="sm" onClick={openEdit}>Edit profile</Button>
                <Settings size={20} className="text-foreground cursor-pointer" />
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant={isFollowing ? 'secondary' : 'default'}
                  className={isFollowing ? '' : 'bg-primary text-primary-foreground'}
                  onClick={handleFollow}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleMessage}>Message</Button>
              </>
            )}
          </div>

          <div className="flex gap-8 mb-4 text-sm">
            <span><strong>{posts.length}</strong> posts</span>
            <span><strong>{formatNum(account.followers)}</strong> followers</span>
            <span><strong>{formatNum(account.following)}</strong> following</span>
          </div>

          <div className="text-sm">
            <p className="font-semibold">
              {account.displayName}
              {account.pronouns && (
                <span className="text-muted-foreground font-normal ml-1.5">({account.pronouns})</span>
              )}
            </p>
            {account.category && <p className="text-muted-foreground">{account.category}</p>}
            {account.bio && <p className="whitespace-pre-wrap mt-1">{account.bio}</p>}
            {account.location && <p className="text-muted-foreground mt-1">{account.location}</p>}
            {account.website && (
              <a className="text-primary mt-1 block" href={account.website} target="_blank" rel="noreferrer">
                {account.website}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Highlights */}
      <HighlightsRow accountId={account.id} canEdit={isOwn} />

      {/* Tabs */}
      <div className="border-t border-border flex justify-center gap-12">

        <button
          onClick={() => setTab('posts')}
          className={`flex items-center gap-1 py-3 text-xs font-semibold tracking-wider uppercase border-t transition-colors ${
            tab === 'posts' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'
          }`}
        >
          <Grid3X3 size={14} /> Posts
        </button>
        <button
          onClick={() => setTab('reels')}
          className={`flex items-center gap-1 py-3 text-xs font-semibold tracking-wider uppercase border-t transition-colors ${
            tab === 'reels' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'
          }`}
        >
          <Film size={14} /> Reels
        </button>
        {isOwn && (
          <button
            onClick={() => setTab('saved')}
            className={`flex items-center gap-1 py-3 text-xs font-semibold tracking-wider uppercase border-t transition-colors ${
              tab === 'saved' ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            <Bookmark size={14} /> Saved
          </button>
        )}
      </div>

      {/* Post Grid - shows posts + reels merged by date, pinned first */}
      {tab === 'posts' && (() => {
        type GridItem = { kind: 'post'; post: Post; date: number } | { kind: 'reel'; reel: Reel; date: number };
        const pinnedItems: GridItem[] = [
          ...pinnedPosts.map(p => ({ kind: 'post', post: p, date: new Date(p.createdAt).getTime() } as GridItem)),
          ...pinnedReels.map(r => ({ kind: 'reel', reel: r, date: new Date(r.createdAt).getTime() } as GridItem)),
        ].sort((a, b) => b.date - a.date);
        const unpinnedItems: GridItem[] = [
          ...unpinnedPosts.map(p => ({ kind: 'post', post: p, date: new Date(p.createdAt).getTime() } as GridItem)),
          ...unpinnedReels.map(r => ({ kind: 'reel', reel: r, date: new Date(r.createdAt).getTime() } as GridItem)),
        ].sort((a, b) => b.date - a.date);
        const items: GridItem[] = [...pinnedItems, ...unpinnedItems];
        const total = items.length;
        const cols = 5;
        const lastRowStart = Math.floor((total - 1) / cols) * cols;
        const visibleItems = items.slice(0, postsVisible.count);
        return (
          <>

          <div className="grid grid-cols-5 mt-1" style={{ gap: '2px' }}>
            {visibleItems.map((it, idx) => {
              const isTopLeft = idx === 0;
              const isTopRight = idx === Math.min(cols - 1, total - 1);
              const isBottomLeft = idx === lastRowStart;
              const isBottomRight = idx === total - 1;
              const rounded = `${isTopLeft ? 'rounded-tl-lg' : ''} ${isTopRight ? 'rounded-tr-lg' : ''} ${isBottomLeft ? 'rounded-bl-lg' : ''} ${isBottomRight ? 'rounded-br-lg' : ''}`;
              if (it.kind === 'post') {
                const post = it.post;
                const count = post.media?.length ?? post.images.length;
                return (
                  <button
                    key={`p-${post.id}`}
                    onClick={() => setSelectedPost(post)}
                    className={`aspect-[4/5] bg-secondary overflow-hidden relative group ${rounded}`}
                  >
                    <img src={post.images[0]} alt="" loading="lazy" className="w-full h-full object-cover" />
                    {post.isPinned && (
                      <span className="absolute top-1.5 left-1.5 text-white drop-shadow">
                        <Pin size={16} className="fill-white" />
                      </span>
                    )}
                    {count > 1 && (
                      <span className="absolute top-1.5 right-1.5 text-white drop-shadow">
                        <CarouselBadgeIcon size={20} />
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white text-sm font-semibold">
                      <span className="flex items-center gap-1.5"><HeartIcon size={18} filled /> {formatCount(post.likes)}</span>
                      <span className="flex items-center gap-1.5"><CommentFilledIcon size={18} /> {formatCount((post.baseComments || 0) + post.comments.length)}</span>
                    </div>
                  </button>
                );
              }
              const reel = it.reel;
              return (
                <button
                  key={`r-${reel.id}`}
                  onClick={() => handleOpenReel(reel)}
                  className={`aspect-[4/5] bg-secondary overflow-hidden relative group ${rounded}`}
                >
                  <img src={reel.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
                  {reel.isPinned && (
                    <span className="absolute top-1.5 left-1.5 text-white drop-shadow">
                      <Pin size={16} className="fill-white" />
                    </span>
                  )}
                  <span className="absolute top-1.5 right-1.5 text-white drop-shadow">
                    <Film size={16} />
                  </span>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white text-sm font-semibold">
                    <span className="flex items-center gap-1.5"><HeartIcon size={18} filled /> {formatCount(reel.likes)}</span>
                    <span className="flex items-center gap-1.5"><Film size={16} /> {formatNum(reel.views)}</span>
                  </div>
                </button>
              );
            })}
            {total === 0 && (
              <div className="col-span-5 py-20 text-center text-muted-foreground">No posts yet</div>
            )}
          </div>
          {postsVisible.hasMore && <div ref={postsVisible.sentinelRef} className="h-10" />}
          </>
        );
      })()}


      {tab === 'reels' && (
        <div className="grid grid-cols-5 mt-1" style={{ gap: '2px' }}>
          {reels.map(reel => (
            <button
              key={reel.id}
              onClick={() => handleOpenReel(reel)}
              className="aspect-[4/5] bg-secondary overflow-hidden relative group"
            >
              <img src={reel.thumbnail} alt="" className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
              {reel.isPinned && pinnedReelIds.has(reel.id) && (
                <span className="absolute top-1.5 left-1.5 text-white drop-shadow">
                  <Pin size={16} className="fill-white" />
                </span>
              )}
              <div className="absolute bottom-2 left-2 text-xs font-semibold flex items-center gap-1 text-white drop-shadow">
                <Film size={12} /> {formatNum(reel.views)}
              </div>
            </button>
          ))}
          {reels.length === 0 && (
            <div className="col-span-5 py-20 text-center text-muted-foreground">No reels yet</div>
          )}
        </div>
      )}

      {tab === 'saved' && (
        <div className="grid grid-cols-3 gap-1 mt-1">
          {savedPosts.map(post => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="aspect-square bg-secondary overflow-hidden relative group"
            >
              <img src={post.images[0]} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
          {savedPosts.length === 0 && (
            <div className="col-span-3 py-20 text-center text-muted-foreground">No saved posts yet</div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(next) => { if (!next && cropImage) return; setEditOpen(next); }}>
        <DialogContent
          className="bg-card border-border"
          onPointerDownOutside={(e) => { if (cropImage) e.preventDefault(); }}
          onInteractOutside={(e) => { if (cropImage) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (cropImage) e.preventDefault(); }}
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
                <input type="file" accept="image/*" className="hidden" onChange={handleProfilePicChange} />
              </label>
            </div>
            <Input placeholder="Display Name" value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))} />
            <Input placeholder="Pronouns (e.g. she/her)" value={editForm.pronouns} onChange={e => setEditForm(f => ({ ...f, pronouns: e.target.value }))} />
            <CategoryPicker value={editForm.category} onChange={(v) => setEditForm(f => ({ ...f, category: v }))} />
            <Textarea placeholder="Bio" value={editForm.bio} onChange={e => setEditForm(f => ({ ...f, bio: e.target.value }))} rows={3} />
            <Input placeholder="Website" value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} />
            <Input placeholder="Location" value={editForm.location} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" placeholder="Followers" value={editForm.followers} onChange={e => setEditForm(f => ({ ...f, followers: parseInt(e.target.value) || 0 }))} />
              <Input type="number" placeholder="Following" value={editForm.following} onChange={e => setEditForm(f => ({ ...f, following: parseInt(e.target.value) || 0 }))} />
            </div>
            <Button onClick={handleEditSave} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Cropper */}
      {cropImage && (
        <ImageCropper
          image={cropImage}
          onCropDone={handleCropDone}
          onCancel={() => setCropImage(null)}
          aspectRatio={1}
        />
      )}

      {/* Post Modal */}
      {selectedPost && (
        <PostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUpdate={() => setTick(t => t + 1)}
        />
      )}

      <ReelModal
        reel={selectedReel}
        onClose={() => setSelectedReel(null)}
        onUpdate={() => setTick(t => t + 1)}
        onNavigate={handleNavigateReel}
        canNavigate
      />
    </div>
  );
};

export default ProfilePage;
