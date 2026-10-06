// 商品一覧（検索・絞り込み）。条件は URL のクエリに持たせ、再読み込みや共有でも同じ一覧になる
import { html } from '../../lib/html.js';
import { navigate, withQuery } from '../../lib/router.js';
import { PRODUCTS, SALE_STATUSES, productById, sellerById, setSaleStatus } from '../../lib/market.js';
import { stockOf } from '../../lib/store.js';
import { REFERENCE_LABELS } from '../../lib/pricing.js';
import { discountOf, publishBlockers } from '../../lib/product-rules.js';
import { CATEGORIES, categoryById } from '../../data/categories.js';
import { ProductImage } from '../../components/ProductImage.js';
import { showToast } from '../../components/Toast.js';
import { PageHead, SituationChip, productSituation, SITUATION_FILTERS, Options, sellerOptions, isLowStock, Chip, confirmDialog, inputError, yen } from '../ui.js';

const md = (iso) => (iso ? `${new Date(iso).getMonth() + 1}/${new Date(iso).getDate()}` : '');
const periodText = (product) => (product.saleStart || product.saleEnd ? `${md(product.saleStart)}〜${md(product.saleEnd) || '期限なし'}` : '期間の指定なし');

// 一括の販売状況の変更（販売中にするときは、区分・状態・流通・発送目安がそろった商品だけ）
const BULK = [['on-sale', '販売中にする'], ['suspended', '販売停止にする'], ['draft', '下書きに戻す']];

const SORTS = [
  ['updated', '更新の新しい順'],
  ['ending', '販売終了の近い順'],
  ['stock', '在庫の少ない順'],
  ['name', '商品名順'],
];

function readFilters(query) {
  return {
    q: (query.get('q') ?? '').trim(),
    seller: query.get('seller') ?? '',
    category: query.get('category') ?? '',
    situation: query.get('situation') ?? '',
    sort: SORTS.some(([key]) => key === query.get('sort')) ? query.get('sort') : 'updated',
  };
}

function filterAdminProducts(filters) {
  const words = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = PRODUCTS.filter((product) => {
    const text = `${product.name} ${product.model} ${product.jan} ${product.id} ${product.maker} ${product.sellerSku ?? ''}`.toLowerCase();
    return words.every((word) => text.includes(word))
      && (!filters.seller || product.sellerId === filters.seller)
      && (!filters.category || product.categoryId === filters.category)
      && (!filters.situation || productSituation(product).key === filters.situation);
  });
  const sorts = {
    updated: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
    ending: (a, b) => (a.saleEnd ? new Date(a.saleEnd) : Infinity) - (b.saleEnd ? new Date(b.saleEnd) : Infinity),
    stock: (a, b) => stockOf(a) - stockOf(b),
    name: (a, b) => a.name.localeCompare(b.name, 'ja'),
  };
  return list.sort(sorts[filters.sort]);
}

