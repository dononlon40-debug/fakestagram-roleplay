import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
  '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳',
  '😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤',
  '😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫',
  '🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵',
  '🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','💩','👻','💀','☠️','👽','👾',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
  '💘','💝','💟','💯','💢','💥','💫','💦','💨','🕳️','💬','💭','🗨️','🗯️','💤','👋',
  '🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕',
  '👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅',
  '🔥','✨','🌟','⭐','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️',
  '🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟',
  '☕','🍵','🧃','🥤','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾','🧊','🥄','🍴',
];

const EmojiPicker = ({ onPick }: { onPick: (e: string) => void }) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Add emoji"
        >
          <Smile size={20} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 bg-card border-border" align="start">
        <div className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto">
          {EMOJIS.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(e)}
              className="text-xl hover:bg-secondary rounded p-1 transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default EmojiPicker;
