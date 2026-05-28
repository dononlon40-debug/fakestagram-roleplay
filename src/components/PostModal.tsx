import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Post, Comment } from '@/lib/types';
import { getAccount, getLikedPosts, toggleLikePost, getSavedPosts, toggleSavePost, addComment, getLikedComments, toggleLikeComment, deleteComment, getPost } from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { X, Heart, Trash2, CornerDownRight } from 'lucide-react';
import { HeartIcon, CommentIcon, ShareIcon, SaveIcon, HeartFilledIcon } from '@/components/icons/InstagramIcons';
import EmojiPicker from '@/components/EmojiPicker';
import PostMenu from '@/components/PostMenu';
import ShareToDmModal from '@/components/ShareToDmModal';
import PostCarousel from '@/components/PostCarousel';
import AccountPicker from '@/components/AccountPicker';
import { formatCount, splitHashtags, timeAgo } from '@/lib/utils';

interface Props {
  post: Post;
  onClose: () => void;
  onUpdate?: () => void;
}

const PostModal = ({ post, onClose, onUpdate }: Props) => {
  const { activeAccountId, accounts, refresh } = useApp();
  const account = getAccount(post.accountId);
  const [commentText, setCommentText] = useState('');
  const [commentAsId, setCommentAsId] = useState(activeAccountId || accounts[0]?.id || '');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; parentId: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [, setTick] = useState(0);

  const bump = () => { setTick(t => t + 1); refresh(); onUpdate?.(); };

  const isLiked = activeAccountId ? getLikedPosts(activeAccountId).includes(post.id) : false;
  const isSaved = activeAccountId ? getSavedPosts(activeAccountId).includes(post.id) : false;
  const likedComments = activeAccountId ? getLikedComments(activeAccountId) : [];

  const handleLike = () => { if (!activeAccountId) return; toggleLikePost(activeAccountId, post.id); bump(); };
  const handleSave = () => { if (!activeAccountId) return; toggleSavePost(activeAccountId, post.id); bump(); };
  const handleComment = () => {
    if (!commentText.trim() || !commentAsId) return;
    addComment(post.id, commentAsId, commentText.trim(), replyTo?.parentId);
    if (replyTo) setExpanded(prev => new Set(prev).add(replyTo.parentId!));
    setCommentText('');
    setReplyTo(null);
    bump();
  };
  const handleLikeComment = (cid: string) => {
    if (!activeAccountId) return;
    toggleLikeComment(activeAccountId, post.id, cid);
    bump();
  };
  const handleDeleteComment = (cid: string) => {
    if (!confirm('Delete this comment?')) return;
    deleteComment(post.id, cid);
    bump();
  };

  const renderText = (text: string) => splitHashtags(text).map((part, index) => (
    part.isHashtag ? <span key={`${part.text}-${index}`} className="text-primary">{part.text}</span> : part.text
  ));

  // Re-read post to get updated data
  const freshPost: Post = getPost(post.id) || post;
  // Any local persona owning the post can moderate (all accounts belong to the user)
  const canModeratePost = accounts.some(a => a.id === post.accountId);

  // Build comment tree: top-level + replies grouped by parentId
  const { topLevel, repliesByParent } = useMemo(() => {
    const top: Comment[] = [];
    const map: Record<string, Comment[]> = {};
    freshPost.comments.forEach(c => {
      if (c.parentId) {
        (map[c.parentId] = map[c.parentId] || []).push(c);
      } else {
        top.push(c);
      }
    });
    return { topLevel: top, repliesByParent: map };
  }, [freshPost.comments]);

  const renderComment = (c: Comment, rootId?: string) => {
    const isReply = !!rootId;
    const commenter = getAccount(c.accountId);
    const liked = likedComments.includes(c.id);
    const canDelete = canModeratePost || c.accountId === activeAccountId;
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
              <button
                onClick={() => setReplyTo({ id: c.id, username: commenter?.username || '', parentId: threadRoot })}
                className="font-semibold hover:text-foreground"
              >
                Reply
              </button>
              {canDelete && (
                <button onClick={() => handleDeleteComment(c.id)} className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
          <button onClick={() => handleLikeComment(c.id)} className="shrink-0 self-start mt-1 hover:opacity-70">
            <Heart size={12} fill={liked ? '#ff3040' : 'none'} stroke={liked ? '#ff3040' : 'currentColor'} />
          </button>
        </div>
        {visibleReplies.map(r => renderComment(r, threadRoot))}
        {hiddenReplyCount > 0 && (
          <button
            onClick={() => setExpanded(prev => { const n = new Set(prev); n.add(c.id); return n; })}
            className="ml-9 mt-2 text-xs text-muted-foreground font-semibold hover:text-foreground flex items-center gap-2"
          >
            <span className="w-6 border-t border-muted-foreground/40" />
            View {hiddenReplyCount} more {hiddenReplyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
        {!isReply && isExpanded && replies.length > 1 && (
          <button
            onClick={() => setExpanded(prev => { const n = new Set(prev); n.delete(c.id); return n; })}
            className="ml-9 mt-2 text-xs text-muted-foreground font-semibold hover:text-foreground flex items-center gap-2"
          >
            <span className="w-6 border-t border-muted-foreground/40" />
            Hide replies
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="absolute top-4 right-4 text-white" onClick={onClose}><X size={24} /></button>
      <div className="bg-card rounded-lg overflow-hidden flex flex-col md:flex-row max-w-4xl w-full max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="md:w-[60%] bg-black flex items-center justify-center min-h-[300px] md:min-h-[70vh]">
          <PostCarousel post={freshPost} contain className="w-full h-full max-h-[70vh]" />
        </div>
        <div className="md:w-[40%] flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <Link to={`/profile/${post.accountId}`} onClick={onClose} className="w-8 h-8 rounded-full bg-secondary overflow-hidden hover:opacity-80">
              {account?.profilePicture && <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />}
            </Link>
            <Link to={`/profile/${post.accountId}`} onClick={onClose} className="font-semibold text-sm hover:opacity-80">{account?.username}</Link>
            <div className="ml-auto"><PostMenu post={freshPost} onChanged={() => { bump(); onClose(); }} /></div>
          </div>
          {/* Caption + Comments */}
          <div className="flex-1 p-4 overflow-y-auto">
            {freshPost.caption && (
              <div className="flex gap-3 mb-4">
                <Link to={`/profile/${post.accountId}`} onClick={onClose} className="w-8 h-8 rounded-full bg-secondary overflow-hidden shrink-0 hover:opacity-80">
                  {account?.profilePicture && <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />}
                </Link>
                <div>
                  <Link to={`/profile/${post.accountId}`} onClick={onClose} className="font-semibold text-sm mr-2 hover:opacity-80">{account?.username}</Link>
                  <span className="text-sm">{renderText(freshPost.caption)}</span>
                </div>
              </div>
            )}
            {topLevel.map(c => renderComment(c))}
          </div>
          {/* Actions */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-4 mb-2">
              <button onClick={handleLike} className="hover:opacity-60 transition-opacity">
                {isLiked ? <HeartFilledIcon size={24} /> : <HeartIcon size={24} />}
              </button>
              <button className="hover:opacity-60 transition-opacity"><CommentIcon size={24} /></button>
              <button onClick={() => setShareOpen(true)} className="hover:opacity-60 transition-opacity"><ShareIcon size={24} /></button>
              <button onClick={handleSave} className="ml-auto hover:opacity-60 transition-opacity">
                <SaveIcon size={24} filled={isSaved} />
              </button>
            </div>
            <p className="font-semibold text-sm">{formatCount(freshPost.likes)} likes</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(freshPost.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          {/* Comment input */}
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
                <button onClick={() => setReplyTo(null)} className="ml-auto hover:text-foreground">
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
            kind: 'post',
            contentId: freshPost.id,
            accountId: freshPost.accountId,
            image: freshPost.images[0],
            caption: freshPost.caption,
          }}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
};

export default PostModal;