export function render({ query, admin }) {
  const filters = readFilters(query);
  const products = filterAdminProducts(filters);
  return {
    title: '商品一覧',
    view: html`
      ${PageHead({
        title: '商品一覧',
        lead: '登録したすべての商品（下書き・販売停止を含む）。行の商品名から編集できます。',
        actions: html`<a class="btn btn--secondary btn--sm" href="#/products/import">CSV一括登録</a><a class="btn btn--primary btn--sm" href="#/products/new">新規商品登録</a>`,
      })}
      <details class="afilters" ${filters.q || filters.seller || filters.category || filters.situation ? 'open' : ''} data-filters-box>
        <summary class="afilters__summary">絞り込み${filters.q || filters.seller || filters.category || filters.situation ? '（条件あり）' : ''}</summary>
        <form class="atoolbar" data-filters role="search" aria-label="商品の絞り込み">
        <label class="field atoolbar__q"><span class="field__label">商品名・JAN・型番・商品ID</span><input class="field__input" type="search" name="q" value="${filters.q}" placeholder="例：ID-180 / 2010000000014"></label>
        <label class="field"><span class="field__label">出品元</span><select class="field__select" name="seller">${sellerOptions(filters.seller, { all: true })}</select></label>
        <label class="field"><span class="field__label">カテゴリー</span><select class="field__select" name="category"><option value="">すべて</option>${Options(CATEGORIES.map((category) => [category.id, category.name]), filters.category)}</select></label>
        <label class="field"><span class="field__label">販売状況</span><select class="field__select" name="situation"><option value="">すべて</option>${Options(SITUATION_FILTERS, filters.situation)}</select></label>
        <label class="field"><span class="field__label">並び順</span><select class="field__select" name="sort">${Options(SORTS, filters.sort)}</select></label>
        <div class="atoolbar__actions"><button class="btn btn--secondary btn--sm" type="submit">絞り込む</button><a class="btn btn--ghost btn--sm" href="#/products">条件を消す</a></div>
      </form>
      </details>
      <p class="aresult" aria-live="polite">${products.length}件 ／ 全${PRODUCTS.length}件</p>
      <div class="abulk" data-bulk>
        <span class="abulk__count" data-bulk-count>選んだ商品：0件</span>
        ${BULK.map(([status, label]) => html`<button class="btn btn--secondary btn--sm" type="button" data-bulk-status="${status}" disabled>${label}</button>`)}
      </div>
      <div class="atable-wrap">
        <table class="atable">
          <thead>
            <tr>
              <th class="atable__check"><input type="checkbox" data-check-all aria-label="表示中の商品をすべて選ぶ"></th>
              <th class="atable__thumb"><span class="visually-hidden">画像</span></th>
              <th>商品名・商品ID・JANコード</th>
              <th>出品元・カテゴリー</th>
              <th class="is-num">会員価格・通常価格・割引率</th>
              <th class="is-num">在庫</th>
              <th>販売状況・販売期間</th>
            </tr>
          </thead>
          <tbody>
            ${products.length ? products.map((product) => {
              const rate = discountOf(product.referencePrice, product.memberPrice);
              const stock = stockOf(product);
              return html`
                <tr>
                  <td class="atable__check"><input type="checkbox" value="${product.id}" data-check aria-label="${product.model} を選ぶ"></td>
                  <td class="atable__thumb">${ProductImage(product, { className: 'pimg--thumb' })}</td>
                  <td class="atable__name-cell"><div class="atable__main"><a class="atable__clamp" href="#/products/${product.id}">${product.name}</a><span class="atable__sub">${product.id}　${product.maker} ${product.model}</span><span class="atable__sub">JAN ${product.jan || '—'}</span></div></td>
                  <td><div class="atable__main"><span>${sellerById(product.sellerId)?.name ?? '未設定'}</span><span class="atable__sub">${categoryById(product.categoryId)?.name ?? '—'}</span></div></td>
                  <td class="is-num is-nowrap">${yen(product.memberPrice)}<div class="atable__sub">${REFERENCE_LABELS[product.referencePriceType]?.short ?? ''} ${yen(product.referencePrice)}</div><div class="atable__sub">${rate === null ? '割引なし' : `${rate}% OFF`}</div></td>
                  <td class="is-num">${stock === 0 ? Chip('0', 'ng') : isLowStock(product) ? Chip(`${stock}`, 'signal') : stock}</td>
                  <td class="is-nowrap">${SituationChip(product)}<div class="atable__sub">${periodText(product)}</div></td>
                </tr>`;
            }) : html`<tr><td class="atable__empty" colspan="7">条件に合う商品はありません。条件を変えるか、<a class="text-link" href="#/products/new">新規商品登録</a>から登録してください。</td></tr>`}
          </tbody>
        </table>
      </div>
    `,
    mount(root, { refresh }) {
      const checked = () => [...root.querySelectorAll('[data-check]:checked')].map((box) => box.value);
      const syncBulk = () => {
        const count = checked().length;
        root.querySelector('[data-bulk-count]').textContent = `選んだ商品：${count}件`;
        root.querySelectorAll('[data-bulk-status]').forEach((button) => { button.disabled = !count; });
      };
      root.querySelector('[data-check-all]').addEventListener('change', (event) => {
        root.querySelectorAll('[data-check]').forEach((box) => { box.checked = event.target.checked; });
        syncBulk();
      });
      root.addEventListener('change', (event) => {
        if (event.target.matches('[data-check]')) syncBulk();
      });
      root.querySelector('[data-bulk]').addEventListener('click', (event) => {
        const button = event.target.closest('[data-bulk-status]');
        if (!button) return;
        const status = button.dataset.bulkStatus;
        const ids = checked();
        // 販売中にできない商品（区分・状態・流通・発送目安が確認中）は外して、理由を伝える
        const blocked = status === 'on-sale' ? ids.map((id) => ({ product: productById(id), missing: publishBlockers(productById(id)) })).filter((item) => item.missing.length) : [];
        const targets = ids.filter((id) => !blocked.some((item) => item.product.id === id));
        confirmDialog({
          title: `${targets.length}件を「${SALE_STATUSES[status].label}」にしますか？`,
          text: `${blocked.length ? `${blocked.length}件は入力が足りないため変えません（${blocked.slice(0, 3).map((item) => `${item.product.model}：${item.missing.join('・')}`).join('／')}${blocked.length > 3 ? ' ほか' : ''}）。` : ''}${status === 'on-sale' ? '販売期間内の商品は、すぐに購入者画面に出ます。' : ''}`,
          confirmLabel: button.textContent,
          onConfirm: () => {
            if (!targets.length) throw inputError('変えられる商品がありません。');
            setSaleStatus(targets, status, { by: admin.id }); // 保存する側でも、入力が足りない商品は販売中にしない
            showToast(`${targets.length}件を「${SALE_STATUSES[status].label}」にしました。${blocked.length ? `${blocked.length}件は入力が足りないため変えていません。` : ''}`);
            refresh();
          },
        });
      });
      root.querySelector('[data-filters]').addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(event.target);
        navigate(withQuery('/products', Object.fromEntries([...data.entries()].filter(([key, value]) => value && !(key === 'sort' && value === 'updated')))));
      });
      // 選択肢を変えたらすぐ絞り込む（検索語は Enter かボタンで）
      root.querySelectorAll('[data-filters] select').forEach((select) => select.addEventListener('change', () => root.querySelector('[data-filters]').requestSubmit()));
    },
  };
}
