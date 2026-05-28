import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { SharedPostRef } from '@/lib/types';
import { getOrCreateConversation, saveMessage, saveConversation, uid, getTopMessageRecipients, getAccount } from '@/lib/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMemo } from 'react';

interface Shareable {
  kind: 'post' | 'reel' | 'highlight' | 'story';
  contentId: string;
  accountId: string;
  image: string;
  caption?: string;
}

interface Props {
  shareable: Shareable;
  open: boolean;
  onClose: () => void;
}

const ShareToDmModal = ({ shareable, open, onClose }: Props) => {
  const { activeAccount, accounts } = useApp();
  const [sendAsId, setSendAsId] = useState(activeAccount?.id || '');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');

  const sender = accounts.find(a => a.id === sendAsId) || activeAccount;
  const targets = accounts.filter(a =>
    a.id !== sendAsId &&
    (search.trim() === '' || a.username.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (id: string) =>
    setRecipients(r => r.includes(id) ? r.filter(x => x !== id) : [...r, id]);

  const topRecipients = useMemo(() => {
    if (!sendAsId) return [];
    return getTopMessageRecipients(sendAsId, 3)
      .map(id => getAccount(id))
      .filter((a): a is NonNullable<typeof a> => !!a);
  }, [sendAsId, open]);

  const handleSend = () => {
    if (!sender || recipients.length === 0) return;
    const sharedPost: SharedPostRef = {
      kind: shareable.kind,
      contentId: shareable.contentId,
      accountId: shareable.accountId,
    };
    recipients.forEach(rid => {
      const conv = getOrCreateConversation(sender.id, rid);
      const baseTime = Date.now();
      const trimmedNote = note.trim();

      // Send note (if any) as a separate text message FIRST, then the shared content alone.
      if (trimmedNote) {
        const noteMsg = {
          id: uid(),
          fromAccountId: sender.id,
          toAccountId: rid,
          text: trimmedNote,
          createdAt: new Date(baseTime).toISOString(),
          isRead: false,
        };
        saveMessage(conv.id, noteMsg);
      }

      const shareMsg = {
        id: uid(),
        fromAccountId: sender.id,
        toAccountId: rid,
        text: '',
        sharedPost,
        createdAt: new Date(baseTime + 1).toISOString(),
        isRead: false,
      };
      saveMessage(conv.id, shareMsg);
      saveConversation({ ...conv, lastMessage: shareMsg, updatedAt: shareMsg.createdAt });
    });
    setRecipients([]);
    setNote('');
    onClose();
  };


  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md p-0 overflow-hidden z-[260]">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-center text-base">Share</DialogTitle>
        </DialogHeader>

        <div className="p-3 space-y-3">
          {/* Preview */}
          <div className="flex items-center gap-3 p-2 rounded-md bg-secondary/40">
            <div className="w-14 h-14 rounded overflow-hidden bg-secondary shrink-0">
              <img src={shareable.image} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground uppercase">{shareable.kind}</p>
              {shareable.caption && <p className="text-sm truncate">{shareable.caption}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Send as</label>
            <Select value={sendAsId} onValueChange={setSendAsId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {accounts.map(a => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {topRecipients.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Frequently messaged</p>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                {topRecipients.map(a => {
                  const checked = recipients.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggle(a.id)}
                      className="flex flex-col items-center gap-1 shrink-0 w-16 group"
                    >
                      <div className={`relative w-14 h-14 rounded-full overflow-hidden bg-secondary ring-2 transition-all ${checked ? 'ring-primary' : 'ring-transparent group-hover:ring-border'}`}>
                        {a.profilePicture && <img src={a.profilePicture} alt="" className="w-full h-full object-cover" />}
                        {checked && (
                          <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                            <span className="text-primary-foreground text-lg">✓</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] truncate w-full text-center">{a.username}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />

          <div className="max-h-64 overflow-y-auto -mx-3">
            {targets.map(a => {
              const checked = recipients.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggle(a.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-secondary/50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-secondary overflow-hidden shrink-0">
                    {a.profilePicture && <img src={a.profilePicture} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold truncate">{a.username}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.displayName}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
                    {checked && <span className="text-white text-xs flex items-center justify-center h-full">✓</span>}
                  </div>
                </button>
              );
            })}
            {targets.length === 0 && <p className="text-center text-muted-foreground text-sm py-6">No accounts</p>}
          </div>

          {recipients.length > 0 && (
            <Input placeholder="Write a message..." value={note} onChange={e => setNote(e.target.value)} />
          )}

          <Button onClick={handleSend} disabled={recipients.length === 0} className="w-full">
            Send {recipients.length > 0 && `to ${recipients.length}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareToDmModal;
