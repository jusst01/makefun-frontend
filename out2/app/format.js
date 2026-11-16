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

export const timeLeft = (deadline) => {
  const diff = new Date(deadline) - Date.now();
  if (diff <= 0) return 'ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `${days}d ${hours}h left`;
};

export const rate = (microRate) => (microRate / 1000000).toFixed(4);

export const pct = (val) => `${(val * 100).toFixed(1)}%`;

export const plural = (count, singular, plural) => count === 1 ? singular : plural;

export const shortWallet = (address) => address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
