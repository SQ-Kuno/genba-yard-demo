// 在庫一覧。販売可能数・LOW STOCK・在庫切れを確かめ、入荷や棚卸の結果で在庫数を直す（増減は記録に残る）
import { html } from '../../lib/html.js';
import { navigate, withQuery } from '../../lib/router.js';
import { PRODUCTS, productById, sellerById, adjustStock, getInventoryLog, getSettings, saleState } from '../../lib/market.js';
import { stockOf, soldOf } from '../../lib/store.js';
import { readInteger, MAX_STOCK } from '../../lib/product-rules.js';
import { ADMIN_ACCOUNTS } from '../../data/admins.js';
import { ProductImage } from '../../components/ProductImage.js';
import { showToast } from '../../components/Toast.js';
import { PageHead, Options, sellerOptions, SituationChip, isLowStock, Chip, errorMessage, shortDateTime } from '../ui.js';

const INCREASE = '入荷（出品元から追加の連絡）';
const DECREASE = '出品元の在庫連絡（減少）';
const REASONS = [INCREASE, DECREASE, '棚卸の結果に合わせる', '破損・不良で販売できない', 'その他'];
const adminName = (id) => ADMIN_ACCOUNTS.find((account) => account.id === id)?.name ?? id;
const FILTERS = [['low', 'LOW STOCK（残りわずか）'], ['soldout', '在庫切れ'], ['onsale', '販売中の商品だけ']];

function readFilters(query) {
  return {
    q: (query.get('q') ?? '').trim(),
    seller: query.get('seller') ?? '',
    filter: FILTERS.some(([key]) => key === query.get('filter')) ? query.get('filter') : '',
  };
}

