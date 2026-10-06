import { html } from '../lib/html.js';
import { Icon } from './Icon.js';

// 小ラベル → 大見出し → リード の編集リズムを全セクションでそろえる
export function SectionHeader({ id, eyebrow, title, lead = '', link = null, aside = '' }) {
  return html`
    <header class="section-head">
      <div class="section-head__text">
        <p class="eyebrow">${eyebrow}</p>
        <h2 class="section-head__title" id="${id}">${title}</h2>
        ${lead ? html`<p class="section-head__lead">${lead}</p>` : ''}
      </div>
      <div class="section-head__aside">
        ${aside}
        ${link ? html`<a class="text-link" href="${link.href}">${link.label}${Icon('arrow')}</a>` : ''}
      </div>
    </header>`;
}
