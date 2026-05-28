import { useState } from 'react';
import { Reel } from '@/lib/types';
import { deleteReel } from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import EditReelModal from '@/components/EditReelModal';

interface Props {
  reel: Reel;
  onChanged?: () => void;
}

const ReelMenu = ({ reel, onChanged }: Props) => {
  const { accounts, refresh } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const isOwner = accounts.some(a => a.id === reel.accountId);

  const handleDelete = () => {
    if (!confirm('Delete this reel?')) return;
    deleteReel(reel.id);
    refresh();
    onChanged?.();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="text-muted-foreground hover:text-foreground p-1" aria-label="Reel options">
            <MoreHorizontal size={18} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border-border z-[260]">
          {isOwner ? (
            <>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleDelete}>Delete</DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem disabled>No actions</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {editOpen && <EditReelModal reel={reel} open={editOpen} onClose={() => { setEditOpen(false); onChanged?.(); }} />}
    </>
  );
};

export default ReelMenu;