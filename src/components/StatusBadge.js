import { html } from '../lib/html.js';
import { getBadges } from '../lib/status.js';

export const StatusBadge = (badge) => html`<span class="tag tag--${badge.tone} ${badge.en ? 'tag--en' : ''}">${badge.label}</span>`;

export function StatusBadges(product, { forCard = false } = {}) {
  const badges = getBadges(product, { forCard });
  return html`<div class="badges">${badges.map(StatusBadge)}</div>`;
}
