// Instagram-style SVG icons matching the real app as closely as possible

interface IconProps {
  size?: number;
  className?: string;
  filled?: boolean;
}

export const HeartIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

export const HeartFilledIcon = ({ size = 24, className = '' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="#ff3040" stroke="#ff3040" strokeWidth="2" />
  </svg>
);

export const CommentIcon = ({ size = 24, className = '' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22z" />
  </svg>
);

export const CommentFilledIcon = ({ size = 24, className = '' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22z" />
  </svg>
);

// Carousel/multi-image: front white square overlapping a back white square poking out bottom-right.
// A transparent gap is cut from the back square so the two shapes read as distinct.
let __carouselMaskCounter = 0;
export const CarouselBadgeIcon = ({ size = 22, className = '' }: IconProps) => {
  const maskId = `carousel-mask-${++__carouselMaskCounter}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <defs>
        <mask id={maskId}>
          <rect width="24" height="24" fill="white" />
          {/* Knock out the front square + a small padding to create the gap */}
          <rect x="2" y="2" width="15" height="15" rx="3.5" fill="black" />
        </mask>
      </defs>
      {/* Back square (offset toward bottom-right), masked to leave a gap around the front square */}
      <rect x="7" y="7" width="15" height="15" rx="3" fill="currentColor" mask={`url(#${maskId})`} />
      {/* Front square */}
      <rect x="3" y="3" width="13" height="13" rx="3" fill="currentColor" />
    </svg>
  );
};

// Reels badge: rounded filled white square with a transparent play triangle cut out of the middle.
export const ReelBadgeIcon = ({ size = 22, className = '' }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm5.2 5.6v6.8L16 12z"
      fill="currentColor"
    />
  </svg>
);

// Paper plane (Instagram Direct) — used for share and Messages
export const ShareIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="22" y1="3" x2="9.218" y2="10.083" />
    <polygon points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" />
  </svg>
);

export const SaveIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="20 21 12 13.44 4 21 4 3 20 3 20 21" />
  </svg>
);

export const HomeIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9.005 16.545a2.997 2.997 0 0 1 2.997-2.997A2.997 2.997 0 0 1 15 16.545V22h7V11.543L12 2 2 11.543V22h7.005z" />
  </svg>
);

export const ExploreIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const ReelsIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="2" y="2" width="20" height="20" rx="4" />
    <line x1="2" y1="8" x2="22" y2="8" />
    <line x1="8" y1="2" x2="14" y2="8" />
    <line x1="14" y1="2" x2="20" y2="8" />
    <polygon points="10 12 10 18 16 15 10 12" fill="currentColor" stroke="none" />
  </svg>
);

// Paper plane used for the Messages / Direct nav button
export const MessengerIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="22" y1="3" x2="9.218" y2="10.083" />
    <polygon points="11.698 20.334 22 3.001 2 3.001 9.218 10.084 11.698 20.334" />
  </svg>
);

export const CreateIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

export const NotificationsIcon = ({ size = 24, className = '', filled = false }: IconProps) => (
  <HeartIcon size={size} className={className} filled={filled} />
);
