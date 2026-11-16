// Utilities for formatting data
export const esc = (text) => {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const money = (amount) => `$${(amount || 0).toLocaleString()}`;

export const dateUtc = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// The fuller form of dateUtc: always carries the year, plus weekday short
// so a deadline reads as a real calendar date ("Mon, Nov 16, 2026").
export const dateFull = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

export const timeLeft = (deadline) => {
  const diff = new Date(deadline) - Date.now();
  if (diff <= 0) return 'ended';
  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / HOUR);
  return `${days}d ${hours}h left`;
};

// timeLeft plus the urgency level a view needs for its badge colour.
// level: "ended" | "urgent" (under 48h) | "soon" (under 7 days) | "ok"
export const countdown = (deadline) => {
  if (!deadline) return { label: 'ended', level: 'ended' };

  const diff = new Date(deadline) - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return { label: 'ended', level: 'ended' };

  const level = diff < 48 * HOUR ? 'urgent' : diff < 7 * DAY ? 'soon' : 'ok';

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    const minutes = Math.floor((diff % HOUR) / (1000 * 60));
    return { label: `${hours}h ${minutes}m left`, level };
  }

  return { label: timeLeft(deadline), level };
};

export const rate = (microRate) => (microRate / 1000000).toFixed(4);

export const pct = (val) => `${(val * 100).toFixed(1)}%`;

export const plural = (count, singular, plural) => count === 1 ? singular : plural;

export const shortWallet = (address) => address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
