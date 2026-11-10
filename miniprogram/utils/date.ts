export function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (delta < minute) return '刚刚修改';
  if (delta < hour) return `${Math.floor(delta / minute)} 分钟前修改`;
  if (delta < day) return `${Math.floor(delta / hour)} 小时前修改`;
  if (delta < 7 * day) return `${Math.floor(delta / day)} 天前修改`;

  const date = new Date(timestamp);
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} 修改`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
