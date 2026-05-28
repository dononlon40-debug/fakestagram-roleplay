export interface Account {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  profilePicture: string;
  website: string;
  location?: string;
  pronouns?: string;
  category?: string;
  followers: number;
  following: number;
  isPrivate: boolean;
  createdAt: string;
  /** Private organizational tags only shown on the manage-accounts page. */
  tags?: string[];
  /** Optional folder grouping on the manage-accounts page. */
  folderId?: string;
}

export interface AccountFolder {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}


export interface MediaItem {
  url: string;
  type: 'image' | 'video';
  thumbnail?: string;
}

export interface Post {
  id: string;
  accountId: string;
  images: string[]; // thumbnails / image URLs for grid display (back-compat)
  media?: MediaItem[]; // full media list (photos + videos). Takes precedence over images when present.
  caption: string;
  likes: number;
  baseComments?: number;
  comments: Comment[];
  createdAt: string;
  isPinned: boolean;
}


export interface Comment {
  id: string;
  accountId: string;
  text: string;
  likes: number;
  createdAt: string;
  parentId?: string;
}

export interface Story {
  id: string;
  accountId: string;
  image: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoryHighlight {
  id: string;
  accountId: string;
  name: string;
  coverImage: string;
  storyIds: string[];
  images?: string[]; // Additional 9:16 images added directly to the highlight
}

export interface Reel {
  id: string;
  accountId: string;
  thumbnail: string;
  video?: string;
  caption: string;
  likes: number;
  baseComments?: number;
  comments: Comment[];
  views: number;
  createdAt: string;
  isPinned?: boolean;
}


export interface SharedPostRef {
  kind: 'post' | 'reel' | 'highlight' | 'story';
  contentId: string;
  accountId: string;
  // Legacy fallback only — new shares look up live content
  image?: string;
  caption?: string;
}

export interface DirectMessage {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  text: string;
  image?: string;
  sharedPost?: SharedPostRef;
  reactions?: Record<string, string>; // accountId -> emoji
  createdAt: string;
  isRead: boolean;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  lastMessage?: DirectMessage;
  updatedAt: string;
}
