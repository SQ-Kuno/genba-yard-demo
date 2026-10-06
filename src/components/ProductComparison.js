import { html } from '../lib/html.js';
import { SITE } from '../config/site.js';
import { yen } from '../lib/format.js';
import { getPricing, priceLabel } from '../lib/pricing.js';
import { brandById } from '../data/brands.js';
import { COMPARISONS, CURRENT_MODELS } from '../data/comparisons.js';
import { ProductImage } from './ProductImage.js';
import { ModelArt } from './ProductArt.js';
import { Icon } from './Icon.js';

export const comparisonFor = (product) => {
  const data = COMPARISONS[product.id];
  return data ? { ...data, current: CURRENT_MODELS[product.successorId] } : null;
};

const decimals = (value) => (typeof value === 'number' ? (String(value).split('.')[1] ?? '').length : 0);

// 旧・現行で小数の桁をそろえる（2.9 kg と 3.0 kg）
function formatValue(value, row) {
  if (typeof value !== 'number') return value;
  const digits = Math.max(decimals(row.old), decimals(row.current));
  const text = value.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return row.unit ? `${text} ${row.unit}` : text;
}

// 数値の行だけ差を出す。「どちらが有利か」は better の向きで判定し、色だけでなく言葉で示す
function difference(row) {
  if (typeof row.old !== 'number' || typeof row.current !== 'number' || row.old === row.current) {
    return row.old === row.current ? html`<span class="diff diff--same">同じ</span>` : '';
  }
  const delta = row.current - row.old;
  const currentIsBetter = row.better === 'higher' ? delta > 0 : delta < 0;
  const sign = delta > 0 ? '+' : '−';
  const digits = Math.max(decimals(row.old), decimals(row.current));
  const rounded = Math.abs(delta).toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return html`<span class="diff ${currentIsBetter ? 'diff--current' : 'diff--old'}">現行が${sign}${rounded}${row.unit ? ` ${row.unit}` : ''}</span>`;
}

const sameText = (row) => row.old === row.current;

export function ComparisonTable(product, comparison) {
  const pricing = getPricing(product);
  const groups = [...new Set(comparison.rows.map((row) => row.group))];
  return html`
    <div class="ctable" role="table" aria-label="${product.model} と ${comparison.current.model} の比較">
      <div class="ctable__head" role="row">
        <span role="columnheader" class="ctable__label">項目</span>
        <span role="columnheader" class="ctable__col ctable__col--old">旧モデル<strong class="en">${product.model}</strong></span>
        <span role="columnheader" class="ctable__col">現行モデル<strong class="en">${comparison.current.model}</strong></span>
      </div>
      ${groups.map((group) => html`
        <div class="ctable__group" role="rowgroup">
          <p class="ctable__group-title" role="row"><span role="rowheader">${group}</span></p>
          ${comparison.rows.filter((row) => row.group === group).map((row) => html`
            <div class="ctable__row ${sameText(row) ? 'is-same' : ''}" role="row">
              <span class="ctable__label" role="rowheader">${row.label}</span>
              <span class="ctable__cell ctable__cell--old" role="cell">${formatValue(row.old, row)}</span>
              <span class="ctable__cell" role="cell">${formatValue(row.current, row)} ${difference(row)}</span>
            </div>`)}
        </div>`)}
      <div class="ctable__group" role="rowgroup">
        <p class="ctable__group-title" role="row"><span role="rowheader">価格（税込）</span></p>
        <div class="ctable__row ctable__row--price" role="row">
          <span class="ctable__label" role="rowheader">価格</span>
          <span class="ctable__cell ctable__cell--old" role="cell"><strong class="num">${yen(pricing.final)}</strong><small>${priceLabel(pricing)}（このマーケット）</small></span>
          <span class="ctable__cell" role="cell">${SITE.pricing.showSuccessorMsrp
            ? html`<span class="num">${yen(comparison.current.msrp)}</span><small>メーカー希望小売価格（参考・このマーケットでは取り扱いなし）</small>`
            : html`<small>このマーケットでは取り扱いなし。価格はメーカーの公表値・販売店でご確認ください</small>`}</span>
        </div>
      </div>
    </div>`;
}

export function ChangeLists(comparison) {
  return html`
    <div class="changes">
      <div class="changes__col">
        <p class="changes__title">現行モデルで変わった点</p>
        <ul>${comparison.changed.map((item) => html`<li>${Icon('plus')}${item}</li>`)}</ul>
      </div>
      <div class="changes__col changes__col--same">
        <p class="changes__title">変わらない点</p>
        <ul>${comparison.unchanged.map((item) => html`<li>${Icon('check')}${item}</li>`)}</ul>
      </div>
    </div>`;
}

// 用途を選ぶと「旧モデルで十分か」を示す。初期表示は最初の用途
export function UseCaseVerdict(product, comparison, selectedId) {
  const useCase = comparison.useCases.find((item) => item.id === selectedId) ?? comparison.useCases[0];
  const isOld = useCase.pick === 'old';
  return html`
    <div class="verdict" data-verdict>
      <fieldset class="verdict__choices">
        <legend class="verdict__question">あなたの主な使い方は？</legend>
        ${comparison.useCases.map((item) => html`
          <label class="choice">
            <input type="radio" name="use-case" value="${item.id}" ${item.id === useCase.id ? 'checked' : ''} data-use-case>
            <span>${item.label}</span>
          </label>`)}
      </fieldset>
      <div class="verdict__result ${isOld ? 'verdict__result--old' : 'verdict__result--current'}" aria-live="polite">
        <p class="verdict__eyebrow en">${isOld ? 'OLD MODEL IS ENOUGH' : 'CURRENT MODEL FITS'}</p>
        <p class="verdict__title">${isOld ? `この使い方なら、旧モデル ${product.model} で十分です。` : `この使い方なら、現行モデル ${comparison.current.model} をおすすめします。`}</p>
        <p class="verdict__reason">${useCase.reason}</p>
        ${isOld ? '' : html`<p class="note">現行モデルはこのマーケットでは取り扱っていません。お近くの販売店でお求めください。</p>`}
      </div>
    </div>`;
}

// 商品詳細に置く要約。全項目は比較ページで見せる
export function ComparisonTeaser(product, comparison) {
  const brand = brandById(product.brandId);
  return html`
    <section class="detail-section compare-teaser" aria-labelledby="compare-title">
      <div class="compare-teaser__head">
        <p class="eyebrow">OLD vs NEW</p>
        <h2 class="compare-teaser__title" id="compare-title">現行モデル ${comparison.current.model} と比べる</h2>
      </div>
      <div class="compare-teaser__models">
        <div class="compare-teaser__model">
          ${ProductImage(product, { className: 'pimg--thumb' })}
          <p><span class="tag tag--navy">このページの商品</span><span class="en">${brand.name} ${product.model}</span></p>
        </div>
        <span class="compare-teaser__vs en" aria-hidden="true">VS</span>
        <div class="compare-teaser__model">
          <figure class="pimg pimg--thumb"><div class="pimg__placeholder">${ModelArt(comparison.current)}</div></figure>
          <p><span class="tag tag--outline">現行モデル（取り扱いなし）</span><span class="en">${brand.name} ${comparison.current.model}</span></p>
        </div>
      </div>
      ${ChangeLists(comparison)}
      <a class="btn btn--secondary btn--block" href="#/compare/${product.id}">${Icon('compare')}用途別に、旧モデルで十分か確かめる</a>
    </section>`;
}
