// CSV 一括登録：ファイルを選ぶ → プレビュー（行ごとのエラー・注意・読み取った値）→ 問題のない行だけ登録・更新
import { html, render as renderInto } from '../../lib/html.js';
import { PRODUCTS, SELLERS, SALE_STATUSES, productById, importProducts, getSettings } from '../../lib/market.js';
import { stockOf } from '../../lib/store.js';
import { decodeCsv, readImport, importTemplate, IMPORT_COLUMNS, UPDATE_LABELS, MAX_ROWS } from '../../lib/csv.js';
import { leadText } from '../../lib/delivery.js';
import { jstParts } from '../../lib/product-rules.js';
import { categoryById, LIFECYCLES } from '../../data/categories.js';
import { showToast } from '../../components/Toast.js';
import { PageHead, Chip, Options, sellerOptions, downloadText, errorMessage, yen } from '../ui.js';

const MAX_BYTES = 2 * 1024 * 1024;
const SHOWN_ROWS = 200; // プレビューに出す行の上限（多いファイルでタブが固まらないように）

const jstText = (iso) => {
  if (!iso) return '';
  const { y, m, d, hh, mm } = jstParts(iso);
  return `${y}/${m}/${d} ${hh}:${String(mm).padStart(2, '0')}`;
};
const periodText = (product) => (product.saleStart || product.saleEnd ? `${jstText(product.saleStart) || '—'} 〜 ${jstText(product.saleEnd) || '期限なし'}` : '期限なし');
const leadOfRow = (product) => (product.shipping.leadMax == null ? '—' : leadText({ min: product.shipping.leadMin, max: product.shipping.leadMax }));
const valueText = (key, value) => (key === 'stock' ? String(value) : key.startsWith('sale') ? jstText(value) || '期限なし' : yen(value));

// 同じ内容か（プレビューの後に、別のタブの登録などで結果が変わっていないか）
const fingerprint = (result) => JSON.stringify(result.rows.filter((row) => !row.problems.length).map((row) => [row.line, row.mode, row.targetId, row.changes]));

function Judge(row, saleStatus) {
  if (row.problems.length) return html`${Chip('登録しない', 'ng')}<ul class="aproblem">${row.problems.map((problem) => html`<li>${problem.column}：${problem.message}</li>`)}</ul>`;
  const head = row.mode === 'update'
    ? Chip(Object.keys(row.changes).length ? `更新（${row.targetId}）` : `変更なし（${row.targetId}）`, Object.keys(row.changes).length ? 'blue' : 'neutral')
    : Chip(`${SALE_STATUSES[row.product.saleStatus ?? saleStatus].label}で登録`, 'ok');
  return html`${head}
    ${row.mode === 'update' ? html`<ul class="aproblem aproblem--update">${Object.entries(row.changes).map(([key, change]) => html`<li>${UPDATE_LABELS[key]}：${valueText(key, change.from)} → ${valueText(key, change.to)}</li>`)}</ul>` : ''}
    ${row.warnings.map((warning) => html`<p class="awarn">${warning}</p>`)}`;
}

