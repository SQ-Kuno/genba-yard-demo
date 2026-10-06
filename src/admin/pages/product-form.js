// 商品登録・編集。入力の確かめ方は lib/product-rules.js（CSV 一括登録と同じ）。
// 保存するのは変えた項目だけ。在庫は「画面に出していた販売可能数からの増減」で反映する（編集中に売れた分・別の画面での変更を消さない）
import { html, render as renderInto } from '../../lib/html.js';
import { navigate } from '../../lib/router.js';
import { PRODUCTS, SELLERS, SALE_STATUSES, UNKNOWN, productById, sellerById, saveProduct, isListed } from '../../lib/market.js';
import { soldOf, stockOf } from '../../lib/store.js';
import { REFERENCE_LABELS, getPricing } from '../../lib/pricing.js';
import { validateProduct, discountOf, parseNumber, readInteger, readDateTime, toJstInput, normalizeJan, normalizeText, MAX_IMAGES, MAX_PRICE, MAX_STOCK, MAX_LEAD_DAYS, LIMITS, CONDITIONS, CHANNELS } from '../../lib/product-rules.js';
import { CATEGORIES, LIFECYCLES } from '../../data/categories.js';
import { BRANDS } from '../../data/brands.js';
import { SITE } from '../../config/site.js';
import { ART_KINDS } from '../../components/ProductArt.js';
import { imageSrc } from '../../components/ProductImage.js';
import { showToast } from '../../components/Toast.js';
import { PageHead, Field, Options, sellerOptions, SituationChip, errorMessage, yen, shortDateTime } from '../ui.js';