export function render({ query, admin }) {
  const filters = readFilters(query);
  const threshold = getSettings().lowStockThreshold;
  const words = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  const products = PRODUCTS
    .filter((product) => words.every((word) => `${product.name} ${product.model} ${product.jan} ${product.id}`.toLowerCase().includes(word)))
    .filter((product) => !filters.seller || product.sellerId === filters.seller)
    .filter((product) => ({ low: isLowStock(product), soldout: stockOf(product) === 0, onsale: saleState(product) === 'on-sale', '': true })[filters.filter])
    .sort((a, b) => stockOf(a) - stockOf(b));
  const log = [...getInventoryLog()].reverse().slice(0, 20);
  return {
    title: '在庫一覧',
    view: html`
      ${PageHead({ title: '在庫一覧', lead: `販売可能数は、購入されると自動で減り、キャンセルすると戻ります。${threshold}以下は LOW STOCK（閾値は設定で変更）。入力した数は、表示している数からの増減として反映します（入力中に売れた分は消えません）。` })}
      <details class="afilters" ${filters.q || filters.seller || filters.filter ? 'open' : ''} data-filters-box>
        <summary class="afilters__summary">絞り込み${filters.q || filters.seller || filters.filter ? '（条件あり）' : ''}</summary>
        <form class="atoolbar" data-filters role="search" aria-label="在庫の絞り込み">
        <label class="field atoolbar__q"><span class="field__label">商品名・型番・JAN</span><input class="field__input" type="search" name="q" value="${filters.q}"></label>
        <label class="field"><span class="field__label">出品元</span><select class="field__select" name="seller">${sellerOptions(filters.seller, { all: true })}</select></label>
        <label class="field"><span class="field__label">表示</span><select class="field__select" name="filter"><option value="">すべて</option>${Options(FILTERS, filters.filter)}</select></label>
        <div class="atoolbar__actions"><button class="btn btn--secondary btn--sm" type="submit">絞り込む</button><a class="btn btn--ghost btn--sm" href="#/inventory">条件を消す</a></div>
      </form>
      </details>
      <p class="aresult" aria-live="polite">${products.length}件</p>
      <div class="atable-wrap">
        <table class="atable atable--stack">
          <thead><tr><th class="atable__thumb"><span class="visually-hidden">画像</span></th><th>商品・出品元</th><th>販売状況</th><th class="is-num" title="売れた数＝このデモで確定した注文の数量（キャンセルした分を除く。返品は含む）">販売可能（売れた数）</th><th>販売可能数を変える</th></tr></thead>
          <tbody>
            ${products.length ? '' : html`<tr><td class="atable__empty" colspan="5">条件に合う商品はありません。条件を消すか、<a class="text-link" href="#/products/new">商品登録</a>・<a class="text-link" href="#/products/import">CSV一括登録</a>から商品を入れてください。</td></tr>`}
            ${products.map((product) => {
              const stock = stockOf(product);
              return html`
                <tr>
                  <td class="atable__thumb">${ProductImage(product, { className: 'pimg--thumb' })}</td>
                  <td class="atable__main-cell atable__name-cell"><div class="atable__main"><a class="atable__clamp" href="#/products/${product.id}">${product.model}　${product.name}</a><span class="atable__sub">${product.id}・JAN ${product.jan || '—'}</span><span class="atable__sub">${sellerById(product.sellerId)?.name ?? '—'}</span></div></td>
                  <td data-label="販売状況">${SituationChip(product)}</td>
                  <td class="is-num" data-label="販売可能">${stock === 0 ? Chip('0（SOLD OUT）', 'ng') : isLowStock(product) ? Chip(`${stock}（LOW STOCK）`, 'signal') : stock}<div class="atable__sub">売れた数 ${soldOf(product.id)}</div></td>
                  <td data-label="販売可能数を変える">
                    <form class="astock" data-stock-form="${product.id}" data-shown="${stock}" novalidate>
                      <input class="field__input astock__qty" name="stock" value="${stock}" inputmode="numeric" aria-label="${product.model} の新しい販売可能数">
                      <select class="field__select astock__reason" name="reason" aria-label="変える理由">${Options(REASONS.map((reason) => [reason, reason]), INCREASE)}</select>
                      <button class="btn btn--secondary btn--sm" type="submit">保存</button>
                    </form>
                  </td>
                </tr>`;
            })}
          </tbody>
        </table>
      </div>
      <section class="asection" aria-labelledby="log-title">
        <div class="asection__head"><h2 class="asection__title" id="log-title">在庫の増減の記録（新しい順・20件）</h2><span class="asection__note">購入による減少は注文として記録しています（販売分析で集計）。返品は在庫に戻しません（再販できるかは出品元の確認後に、ここで増やします）。</span></div>
        ${log.length ? html`
          <div class="atable-wrap">
            <table class="atable">
              <thead><tr><th>日時</th><th>商品</th><th class="is-num">増減</th><th>理由</th><th>操作した人</th></tr></thead>
              <tbody>${log.map((entry) => html`
                <tr>
                  <td class="is-nowrap">${shortDateTime(entry.at)}</td>
                  <td>${productById(entry.productId)?.model ?? entry.productId}</td>
                  <td class="is-num">${entry.delta > 0 ? `+${entry.delta}` : entry.delta}</td>
                  <td>${entry.reason}${entry.orderId ? `（${entry.orderId}）` : ''}</td>
                  <td class="is-muted">${entry.by ? adminName(entry.by) : '—'}</td>
                </tr>`)}</tbody>
            </table>
          </div>` : html`<p class="asection__note">まだ記録はありません。</p>`}
      </section>`,
    mount(root, { refresh }) {
      const filterForm = root.querySelector('[data-filters]');
      filterForm.addEventListener('submit', (event) => {
        event.preventDefault();
        navigate(withQuery('/inventory', Object.fromEntries([...new FormData(filterForm).entries()].filter(([, value]) => value))));
      });
      filterForm.querySelectorAll('select').forEach((select) => select.addEventListener('change', () => filterForm.requestSubmit()));
      // 増やすか減らすかに合わせて、理由の既定を切り替える（理由を自分で選んだ後は変えない）
      root.addEventListener('input', (event) => {
        const form = event.target.closest('[data-stock-form]');
        if (!form || event.target.name !== 'stock' || form.dataset.reasonTouched) return;
        const { value } = readInteger(form.stock.value, { label: '販売可能数', max: MAX_STOCK });
        if (value !== null) form.reason.value = value < Number(form.dataset.shown) ? DECREASE : INCREASE;
      });
      root.addEventListener('change', (event) => {
        if (event.target.name === 'reason') event.target.closest('[data-stock-form]').dataset.reasonTouched = '1';
      });
      root.addEventListener('submit', (event) => {
        const form = event.target.closest('[data-stock-form]');
        if (!form) return;
        event.preventDefault();
        const product = productById(form.dataset.stockForm);
        const shown = Number(form.dataset.shown);
        const { value, error } = readInteger(form.stock.value, { label: '販売可能数', max: MAX_STOCK, required: true });
        if (error) {
          showToast(error);
          form.stock.focus();
          return;
        }
        if (value === shown) {
          showToast('販売可能数は変わっていません。');
          return;
        }
        try {
          // 表示していた数からの増減で反映する（入力中に売れた分は、そのまま差し引かれる）
          const delta = adjustStock(product.id, { shown, to: value, reason: form.reason.value, by: admin.id });
          const now = stockOf(productById(product.id));
          showToast(`${product.model} の販売可能数を ${delta > 0 ? `+${delta}` : delta} しました（いま ${now}）。`);
          refresh();
        } catch (error) {
          showToast(errorMessage(error));
        }
      });
    },
  };
}
