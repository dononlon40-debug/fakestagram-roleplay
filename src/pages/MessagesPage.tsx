import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import {
  getConversations, getAccount, getMessages, saveMessage, saveConversation, uid,
  updateMessage, deleteMessage, getFollowing, getStoriesByAccount,
  getPost, getReel, getHighlight, getStoryById, setMessageReaction,
  deleteConversation, updateMessageTimestamp,
} from '@/lib/store';
import { Account, Conversation, DirectMessage } from '@/lib/types';
import { Send, Pencil, Trash2, Check, X, Search, Phone, Video, Info, SmilePlus, Play, Clock } from 'lucide-react';
import { timeAgo, formatMessageSeparator, toDateTimeLocalValue } from '@/lib/utils';
import { CreateIcon } from '@/components/icons/InstagramIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import StoryViewer from '@/components/StoryViewer';
import PostModal from '@/components/PostModal';
import ReelModal from '@/components/ReelModal';
import { Story } from '@/lib/types';

const Avatar = ({ account, size = 'md' }: { account?: Account; size?: 'sm' | 'md' | 'lg' }) => {
  const cls = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-12 h-12 text-sm';
  return (
    <div className={`${cls} rounded-full bg-secondary overflow-hidden shrink-0 flex items-center justify-center`}>
      {account?.profilePicture
        ? <img src={account.profilePicture} alt="" className="w-full h-full object-cover" />
        : <span className="font-bold text-muted-foreground">{account?.username?.[0]?.toUpperCase() || '?'}</span>}
    </div>
  );
};

// Group chat avatar: two overlapping small circles
const GroupAvatar = ({ accounts }: { accounts: Account[] }) => {
  const [a, b] = accounts;
  const ring = (acc?: Account, extra = '') => (
    <div className={`w-8 h-8 rounded-full bg-secondary overflow-hidden border-2 border-background flex items-center justify-center ${extra}`}>
      {acc?.profilePicture
        ? <img src={acc.profilePicture} alt="" className="w-full h-full object-cover" />
        : <span className="text-[10px] font-bold text-muted-foreground">{acc?.username?.[0]?.toUpperCase() || '?'}</span>}
    </div>
  );
  return (
    <div className="relative w-12 h-12 shrink-0">
      <div className="absolute top-0 left-0">{ring(a)}</div>
      <div className="absolute bottom-0 right-0">{ring(b)}</div>
    </div>
  );
};