const KIND_LABELS = {
  generic: '汎用（箱）', impact: 'インパクトドライバー', drill: 'ドリル', saw: '丸ノコ', grinder: 'グラインダー', battery: 'バッテリー', charger: '充電器',
  laser: '墨出し器', meter: '距離計', clamp: 'クランプメーター', sockets: 'ソケットセット', stripper: 'ストリッパー', toolbox: '工具箱', light: '照明',
  harness: 'フルハーネス', vest: 'ベスト', cleaner: 'クリーナー',
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const emptyValues = () => ({
  name: '', maker: '', model: '', jan: '', sellerSku: '', categoryId: '', lifecycle: 'unknown', kind: 'generic', description: '', images: [],
  condition: UNKNOWN, channel: UNKNOWN, releaseDate: '', productionEnd: '', supportUntil: '',
  sellerId: '', fulfillerId: '', referencePrice: '', referencePriceType: 'unconfirmed', memberPrice: '', stock: '',
  saleStart: '', saleEnd: '', shippingMode: 'standard', shippingFee: '', leadMode: 'lead', leadMin: '', leadMax: '',
  saleStatus: 'draft', reasonLabel: '会員限定価格', reasonHeadline: '', reasonBody: '', warranty: '',
});

function valuesOf(product) {
  return {
    ...emptyValues(),
    name: product.name,
    maker: product.maker,
    model: product.model,
    jan: product.jan,
    sellerSku: product.sellerSku ?? '',
    categoryId: product.categoryId,
    lifecycle: product.lifecycle,
    kind: product.kind,
    description: product.description,
    images: product.images ?? [],
    condition: product.provenance.condition ?? UNKNOWN,
    channel: product.provenance.channel ?? UNKNOWN,
    releaseDate: product.releaseDate ?? '',
    productionEnd: product.productionEnd ?? '',
    supportUntil: product.support.until ?? '',
    sellerId: product.sellerId ?? '',
    fulfillerId: product.fulfillerId && product.fulfillerId !== product.sellerId ? product.fulfillerId : '',
    referencePrice: String(product.referencePrice),
    referencePriceType: product.referencePriceType,
    memberPrice: String(product.memberPrice),
    stock: String(stockOf(product)),
    saleStart: toJstInput(product.saleStart),
    saleEnd: toJstInput(product.saleEnd),
    shippingMode: product.shipping.fee == null ? 'standard' : 'individual',
    shippingFee: product.shipping.fee == null ? '' : String(product.shipping.fee),
    leadMode: product.shipping.leadMax != null ? 'lead' : 'standard',
    leadMin: product.shipping.leadMax != null ? String(product.shipping.leadMin ?? product.shipping.leadMax) : '',
    leadMax: product.shipping.leadMax != null ? String(product.shipping.leadMax) : '',
    saleStatus: product.saleStatus,
    reasonLabel: product.priceReason.label,
    reasonHeadline: product.priceReason.headline,
    reasonBody: product.priceReason.body,
    warranty: product.support.warranty === UNKNOWN ? '' : product.support.warranty,
  };
}

// 入力値 → 保存する商品の形と、読み取りのエラー（数値・日時・年月が読めないもの）
function toInput(values, product) {
  const readErrors = {};
  const take = (key, read) => {
    if (read.error) readErrors[key] = read.error;
    return read.value;
  };
  const month = (key, label) => {
    const value = values[key].trim();
    if (value && !MONTH.test(value)) readErrors[key] = `${label}は「2024-03」の形（年-月）で入力してください。`;
    return value || null;
  };
  const shippingFee = values.shippingMode === 'individual' ? take('shippingFee', readInteger(values.shippingFee, { label: '個別送料', max: 99999, required: true, unit: '円' })) : null;
  let leadMin = null;
  let leadMax = null;
  if (values.leadMode === 'lead') {
    leadMin = take('lead', readInteger(values.leadMin, { label: '発送目安（最短）', max: MAX_LEAD_DAYS, required: true }));
    leadMax = take('lead', readInteger(values.leadMax, { label: '発送目安（最長）', max: MAX_LEAD_DAYS, required: true }));
  }
  const supportUntil = month('supportUntil', '修理受付期限');
  const input = {
    name: normalizeText(values.name),
    maker: normalizeText(values.maker),
    model: normalizeText(values.model),
    jan: normalizeJan(values.jan),
    sellerSku: normalizeText(values.sellerSku),
    categoryId: values.categoryId,
    lifecycle: values.lifecycle,
    kind: values.kind,
    description: values.description.trim(),
    images: values.images,
    sellerId: values.sellerId,
    fulfillerId: values.fulfillerId || values.sellerId,
    merchantId: product?.merchantId && product.merchantId !== product.sellerId ? product.merchantId : values.sellerId,
    referencePrice: take('referencePrice', readInteger(values.referencePrice, { label: '通常価格', min: 1, max: MAX_PRICE, required: true, unit: '円・税込' })),
    referencePriceType: values.referencePriceType,
    memberPrice: take('memberPrice', readInteger(values.memberPrice, { label: '会員価格', min: 1, max: MAX_PRICE, required: true, unit: '円・税込' })),
    stock: take('stock', readInteger(values.stock, { label: '販売可能在庫数', max: MAX_STOCK, required: true })),
    saleStart: take('saleStart', readDateTime(values.saleStart, { label: '販売開始日時' })),
    saleEnd: take('saleEnd', readDateTime(values.saleEnd, { label: '販売終了日時', endOfDay: true })),
    saleStatus: values.saleStatus,
    shipping: { fee: shippingFee, leadMin, leadMax },
    provenance: { ...(product?.provenance ?? {}), condition: values.condition, channel: values.channel },
    releaseDate: month('releaseDate', '発売'),
    productionEnd: month('productionEnd', '製造終了'),
    priceReason: { label: values.reasonLabel.trim() || '会員限定価格', headline: values.reasonHeadline.trim(), body: values.reasonBody.trim() },
    support: { ...(product?.support ?? {}), warranty: values.warranty.trim() || UNKNOWN, until: supportUntil, untilLabel: supportUntil ? product?.support.untilLabel || '修理受付' : '' },
  };
  return { input, readErrors };
}

// 開いた時点の値と比べて、変えた項目だけを返す（在庫は別に増減で扱う）
function changedFields(input, initial) {
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => key !== 'stock' && JSON.stringify(value) !== JSON.stringify(initial[key])));
}

