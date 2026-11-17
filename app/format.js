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

// Full date for detail views: month, day and year, no weekday.
export const dateFull = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

// Remaining time plus a severity level for styling:
// "ended", "urgent" (under 48h), "soon" (under 7 days) or "ok".
export const countdown = (deadline) => {
  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return { label: 'ended', level: 'ended' };

  const diff = target - Date.now();
  if (diff <= 0) return { label: 'ended', level: 'ended' };

  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / HOUR);
  const minutes = Math.floor((diff % HOUR) / (1000 * 60));

  const label = days >= 1 ? `${days}d ${hours}h left` : `${hours}h ${minutes}m left`;

  let level = 'ok';
  if (diff < 48 * HOUR) level = 'urgent';
  else if (diff < 7 * DAY) level = 'soon';

  return { label, level };
};

export const timeLeft = (deadline) => countdown(deadline).label;

export const rate = (microRate) => (microRate / 1000000).toFixed(4);

export const pct = (val) => `${(val * 100).toFixed(1)}%`;

export const plural = (count, singular, plural) => count === 1 ? singular : plural;

export const shortWallet = (address) => address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