const MessagesPage = () => {
  const { activeAccount, accounts, refresh } = useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [sendAsId, setSendAsId] = useState(activeAccount?.id || '');
  const [showNewConv, setShowNewConv] = useState(false);
  const [newConvParticipants, setNewConvParticipants] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTsId, setEditTsId] = useState<string | null>(null);
  const [editTsValue, setEditTsValue] = useState('');
  const [search, setSearch] = useState('');
  const [storyViewer, setStoryViewer] = useState<{ stories: Story[]; index: number } | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [openReelId, setOpenReelId] = useState<string | null>(null);

  const openSharedContent = (sp: { kind: string; contentId: string; accountId: string }) => {
    if (sp.kind === 'post') {
      setOpenPostId(sp.contentId);
    } else if (sp.kind === 'reel') {
      setOpenReelId(sp.contentId);
    } else if (sp.kind === 'story') {
      const s = getStoryById(sp.contentId);
      if (s) setStoryViewer({ stories: [s], index: 0 });
    } else if (sp.kind === 'highlight') {
      const hl = getHighlight(sp.contentId);
      if (hl) {
        const stories = hl.storyIds.map(id => getStoryById(id)).filter(Boolean) as Story[];
        if (stories.length) setStoryViewer({ stories, index: 0 });
      }
    }
  };
  const goToProfile = (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation();
    navigate(`/profile/${accountId}`);
  };

  const allConvs = getConversations();
  // Only conversations the active persona participates in
  const conversations = activeAccount
    ? allConvs.filter(c => c.participantIds.includes(activeAccount.id))
    : [];

  // Notes/status row: followed accounts that have at least one active story
  const following = activeAccount ? getFollowing(activeAccount.id) : [];
  const notesAccounts = accounts.filter(a =>
    following.includes(a.id) && getStoriesByAccount(a.id).length > 0
  );

  // Auto-open conversation from query param (?conv=...)
  useEffect(() => {
    const convId = searchParams.get('conv');
    if (convId && !selectedConv) {
      const conv = allConvs.find(c => c.id === convId);
      if (conv) {
        setSelectedConv(conv);
        setSendAsId(activeAccount?.id || conv.participantIds[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Reset selection if active account changes and they aren't in convo
  useEffect(() => {
    if (selectedConv && activeAccount && !selectedConv.participantIds.includes(activeAccount.id)) {
      setSelectedConv(null);
    }
    if (activeAccount) setSendAsId(activeAccount.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id]);

  const createConversation = () => {
    if (!activeAccount) return;
    if (newConvParticipants.length < 1) return;
    const ids = Array.from(new Set([activeAccount.id, ...newConvParticipants]));
    const conv: Conversation = {
      id: uid(),
      participantIds: ids,
      updatedAt: new Date().toISOString(),
    };
    saveConversation(conv);
    refresh();
    setSelectedConv(conv);
    setShowNewConv(false);
    setNewConvParticipants([]);
  };

  const sendMessage = (overrideImage?: string) => {
    if (!selectedConv || !sendAsId) return;
    if (!overrideImage && !newMsg.trim()) return;
    const msg: DirectMessage = {
      id: uid(),
      fromAccountId: sendAsId,
      toAccountId: selectedConv.participantIds.find(id => id !== sendAsId) || '',
      text: overrideImage ? '' : newMsg.trim(),
      ...(overrideImage ? { image: overrideImage } : {}),
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    saveMessage(selectedConv.id, msg);
    saveConversation({ ...selectedConv, lastMessage: msg, updatedAt: msg.createdAt });
    if (!overrideImage) setNewMsg('');
    refresh();
  };

  // Paste image from clipboard to send as a message
  useEffect(() => {
    if (!selectedConv) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (!f) continue;
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => sendMessage(reader.result as string);
          reader.readAsDataURL(f);
          return;
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv?.id, sendAsId]);

  const handleSaveEdit = (msgId: string) => {
    if (!selectedConv || !editText.trim()) return;
    updateMessage(selectedConv.id, msgId, editText.trim());
    setEditingId(null);
    setEditText('');
    refresh();
  };

  const handleDelete = (msgId: string) => {
    if (!selectedConv) return;
    deleteMessage(selectedConv.id, msgId);
    refresh();
  };

  const handleSaveTimestamp = (msgId: string) => {
    if (!selectedConv || !editTsValue) { setEditTsId(null); return; }
    const iso = new Date(editTsValue).toISOString();
    updateMessageTimestamp(selectedConv.id, msgId, iso);
    setEditTsId(null);
    setEditTsValue('');
    refresh();
  };

  const handleDeleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    deleteConversation(convId);
    if (selectedConv?.id === convId) setSelectedConv(null);
    refresh();
  };

  const handleReact = (msgId: string, emoji: string) => {
    if (!selectedConv || !sendAsId) return;
    const msg = getMessages(selectedConv.id).find(m => m.id === msgId);
    const existing = msg?.reactions?.[sendAsId];
    setMessageReaction(selectedConv.id, msgId, sendAsId, existing === emoji ? null : emoji);
    refresh();
  };

  const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

  // Get the "other" participants relative to the active persona
  const othersOf = (conv: Conversation): Account[] =>
    conv.participantIds
      .filter(id => id !== activeAccount?.id)
      .map(id => getAccount(id))
      .filter(Boolean) as Account[];

  const convLabel = (conv: Conversation) => {
    const others = othersOf(conv);
    const missing = conv.participantIds.filter(id => id !== activeAccount?.id && !getAccount(id)).length;
    if (others.length === 0 && missing === 0) return 'Just you';
    const names = others.map(a => a.username);
    if (missing > 0) names.push(`${missing} deleted`);
    return names.join(', ') || 'Deleted persona';
  };

  if (!activeAccount) {
    return (
      <div className="flex items-center justify-center h-[80vh] text-muted-foreground">
        Select an active account first
      </div>
    );
  }

  const filteredConvs = conversations.filter(c =>
    !search.trim() || convLabel(c).toLowerCase().includes(search.toLowerCase())
  );

  const messages = selectedConv ? getMessages(selectedConv.id) : [];
  const headerOthers = selectedConv ? othersOf(selectedConv) : [];

  return (
    <div className="flex h-screen">
      {/* Inbox sidebar */}
      <aside className="w-[397px] border-r border-border flex flex-col shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-8 pb-4">
          <h1 className="text-xl font-bold truncate">{activeAccount.username}</h1>
          <button
            onClick={() => setShowNewConv(true)}
            className="hover:opacity-70 transition-opacity"
            title="New message"
          >
            <CreateIcon size={24} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              className="pl-8 h-9 bg-secondary border-0 text-sm"
            />
          </div>
        </div>

        {/* Notes / status row */}
        {notesAccounts.length > 0 && (
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-4 py-2">
            {notesAccounts.map(a => (
              <button
                key={a.id}
                onClick={() => {
                  const s = getStoriesByAccount(a.id);
                  if (s.length) setStoryViewer({ stories: s, index: 0 });
                }}
                className="flex flex-col items-center gap-1 shrink-0 w-16"
              >
                <div className="ig-story-ring">
                  <div className="ig-story-ring-inner">
                    <Avatar account={a} />
                  </div>
                </div>
                <span className="text-xs truncate w-full text-center">{a.username}</span>
              </button>
            ))}
          </div>
        )}

        {/* Messages header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <span className="font-semibold text-sm">Messages</span>
          <span className="text-xs text-muted-foreground">Requests</span>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filteredConvs.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm px-6">
              No conversations yet
            </div>
          )}
          {filteredConvs.map(conv => {
            const others = othersOf(conv);
            const isGroup = others.length > 1;
            const isSelected = selectedConv?.id === conv.id;
            return (
              <div
                key={conv.id}
                className={`group relative w-full flex items-center gap-3 px-6 py-2 hover:bg-secondary/50 transition-colors ${
                  isSelected ? 'bg-secondary/70' : ''
                }`}
              >
                <button
                  onClick={() => { setSelectedConv(conv); setSendAsId(activeAccount.id); }}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  {isGroup
                    ? <GroupAvatar accounts={others.slice(0, 2)} />
                    : <Avatar account={others[0]} />}
                  <div className="min-w-0 flex-1">
                    <p className="font-normal text-sm truncate">{convLabel(conv)}</p>
                    {conv.lastMessage && (
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.lastMessage.fromAccountId === activeAccount.id ? 'You: ' : ''}
                        {conv.lastMessage.text || (conv.lastMessage.sharedPost ? `Sent a ${conv.lastMessage.sharedPost.kind}` : conv.lastMessage.image ? 'Sent a photo' : '')}
                      </p>
                    )}
                  </div>
                </button>
                <button
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Chat panel */}
      <section className="flex-1 flex flex-col min-w-0">
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-24 h-24 rounded-full border-2 border-foreground flex items-center justify-center mb-4">
              <Send size={40} className="rotate-12" />
            </div>
            <h2 className="text-xl font-light mb-1">Your messages</h2>
            <p className="text-sm text-muted-foreground mb-4">Send a message to start a chat.</p>
            <Button onClick={() => setShowNewConv(true)}>Send message</Button>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border">
              <button
                onClick={() => {
                  if (headerOthers.length === 1) navigate(`/profile/${headerOthers[0].id}`);
                }}
                disabled={headerOthers.length !== 1}
                className="flex items-center gap-3 text-left hover:opacity-80 disabled:hover:opacity-100 disabled:cursor-default"
              >
                {headerOthers.length > 1
                  ? <GroupAvatar accounts={headerOthers.slice(0, 2)} />
                  : <Avatar account={headerOthers[0]} />}
                <div>
                  <p className="font-semibold text-sm">{convLabel(selectedConv)}</p>
                  {headerOthers.length === 1 && (
                    <p className="text-xs text-muted-foreground">{headerOthers[0].displayName}</p>
                  )}
                </div>
              </button>
              <div className="flex items-center gap-4 text-foreground">
                <Phone size={22} className="cursor-pointer hover:opacity-70" />
                <Video size={22} className="cursor-pointer hover:opacity-70" />
                <Info size={22} className="cursor-pointer hover:opacity-70" />
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((msg, i) => {
                const sender = getAccount(msg.fromAccountId);
                const isSelf = msg.fromAccountId === sendAsId;
                const isEditing = editingId === msg.id;
                const prev = messages[i - 1];
                const showSeparator = !prev || (
                  +new Date(msg.createdAt) - +new Date(prev.createdAt) > 3_600_000
                ) || new Date(msg.createdAt).toDateString() !== new Date(prev.createdAt).toDateString();
                return (
                  <div key={msg.id}>
                    {showSeparator && (
                      <Popover
                        open={editTsId === msg.id}
                        onOpenChange={(o) => { if (!o) setEditTsId(null); }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            onClick={() => { setEditTsId(msg.id); setEditTsValue(toDateTimeLocalValue(msg.createdAt)); }}
                            className="block mx-auto my-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit timestamp"
                          >
                            {formatMessageSeparator(msg.createdAt)}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2 bg-card border-border" align="center">
                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={editTsValue}
                              onChange={e => setEditTsValue(e.target.value)}
                              className="bg-background border border-border rounded px-2 py-1 text-xs"
                            />
                            <button onClick={() => handleSaveTimestamp(msg.id)} className="text-primary hover:opacity-70" title="Save">
                              <Check size={14} />
                            </button>
                            <button onClick={() => setEditTsId(null)} className="text-muted-foreground hover:text-foreground" title="Cancel">
                              <X size={14} />
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  <div className={`group flex gap-2 items-end ${isSelf ? 'flex-row-reverse' : ''}`}>

                    {!isSelf && (
                      sender ? (
                        <button
                          onClick={() => navigate(`/profile/${sender.id}`)}
                          className="hover:opacity-80 transition-opacity"
                          aria-label={`Open ${sender.username}'s profile`}
                        >
                          <Avatar account={sender} size="sm" />
                        </button>
                      ) : <Avatar account={sender} size="sm" />
                    )}
                    <div className="relative max-w-[60%] flex flex-col">
                      <div className={`text-sm ${
                        msg.sharedPost || msg.image
                          ? 'rounded-2xl overflow-hidden border border-border bg-secondary'
                          : `px-3 py-2 rounded-3xl ${isSelf ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`
                      }`}>
                        {selectedConv.participantIds.length > 2 && !isSelf && !msg.sharedPost && !msg.image && (
                          <p className="text-[10px] font-semibold mb-0.5 opacity-70">{sender?.username}</p>
                        )}
                        {isEditing ? (
                          <div className="flex items-center gap-1 px-2 py-1">
                            <Input
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveEdit(msg.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="h-7 text-xs bg-background text-foreground"
                              autoFocus
                            />
                            <button onClick={() => handleSaveEdit(msg.id)} className="p-1 hover:opacity-70">
                              <Check size={14} />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-1 hover:opacity-70">
                              <X size={14} />
                            </button>
                          </div>
                        ) : msg.sharedPost ? (
                          (() => {
                            const sp = msg.sharedPost;
                            const owner = getAccount(sp.accountId);
                            if (sp.kind === 'story' || sp.kind === 'highlight') {
                              let img: string | undefined;
                              let label: string;
                              if (sp.kind === 'story') {
                                img = getStoryById(sp.contentId)?.image || sp.image;
                                label = `Shared ${owner?.username ? `${owner.username}'s` : 'a'} story`;
                              } else {
                                const hl = getHighlight(sp.contentId);
                                img = hl?.coverImage || sp.image;
                                label = `Shared ${owner?.username ? `${owner.username}'s` : 'a'} highlight${hl?.name ? ` · ${hl.name}` : ''}`;
                              }
                              return (
                                <button type="button" onClick={() => openSharedContent(sp)} className="w-[220px] flex flex-col gap-1.5 text-left hover:opacity-90 transition-opacity">
                                  <p className="text-[11px] text-muted-foreground px-1">{label}</p>
                                  {img ? (
                                    <img src={img} alt="" className="w-full aspect-[9/16] object-cover rounded-xl bg-black" />
                                  ) : (
                                    <div className="w-full aspect-[9/16] bg-black/40 rounded-xl flex items-center justify-center text-xs text-muted-foreground">
                                      {sp.kind === 'story' ? 'Story' : 'Highlight'} unavailable
                                    </div>
                                  )}
                                  {msg.text && <p className="text-xs px-1 pb-1">{msg.text}</p>}
                                </button>
                              );
                            }
                            if (sp.kind === 'reel') {
                              const live = getReel(sp.contentId);
                              const img = live?.thumbnail || sp.image;
                              const caption = live?.caption ?? sp.caption;
                              return (
                                <button type="button" onClick={() => openSharedContent(sp)} className="w-[260px] flex flex-col gap-1.5 text-left hover:opacity-90 transition-opacity">
                                  {img ? (
                                    <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden bg-black">
                                      <img src={img} alt="" className="w-full h-full object-cover" />
                                      <div
                                        role="link"
                                        tabIndex={0}
                                        onClick={(e) => goToProfile(e, sp.accountId)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') goToProfile(e as unknown as React.MouseEvent, sp.accountId); }}
                                        className="absolute top-2 left-2 flex items-center gap-1.5 pr-2 py-0.5 rounded-full bg-black/30 backdrop-blur-sm hover:bg-black/50 cursor-pointer"
                                      >
                                        <div className="w-6 h-6 rounded-full bg-secondary overflow-hidden ring-1 ring-white/40">
                                          {owner?.profilePicture && <img src={owner.profilePicture} alt="" className="w-full h-full object-cover" />}
                                        </div>
                                        <span className="text-[11px] font-semibold text-white drop-shadow">{owner?.username}</span>
                                      </div>
                                      <div className="absolute bottom-2 left-2 w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                                        <Play size={12} className="text-white fill-white ml-0.5" />
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full aspect-[9/16] bg-black/40 rounded-xl flex items-center justify-center text-xs text-muted-foreground">
                                      Reel unavailable
                                    </div>
                                  )}
                                  {caption && (
                                    <p className="text-xs px-1 line-clamp-2">
                                      <span className="font-semibold mr-1">{owner?.username}</span>{caption}
                                    </p>
                                  )}
                                  {msg.text && <p className="text-xs px-1 pb-1">{msg.text}</p>}
                                </button>
                              );
                            }
                            const live = getPost(sp.contentId);
                            const liveImage = live ? (live as { images: string[] }).images?.[0] : undefined;
                            const liveCaption = (live as { caption?: string } | undefined)?.caption;
                            const img = liveImage || sp.image;
                            const caption = liveCaption ?? sp.caption;
                            return (
                              <button type="button" onClick={() => openSharedContent(sp)} className="w-[260px] text-left hover:opacity-90 transition-opacity">
                                <div
                                  role="link"
                                  tabIndex={0}
                                  onClick={(e) => goToProfile(e, sp.accountId)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') goToProfile(e as unknown as React.MouseEvent, sp.accountId); }}
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-background/40 cursor-pointer"
                                >
                                  <div className="w-6 h-6 rounded-full bg-secondary overflow-hidden">
                                    {owner?.profilePicture && <img src={owner.profilePicture} alt="" className="w-full h-full object-cover" />}
                                  </div>
                                  <span className="text-xs font-semibold truncate hover:underline">{owner?.username}</span>
                                  <span className="text-[10px] uppercase ml-auto text-muted-foreground">post</span>
                                </div>
                                {img ? (
                                  <img src={img} alt="" className="w-full aspect-square object-cover bg-black" />
                                ) : (
                                  <div className="w-full aspect-square bg-black/40 flex items-center justify-center text-xs text-muted-foreground">
                                    Post unavailable
                                  </div>
                                )}
                                {caption && (
                                  <p className="text-xs px-3 py-2 line-clamp-2">
                                    <span className="font-semibold mr-1">{owner?.username}</span>{caption}
                                  </p>
                                )}
                                {msg.text && <p className="text-xs px-3 pb-2">{msg.text}</p>}
                              </button>
                            );
                          })()
                        ) : msg.image ? (
                          <div>
                            <img src={msg.image} alt="" className="w-[240px] aspect-square object-cover" />
                            {msg.text && <p className="text-xs px-3 py-2">{msg.text}</p>}
                          </div>
                        ) : (
                          <div className="break-words">{msg.text}</div>
                        )}
                      </div>

                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className={`flex gap-1 -mt-2 ${isSelf ? 'self-end mr-2' : 'self-start ml-2'}`}>
                          {Object.entries(
                            Object.values(msg.reactions).reduce<Record<string, number>>((acc, e) => {
                              acc[e] = (acc[e] || 0) + 1; return acc;
                            }, {})
                          ).map(([emoji, count]) => (
                            <button
                              key={emoji}
                              onClick={() => handleReact(msg.id, emoji)}
                              className="bg-background border border-border rounded-full px-1.5 py-0.5 text-xs hover:scale-110 transition-transform"
                            >
                              {emoji}{count > 1 && <span className="ml-1 text-[10px] text-muted-foreground">{count}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-muted-foreground hover:text-foreground" title="React">
                              <SmilePlus size={14} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1 bg-card border-border" align="center" side="top">
                            <div className="flex gap-1">
                              {QUICK_EMOJIS.map(e => (
                                <button
                                  key={e}
                                  onClick={() => handleReact(msg.id, e)}
                                  className="text-xl hover:bg-secondary rounded p-1 transition-colors"
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        {msg.text && !msg.sharedPost && !msg.image && (
                          <button
                            onClick={() => { setEditingId(msg.id); setEditText(msg.text); }}
                            className="text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => { setEditTsId(msg.id); setEditTsValue(toDateTimeLocalValue(msg.createdAt)); }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Edit timestamp"
                        >
                          <Clock size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  </div>
                );
              })}
              {(() => {
                const last = messages[messages.length - 1];
                if (!last || last.fromAccountId !== sendAsId) return null;
                return (
                  <p className="text-[11px] text-muted-foreground text-right pr-2 -mt-1">
                    Seen {timeAgo(last.createdAt)} ago
                  </p>
                );
              })()}
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-10">
                  No messages yet. Say hi 👋
                </div>
              )}
            </div>

            {/* Compose */}
            <div className="px-4 pb-4 pt-2 space-y-2">
              <Select value={sendAsId} onValueChange={setSendAsId}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Send as..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedConv.participantIds.map(id => {
                    const a = getAccount(id);
                    return <SelectItem key={id} value={id}>{a?.username || id}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              <div className="flex gap-2 items-center border border-border rounded-full px-4 py-1">
                <Input
                  value={newMsg}
                  onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Message..."
                  className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-0"
                />
                <Button size="sm" variant="ghost" onClick={() => sendMessage()} disabled={!newMsg.trim()} className="text-primary hover:text-primary font-semibold">
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* New conversation modal */}
      {showNewConv && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowNewConv(false)}
        >
          <div
            className="bg-card border border-border rounded-xl w-[440px] max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border text-center font-semibold">New message</div>
            <div className="px-4 py-3 text-sm">
              <span className="font-semibold mr-2">To:</span>
              <span className="text-muted-foreground">Select accounts to message (as {activeAccount.username})</span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {accounts.filter(a => a.id !== activeAccount.id).map(a => {
                const checked = newConvParticipants.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setNewConvParticipants(prev =>
                        prev.includes(a.id) ? prev.filter(id => id !== a.id) : [...prev, a.id]
                      );
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary text-left"
                  >
                    <Avatar account={a} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{a.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.displayName}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
                      {checked && <Check size={14} className="text-primary-foreground m-auto" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t border-border">
              <Button className="w-full" onClick={createConversation} disabled={newConvParticipants.length < 1}>
                Chat
              </Button>
            </div>
          </div>
        </div>
      )}

      {storyViewer && (
        <StoryViewer
          stories={storyViewer.stories}
          initialIndex={storyViewer.index}
          onClose={() => setStoryViewer(null)}
        />
      )}

      {openPostId && (() => {
        const p = getPost(openPostId);
        if (!p) { setOpenPostId(null); return null; }
        return <PostModal post={p} onClose={() => setOpenPostId(null)} onUpdate={refresh} />;
      })()}

      {openReelId && (
        <ReelModal
          reel={getReel(openReelId) || null}
          onClose={() => setOpenReelId(null)}
          onUpdate={refresh}
        />
      )}
    </div>
  );
};

export default MessagesPage;
