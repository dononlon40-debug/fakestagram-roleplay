import { useEffect, useRef, useState } from 'react';
import { getPosts, getReels, getAccount, getStories, getStoriesByAccount, getLikedPosts, toggleLikePost, getSavedPosts, toggleSavePost, getFollowing, toggleFollow, getLikedReels, toggleLikeReel, getSavedReels, toggleSaveReel } from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { HeartIcon, HeartFilledIcon, CommentIcon, ShareIcon, SaveIcon } from '@/components/icons/InstagramIcons';
import { Film, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react';
import PostModal from '@/components/PostModal';
import ReelModal from '@/components/ReelModal';
import StoryViewer from '@/components/StoryViewer';
import ShareToDmModal from '@/components/ShareToDmModal';
import PostMenu from '@/components/PostMenu';
import PostCarousel from '@/components/PostCarousel';
import { toast } from '@/components/ui/use-toast';
import { Post, Story, Reel } from '@/lib/types';
import { useNavigate } from 'react-router-dom';
import { formatCount, splitHashtags } from '@/lib/utils';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

const FeedPage = () => {
  const { activeAccount, activeAccountId, accounts, refresh } = useApp();
  const navigate = useNavigate();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [shareReel, setShareReel] = useState<Reel | null>(null);
  const [storyViewer, setStoryViewer] = useState<{ groups: Story[][]; groupIndex: number } | null>(null);
  const [heartPop, setHeartPop] = useState<string | null>(null);
  const [reelMuted, setReelMuted] = useState<Record<string, boolean>>({});
  const [reelQueue, setReelQueue] = useState<Reel[]>([]);
  const reelOpenTimer = useRef<number | null>(null);
  const storiesScrollRef = useRef<HTMLDivElement | null>(null);
  const [storyScrollState, setStoryScrollState] = useState({ canLeft: false, canRight: false });
  const [, setTick] = useState(0);

  const updateStoryScroll = () => {
    const el = storiesScrollRef.current;
    if (!el) { setStoryScrollState({ canLeft: false, canRight: false }); return; }
    const canLeft = el.scrollLeft > 4;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setStoryScrollState(prev =>
      prev.canLeft === canLeft && prev.canRight === canRight ? prev : { canLeft, canRight }
    );
  };

  const scrollStories = (dir: 'left' | 'right') => {
    const el = storiesScrollRef.current;
    if (!el) return;
    const delta = Math.max(160, Math.round(el.clientWidth * 0.7)) * (dir === 'left' ? -1 : 1);
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  useEffect(() => {
    updateStoryScroll();
    const el = storiesScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateStoryScroll, { passive: true });
    window.addEventListener('resize', updateStoryScroll);
    return () => {
      el.removeEventListener('scroll', updateStoryScroll);
      window.removeEventListener('resize', updateStoryScroll);
    };
  });


  const allPosts = getPosts();
  const allReels = getReels();
  const allStories = getStories();

  const following = activeAccountId ? getFollowing(activeAccountId) : [];
  const visibleAccountIds = new Set([...(activeAccountId ? [activeAccountId] : []), ...following]);
  const posts = activeAccountId ? allPosts.filter(p => visibleAccountIds.has(p.accountId)) : allPosts;
  const reels = activeAccountId ? allReels.filter(r => visibleAccountIds.has(r.accountId)) : allReels;

  // Merge posts + reels chronologically into a single feed
  type FeedItem =
    | { kind: 'post'; createdAt: string; post: Post }
    | { kind: 'reel'; createdAt: string; reel: Reel };
  const feedItems: FeedItem[] = [
    ...posts.map(p => ({ kind: 'post' as const, createdAt: p.createdAt, post: p })),
    ...reels.map(r => ({ kind: 'reel' as const, createdAt: r.createdAt, reel: r })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const feedVisible = useInfiniteScroll(feedItems.length, 8, 8);

  const accountsWithStories = accounts.filter(a =>
    allStories.some(s => s.accountId === a.id) && (!activeAccountId || visibleAccountIds.has(a.id))
  );

  const suggestions = accounts
    .filter(a => a.id !== activeAccountId && !following.includes(a.id))
    .slice(0, 5);

  const openStories = (accountId: string) => {
    const groups = accountsWithStories
      .map(a => getStoriesByAccount(a.id))
      .filter(g => g.length > 0);
    const idx = accountsWithStories.findIndex(a => a.id === accountId);
    if (groups.length > 0) setStoryViewer({ groups, groupIndex: Math.max(0, idx) });
  };

  const handleLike = (postId: string) => {
    if (!activeAccountId) return;
    toggleLikePost(activeAccountId, postId);
    refresh();
    setTick(t => t + 1);
  };

  const handleSave = (postId: string) => {
    if (!activeAccountId) return;
    toggleSavePost(activeAccountId, postId);
    setTick(t => t + 1);
  };

  const handleLikeReel = (reelId: string) => {
    if (!activeAccountId) return;
    toggleLikeReel(activeAccountId, reelId);
    refresh();
    setTick(t => t + 1);
  };

  const handleSaveReel = (reelId: string) => {
    if (!activeAccountId) return;
    toggleSaveReel(activeAccountId, reelId);
    refresh();
    setTick(t => t + 1);
  };

  const handleOpenReel = (reel: Reel) => {
    const others = allReels.filter(r => r.id !== reel.id).sort(() => Math.random() - 0.5);
    setReelQueue([reel, ...others]);
    setSelectedReel(reel);
  };

  const handleReelMediaClick = (reel: Reel) => {
    if (reelOpenTimer.current) window.clearTimeout(reelOpenTimer.current);
    reelOpenTimer.current = window.setTimeout(() => {
      navigate(`/reels?reel=${reel.id}`);
      reelOpenTimer.current = null;
    }, 260);
  };

  const handleReelDoubleLike = (reel: Reel, isLiked: boolean) => {
    if (reelOpenTimer.current) {
      window.clearTimeout(reelOpenTimer.current);
      reelOpenTimer.current = null;
    }
    if (!isLiked) handleLikeReel(reel.id);
    setHeartPop(reel.id);
    setTimeout(() => setHeartPop(curr => curr === reel.id ? null : curr), 800);
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

  const handleFollow = (id: string) => {
    if (!activeAccountId) return;
    toggleFollow(activeAccountId, id);
    refresh();
    setTick(t => t + 1);
  };

  const renderText = (text: string) => splitHashtags(text).map((part, index) => (
    part.isHashtag ? <span key={`${part.text}-${index}`} className="text-primary">{part.text}</span> : part.text
  ));

  if (accounts.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center text-muted-foreground px-4">
        <p className="text-xl mb-3">Welcome to Fakestagram</p>
        <p className="text-sm mb-6">Create your first fake account to get started!</p>
        <button onClick={() => navigate('/accounts')} className="text-primary font-semibold hover:opacity-80">
          Create Account →
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center gap-16 px-6 py-6">
      {/* Feed column */}
      <div className="w-full max-w-[470px]">
        {accountsWithStories.length > 0 && (
          <div className="relative mb-4 group/stories">
            <div ref={storiesScrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide py-2 scroll-smooth">
              {accountsWithStories.map(a => (
                <button key={a.id} onClick={() => openStories(a.id)} className="flex flex-col items-center gap-1 shrink-0">
                  <div className="ig-story-ring">
                    <div className="ig-story-ring-inner">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-secondary">
                        {a.profilePicture ? (
                          <img src={a.profilePicture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-muted-foreground">
                            {a.username[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs truncate w-16 text-center">{a.username}</span>
                </button>
              ))}
            </div>
            {storyScrollState.canLeft && (
              <button
                aria-label="Scroll stories left"
                onClick={() => scrollStories('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/90 border border-border shadow-md flex items-center justify-center opacity-0 group-hover/stories:opacity-100 transition-opacity hover:bg-background"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {storyScrollState.canRight && (
              <button
                aria-label="Scroll stories right"
                onClick={() => scrollStories('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/90 border border-border shadow-md flex items-center justify-center opacity-0 group-hover/stories:opacity-100 transition-opacity hover:bg-background"
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        )}


        {feedItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-2">Your feed is empty</p>
            <p className="text-xs mb-4">Follow other profiles to see their posts here, or create a post yourself.</p>
            <button onClick={() => navigate('/explore')} className="text-primary font-semibold text-sm hover:opacity-80">
              Discover profiles →
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {feedItems.slice(0, feedVisible.count).map(item => {
              if (item.kind === 'reel') {
                const reel = item.reel;
                const account = getAccount(reel.accountId);
                const muted = reelMuted[reel.id] !== false;
                const isReelLiked = activeAccountId ? getLikedReels(activeAccountId).includes(reel.id) : false;
                const isReelSaved = activeAccountId ? getSavedReels(activeAccountId).includes(reel.id) : false;
                const totalReelComments = (reel.baseComments || 0) + reel.comments.length;
                return (
                  <article key={`reel-${reel.id}`} className="border-b border-border pb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <button onClick={() => navigate(`/profile/${reel.accountId}`)} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden">
                          {account?.profilePicture && <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <span className="font-semibold text-sm">{account?.username}</span>
                      </button>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Film size={12} /> Reel</span>
                    </div>

                    <div
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        handleReelDoubleLike(reel, isReelLiked);
                      }}
                      className="w-full relative bg-black rounded-sm overflow-hidden block"
                    >
                      {reel.video ? (
                        <video
                          src={reel.video}
                          poster={reel.thumbnail}
                          className="w-full aspect-[9/16] object-cover"
                          autoPlay
                          loop
                          muted={muted}
                          playsInline
                        />
                      ) : (
                        <img src={reel.thumbnail} alt="" className="w-full aspect-[9/16] object-cover" />
                      )}
                      <button
                        onClick={() => handleReelMediaClick(reel)}
                        className="absolute inset-0"
                        aria-label="Open reel"
                      />
                      {reel.video && (
                        <button
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setReelMuted(m => ({ ...m, [reel.id]: !muted })); }}
                          className="absolute top-3 right-3 bg-black/50 rounded-full p-2 text-white cursor-pointer z-10"
                          aria-label="Toggle mute"
                        >
                          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                      )}
                      {heartPop === reel.id && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <HeartFilledIcon size={96} className="drop-shadow-lg animate-[heart-pop_0.8s_ease-out_forwards]" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-3">
                      <button className="hover:opacity-60 transition-opacity" onClick={() => handleLikeReel(reel.id)}>
                        {isReelLiked ? <HeartFilledIcon size={24} /> : <HeartIcon size={24} />}
                      </button>
                      <button onClick={() => handleOpenReel(reel)} className="hover:opacity-60 transition-opacity">
                        <CommentIcon size={24} />
                      </button>
                      <button onClick={() => setShareReel(reel)} className="hover:opacity-60 transition-opacity"><ShareIcon size={24} /></button>
                      <button onClick={() => handleSaveReel(reel.id)} className="ml-auto hover:opacity-60 transition-opacity" aria-label="Save reel">
                        <SaveIcon size={24} filled={isReelSaved} />
                      </button>
                    </div>

                    <p className="font-semibold text-sm mt-2">{formatCount(reel.likes)} likes · {formatCount(reel.views)} views</p>
                    {totalReelComments > 0 && (
                      <button onClick={() => handleOpenReel(reel)} className="text-sm text-muted-foreground mt-1">
                        View all {formatCount(totalReelComments)} comments
                      </button>
                    )}
                    {reel.caption && (
                      <p className="text-sm mt-1">
                        <span className="font-semibold mr-2">{account?.username}</span>
                        {renderText(reel.caption)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(reel.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                    </p>
                  </article>
                );
              }

              const post = item.post;
              const account = getAccount(post.accountId);
              const isLiked = activeAccountId ? getLikedPosts(activeAccountId).includes(post.id) : false;
              const isSaved = activeAccountId ? getSavedPosts(activeAccountId).includes(post.id) : false;
              return (
                <article key={post.id} className="border-b border-border pb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => navigate(`/profile/${post.accountId}`)} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden">
                        {account?.profilePicture && <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <span className="font-semibold text-sm">{account?.username}</span>
                    </button>
                    <div className="ml-auto"><PostMenu post={post} onChanged={() => setTick(t => t + 1)} /></div>
                  </div>

                  <PostCarousel
                    post={post}
                    className="w-full rounded-sm overflow-hidden"
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      if (!isLiked) handleLike(post.id);
                      setHeartPop(post.id);
                      setTimeout(() => setHeartPop(curr => curr === post.id ? null : curr), 800);
                    }}
                    overlay={
                      heartPop === post.id ? (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <HeartFilledIcon size={96} className="drop-shadow-lg animate-[heart-pop_0.8s_ease-out_forwards]" />
                        </div>
                      ) : null
                    }
                  />


                  <div className="flex items-center gap-4 mt-3">
                    <button onClick={() => handleLike(post.id)} className="hover:opacity-60 transition-opacity">
                      {isLiked ? <HeartFilledIcon size={24} /> : <HeartIcon size={24} />}
                    </button>
                    <button onClick={() => setSelectedPost(post)} className="hover:opacity-60 transition-opacity">
                      <CommentIcon size={24} />
                    </button>
                    <button onClick={() => setSharePost(post)} className="hover:opacity-60 transition-opacity"><ShareIcon size={24} /></button>
                    <button onClick={() => handleSave(post.id)} className="ml-auto hover:opacity-60 transition-opacity">
                      <SaveIcon size={24} filled={isSaved} />
                    </button>
                  </div>

                  <p className="font-semibold text-sm mt-2">{formatCount(post.likes)} likes</p>
                  {post.caption && (
                    <p className="text-sm mt-1">
                      <span className="font-semibold mr-2">{account?.username}</span>
                      {renderText(post.caption)}
                    </p>
                  )}
                  {(() => {
                    const totalComments = (post.baseComments || 0) + post.comments.length;
                    return totalComments > 0 ? (
                      <button onClick={() => setSelectedPost(post)} className="text-sm text-muted-foreground mt-1">
                        View all {formatCount(totalComments)} comments
                      </button>
                    ) : null;
                  })()}

                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(post.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                  </p>
                </article>
              );
            })}
            {feedVisible.hasMore && <div ref={feedVisible.sentinelRef} className="h-10" />}
          </div>
        )}
      </div>

      {/* Right rail */}
      <aside className="hidden lg:block w-[320px] pt-2 shrink-0">
        {activeAccount && (
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => navigate(`/profile/${activeAccount.id}`)} className="w-11 h-11 rounded-full bg-secondary overflow-hidden shrink-0">
              {activeAccount.profilePicture && <img src={activeAccount.profilePicture} alt="" className="w-full h-full object-cover" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{activeAccount.username}</p>
              <p className="text-xs text-muted-foreground truncate">{activeAccount.displayName}</p>
            </div>
            <button onClick={() => navigate('/accounts')} className="text-xs font-semibold text-primary hover:opacity-80">
              Switch
            </button>
          </div>
        )}

        {suggestions.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-muted-foreground">Suggested for you</p>
              <button onClick={() => navigate('/explore')} className="text-xs font-semibold hover:text-muted-foreground">
                See all
              </button>
            </div>
            <div className="space-y-3">
              {suggestions.map(a => (
                <div key={a.id} className="flex items-center gap-3">
                  <button onClick={() => navigate(`/profile/${a.id}`)} className="w-9 h-9 rounded-full bg-secondary overflow-hidden shrink-0">
                    {a.profilePicture && <img src={a.profilePicture} alt="" className="w-full h-full object-cover" />}
                  </button>
                  <button onClick={() => navigate(`/profile/${a.id}`)} className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity">
                    <p className="text-sm font-semibold truncate">{a.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.displayName}</p>
                  </button>
                  <button
                    onClick={() => handleFollow(a.id)}
                    className="text-xs font-semibold text-primary hover:text-foreground"
                  >
                    Follow
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="text-[11px] text-muted-foreground mt-8 leading-relaxed">
          © {new Date().getFullYear()} FAKESTAGRAM · Offline roleplay
        </p>
      </aside>

      {selectedPost && (
        <PostModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUpdate={() => setTick(t => t + 1)}
        />
      )}
      {storyViewer && (
        <StoryViewer
          groups={storyViewer.groups}
          initialGroupIndex={storyViewer.groupIndex}
          onClose={() => setStoryViewer(null)}
        />
      )}
      {sharePost && (
        <ShareToDmModal
          shareable={{
            kind: 'post',
            contentId: sharePost.id,
            accountId: sharePost.accountId,
            image: sharePost.images[0],
            caption: sharePost.caption,
          }}
          open
          onClose={() => setSharePost(null)}
        />
      )}
      {shareReel && (
        <ShareToDmModal
          shareable={{
            kind: 'reel',
            contentId: shareReel.id,
            accountId: shareReel.accountId,
            image: shareReel.thumbnail,
            caption: shareReel.caption,
          }}
          open
          onClose={() => setShareReel(null)}
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

export default FeedPage;