// 画像を縮小してブラウザに保存できる大きさにする（長辺 800px・JPEG）。JPEG・PNG・WebP だけを受け付ける
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error(`${file.name} は使えません（JPEG・PNG・WebP の画像を選んでください）。`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} を読み込めませんでした。`));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error(`${file.name} を画像として開けませんでした。`));
      image.onload = () => {
        if (!image.width || !image.height) {
          reject(new Error(`${file.name} は大きさの分からない画像です。`));
          return;
        }
        const scale = Math.min(1, 800 / Math.max(image.width, image.height));
        const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(image.width * scale), height: Math.round(image.height * scale) });
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function RatePreview(values) {
  const reference = parseNumber(values.referencePrice);
  const member = parseNumber(values.memberPrice);
  const rate = Number.isInteger(reference) && Number.isInteger(member) ? discountOf(reference, member) : null;
  const label = REFERENCE_LABELS[values.referencePriceType]?.label ?? '';
  const shown = getPricing({ id: '', memberPrice: member, referencePrice: reference, referencePriceType: values.referencePriceType }).showRate;
  let note = '通常価格と会員価格を入れると計算します。';
  if (rate !== null) {
    if (values.referencePriceType === 'unconfirmed') note = '比較元の種類が確認中のため、購入者画面には比較の価格も割引率も出しません。';
    else note = shown ? `購入者画面に「${label}」との比較として表示します。` : `購入者画面には出しません（「${label}」との比較は、専門家の確認まで止めています。config/site.js で切り替え）。`;
  }
  return html`
    <div class="arate" aria-live="polite">
      <span class="aform__side-title">割引率（自動計算）</span>
      <span class="arate__value num">${rate === null ? '—' : `${rate}% OFF`}</span>
      <span class="arate__note">${note}</span>
    </div>`;
}

function Images(values, product) {
  return html`
    <div class="aimages">
      ${values.images.map((src, index) => html`
        <div class="aimage">
          ${index === 0 ? html`<span class="aimage__first">メイン</span>` : ''}
          ${imageSrc(src) ? html`<img src="${imageSrc(src)}" alt="商品画像 ${index + 1}枚目">` : html`<span class="aimage__broken">表示できない画像</span>`}
          <div class="aimage__actions">
            <button type="button" data-image-move="${index}" data-dir="-1" ${index === 0 ? 'disabled' : ''} aria-label="${index + 1}枚目を前へ">←</button>
            <button type="button" data-image-remove="${index}">削除</button>
            <button type="button" data-image-move="${index}" data-dir="1" ${index === values.images.length - 1 ? 'disabled' : ''} aria-label="${index + 1}枚目を後ろへ">→</button>
          </div>
        </div>`)}
      ${values.images.length < MAX_IMAGES ? html`
        <label class="adrop">
          <span>画像を追加<br><small>JPEG・PNG・WebP（複数可）</small></span>
          <input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple data-image-input>
        </label>` : ''}
    </div>
    ${!values.images.length && product?.source === 'seed' ? html`<p class="field__hint">画像は未登録です（public/products/${product.id}.jpg を置くとそちらを表示します）。ここで追加すると、こちらを優先します。</p>` : ''}`;
}

// 選択肢に、いまの値（初期データの独自の表記など）も残す
const choices = (list, current) => [...new Set([current, ...list, UNKNOWN].filter(Boolean))].map((value) => [value, value === UNKNOWN ? '出品元に確認中' : value]);

function ImportSource(product) {
  const source = product?.importSource;
  if (!source) return '';
  return html`
    <section class="aform__section" aria-labelledby="import-title">
      <div><h2 class="aform__section-title" id="import-title">取込元の行（CSV）</h2><p class="aform__section-note">登録した時の CSV の元の値。読み取りに誤りがないか、ここで確かめられます。</p></div>
      <div class="afieldset">
        <p class="field__hint">${source.fileName || 'ファイル名なし'}・${source.encoding || ''}・${source.line}行目・${shortDateTime(source.importedAt)} 取込</p>
        <div class="atable-wrap">
          <table class="atable">
            <tbody>${source.header.map((name, index) => html`<tr><th scope="row">${name}</th><td>${source.cells[index] ?? ''}</td></tr>`)}</tbody>
          </table>
        </div>
      </div>
    </section>`;
}

export function render({ params, admin }) {
  const product = params.id ? productById(params.id) : null;
  if (params.id && !product) {
    return { title: '商品が見つかりません', view: html`${PageHead({ title: '商品が見つかりません', crumbs: [{ href: '#/products', label: '商品一覧' }] })}<p>商品ID「${params.id}」は登録されていません。</p>` };
  }
  const seed = product?.source === 'seed';
  const title = product ? `商品の編集：${product.model}` : '新規商品登録';
  return {
    title,
    view: html`
      ${PageHead({
        title,
        crumbs: [{ href: '#/products', label: '商品一覧' }],
        lead: product ? html`${product.id}　${SituationChip(product)}　最終更新 ${shortDateTime(product.updatedAt)}` : '出品元から受け取った商品情報を登録します。下書きで保存し、内容を確かめてから「販売中」にできます。',
        actions: product && isListed(product) ? html`<a class="btn btn--ghost btn--sm" href="../#/product/${product.id}" target="_blank" rel="noopener">購入者画面で見る</a>` : '',
      })}
      <div data-form-root></div>`,
    mount(root, { refresh }) {
      const values = product ? valuesOf(product) : emptyValues();
      const shownStock = product ? stockOf(product) : 0; // 画面に出した販売可能数（在庫は、ここからの増減で保存する）
      const initial = product ? toInput(values, product).input : null;
      let errors = {};
      let warnings = {};
      let notice = '';
      const formRoot = root.querySelector('[data-form-root]');

      const read = () => {
        const form = formRoot.querySelector('form');
        const data = new FormData(form);
        Object.keys(emptyValues()).forEach((key) => {
          if (key !== 'images' && data.has(key)) values[key] = String(data.get(key));
        });
      };

      // 新規登録は、出品元を選んだら出品元の既定の発送目安を入れる（出品元から発送するため、発送目安は必須）
      const applyDefaultLead = () => {
        const lead = sellerById(values.sellerId)?.defaultLead;
        if (!product && lead && !values.leadMax) {
          values.leadMin = String(lead.leadMin);
          values.leadMax = String(lead.leadMax);
        }
      };

      const draw = () => {
        const errorList = Object.values(errors);
        const shippers = SELLERS.filter((seller) => seller.roles?.ships !== false);
        renderInto(formRoot, html`
          <form class="aform" novalidate data-product-form>
            <div class="aform__main">
              <section class="aform__section" aria-labelledby="basic-title">
                <div><h2 class="aform__section-title" id="basic-title">基本情報</h2><p class="aform__section-note">購入者画面の商品名・型番・説明になります。</p></div>
                <div class="aform__fields">
                  ${Field({ id: 'f-name', label: '商品名', required: true, wide: true, error: errors.name, control: html`<input class="field__input" id="f-name" name="name" value="${values.name}" maxlength="${LIMITS.name}" required>` })}
                  ${Field({ id: 'f-maker', label: 'メーカー名', required: true, error: errors.maker, control: html`<input class="field__input" id="f-maker" name="maker" value="${values.maker}" maxlength="${LIMITS.maker}" list="maker-list" required><datalist id="maker-list">${BRANDS.map((brand) => html`<option value="${brand.name}"></option>`)}</datalist>` })}
                  ${Field({ id: 'f-model', label: '型番', required: true, error: errors.model, control: html`<input class="field__input" id="f-model" name="model" value="${values.model}" maxlength="${LIMITS.model}" required>` })}
                  ${Field({ id: 'f-jan', label: 'JANコード', required: true, hint: '13桁または8桁。チェックデジットを確かめます', error: errors.jan, warning: warnings.jan, control: html`<input class="field__input" id="f-jan" name="jan" value="${values.jan}" inputmode="numeric" autocomplete="off" required>` })}
                  ${Field({ id: 'f-sku', label: '出品者商品コード', hint: '出品元の自社品番（発送依頼の控えに載ります）', error: errors.sellerSku, control: html`<input class="field__input" id="f-sku" name="sellerSku" value="${values.sellerSku}" maxlength="${LIMITS.sellerSku}" autocomplete="off">` })}
                  ${Field({ id: 'f-category', label: 'カテゴリー', required: true, error: errors.categoryId, control: html`<select class="field__select" id="f-category" name="categoryId"><option value="">選んでください</option>${Options(CATEGORIES.map((category) => [category.id, category.name]), values.categoryId)}</select>` })}
                  ${Field({ id: 'f-description', label: '商品説明', wide: true, error: errors.description, control: html`<textarea class="field__input" id="f-description" name="description" rows="5" maxlength="${LIMITS.description}">${values.description}</textarea>` })}
                </div>
              </section>

              <section class="aform__section" aria-labelledby="state-title">
                <div><h2 class="aform__section-title" id="state-title">区分・状態・出どころ</h2><p class="aform__section-note">購入者画面の「商品の状態」「出どころ」「製造・販売の状況」。出品元に確かめた内容だけを入れます。確認中のままでは販売中にできません。</p></div>
                <div class="aform__fields">
                  ${Field({ id: 'f-lifecycle', label: '商品の区分', required: true, error: errors.lifecycle, control: html`<select class="field__select" id="f-lifecycle" name="lifecycle">${Options(Object.entries(LIFECYCLES).map(([key, value]) => [key, key === 'unknown' ? '出品元に確認中' : value.label]), values.lifecycle)}</select>` })}
                  ${Field({ id: 'f-condition', label: '状態', required: true, control: html`<select class="field__select" id="f-condition" name="condition">${Options(choices(CONDITIONS, values.condition), values.condition)}</select>` })}
                  ${Field({ id: 'f-channel', label: '流通', required: true, hint: '並行輸入品・中古品は扱いません', control: html`<select class="field__select" id="f-channel" name="channel">${Options(choices(CHANNELS, values.channel), values.channel)}</select>` })}
                  ${Field({ id: 'f-release', label: '発売（年-月）', hint: '例：2021-04。空欄なら「確認中」', error: errors.releaseDate, control: html`<input class="field__input" id="f-release" name="releaseDate" value="${values.releaseDate}" placeholder="2021-04" inputmode="numeric">` })}
                  ${Field({ id: 'f-production', label: '製造終了（年-月）', hint: '空欄なら、現行品は「製造中」、それ以外は「確認中」', error: errors.productionEnd, control: html`<input class="field__input" id="f-production" name="productionEnd" value="${values.productionEnd}" placeholder="2025-03" inputmode="numeric">` })}
                  ${Field({ id: 'f-support', label: '修理受付期限（年-月）', error: errors.supportUntil, control: html`<input class="field__input" id="f-support" name="supportUntil" value="${values.supportUntil}" placeholder="2032-03" inputmode="numeric">` })}
                </div>
              </section>

              <section class="aform__section" aria-labelledby="image-title">
                <div><h2 class="aform__section-title" id="image-title">商品画像</h2><p class="aform__section-note">最大${MAX_IMAGES}枚。1枚目がメイン。長辺800pxに縮小して保存します。</p></div>
                <div class="afieldset">
                  <div data-images>${Images(values, product)}</div>
                  ${errors.images ? html`<p class="field__error">${errors.images}</p>` : warnings.images ? html`<p class="field__warn">${warnings.images}</p>` : ''}
                  ${Field({ id: 'f-kind', label: '画像がないときのイラスト', error: errors.kind, control: html`<select class="field__select" id="f-kind" name="kind">${Options(ART_KINDS.map((kind) => [kind, KIND_LABELS[kind] ?? kind]), values.kind)}</select>` })}
                </div>
              </section>

              <section class="aform__section" aria-labelledby="seller-title">
                <div><h2 class="aform__section-title" id="seller-title">出品情報</h2><p class="aform__section-note">どの出品元（SELLER）の商品か。PoC では運営者が選びます。販売者も出品元と同じです（将来は分けて設定できます）。</p></div>
                <div class="aform__fields">
                  ${Field({ id: 'f-seller', label: '出品元', required: true, wide: true, error: errors.sellerId, warning: warnings.sellerId, control: html`<select class="field__select" id="f-seller" name="sellerId" data-seller-select>${sellerOptions(values.sellerId)}</select>` })}
                </div>
              </section>

              <section class="aform__section" aria-labelledby="price-title">
                <div><h2 class="aform__section-title" id="price-title">価格</h2><p class="aform__section-note">税込の金額。割引率は通常価格と会員価格から自動で計算します。</p></div>
                <div class="aform__fields">
                  ${Field({ id: 'f-reference', label: '通常価格（円・税込）', required: true, error: errors.referencePrice, control: html`<input class="field__input" id="f-reference" name="referencePrice" value="${values.referencePrice}" inputmode="numeric" data-rate-input>` })}
                  ${Field({ id: 'f-member', label: '会員限定価格（円・税込）', required: true, error: errors.memberPrice, warning: warnings.memberPrice, control: html`<input class="field__input" id="f-member" name="memberPrice" value="${values.memberPrice}" inputmode="numeric" data-rate-input>` })}
                  <fieldset class="afieldset is-wide">
                    <legend class="field__label">通常価格の種類（購入者画面の比較元）</legend>
                    <div class="aradios">
                      ${Object.entries(REFERENCE_LABELS).map(([key, label]) => html`<label class="aradio"><input type="radio" name="referencePriceType" value="${key}" ${values.referencePriceType === key ? 'checked' : ''} data-rate-input>${key === 'unconfirmed' ? '出品元に確認中（比較を出さない）' : label.label}</label>`)}
                    </div>
                    ${errors.referencePriceType ? html`<p class="field__error">${errors.referencePriceType}</p>` : ''}
                    <p class="field__hint">自店（当マーケット）の通常価格と比べる表示は、その価格での販売実績が必要です（景品表示法）。専門家の確認まで割引率を出しません。</p>
                  </fieldset>
                </div>
              </section>

              <section class="aform__section" aria-labelledby="stock-title">
                <div><h2 class="aform__section-title" id="stock-title">在庫</h2><p class="aform__section-note">購入されると自動で減ります。0 になると購入者画面は SOLD OUT になります。</p></div>
                <div class="aform__fields">
                  ${Field({ id: 'f-stock', label: '販売可能在庫数', required: true, error: errors.stock, hint: product ? `開いた時点の販売可能数：${shownStock}（このデモで売れた数 ${soldOf(product.id)}）。変えたときだけ、その差を在庫に反映します` : '', control: html`<input class="field__input" id="f-stock" name="stock" value="${values.stock}" inputmode="numeric">` })}
                </div>
              </section>

              <section class="aform__section" aria-labelledby="period-title">
                <div><h2 class="aform__section-title" id="period-title">販売期間</h2><p class="aform__section-note">日本時間。期間外は購入できません（開始前は「販売開始前」、終了後は「販売終了」と表示）。空欄なら期限なし。終了時刻はその分の終わりまで販売します。</p></div>
                <div class="aform__fields">
                  ${Field({ id: 'f-start', label: '販売開始日時', error: errors.saleStart, control: html`<input class="field__input" id="f-start" type="datetime-local" name="saleStart" value="${values.saleStart}">` })}
                  ${Field({ id: 'f-end', label: '販売終了日時', error: errors.saleEnd, warning: warnings.saleEnd, control: html`<input class="field__input" id="f-end" type="datetime-local" name="saleEnd" value="${values.saleEnd}">` })}
                </div>
              </section>

              <section class="aform__section" aria-labelledby="ship-title">
                <div><h2 class="aform__section-title" id="ship-title">発送情報</h2><p class="aform__section-note">出品者発送：出品元から購入者へ直接届けます。</p></div>
                <div class="aform__fields">
                  ${Field({ id: 'f-fulfiller', label: '発送元', wide: true, hint: '「出品元と同じ」なら出品元から発送（発送しない出品元は選べません）', error: errors.fulfillerId, control: html`<select class="field__select" id="f-fulfiller" name="fulfillerId"><option value="">出品元と同じ</option>${shippers.map((seller) => html`<option value="${seller.id}" ${values.fulfillerId === seller.id ? 'selected' : ''}>${seller.id}　${seller.name}（${seller.shipFrom.label || '発送元未登録'}）</option>`)}</select>` })}
                  <fieldset class="afieldset">
                    <legend class="field__label">送料</legend>
                    <div class="aradios">
                      <label class="aradio"><input type="radio" name="shippingMode" value="standard" ${values.shippingMode === 'standard' ? 'checked' : ''}>標準（${yen(SITE.shipping.fee)}・${yen(SITE.shipping.freeThreshold)}以上無料）</label>
                      <label class="aradio"><input type="radio" name="shippingMode" value="individual" ${values.shippingMode === 'individual' ? 'checked' : ''}>個別送料</label>
                    </div>
                    <input class="field__input" name="shippingFee" value="${values.shippingFee}" inputmode="numeric" placeholder="個別送料（円）" aria-label="個別送料（円）">
                    ${errors.shippingFee ? html`<p class="field__error">${errors.shippingFee}</p>` : ''}
                  </fieldset>
                  <fieldset class="afieldset is-wide">
                    <legend class="field__label">発送目安${seed ? '' : html`<span class="field__req">必須</span>`}</legend>
                    <div class="aradios">
                      ${seed ? html`<label class="aradio"><input type="radio" name="leadMode" value="standard" ${values.leadMode === 'standard' ? 'checked' : ''}>標準（${SITE.shipping.sameDayCutoffHour}時までの注文は翌日お届け）</label>` : html`<input type="hidden" name="leadMode" value="lead">`}
                      <label class="aradio">${seed ? html`<input type="radio" name="leadMode" value="lead" ${values.leadMode === 'lead' ? 'checked' : ''}>` : ''}注文後
                        <input class="field__input aform__days" name="leadMin" value="${values.leadMin}" inputmode="numeric" aria-label="最短の営業日数">〜
                        <input class="field__input aform__days" name="leadMax" value="${values.leadMax}" inputmode="numeric" aria-label="最長の営業日数">営業日で発送</label>
                    </div>
                    <p class="field__hint">当日発送は 0。出品元の既定：${sellerById(values.sellerId)?.defaultLead ? `注文後${sellerById(values.sellerId).defaultLead.leadMin}〜${sellerById(values.sellerId).defaultLead.leadMax}営業日` : '未設定'}</p>
                    ${errors.lead ? html`<p class="field__error">${errors.lead}</p>` : ''}
                  </fieldset>
                </div>
              </section>

              <section class="aform__section" aria-labelledby="reason-title">
                <div><h2 class="aform__section-title" id="reason-title">購入者向けの説明</h2><p class="aform__section-note">商品ページの「この商品が特別価格の理由」と保証の欄。空欄なら「出品元に確認中」と出します。</p></div>
                <div class="aform__fields">
                  ${Field({ id: 'f-reason-label', label: '理由の種類', hint: '例：後継モデル発売／パッケージ変更／在庫調整', control: html`<input class="field__input" id="f-reason-label" name="reasonLabel" value="${values.reasonLabel}" maxlength="${LIMITS.reasonLabel}">` })}
                  ${Field({ id: 'f-warranty', label: '保証', hint: '例：メーカー保証 1年', control: html`<input class="field__input" id="f-warranty" name="warranty" value="${values.warranty}" maxlength="${LIMITS.warranty}">` })}
                  ${Field({ id: 'f-reason-headline', label: '理由の見出し', wide: true, control: html`<input class="field__input" id="f-reason-headline" name="reasonHeadline" value="${values.reasonHeadline}" maxlength="${LIMITS.reasonHeadline}">` })}
                  ${Field({ id: 'f-reason-body', label: '理由の説明', wide: true, control: html`<textarea class="field__input" id="f-reason-body" name="reasonBody" rows="3" maxlength="${LIMITS.reasonBody}">${values.reasonBody}</textarea>` })}
                </div>
              </section>
              ${ImportSource(product)}
            </div>

            <aside class="aform__side" aria-label="保存と販売状況">
              ${errorList.length ? html`<div class="aform__errors" role="alert"><p><strong>${errorList.length}件の項目を直してください</strong></p><ul>${errorList.map((message) => html`<li>${message}</li>`)}</ul></div>` : ''}
              ${notice ? html`<p class="form__error" role="alert">${notice}</p>` : ''}
              <fieldset class="afieldset">
                <legend class="aform__side-title">販売状況</legend>
                ${Object.entries(SALE_STATUSES).map(([key, status]) => html`
                  <label class="aradio"><input type="radio" name="saleStatus" value="${key}" ${values.saleStatus === key ? 'checked' : ''}><span><strong>${status.label}</strong><br><small>${status.note}</small></span></label>`)}
              </fieldset>
              <div data-rate>${RatePreview(values)}</div>
              <button class="btn btn--primary btn--block" type="submit">${product ? '変更を保存する' : '登録する'}</button>
              <a class="btn btn--ghost btn--block" href="#/products">一覧へ戻る</a>
            </aside>
          </form>`);
      };

      draw();

      formRoot.addEventListener('input', (event) => {
        if (!event.target.closest('[data-rate-input]')) return;
        read();
        renderInto(formRoot.querySelector('[data-rate]'), RatePreview(values));
      });
      formRoot.addEventListener('change', async (event) => {
        if (event.target.matches('[data-seller-select]')) {
          read();
          applyDefaultLead();
          draw();
          return;
        }
        if (!event.target.matches('[data-image-input]')) return;
        read();
        const files = [...event.target.files].slice(0, MAX_IMAGES - values.images.length);
        try {
          for (const file of files) values.images.push(await resizeImage(file));
          notice = '';
        } catch (error) {
          notice = error.message;
        }
        draw();
      });
      formRoot.addEventListener('click', (event) => {
        const move = event.target.closest('[data-image-move]');
        const remove = event.target.closest('[data-image-remove]');
        if (!move && !remove) return;
        read();
        if (remove) values.images.splice(Number(remove.dataset.imageRemove), 1);
        if (move) {
          const from = Number(move.dataset.imageMove);
          const to = from + Number(move.dataset.dir);
          [values.images[from], values.images[to]] = [values.images[to], values.images[from]];
        }
        draw();
      });
      formRoot.addEventListener('submit', (event) => {
        event.preventDefault();
        read();
        const { input, readErrors } = toInput(values, product);
        const now = new Date();
        ({ errors, warnings } = validateProduct(input, {
          sellers: SELLERS, products: PRODUCTS, currentId: product?.id ?? null, now, readErrors, kinds: ART_KINDS, requireLead: !seed, hasFallbackImage: seed,
        }));
        notice = '';
        if (Object.keys(errors).length) {
          draw();
          formRoot.querySelector('.aform__errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        try {
          let id;
          if (product) {
            const changes = changedFields(input, initial);
            const stockChange = input.stock !== shownStock ? { shown: shownStock, to: input.stock, reason: '商品の編集で変更' } : null;
            if (!Object.keys(changes).length && !stockChange) {
              showToast('変更はありません。');
              return;
            }
            id = saveProduct({ id: product.id, ...changes }, { by: admin.id, now, stockChange });
          } else {
            id = saveProduct(input, { by: admin.id, now });
          }
          // 保存はできたが確かめてほしいこと（販売終了日時が過ぎている等）も伝える
          const note = Object.values(warnings)[0];
          showToast(`${product ? '変更を保存しました。' : `商品を登録しました（${id}）。`}${note ? `　注意：${note}` : ''}`);
          if (product) refresh();
          else navigate(`/products/${id}`);
        } catch (error) {
          notice = errorMessage(error);
          draw();
        }
      });
    },
  };
}
