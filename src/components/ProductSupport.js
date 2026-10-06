import { html } from '../lib/html.js';
import { yearMonth } from '../lib/format.js';
import { SUPPORT_LABELS } from '../data/categories.js';
import { platformById } from '../data/batteries.js';
import { getOwnedBatteries } from '../lib/store.js';
import { SectionHeader } from './Section.js';

const Chip = ({ label, tone }) => html`<span class="chip chip--${tone}">${label}</span>`;

const ymValue = (value) => {
  const [year, month] = value.split('-').map(Number);
  return year * 12 + month;
};

// 発売 → 製造終了 → 販売終了 → 現在 → サポート期限 を1本の線で見せる（発売時期が分からない商品は出さない）
function Lifecycle(product) {
  if (!product.releaseDate) return html`<p class="note">発売・製造終了の時期は出品元に確認中です。</p>`;
  const now = new Date();
  const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const points = [
    { key: 'release', label: '発売', value: product.releaseDate },
    // 終了の時期が分からないときは、現行品だけ「製造中・販売中」と書く（それ以外は断定しない）
    product.productionEnd ? { key: 'production', label: '製造終了', value: product.productionEnd } : { key: 'production', label: '製造', value: null, note: product.lifecycle === 'current' ? '製造中' : '確認中' },
    product.salesEnd ? { key: 'sales', label: 'メーカー販売終了', value: product.salesEnd } : { key: 'sales', label: 'メーカー販売', value: null, note: product.lifecycle === 'current' ? '販売中' : '確認中' },
    { key: 'now', label: '現在', value: nowYm, isNow: true },
    product.support.until ? { key: 'until', label: `${product.support.untilLabel}まで`, value: product.support.until, isFuture: true } : null,
  ].filter(Boolean);

  const dated = points.filter((point) => point.value);
  const min = ymValue(dated[0].value);
  const max = Math.max(...dated.map((point) => ymValue(point.value)));
  const position = (value) => ((ymValue(value) - min) / Math.max(1, max - min)) * 100;

  return html`
    <div class="lifecycle">
      <div class="lifecycle__track" aria-hidden="true">
        <span class="lifecycle__past" style="width:${position(nowYm)}%"></span>
        ${dated.map((point) => html`<span class="lifecycle__dot ${point.isNow ? 'is-now' : ''} ${point.isFuture ? 'is-future' : ''}" style="left:${position(point.value)}%"></span>`)}
      </div>
      <ol class="lifecycle__list">
        ${points.map((point) => html`
          <li class="lifecycle__item ${point.isNow ? 'is-now' : ''} ${point.isFuture ? 'is-future' : ''}">
            <span class="lifecycle__label">${point.label}</span>
            <span class="lifecycle__value">${point.value ? yearMonth(point.value) : point.note}</span>
          </li>`)}
      </ol>
    </div>`;
}

function SupportRow({ title, chip, note }) {
  return html`
    <div class="support-row">
      <dt class="support-row__title">${title}</dt>
      <dd class="support-row__status">${chip}</dd>
      <dd class="support-row__note">${note}</dd>
    </div>`;
}

function BatteryTable(platform) {
  const owned = getOwnedBatteries().includes(platform.id);
  return html`
    <div class="compat">
      <p class="compat__title">使えるバッテリー・充電器（${platform.name}）${owned ? html`<span class="chip chip--ok">手持ちの電池で動きます</span>` : ''}</p>
      <ul class="compat__list">
        ${[...platform.batteries, ...platform.chargers].map((item) => html`<li><span class="compat__mark" aria-label="対応">○</span>${item}</li>`)}
      </ul>
      <p class="note">${platform.name} は${platform.since}から同じ規格です。手持ちのバッテリーはマイページで登録できます。</p>
    </div>`;
}

export function ProductSupport(product) {
  const { support } = product;
  const platform = support.battery.platform ? platformById(support.battery.platform) : null;
  return html`
    <section class="detail-section support" aria-labelledby="support-title">
      ${SectionHeader({ id: 'support-title', eyebrow: 'AFTER SUPPORT', title: '型落ち・廃番でも、あとで困らないために', lead: '製造・販売の状況と、買ったあとのサポートをすべて開示しています。' })}
      ${Lifecycle(product)}
      <dl class="support-grid">
        ${SupportRow({ title: 'メーカーサポート', chip: Chip(SUPPORT_LABELS.maker[support.maker]), note: support.makerNote })}
        ${SupportRow({ title: '修理対応', chip: Chip(SUPPORT_LABELS.repair[support.repair]), note: support.repairNote })}
        ${SupportRow({ title: '交換部品', chip: Chip(SUPPORT_LABELS.parts[support.parts]), note: support.partsNote })}
        ${SupportRow({ title: '消耗品の互換', chip: Chip(SUPPORT_LABELS.compat[support.consumables.status]), note: support.consumables.note })}
        ${SupportRow({ title: 'バッテリー互換', chip: Chip(SUPPORT_LABELS.compat[support.battery.status]), note: support.battery.note })}
        ${SupportRow({ title: '保証', chip: Chip({ label: '保証付き', tone: 'ok' }), note: support.warranty })}
      </dl>
      ${platform ? BatteryTable(platform) : ''}
      <p class="note support__note">補修部品の保有期間・保証期間は各ブランドの公表値です（デモのため架空の値）。</p>
    </section>`;
}

export function Provenance(product) {
  const { provenance } = product;
  const rows = [
    ['出品元', provenance.source],
    ['流通', provenance.channel],
    ['状態', provenance.condition],
    ['製造時期', provenance.lot],
    provenance.pse ? ['電気用品安全法', provenance.pse] : null,
  ].filter(Boolean);
  return html`
    <div class="provenance">
      <p class="provenance__title">出どころ</p>
      <dl class="provenance__list">
        ${rows.map(([term, value]) => html`<div><dt>${term}</dt><dd>${value}</dd></div>`)}
      </dl>
      <p class="note">並行輸入品・中古品・互換バッテリーは取り扱っていません。</p>
    </div>`;
}
