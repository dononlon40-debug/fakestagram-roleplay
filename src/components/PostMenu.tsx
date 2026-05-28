import { useState } from 'react';
import { Post } from '@/lib/types';
import { deletePost } from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import EditPostModal from './EditPostModal';

interface Props {
  post: Post;
  onChanged?: () => void;
}

const PostMenu = ({ post, onChanged }: Props) => {
  const { accounts, refresh } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  // Any local persona belongs to the user — allow management of all owned posts
  const isOwner = accounts.some(a => a.id === post.accountId);

  const handleDelete = () => {
    if (!confirm('Delete this post?')) return;
    deletePost(post.id);
    refresh();
    onChanged?.();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground p-1" aria-label="Post options">
            <MoreHorizontal size={18} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border-border z-[230]">
          {isOwner && (
            <>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>
                Delete
              </DropdownMenuItem>
            </>
          )}
          {!isOwner && <DropdownMenuItem disabled>No actions</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      {editOpen && <EditPostModal post={post} open={editOpen} onClose={() => { setEditOpen(false); onChanged?.(); }} />}
    </>
  );
};

export default PostMenu;
