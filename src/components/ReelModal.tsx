import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccount, getLikedReels, toggleLikeReel, addReelComment, getLikedComments, toggleLikeReelComment, deleteReelComment, getReel, getSavedReels, toggleSaveReel } from '@/lib/store';
import { Comment, Reel } from '@/lib/types';
import { useApp } from '@/contexts/AppContext';
import { ArrowDown, ArrowUp, CornerDownRight, Heart, Trash2, X } from 'lucide-react';
import { CommentIcon, HeartFilledIcon, HeartIcon, SaveIcon, ShareIcon } from '@/components/icons/InstagramIcons';
import EmojiPicker from '@/components/EmojiPicker';
import ShareToDmModal from '@/components/ShareToDmModal';
import { formatCount, splitHashtags, timeAgo } from '@/lib/utils';
import AccountPicker from '@/components/AccountPicker';
import ReelMenu from '@/components/ReelMenu';

interface Props {
  reel: Reel | null;
  onClose: () => void;
  onUpdate?: () => void;
  onNavigate?: (direction: 'next' | 'previous') => void;
  canNavigate?: boolean;
}

const ReelModal = ({ reel, onClose, onUpdate, onNavigate, canNavigate = false }: Props) => {
  const { activeAccountId, accounts, refresh } = useApp();
  const [commentText, setCommentText] = useState('');
  const [commentAsId, setCommentAsId] = useState(activeAccountId || '');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; parentId: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (activeAccountId) setCommentAsId(activeAccountId);
  }, [activeAccountId]);

  useEffect(() => {
    setCommentText('');
    setReplyTo(null);
    setShareOpen(false);
  }, [reel?.id]);

  useEffect(() => {
    if (!reel || !onNavigate) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') onNavigate('next');
      if (event.key === 'ArrowUp') onNavigate('previous');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reel, onNavigate]);

  if (!reel) return null;

  const freshReel = getReel(reel.id) || reel;
  const account = getAccount(freshReel.accountId);
  const isLiked = activeAccountId ? getLikedReels(activeAccountId).includes(freshReel.id) : false;
  const isSaved = activeAccountId ? getSavedReels(activeAccountId).includes(freshReel.id) : false;
  const likedComments = activeAccountId ? getLikedComments(activeAccountId) : [];
  const canModerateReel = accounts.some(a => a.id === freshReel.accountId);

  const bump = () => {
    setTick(t => t + 1);
    refresh();
    onUpdate?.();
  };

  const handleLike = () => {
    if (!activeAccountId) return;
    toggleLikeReel(activeAccountId, freshReel.id);
    bump();
  };

  const handleDoubleTapLike = () => {
    if (!activeAccountId) return;
    if (!getLikedReels(activeAccountId).includes(freshReel.id)) {
      toggleLikeReel(activeAccountId, freshReel.id);
      bump();
    }
  };

  const handleSave = () => {
    if (!activeAccountId) return;
    toggleSaveReel(activeAccountId, freshReel.id);
    bump();
  };

  const handleComment = () => {
    if (!commentText.trim() || !commentAsId) return;
    addReelComment(freshReel.id, commentAsId, commentText.trim(), replyTo?.parentId);
    if (replyTo) setExpanded(prev => new Set(prev).add(replyTo.parentId));
    setCommentText('');
    setReplyTo(null);
    bump();
  };

  const handleLikeComment = (commentId: string) => {
    if (!activeAccountId) return;
    toggleLikeReelComment(activeAccountId, freshReel.id, commentId);
    bump();
  };

  const handleDeleteComment = (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    deleteReelComment(freshReel.id, commentId);
    bump();
  };

  const totalComments = (freshReel.baseComments || 0) + freshReel.comments.length;

  const renderText = (text: string) => splitHashtags(text).map((part, index) => (
    part.isHashtag ? <span key={`${part.text}-${index}`} className="text-primary">{part.text}</span> : part.text
  ));

  const topLevel: Comment[] = [];
  const repliesByParent: Record<string, Comment[]> = {};
  freshReel.comments.forEach(c => {
    if (c.parentId) (repliesByParent[c.parentId] = repliesByParent[c.parentId] || []).push(c);
    else topLevel.push(c);
  });

  const renderComment = (c: Comment, rootId?: string) => {
    const isReply = !!rootId;
    const commenter = getAccount(c.accountId);
    const liked = likedComments.includes(c.id);
    const canDelete = canModerateReel || c.accountId === activeAccountId;
    const replies = repliesByParent[c.id] || [];
    const isExpanded = expanded.has(c.id);
    const visibleReplies = isReply ? [] : (isExpanded ? replies : replies.slice(0, 1));
    const hiddenReplyCount = isReply ? 0 : Math.max(0, replies.length - visibleReplies.length);
    const threadRoot = rootId || c.id;

    return (
      <div key={c.id} className={isReply ? 'ml-9 mt-2' : 'mb-3'}>
        <div className="flex gap-3 group">
          <Link to={`/profile/${c.accountId}`} onClick={onClose} className="w-8 h-8 rounded-full bg-secondary overflow-hidden shrink-0 hover:opacity-80">
            {commenter?.profilePicture && <img src={commenter.profilePicture} alt="" className="w-full h-full object-cover" />}
          </Link>
          <div className="flex-1 min-w-0">
            <div>
              <Link to={`/profile/${c.accountId}`} onClick={onClose} className="font-semibold text-sm mr-2 hover:opacity-80">{commenter?.username || 'unknown'}</Link>
              <span className="text-sm">{renderText(c.text)}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>{timeAgo(c.createdAt)}</span>
              {c.likes > 0 && <span>{c.likes} {c.likes === 1 ? 'like' : 'likes'}</span>}
              <button onClick={() => setReplyTo({ id: c.id, username: commenter?.username || '', parentId: threadRoot })} className="font-semibold hover:text-foreground">Reply</button>
              {canDelete && <button onClick={() => handleDeleteComment(c.id)} className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity" aria-label="Delete comment"><Trash2 size={12} /></button>}
            </div>
          </div>
          <button onClick={() => handleLikeComment(c.id)} className="shrink-0 self-start mt-1 hover:opacity-70" aria-label="Like comment">
            <Heart size={12} fill={liked ? '#ff3040' : 'none'} stroke={liked ? '#ff3040' : 'currentColor'} />
          </button>
        </div>
        {visibleReplies.map(r => renderComment(r, threadRoot))}
        {hiddenReplyCount > 0 && (
          <button onClick={() => setExpanded(prev => new Set(prev).add(c.id))} className="ml-9 mt-2 text-xs text-muted-foreground font-semibold hover:text-foreground flex items-center gap-2">
            <span className="w-6 border-t border-muted-foreground/40" />View {hiddenReplyCount} more {hiddenReplyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
        {!isReply && isExpanded && replies.length > 1 && (
          <button onClick={() => setExpanded(prev => { const n = new Set(prev); n.delete(c.id); return n; })} className="ml-9 mt-2 text-xs text-muted-foreground font-semibold hover:text-foreground flex items-center gap-2">
            <span className="w-6 border-t border-muted-foreground/40" />Hide replies
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[230] bg-black/75 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="absolute top-4 right-4 text-white hover:opacity-70" onClick={onClose} aria-label="Close reel">
        <X size={26} />
      </button>

      {canNavigate && onNavigate && (
        <div className="absolute right-5 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate('previous'); }}
            className="w-11 h-11 rounded-full bg-background text-foreground shadow-lg flex items-center justify-center hover:bg-secondary"
            aria-label="Previous reel"
          >
            <ArrowUp size={22} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate('next'); }}
            className="w-11 h-11 rounded-full bg-background text-foreground shadow-lg flex items-center justify-center hover:bg-secondary"
            aria-label="Next reel"
          >
            <ArrowDown size={22} />
          </button>
        </div>
      )}

      <div className="bg-card rounded-lg overflow-hidden flex flex-col md:flex-row max-w-5xl w-full max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="md:w-[58%] bg-black flex items-center justify-center relative" onDoubleClick={handleDoubleTapLike}>
          {freshReel.video ? (
            <video
              key={freshReel.id}
              src={freshReel.video}
              poster={freshReel.thumbnail}
              className="w-full h-full object-contain max-h-[90vh] bg-black"
              controls
              autoPlay
              loop
              playsInline
            />
          ) : (
            <img src={freshReel.thumbnail} alt="" className="w-full h-full object-contain max-h-[90vh]" draggable={false} />
          )}
        </div>

        <div className="md:w-[42%] flex flex-col min-h-0">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <Link to={`/profile/${freshReel.accountId}`} onClick={onClose} className="w-8 h-8 rounded-full bg-secondary overflow-hidden shrink-0 hover:opacity-80">
              {account?.profilePicture && <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />}
            </Link>
            <div className="min-w-0">
              <Link to={`/profile/${freshReel.accountId}`} onClick={onClose} className="font-semibold text-sm block truncate hover:opacity-80">{account?.username}</Link>
              <span className="text-xs text-muted-foreground">Original audio</span>
            </div>
            <div className="ml-auto"><ReelMenu reel={freshReel} onChanged={() => { bump(); onClose(); }} /></div>
          </div>

          <div className="flex-1 p-4 overflow-y-auto min-h-0">
            {freshReel.caption && (
              <div className="flex gap-3 mb-4">
                <Link to={`/profile/${freshReel.accountId}`} onClick={onClose} className="w-8 h-8 rounded-full bg-secondary overflow-hidden shrink-0 hover:opacity-80">
                  {account?.profilePicture && <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />}
                </Link>
                <div>
                  <Link to={`/profile/${freshReel.accountId}`} onClick={onClose} className="font-semibold text-sm mr-2 hover:opacity-80">{account?.username}</Link>
                  <span className="text-sm">{renderText(freshReel.caption)}</span>
                </div>
              </div>
            )}

            {topLevel.map(c => renderComment(c))}

            {freshReel.comments.length === 0 && !freshReel.caption && (
              <p className="text-sm text-muted-foreground text-center py-8">No comments yet</p>
            )}
          </div>

          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={handleLike} className="hover:opacity-60 transition-opacity" aria-label="Like reel">
                {isLiked ? <HeartFilledIcon size={24} /> : <HeartIcon size={24} />}
              </button>
              <button className="hover:opacity-60 transition-opacity" aria-label="Comment on reel">
                <CommentIcon size={24} />
              </button>
              <button onClick={() => setShareOpen(true)} className="hover:opacity-60 transition-opacity" aria-label="Share reel">
                <ShareIcon size={24} />
              </button>
              <button onClick={handleSave} className="ml-auto hover:opacity-60 transition-opacity" aria-label="Save reel">
                <SaveIcon size={24} filled={isSaved} />
              </button>
            </div>
            <p className="font-semibold text-sm">{formatCount(freshReel.likes)} likes</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCount(totalComments)} comments · {formatCount(freshReel.views)} views
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(freshReel.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <div className="p-4 border-t border-border space-y-2">
            {accounts.length > 1 && (
              <AccountPicker
                accounts={accounts}
                selectedId={commentAsId}
                onSelect={setCommentAsId}
                label="Commenting as"
                size="sm"
              />
            )}
            {replyTo && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded px-2 py-1">
                <CornerDownRight size={12} />
                <span>Replying to <span className="font-semibold text-foreground">@{replyTo.username}</span></span>
                <button onClick={() => setReplyTo(null)} className="ml-auto hover:text-foreground" aria-label="Cancel reply">
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <EmojiPicker onPick={(e) => setCommentText(t => t + e)} />
              <input
                type="text"
                placeholder={replyTo ? `Reply to @${replyTo.username}...` : 'Add a comment...'}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleComment()}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim()}
                className="text-primary text-sm font-semibold disabled:opacity-30"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      </div>

      {shareOpen && (
        <ShareToDmModal
          shareable={{
            kind: 'reel',
            contentId: freshReel.id,
            accountId: freshReel.accountId,
            image: freshReel.thumbnail,
            caption: freshReel.caption,
          }}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
};

export default ReelModal;