function Preview(result, { fileName, encoding, saleStatus }) {
  if (result.fileErrors.length) {
    return html`<div class="acsv-errors" role="alert"><strong>読み込めませんでした（${fileName}・${encoding}）</strong>${result.fileErrors.map((message) => html`<span>${message}</span>`)}<span>見本のCSVと同じ見出しにしてから、もう一度選んでください。</span></div>`;
  }
  const ok = result.rows.filter((row) => !row.problems.length);
  const ng = result.rows.filter((row) => row.problems.length);
  const { counts } = result;
  // 問題のある行を先に。多いときは先頭だけ出し、残りは件数だけ
  const shown = [...ng, ...ok].slice(0, SHOWN_ROWS);
  return html`
    <section class="asection" aria-labelledby="preview-title">
      <div class="asection__head">
        <h2 class="asection__title" id="preview-title">登録内容のプレビュー（${fileName}・${encoding}）</h2>
        <span class="asection__note">データ ${counts.data}行 ＝ 新規 ${counts.create} ＋ 更新 ${counts.update} ＋ 問題あり ${counts.error} ＋ 読み飛ばし ${counts.skipped}</span>
      </div>
      ${result.fileNotes.length ? html`<ul class="ahistory">${result.fileNotes.map((note) => html`<li><span>${Chip('お知らせ', 'blue')}</span><span>${note}</span></li>`)}</ul>` : ''}
      ${ng.length ? html`
        <div class="acsv-errors" role="alert">
          <strong>${ng.length}行に問題があります（この行は登録しません）。CSV を直して選び直すか、問題のない行だけ登録してください。</strong>
          ${ng.slice(0, 50).map((row) => row.problems.map((problem) => html`<span>${row.line}行目・「${problem.column}」：${problem.message}</span>`))}
          ${ng.length > 50 ? html`<span>ほか ${ng.length - 50}行（下の表を確かめてください）</span>` : ''}
        </div>` : ''}
      <div class="atable-wrap">
        <table class="atable">
          <thead><tr><th class="is-num">行</th><th>判定</th><th>出品元</th><th>商品名・型番・JAN</th><th>区分・状態</th><th class="is-num">通常価格・会員価格</th><th class="is-num">在庫</th><th>販売期間（日本時間）・発送目安</th></tr></thead>
          <tbody>
            ${shown.map(({ line, raw, product, ...row }) => html`
              <tr class="${row.problems.length ? 'arow--error' : ''}">
                <td class="is-num">${line}</td>
                <td>${Judge({ product, ...row }, saleStatus)}</td>
                <td class="is-nowrap">${product.sellerId || '—'}</td>
                <td><div class="atable__main"><span>${product.name || '—'}</span><span class="atable__sub">${product.maker} ${product.model}・JAN ${product.jan || raw.jan || '—'}</span><span class="atable__sub">${categoryById(product.categoryId)?.name ?? raw.category ?? '—'}</span></div></td>
                <td><div class="atable__main"><span>${LIFECYCLES[product.lifecycle]?.label ?? '—'}</span><span class="atable__sub">${product.provenance.condition}</span></div></td>
                <td class="is-num is-nowrap">${Number.isInteger(product.memberPrice) ? yen(product.memberPrice) : raw.memberPrice || '—'}<div class="atable__sub">${Number.isInteger(product.referencePrice) ? yen(product.referencePrice) : raw.referencePrice || '—'}</div></td>
                <td class="is-num">${Number.isInteger(product.stock) ? product.stock : raw.stock || '—'}</td>
                <td><div class="atable__main"><span>${periodText(product)}</span><span class="atable__sub">${leadOfRow(product)}</span></div></td>
              </tr>`)}
            ${result.rows.length > SHOWN_ROWS ? html`<tr><td class="atable__empty" colspan="8">ほか ${result.rows.length - SHOWN_ROWS}行は表示していません（登録・更新の対象には含みます）。</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div class="ahead__actions">
        <button class="btn btn--primary" type="button" data-import ${ok.length ? '' : 'disabled'}>問題のない ${ok.length}行を登録・更新する</button>
        <button class="btn btn--ghost" type="button" data-reset>選び直す</button>
      </div>
    </section>`;
}

export function render({ admin }) {
  return {
    title: 'CSV一括登録',
    view: html`
      ${PageHead({
        title: 'CSV一括登録',
        crumbs: [{ href: '#/products', label: '商品一覧' }],
        lead: '出品元から受け取った商品リスト（CSV）をまとめて登録します。同じ出品元・同じ JAN の商品が登録済みなら、在庫・価格・販売期間を更新します。登録前に内容を確かめ、問題のある行は「何行目・どの項目・何が問題か」を表示します。',
        actions: html`<button class="btn btn--secondary btn--sm" type="button" data-template>見本のCSVをダウンロード</button>`,
      })}
      <section class="asection" aria-labelledby="file-title">
        <h2 class="asection__title" id="file-title">1. ファイルを選ぶ</h2>
        <form class="atoolbar" data-file-form>
          <label class="field atoolbar__q"><span class="field__label">CSV ファイル（UTF-8・Shift_JIS のどちらでも可・2MB／${MAX_ROWS.toLocaleString()}行まで）</span><input class="field__input" type="file" name="file" accept=".csv,text/csv" data-file></label>
          <label class="field"><span class="field__label">出品元（seller_id が空欄の行）</span><select class="field__select" name="seller" data-seller>${sellerOptions('', { placeholder: 'seller_id の列で指定' })}</select></label>
          <label class="field"><span class="field__label">新規に登録したときの販売状況</span><select class="field__select" name="saleStatus" data-status>${Options(Object.entries(SALE_STATUSES).map(([key, value]) => [key, value.label]), getSettings().csvDefaultStatus)}</select></label>
        </form>
        <p class="field__hint">区分・状態・流通が空欄の行は、「販売中」を選んでも下書きで登録します（出品元に確かめてから販売中にします）。読み込んだファイルはこのブラウザの中だけで扱い、外へ送りません。</p>
        <details>
          <summary class="link-btn">列の一覧（見出しの名前）</summary>
          <div class="atable-wrap">
            <table class="atable">
              <thead><tr><th>列</th><th>必須</th><th>見出しの別名</th><th>書き方</th></tr></thead>
              <tbody>
                ${IMPORT_COLUMNS.map((column) => html`<tr><td>${column.label}</td><td>${column.required ? Chip('必須', 'ng') : '任意'}</td><td class="is-muted">${column.aliases.filter((alias) => alias !== column.label).slice(0, 5).join('・')}</td><td class="is-muted">${column.note ?? ''}</td></tr>`)}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <div data-preview></div>`,
    mount(root) {
      const preview = root.querySelector('[data-preview]');
      let current = null;

      root.querySelector('[data-template]').addEventListener('click', () => downloadText('genba-yard-products-template.csv', importTemplate()));

      const read = (text, { fileName, encoding }) => readImport(text, {
        sellers: SELLERS,
        products: PRODUCTS,
        saleStatus: root.querySelector('[data-status]').value,
        defaultSellerId: root.querySelector('[data-seller]').value,
        availableOf: stockOf,
        fileName,
        encoding,
      });

      const readFile = async () => {
        const file = root.querySelector('[data-file]').files[0];
        if (!file) return;
        if (file.size > MAX_BYTES) {
          renderInto(preview, html`<p class="form__error" role="alert">ファイルが大きすぎます（2MBまで）。分けてください。</p>`);
          return;
        }
        const { text, encoding } = decodeCsv(await file.arrayBuffer());
        const meta = { fileName: file.name, encoding };
        const result = read(text, meta);
        current = { text, meta, result };
        renderInto(preview, Preview(result, { ...meta, saleStatus: root.querySelector('[data-status]').value }));
        preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      root.querySelector('[data-file]').addEventListener('change', readFile);
      root.querySelector('[data-status]').addEventListener('change', readFile);
      root.querySelector('[data-seller]').addEventListener('change', readFile);
      preview.addEventListener('click', (event) => {
        if (event.target.closest('[data-reset]')) {
          current = null;
          root.querySelector('[data-file]').value = '';
          renderInto(preview, '');
          return;
        }
        if (!event.target.closest('[data-import]') || !current) return;
        // 登録の直前に読み直す。プレビューの後に別のタブで登録された等で結果が変わっていたら、登録せずに見せ直す
        const fresh = read(current.text, current.meta);
        if (fingerprint(fresh) !== fingerprint(current.result)) {
          current.result = fresh;
          renderInto(preview, html`<p class="form__error" role="alert">プレビューの後に商品の登録が変わったため、読み直しました。内容を確かめてから、もう一度押してください。</p>${Preview(fresh, { ...current.meta, saleStatus: root.querySelector('[data-status]').value })}`);
          return;
        }
        const rows = fresh.rows.filter((row) => !row.problems.length);
        const creates = rows.filter((row) => row.mode === 'create');
        const updates = rows.filter((row) => row.mode === 'update' && Object.keys(row.changes).length);
        try {
          const { created } = importProducts({
            creates: creates.map((row) => row.product),
            updates: updates.map((row) => {
              const { stock, ...fields } = row.changes;
              return {
                id: row.targetId,
                changes: Object.fromEntries(Object.entries(fields).map(([key, change]) => [key, change.to])),
                stockChange: stock ? { shown: stock.from, to: stock.to } : null,
              };
            }),
          }, { by: admin.id });
          showToast(`新規 ${created.length}件・更新 ${updates.length}件を反映しました。`);
          renderInto(preview, html`
            <section class="asection">
              <h2 class="asection__title">反映しました（新規 ${created.length}件・更新 ${updates.length}件）</h2>
              <ul class="ahistory">
                ${created.map((id, index) => html`<li><span>${Chip('新規', 'ok')} ${id}</span><a class="text-link" href="#/products/${id}">${creates[index].product.model}　${creates[index].product.name}</a></li>`)}
                ${updates.map((row) => html`<li><span>${Chip('更新', 'blue')} ${row.targetId}</span><a class="text-link" href="#/products/${row.targetId}">${productById(row.targetId)?.model}　${Object.keys(row.changes).map((key) => UPDATE_LABELS[key]).join('・')}</a></li>`)}
              </ul>
              <div class="ahead__actions"><a class="btn btn--primary btn--sm" href="#/products?sort=updated">商品一覧で確かめる</a><button class="btn btn--ghost btn--sm" type="button" data-reset>続けて登録する</button></div>
            </section>`);
          current = null;
          root.querySelector('[data-file]').value = '';
        } catch (error) {
          renderInto(preview, html`<p class="form__error" role="alert">${errorMessage(error)}</p>`);
        }
      });
    },
  };
}
