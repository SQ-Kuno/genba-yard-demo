import { html, raw } from '../lib/html.js';
import { SITE } from '../config/site.js';

// 「門（ゲート）」をかたどったマーク。会員だけが入れる売り場を表す
export const LogoMark = () =>
  raw('<svg class="logo__mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 28V4h24v24" fill="none" stroke="currentColor" stroke-width="3"/><path d="M11 28V11h10v17" fill="none" stroke="currentColor" stroke-width="3"/></svg>');

export const Logo = ({ invert = false } = {}) => html`
  <a class="logo ${invert ? 'logo--invert' : ''}" href="#/" aria-label="${SITE.name} トップへ">
    ${LogoMark()}
    <span class="logo__word">${SITE.name}</span>
  </a>
`;
