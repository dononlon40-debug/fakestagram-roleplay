import { useState, useEffect, useCallback, useMemo } from 'react';
import { Story, DirectMessage, SharedPostRef } from '@/lib/types';
import {
  getAccount, getOrCreateConversation, saveMessage, saveConversation, uid,
  getHighlight, deleteStory, saveHighlight,
} from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { X, Pause, Play, MoreHorizontal, Heart, Send, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import ShareToDmModal from './ShareToDmModal';

interface Props {
  // Single-group mode (back-compat)
  stories?: Story[];
  initialIndex?: number;
  // Multi-account mode: each inner array is one account's story batch
  groups?: Story[][];
  initialGroupIndex?: number;
  // When viewing highlights, parallel array of highlight ids for sharing/replying with context
  highlightIds?: string[];
  onClose: () => void;
}

const StoryViewer = ({ stories, initialIndex = 0, groups, initialGroupIndex = 0, highlightIds, onClose }: Props) => {
  const { activeAccount, refresh } = useApp();
  const navigate = useNavigate();

  const normalizedGroups: Story[][] = useMemo(() => {
    if (groups && groups.length > 0) return groups.filter(g => g.length > 0);
    if (stories && stories.length > 0) return [stories];
    return [];
  }, [groups, stories]);

  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  const currentGroup = normalizedGroups[groupIdx] || [];
  const story = currentGroup[storyIdx];
  const account = story ? getAccount(story.accountId) : null;
  const currentHighlightId = highlightIds?.[groupIdx];

  const goNext = useCallback(() => {
    if (storyIdx < currentGroup.length - 1) {
      setStoryIdx(i => i + 1);
      setProgress(0);
    } else if (groupIdx < normalizedGroups.length - 1) {
      setGroupIdx(i => i + 1);
      setStoryIdx(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [storyIdx, currentGroup.length, groupIdx, normalizedGroups.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx(i => i - 1);
      setProgress(0);
    } else if (groupIdx > 0) {
      const prevGroup = normalizedGroups[groupIdx - 1];
      setGroupIdx(i => i - 1);
      setStoryIdx(prevGroup.length - 1);
      setProgress(0);
    }
  }, [storyIdx, groupIdx, normalizedGroups]);

  useEffect(() => { setProgress(0); }, [storyIdx, groupIdx]);

  useEffect(() => {
    if (paused || menuOpen || shareOpen) return;
    const duration = 5000;
    const interval = 50;
    const step = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { goNext(); return 0; }
        return p + step;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [storyIdx, groupIdx, paused, menuOpen, shareOpen, goNext]);

  if (!story) return null;

  const prevGroup = groupIdx > 0 ? normalizedGroups[groupIdx - 1] : null;
  const nextGroup = groupIdx < normalizedGroups.length - 1 ? normalizedGroups[groupIdx + 1] : null;

  const goPrevGroup = () => {
    if (groupIdx > 0) { setGroupIdx(i => i - 1); setStoryIdx(0); setProgress(0); }
  };
  const goNextGroup = () => {
    if (groupIdx < normalizedGroups.length - 1) { setGroupIdx(i => i + 1); setStoryIdx(0); setProgress(0); }
  };

  const isHighlightMode = !!highlightIds;
  const prevHighlight = isHighlightMode && groupIdx > 0 ? getHighlight(highlightIds![groupIdx - 1]) : null;
  const nextHighlight = isHighlightMode && groupIdx < (highlightIds?.length || 0) - 1 ? getHighlight(highlightIds![groupIdx + 1]) : null;

  const renderSidePreview = (group: Story[] | null, side: 'prev' | 'next') => {
    if (!group) return null;
    const acc = getAccount(group[0].accountId);
    const hl = side === 'prev' ? prevHighlight : nextHighlight;
    const coverSrc = isHighlightMode ? (hl?.coverImage || group[0].image) : group[0].image;
    const label = isHighlightMode ? (hl?.name || acc?.username) : acc?.username;
    return (
      <>
        <img src={group[0].image} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2">
          <div className="p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
            <div className="p-[2px] rounded-full bg-black">
              <div className="w-16 h-16 rounded-full bg-secondary overflow-hidden">
                {coverSrc && <img src={coverSrc} alt="" className="w-full h-full object-cover" />}
              </div>
            </div>
          </div>
          <span className="text-white text-sm font-semibold text-center truncate max-w-full">{label}</span>
          {!isHighlightMode && (
            <span className="text-white/80 text-xs">
              {Math.max(1, Math.round((Date.now() - new Date(group[0].createdAt).getTime()) / 3600000))}h ago
            </span>
          )}
        </div>
      </>
    );
  };

  const canDelete = !!activeAccount && !!account && activeAccount.id === account.id;

  const handleDeleteStory = () => {
    if (!confirm('Delete this story post?')) return;
    setMenuOpen(false);
    const syntheticMatch = story.id.match(/^(.+)-img-(\d+)$/);
    if (syntheticMatch && isHighlightMode) {
      // Remove from highlight.images
      const hl = getHighlight(syntheticMatch[1]);
      if (hl) {
        const idx = parseInt(syntheticMatch[2], 10);
        const nextImages = (hl.images || []).filter((_, i) => i !== idx);
        saveHighlight({ ...hl, images: nextImages });
      }
    } else {
      deleteStory(story.id);
    }
    refresh();
    // Remove from local group
    const newGroup = currentGroup.filter((_, i) => i !== storyIdx);
    if (newGroup.length === 0) {
      // group empty -> advance to next group or close
      if (groupIdx < normalizedGroups.length - 1) {
        setGroupIdx(i => i + 1); setStoryIdx(0); setProgress(0);
      } else {
        onClose();
      }
    } else {
      setStoryIdx(i => Math.min(i, newGroup.length - 1));
      setProgress(0);
      // Mutate the underlying array reference
      currentGroup.splice(0, currentGroup.length, ...newGroup);
    }
  };

  const buildEmbedRef = (): SharedPostRef | null => {
    if (!account) return null;
    if (currentHighlightId) {
      return { kind: 'highlight', contentId: currentHighlightId, accountId: account.id, image: story.image };
    }
    // Don't embed synthetic highlight images
    if (story.id.match(/^.+-img-\d+$/)) return null;
    return { kind: 'story', contentId: story.id, accountId: account.id, image: story.image };
  };

  const sendReply = () => {
    if (!replyText.trim() || !activeAccount || !account) return;
    if (activeAccount.id === account.id) {
      toast({ title: "Can't reply to your own story" });
      return;
    }
    const conv = getOrCreateConversation(activeAccount.id, account.id);
    const now = new Date().toISOString();
    const textMsg: DirectMessage = {
      id: uid(),
      fromAccountId: activeAccount.id,
      toAccountId: account.id,
      text: replyText.trim(),
      createdAt: now,
      isRead: false,
    };
    saveMessage(conv.id, textMsg);

    const sharedPost = buildEmbedRef();
    let embedMsg: DirectMessage | null = null;
    if (sharedPost) {
      embedMsg = {
        id: uid(),
        fromAccountId: activeAccount.id,
        toAccountId: account.id,
        text: '',
        sharedPost,
        createdAt: new Date(Date.now() + 1).toISOString(),
        isRead: false,
      };
      saveMessage(conv.id, embedMsg);
    }
    saveConversation({ ...conv, lastMessage: embedMsg || textMsg, updatedAt: embedMsg?.createdAt || now });
    setReplyText('');
    toast({ title: `Reply sent to @${account.username}` });
  };

  const handleLike = () => {
    if (!activeAccount || !account) return;
    if (activeAccount.id === account.id) {
      toast({ title: "Can't like your own story" });
      return;
    }
    const conv = getOrCreateConversation(activeAccount.id, account.id);
    const now = new Date().toISOString();
    const kindLabel = currentHighlightId ? 'highlight' : 'story';
    const textMsg: DirectMessage = {
      id: uid(),
      fromAccountId: activeAccount.id,
      toAccountId: account.id,
      text: `Liked your ${kindLabel}`,
      createdAt: now,
      isRead: false,
    };
    saveMessage(conv.id, textMsg);

    const sharedPost = buildEmbedRef();
    let embedMsg: DirectMessage | null = null;
    if (sharedPost) {
      embedMsg = {
        id: uid(),
        fromAccountId: activeAccount.id,
        toAccountId: account.id,
        text: '',
        sharedPost,
        createdAt: new Date(Date.now() + 1).toISOString(),
        isRead: false,
      };
      saveMessage(conv.id, embedMsg);
    }
    saveConversation({ ...conv, lastMessage: embedMsg || textMsg, updatedAt: embedMsg?.createdAt || now });
    toast({ title: `❤️ Liked @${account.username}'s ${kindLabel}` });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center gap-4 px-4">
      <button onClick={onClose} className="absolute top-5 right-5 text-white/90 hover:text-white z-20">
        <X size={28} />
      </button>

      {/* Previous group preview */}
      <button
        onClick={goPrevGroup}
        disabled={!prevGroup}
        className="hidden md:block relative w-[200px] h-[360px] rounded-md overflow-hidden bg-black shrink-0 opacity-70 hover:opacity-90 transition-opacity disabled:opacity-0 disabled:pointer-events-none"
        aria-label="Previous"
      >
        {renderSidePreview(prevGroup, 'prev')}
      </button>

      {/* Left nav arrow */}
      <button
        onClick={goPrev}
        disabled={groupIdx === 0 && storyIdx === 0}
        className="hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-white/90 text-black hover:bg-white shrink-0 disabled:opacity-40 disabled:pointer-events-none z-10"
        aria-label="Previous story"
      >
        <ChevronLeft size={20} />
      </button>



      {/* Story frame */}
      <div className="relative w-full max-w-[420px] h-[92vh] max-h-[760px] rounded-md overflow-hidden bg-black shrink-0 flex flex-col">
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 z-10">
          {currentGroup.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full"
                style={{
                  width: i < storyIdx ? '100%' : i === storyIdx ? `${progress}%` : '0%',
                  transition: i === storyIdx ? 'width 50ms linear' : 'none',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-5 left-3 right-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => { if (account) { onClose(); navigate(`/profile/${account.id}`); } }}
              className="flex items-center gap-2 min-w-0 hover:opacity-80"
            >
              <div className="w-8 h-8 rounded-full bg-secondary overflow-hidden shrink-0">
                {account?.profilePicture && (
                  <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <span className="text-white text-sm font-semibold truncate">{account?.username}</span>
            </button>
            <span className="text-white/60 text-xs shrink-0">
              {Math.max(1, Math.round((Date.now() - new Date(story.createdAt).getTime()) / 3600000))}h
            </span>
          </div>
          <div className="flex items-center gap-3 text-white">
            <button onClick={() => setPaused(p => !p)} className="hover:opacity-70" aria-label="Pause/play">
              {paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
            </button>
            <button onClick={() => setMenuOpen(true)} className="hover:opacity-70" aria-label="More">
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>

        {/* Image */}
        <img src={story.image} alt="" className="absolute inset-0 w-full h-full object-contain" />

        {/* Tap zones */}
        <button className="absolute left-0 top-12 w-1/3 bottom-20 z-[5]" onClick={goPrev} aria-label="Previous" />
        <button className="absolute right-0 top-12 w-1/3 bottom-20 z-[5]" onClick={goNext} aria-label="Next" />

        {/* Reply / share bar — overlaid at bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 flex items-center gap-2 bg-gradient-to-t from-black/90 to-transparent">
          <div className="flex-1 flex items-center border border-white/60 rounded-full px-4 py-2 bg-black/30 backdrop-blur-sm">
            <input
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
              placeholder={`Reply to ${account?.username || 'user'}...`}
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/60 outline-none"
            />
          </div>
          <button onClick={handleLike} className="text-white hover:scale-110 transition-transform" aria-label="Like">
            <Heart size={26} />
          </button>
          <button onClick={() => setShareOpen(true)} className="text-white hover:scale-110 transition-transform" aria-label="Share">
            <Send size={24} />
          </button>
        </div>
      </div>

      {/* Right nav arrow */}
      <button
        onClick={goNext}
        className="hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-white/90 text-black hover:bg-white shrink-0 z-10"
        aria-label="Next story"
      >
        <ChevronRight size={20} />
      </button>

      {/* Next group preview */}
      <button
        onClick={goNextGroup}
        disabled={!nextGroup}
        className="hidden md:block relative w-[200px] h-[360px] rounded-md overflow-hidden bg-black shrink-0 opacity-70 hover:opacity-90 transition-opacity disabled:opacity-0 disabled:pointer-events-none"
        aria-label="Next"
      >
        {renderSidePreview(nextGroup, 'next')}
      </button>



      {/* Three-dot menu */}
      {menuOpen && (
        <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center" onClick={() => setMenuOpen(false)}>
          <div className="bg-card rounded-2xl w-[320px] overflow-hidden border border-border" onClick={(e) => e.stopPropagation()}>
            {canDelete && (
              <button onClick={handleDeleteStory} className="w-full px-4 py-3 text-sm text-destructive font-semibold border-b border-border hover:bg-secondary/50 flex items-center justify-center gap-2">
                <Trash2 size={14} /> Delete
              </button>
            )}
            <button onClick={() => setMenuOpen(false)} className="w-full px-4 py-3 text-sm text-destructive font-semibold border-b border-border hover:bg-secondary/50">
              Report inappropriate content
            </button>
            <button onClick={() => setMenuOpen(false)} className="w-full px-4 py-3 text-sm border-b border-border hover:bg-secondary/50">
              About this account
            </button>
            <button onClick={() => setMenuOpen(false)} className="w-full px-4 py-3 text-sm hover:bg-secondary/50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {shareOpen && account && (
        <ShareToDmModal
          shareable={
            currentHighlightId
              ? { kind: 'highlight', contentId: currentHighlightId, accountId: account.id, image: story.image }
              : { kind: 'story', contentId: story.id, accountId: account.id, image: story.image }
          }
          open
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
};

export default StoryViewer;
