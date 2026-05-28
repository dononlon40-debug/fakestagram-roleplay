import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getReels, getAccount, getLikedReels, toggleLikeReel, getSavedReels, toggleSaveReel, getReel, getFollowing, toggleFollow } from '@/lib/store';
import { ArrowDown, ArrowUp, MessageCircle, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { HeartFilledIcon, HeartIcon, SaveIcon, ShareIcon } from '@/components/icons/InstagramIcons';
import ShareToDmModal from '@/components/ShareToDmModal';
import ReelModal from '@/components/ReelModal';
import ReelMenu from '@/components/ReelMenu';
import { Reel } from '@/lib/types';
import { useApp } from '@/contexts/AppContext';
import { toast } from '@/components/ui/use-toast';
import { formatCount, splitHashtags } from '@/lib/utils';

const ReelsPage = () => {
  const { activeAccountId, refresh } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Capture once — clearing the URL param later must not re-shuffle and lose the target reel.
  const [initialReelId] = useState<string | null>(() => searchParams.get('reel'));
  const allReels = getReels();
  const reelOrder = useMemo(() => {
    const shuffled = [...allReels].sort(() => Math.random() - 0.5).map(reel => reel.id);
    if (initialReelId && shuffled.includes(initialReelId)) {
      return [initialReelId, ...shuffled.filter(id => id !== initialReelId)];
    }
    return shuffled;
  }, [allReels.length, initialReelId]);
  const [muted, setMuted] = useState(true);
  const [shareReel, setShareReel] = useState<Reel | null>(null);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [heartPop, setHeartPop] = useState<string | null>(null);
  const [playPauseFeedback, setPlayPauseFeedback] = useState<{ id: string; kind: 'play' | 'pause'; nonce: number } | null>(null);
  const [slideDir, setSlideDir] = useState<'next' | 'previous' | null>(null);
  const [, setTick] = useState(0);
  const singleTapTimer = useRef<number | null>(null);
  const wheelLockUntil = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Clear the ?reel= query param after consuming it so navigating away/back behaves normally
  useEffect(() => {
    if (searchParams.get('reel')) {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeReelId = reelOrder[activeIndex] || reelOrder[0];
  const activeReel = activeReelId ? getReel(activeReelId) : null;
  const account = activeReel ? getAccount(activeReel.accountId) : null;
  const isLiked = activeAccountId && activeReel ? getLikedReels(activeAccountId).includes(activeReel.id) : false;
  const isSaved = activeAccountId && activeReel ? getSavedReels(activeAccountId).includes(activeReel.id) : false;
  const totalComments = activeReel ? (activeReel.baseComments || 0) + activeReel.comments.length : 0;
  const isOwn = !!activeAccountId && !!activeReel && activeAccountId === activeReel.accountId;
  const isFollowing = !!activeAccountId && !!activeReel
    ? getFollowing(activeAccountId).includes(activeReel.accountId)
    : false;

  const handleToggleFollow = () => {
    if (!activeAccountId || !activeReel || isOwn) return;
    toggleFollow(activeAccountId, activeReel.accountId);
    bump();
  };

  const renderText = (text: string) => splitHashtags(text).map((part, index) => (
    part.isHashtag ? <span key={`${part.text}-${index}`} className="text-primary">{part.text}</span> : part.text
  ));

  const bump = () => {
    setTick(t => t + 1);
    refresh();
  };

  const handleLike = () => {
    if (!activeAccountId || !activeReel) return;
    toggleLikeReel(activeAccountId, activeReel.id);
    bump();
  };

  const handleSave = () => {
    if (!activeAccountId || !activeReel) return;
    toggleSaveReel(activeAccountId, activeReel.id);
    bump();
  };

  const showHeart = (reelId: string) => {
    setHeartPop(reelId);
    window.setTimeout(() => setHeartPop(curr => curr === reelId ? null : curr), 800);
  };

  const handleDoubleTapLike = () => {
    if (singleTapTimer.current) {
      window.clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
    if (!activeAccountId || !activeReel) return;
    if (!getLikedReels(activeAccountId).includes(activeReel.id)) {
      toggleLikeReel(activeAccountId, activeReel.id);
      bump();
    }
    showHeart(activeReel.id);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video || !activeReel) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPlayPauseFeedback({ id: activeReel.id, kind: 'play', nonce: Date.now() });
    } else {
      video.pause();
      setPlayPauseFeedback({ id: activeReel.id, kind: 'pause', nonce: Date.now() });
    }
  };

  const handleMediaClick = () => {
    if (singleTapTimer.current) {
      window.clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
    singleTapTimer.current = window.setTimeout(() => {
      togglePlayPause();
      singleTapTimer.current = null;
    }, 240);
  };

  const handleNavigate = (direction: 'next' | 'previous') => {
    const nextIndex = activeIndex + (direction === 'next' ? 1 : -1);
    if (nextIndex < 0 || nextIndex >= reelOrder.length) {
      toast({ title: "that's all for now" });
      return;
    }
    const nextReel = getReel(reelOrder[nextIndex]);
    setSlideDir(direction);
    setActiveIndex(nextIndex);
    if (selectedReel && nextReel) setSelectedReel(nextReel);
  };

  const handleWheel = (event: React.WheelEvent) => {
    if (selectedReel) return;
    if (Math.abs(event.deltaY) < 12) return;
    const now = Date.now();
    if (now < wheelLockUntil.current) return;
    wheelLockUntil.current = now + 450;
    handleNavigate(event.deltaY > 0 ? 'next' : 'previous');
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (selectedReel) return;
      if (event.key === 'ArrowDown') handleNavigate('next');
      if (event.key === 'ArrowUp') handleNavigate('previous');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, reelOrder.length, selectedReel]);

  if (allReels.length === 0 || !activeReel) {
    return (
      <div className="flex items-center justify-center h-[80vh] text-muted-foreground text-sm">
        No reels yet. Create one from the Create page!
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background px-4 py-5">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(210px,1fr)_minmax(320px,520px)_96px]">
        <aside className="order-2 flex flex-col gap-3 self-end pb-4 lg:order-1 lg:self-end lg:items-end lg:pb-2">
          <div className="w-full max-w-sm lg:pr-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => activeReel && navigate(`/profile/${activeReel.accountId}`)}
                className="flex items-center gap-2 hover:opacity-80"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
                  {account?.profilePicture && <img src={account.profilePicture} alt="" className="h-full w-full object-cover" />}
                </div>
                <span className="text-sm font-semibold">{account?.username}</span>
              </button>
              {!isOwn && (
                <button
                  onClick={handleToggleFollow}
                  className={`text-sm font-semibold hover:opacity-80 ${isFollowing ? 'text-muted-foreground' : 'text-primary'}`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
            {activeReel.caption && <p className="mt-2 text-sm leading-relaxed">{renderText(activeReel.caption)}</p>}
          </div>
        </aside>

        <section
          className="relative order-1 mx-auto flex h-[calc(100vh-3rem)] max-h-[900px] w-full max-w-[520px] items-center justify-center overflow-hidden lg:order-2"
          onWheel={handleWheel}
        >
          <div
            key={`${activeReel.id}-${slideDir ?? 'init'}`}
            className="relative h-full max-h-[900px] w-full overflow-hidden rounded-md bg-card shadow-2xl select-none"
            style={slideDir ? {
              animation: `${slideDir === 'next' ? 'reel-slide-up' : 'reel-slide-down'} 0.35s cubic-bezier(0.22, 0.61, 0.36, 1)`,
            } : undefined}
            onDoubleClick={handleDoubleTapLike}
          >
            {activeReel.video ? (
              <video
                key={activeReel.id}
                ref={videoRef}
                src={activeReel.video}
                poster={activeReel.thumbnail}
                className="h-full w-full object-cover"
                autoPlay
                loop
                muted={muted}
                playsInline
              />
            ) : (
              <img src={activeReel.thumbnail} alt="" className="h-full w-full object-cover" draggable={false} />
            )}
            <button
              onClick={handleMediaClick}
              className="absolute inset-0 cursor-default"
              aria-label="Play or pause reel"
            />
            {activeReel.video && (
              <button
                onClick={(e) => { e.stopPropagation(); setMuted(m => !m); }}
                className="absolute bottom-4 right-4 z-10 rounded-full bg-background/70 p-2 text-foreground backdrop-blur hover:bg-background"
                aria-label="Toggle mute"
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}
            {heartPop === activeReel.id && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <HeartFilledIcon size={100} className="drop-shadow-lg animate-[heart-pop_0.8s_ease-out_forwards]" />
              </div>
            )}
            {playPauseFeedback && playPauseFeedback.id === activeReel.id && (
              <div
                key={playPauseFeedback.nonce}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-black/55 text-white"
                  style={{ animation: 'playpause-pop 0.7s ease-out forwards' }}
                >
                  {playPauseFeedback.kind === 'play'
                    ? <Play size={36} fill="currentColor" className="ml-1" />
                    : <Pause size={36} fill="currentColor" />}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="order-3 flex flex-row items-end justify-center gap-5 pb-4 lg:flex-col lg:self-center lg:pb-0">
          <button onClick={handleLike} className="flex flex-col items-center gap-1 hover:opacity-70" aria-label="Like reel">
            {isLiked ? <HeartFilledIcon size={27} /> : <HeartIcon size={27} />}
            <span className="text-xs font-semibold">{formatCount(activeReel.likes)}</span>
          </button>
          <button onClick={() => setSelectedReel(activeReel)} className="flex flex-col items-center gap-1 hover:opacity-70" aria-label="Comment on reel">
            <MessageCircle size={27} />
            <span className="text-xs font-semibold">{formatCount(totalComments)}</span>
          </button>
          <button onClick={() => setShareReel(activeReel)} className="flex flex-col items-center gap-1 hover:opacity-70" aria-label="Share reel">
            <ShareIcon size={27} />
          </button>
          <button onClick={handleSave} className="flex flex-col items-center gap-1 hover:opacity-70" aria-label="Save reel">
            <SaveIcon size={27} filled={!!isSaved} />
          </button>
          <div className="flex flex-col items-center gap-1 hover:opacity-70" aria-label="More reel options">
            <ReelMenu reel={activeReel} onChanged={bump} />
          </div>
          <button
            onClick={() => activeReel && navigate(`/profile/${activeReel.accountId}`)}
            className="h-7 w-7 overflow-hidden rounded bg-secondary hover:opacity-80"
            aria-label="Open creator profile"
          >
            {account?.profilePicture && <img src={account.profilePicture} alt="" className="h-full w-full object-cover" />}
          </button>
        </aside>

        <div className="fixed right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-4 xl:flex">
          <button
            onClick={() => handleNavigate('previous')}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-foreground shadow-lg hover:bg-accent"
            aria-label="Previous reel"
          >
            <ArrowUp size={24} />
          </button>
          <button
            onClick={() => handleNavigate('next')}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-foreground shadow-lg hover:bg-accent"
            aria-label="Next reel"
          >
            <ArrowDown size={24} />
          </button>
        </div>
      </div>

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
        onUpdate={bump}
        onNavigate={handleNavigate}
        canNavigate
      />
    </div>
  );
};

export default ReelsPage;
