import { raw } from '../lib/html.js';

// 1.5px の線画アイコン（24×24）。絵文字や記号を丸で囲んだ"偽アイコン"は使わない
const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  cart: '<path d="M3 4h2l2.2 11h11l2-8H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
  grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  wrench: '<path d="M14.5 5.5a4 4 0 0 0 4.9 5L12 18a2.1 2.1 0 0 1-3-3l7.5-7.4a4 4 0 0 0-2-2.1Z"/><path d="M14.5 5.5 17 3l1.5 3.5L22 8l-2.6 2.5"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="1.5"/><path d="M21 10.5v3M7 10v4M10.5 10v4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3 10h18M7 15h4"/>',
  building: '<path d="M4 21V4h10v17M14 9h6v12M7 8h2M7 12h2M7 16h2M17 13h1M17 17h1"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.5L20 16M20 20v-4h-4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="1.5"/><path d="m16 10 5-3v10l-5-3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  compare: '<path d="M8 4v16M16 4v16M3 8h5M16 16h5M3 16h5M16 8h5"/>',
  drill: '<path d="M4 8h11v5H4zM15 9.5h3M18 10.5h3M8 13l-1 7h4l1-7"/>',
  ruler: '<path d="m3 16 13-13 5 5-13 13z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  box: '<path d="M3 8h18v12H3zM3 8l2-4h14l2 4M10 12h4"/>',
  lamp: '<rect x="5" y="4" width="14" height="10" rx="1"/><path d="M12 14v4M7 21l5-3 5 3"/>',
  vest: '<path d="M8 3 5 5v15h6V9M16 3l3 2v15h-6V9M8 3c0 3 1.5 5 4 6 2.5-1 4-3 4-6"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  sparkle: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>',
};

export const ICON_NAMES = Object.keys(PATHS);

export function Icon(name) {
  if (!PATHS[name]) throw new Error(`未定義のアイコン: ${name}`);
  return raw(
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`,
  );
}
