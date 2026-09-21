const IST = 'Asia/Kolkata';

export function formatDateTime(date: Date, timezone = IST): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatTime(date: Date, timezone = IST): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatDay(date: Date, timezone = IST): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function relativeTime(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
