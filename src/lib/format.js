const numberFormat = new Intl.NumberFormat('ja-JP');
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const pad = (n) => String(n).padStart(2, '0');

export const yen = (amount) => `¥${numberFormat.format(amount)}`;

// '2023-04' → '2023年4月'
export function yearMonth(value) {
  const [year, month] = value.split('-');
  return `${year}年${Number(month)}月`;
}

// '10/8(木)'
export function monthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAYS[date.getDay()]})`;
}

// '2026年10月6日'
export function fullDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// '2026/10/06 14:05'
export function dateTime(date) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 残り時間を「01:32:18」、1日以上なら「13日 05:12:44」に
export function remaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}日 ${clock}` : clock;
}

export const daysAgo = (days, from = new Date()) => {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  return date;
};
