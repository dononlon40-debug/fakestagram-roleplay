import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function splitHashtags(text: string): { text: string; isHashtag: boolean }[] {
  return text
    .split(/(#[\p{L}\p{N}_]+)/gu)
    .filter(Boolean)
    .map(part => ({ text: part, isHashtag: part.startsWith('#') }));
}

/** Abbreviate large counts: 1000 -> "1k", 1500 -> "1.5k", 24000 -> "24k", 1_200_000 -> "1.2m". */
export function formatCount(n: number): string {
  if (n == null || isNaN(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1000) return n.toLocaleString();
  const fmt = (val: number, suffix: string) => {
    const rounded = val >= 100 ? Math.floor(val) : Math.floor(val * 10) / 10;
    const str = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);
    return `${str}${suffix}`;
  };
  if (abs < 1_000_000) return fmt(n / 1000, "k");
  if (abs < 1_000_000_000) return fmt(n / 1_000_000, "m");
  return fmt(n / 1_000_000_000, "b");
}

/** Instagram-style relative time: 2s, 5m, 3h, 4d, 6w, 2y. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 52) return `${w}w`;
  return `${Math.floor(d / 365)}y`;
}

/** Conversation separator format, e.g. "Fri 7:56 PM" or "Mar 4 7:56 PM" if older than a week. */
export function formatMessageSeparator(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  const ageDays = (now.getTime() - d.getTime()) / 86400000;
  if (ageDays < 7) {
    const weekday = d.toLocaleDateString([], { weekday: "short" });
    return `${weekday} ${time}`;
  }
  if (sameYear) {
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
  }
  return `${d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} ${time}`;
}

/** Convert an ISO timestamp into the value expected by <input type="datetime-local">. */
export function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
