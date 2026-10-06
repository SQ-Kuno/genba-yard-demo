// 商品の入力ルール。管理画面の商品登録と CSV 一括登録で同じ確かめ方をする（どちらから入れても同じ品質のデータになる）。
// 値の読み取り（全角数字・カンマ・「円」・日付の書き方の揺れ）もここでそろえる。読み取りは { value, error } を返し、
// 読めなかった値を目印の値に置き換えて検証へ渡すことはしない。
import { CATEGORIES, LIFECYCLES } from '../data/categories.js';
import { REFERENCE_LABELS } from './pricing.js';
import { SALE_STATUSES, publishBlockers } from './market.js';

export { publishBlockers };

export const MAX_IMAGES = 6;
export const MAX_PRICE = 9999999;
export const MAX_STOCK = 99999;
export const MAX_LEAD_DAYS = 30;
const LONG_LEAD_DAYS = 7;

// 文字数の上限（購入者画面の表示が崩れない長さ）
export const LIMITS = { name: 120, maker: 60, model: 60, sellerSku: 40, description: 2000, reasonLabel: 40, reasonHeadline: 120, reasonBody: 1000, warranty: 120 };

// 商品の状態・流通（購入者画面の「出どころ」）。選べない値は「出品元に確認中」で、そのままでは販売中にできない
export const CONDITIONS = ['新品・未使用（未開封）', '新品・未使用（外箱に傷み・開封済み）', '展示品（未使用）'];
export const CHANNELS = ['国内正規流通品'];

// 割引率（切り捨て）。比較元がない・会員価格の方が高いときは null
export const discountOf = (reference, member) => (reference > 0 && member > 0 && member <= reference ? Math.floor((1 - member / reference) * 100) : null);

// 全角の数字・記号を半角に
export const toHalfWidth = (value) => String(value ?? '').replace(/[０-９Ａ-Ｚａ-ｚ－／：，．　]/g, (char) => (char === '　' ? ' ' : String.fromCharCode(char.charCodeAt(0) - 0xfee0)));

// 半角カナ（ｲﾝﾊﾟｸﾄ）を全角に。CP932 で入れ替わりやすい「～」（全角チルダ）を「〜」（波ダッシュ）にそろえる
export const normalizeText = (value) => String(value ?? '')
  .replace(/[｡-ﾟ]+/g, (kana) => kana.normalize('NFKC'))
  .replace(/～/g, '〜')
  .trim();

// 金額・数量の読み取り：「12,800」「¥12,800」「12800円」を受け付ける。空欄は null、読めなければ NaN
export function parseNumber(value) {
  const text = toHalfWidth(value).trim().replace(/^[¥￥]/, '').replace(/円$/, '').replace(/,/g, '');
  if (text === '') return null;
  return /^-?\d+$/.test(text) ? Number(text) : NaN;
}

// 整数の読み取りと範囲の確認（画面の入力欄・CSV・在庫・設定で同じものを使う）
export function readInteger(value, { label, min = 0, max, required = false, unit = '' }) {
  const number = parseNumber(value);
  if (number === null) return { value: null, error: required ? `${label}を入力してください。` : '' };
  if (Number.isNaN(number)) return { value: null, error: `${label}は整数${unit ? `（${unit}）` : ''}で入力してください。` };
  if (number < min || number > max) return { value: null, error: `${label}は${min.toLocaleString()}〜${max.toLocaleString()}${unit ? `（${unit}）` : ''}の範囲で入力してください。` };
  return { value: number, error: '' };
}

// チェックデジット：右から数えて奇数番目（チェックデジットの隣から）に3をかけた合計で決まる
const validCheckDigit = (code) => {
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
};

// JAN を読み取って確かめる。{ code（直した番号）, error, warning } を返す（根拠は docs/00-domain-format-admin.md）
//  ・13桁（標準）か8桁（短縮）。先頭0の JAN も実在する（海外メーカー等）ので国コードでは弾かない
//  ・Excel で先頭の0が落ちた 9〜12桁は、0を補ってチェックデジットが合えば直す（警告）
//  ・指数表記（4.9E+12）・14桁（ケース用 ITF）は直せないので差し戻す
//  ・インストアコード（02・20〜29）は店舗独自の番号なので警告
export function inspectJan(value) {
  const code = toHalfWidth(value).trim().replace(/^'/, '').replace(/\s/g, '');
  if (!code) return { code, error: 'JANコードを入力してください。', warning: '' };
  if (/e\+?\d+$/i.test(code)) return { code, error: 'JANコードが指数表記（例：4.9E+12）になっています。表計算ソフトで列を「文字列」にして保存し直してください。', warning: '' };
  if (!/^\d+$/.test(code)) return { code, error: 'JANコードは数字だけで入力してください。', warning: '' };
  if (code.length === 14) return { code, error: 'ケース用の14桁コード（ITF）です。単品のJANコード（13桁）を入力してください。', warning: '' };
  let fixed = code;
  let warning = '';
  if (code.length >= 9 && code.length <= 12) {
    const padded = code.padStart(13, '0');
    if (!validCheckDigit(padded)) return { code, error: `JANコードは13桁か8桁です（入力は${code.length}桁）。`, warning: '' };
    fixed = padded;
    warning = `先頭の0が落ちていたため補いました（${padded}）。`;
  } else if (code.length !== 13 && code.length !== 8) {
    return { code, error: `JANコードは13桁か8桁です（入力は${code.length}桁）。`, warning: '' };
  } else if (!validCheckDigit(code)) {
    return { code, error: 'JANコードのチェックデジット（最後の1桁）が合いません。番号を確かめてください。', warning: '' };
  }
  if ((fixed.length === 13 && /^(02|2[0-9])/.test(fixed)) || (fixed.length === 8 && fixed.startsWith('2'))) {
    warning = [warning, 'インストアコード（店舗独自の番号）です。メーカーのJANコードか確かめてください。'].filter(Boolean).join('');
  }
  return { code: fixed, error: '', warning };
}

export const normalizeJan = (value) => inspectJan(value).code;

// ---- 日時（日本時間で読む。管理者のパソコンの時刻設定に左右されない） ----

const JST_OFFSET = 9 * 3600000;

// 日本時間の年月日時分 → ISO。日付として正しくなければ null
function jstIso(y, m, d, hh, mm, ss = 0, ms = 0) {
  const utc = Date.UTC(y, m - 1, d, hh, mm, ss, ms);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return new Date(utc - JST_OFFSET).toISOString();
}

// ISO → 日本時間の { y, m, d, hh, mm }（画面の入力欄に戻すとき）
export function jstParts(iso) {
  const date = new Date(new Date(iso).getTime() + JST_OFFSET);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), hh: date.getUTCHours(), mm: date.getUTCMinutes() };
}

// ISO → <input type="datetime-local"> の値（日本時間）
export function toJstInput(iso) {
  if (!iso) return '';
  const { y, m, d, hh, mm } = jstParts(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}`;
}

// 日時：「2026-10-06」「2026/10/6」「20261006」「2026/10/06 10:00」「2026-10-06T10:00」（日本時間）。
// 日付だけなら開始は 0:00、終了は 23:59:59.999。終了の時刻は、その分の終わり（59秒）まで販売する
export function readDateTime(value, { label, endOfDay = false }) {
  const text = toHalfWidth(value).trim();
  if (!text) return { value: null, error: '' };
  const example = endOfDay ? '例：2026/10/31 または 2026/10/31 18:00' : '例：2026/10/06 または 2026/10/06 10:00';
  const invalid = { value: null, error: `${label}の書き方が正しくありません（${example}）。` };
  const parts = text.split(/[ T]+/);
  if (parts.length > 2) return invalid;
  const [datePart, timePart] = parts;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(datePart);
  const separated = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(datePart);
  const date = compact ?? separated;
  if (!date) return invalid;
  const [y, m, d] = date.slice(1).map(Number);
  let time = null;
  if (timePart !== undefined) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(timePart);
    if (!match) return invalid;
    time = match.slice(1).map(Number);
    if (time[0] > 23 || time[1] > 59) return { value: null, error: `${label}の時刻が正しくありません（0:00〜23:59）。` };
  }
  const iso = time
    ? endOfDay ? jstIso(y, m, d, time[0], time[1], 59, 999) : jstIso(y, m, d, time[0], time[1])
    : endOfDay ? jstIso(y, m, d, 23, 59, 59, 999) : jstIso(y, m, d, 0, 0);
  return iso ? { value: iso, error: '' } : { value: null, error: `${label}の日付がありません（${text}）。` };
}

// ---- 発送目安 ----

// 「注文後2〜3営業日」「2-3営業日」「3営業日以内」「翌営業日」「即日（14時締め）」「1週間」。
// 営業日の幅 { leadMin, leadMax } を返す。締め時刻（14時・14:00）の数字は日数として読まない
export function readLead(value) {
  const original = toHalfWidth(value).trim();
  if (!original) return { value: null, error: '', warning: '' };
  const text = original.replace(/\d{1,2}\s*(?::\d{2}|時)/g, '');
  const invalid = { value: null, error: `発送目安「${original}」を読めません（例：注文後2〜3営業日／翌営業日／即日（14時締め））。`, warning: '' };
  let lead = null;
  if (/即日|当日/.test(text)) lead = { leadMin: 0, leadMax: 0 };
  else if (/翌(営業)?日/.test(text)) lead = { leadMin: 1, leadMax: 1 };
  else if (/か?月/.test(text)) return invalid;
  else {
    const numbers = (text.match(/\d+/g) ?? []).map(Number);
    if (!numbers.length) return invalid;
    const scale = /週/.test(text) ? 5 : 1;
    const [a, b = a] = numbers.map((n) => n * scale);
    lead = /以内/.test(text) && numbers.length === 1 ? { leadMin: Math.min(1, a), leadMax: a } : { leadMin: Math.min(a, b), leadMax: Math.max(a, b) };
  }
  if (lead.leadMax > MAX_LEAD_DAYS) return { value: null, error: `発送目安は${MAX_LEAD_DAYS}営業日以内にしてください（入力：${original}）。`, warning: '' };
  const warning = lead.leadMax > LONG_LEAD_DAYS ? `発送まで最長${lead.leadMax}営業日かかります（入力：${original}）。購入者に長く見えないか確かめてください。` : '';
  return { value: lead, error: '', warning };
}

export const categoryFromText = (value) => {
  const text = String(value ?? '').trim();
  return CATEGORIES.find((category) => category.id === text || category.name === text) ?? null;
};

// 商品の入力を確かめる。errors（保存できない）と warnings（保存できるが確かめてほしい）を項目ごとに返す。
// context: { sellers, products（JAN の重複確認）, currentId（変更中の商品）, now, readErrors（読み取りのエラー）,
//            kinds（イラストの種類）, requireLead（発送目安が必須か）, hasFallbackImage（画像ファイルを置ける初期商品か） }
export function validateProduct(input, context) {
  const errors = { ...(context.readErrors ?? {}) };
  const warnings = {};
  const { sellers, products, currentId = null } = context;
  const fail = (key, message) => { errors[key] ??= message; };
  const warn = (key, message) => { warnings[key] = [warnings[key], message].filter(Boolean).join(''); };
  const required = (key, label) => {
    if (!String(input[key] ?? '').trim()) fail(key, `${label}を入力してください。`);
  };
  required('name', '商品名');
  required('maker', 'メーカー名');
  required('model', '型番');
  const LABELS = { name: '商品名', maker: 'メーカー名', model: '型番', sellerSku: '出品者商品コード', description: '商品説明' };
  Object.entries(LABELS).forEach(([key, label]) => {
    if (String(input[key] ?? '').length > LIMITS[key]) fail(key, `${label}は${LIMITS[key].toLocaleString()}文字までにしてください。`);
  });

  // 同じ JAN を複数の出品元が出すのは正常。同じ出品元での重複だけを止め、他社と重なるときは確かめてもらう。
  // 廃番品は JAN が再利用されていることがあるので、型番が違えば警告する
  const jan = inspectJan(input.jan);
  if (jan.error) fail('jan', jan.error);
  else {
    if (jan.warning) warn('jan', jan.warning);
    const others = products.filter((product) => product.jan === jan.code && product.id !== currentId);
    const sameSeller = others.find((product) => product.sellerId === input.sellerId);
    const differentModel = others.find((product) => product.model.trim().toLowerCase() !== String(input.model ?? '').trim().toLowerCase());
    if (sameSeller) fail('jan', `この出品元で同じJANコードの商品が登録済みです（${sameSeller.id}：${sameSeller.name}）。`);
    else if (differentModel) warn('jan', `同じJANコードで型番の違う商品があります（${differentModel.id}：${differentModel.model}）。JANの再利用の可能性があるため確かめてください。`);
    else if (others.length) warn('jan', `同じJANコードの商品を別の出品元も出しています（${others.map((product) => product.id).join('・')}）。`);
  }

  if (!CATEGORIES.some((category) => category.id === input.categoryId)) fail('categoryId', 'カテゴリーを選んでください。');
  if (input.lifecycle !== undefined && !LIFECYCLES[input.lifecycle]) fail('lifecycle', '商品の区分が正しくありません。');
  if (input.kind !== undefined && context.kinds && !context.kinds.includes(input.kind)) fail('kind', '画像がないときのイラストを選んでください。');

  const seller = sellers.find((item) => item.id === input.sellerId);
  if (!seller) fail('sellerId', '出品元を選んでください。');
  else if (seller.status !== 'active') warn('sellerId', `出品元「${seller.name}」は取引中ではないため、販売中にしても購入者画面には出ません。`);
  if (input.fulfillerId) {
    const fulfiller = sellers.find((item) => item.id === input.fulfillerId);
    if (!fulfiller) fail('fulfillerId', '発送元を選んでください。');
    else if (fulfiller.roles?.ships === false) fail('fulfillerId', `「${fulfiller.name}」は発送しない出品元です。`);
  }

  const price = (key, label) => {
    const value = input[key];
    if (value === null || value === undefined || value === '') fail(key, `${label}を入力してください。`);
    else if (!Number.isInteger(value) || value <= 0 || value > MAX_PRICE) fail(key, `${label}は1〜${MAX_PRICE.toLocaleString()}の整数（円・税込）で入力してください。`);
  };
  price('referencePrice', '通常価格');
  price('memberPrice', '会員価格');
  if (!REFERENCE_LABELS[input.referencePriceType]) fail('referencePriceType', '通常価格の種類を選んでください。');
  if (!errors.referencePrice && !errors.memberPrice) {
    const rate = discountOf(input.referencePrice, input.memberPrice);
    if (input.memberPrice > input.referencePrice) fail('memberPrice', '会員価格が通常価格より高くなっています。');
    else if (input.memberPrice === input.referencePrice) warn('memberPrice', '会員価格と通常価格が同じため、割引率は表示されません。');
    // 桁の誤り（9,800 が 9 になる等）を、注意ではなくエラーで止める
    else if (rate > 80) fail('memberPrice', `割引率が${rate}%になります。金額の桁を確かめてください（8割を超える割引は登録できません）。`);
    else if (rate > 65) warn('memberPrice', `割引率が${rate}%です。激安・処分品に見えないか、金額の桁が正しいか確かめてください。`);
  }

  if (input.stock === null || input.stock === undefined || input.stock === '') fail('stock', '販売可能在庫数を入力してください。');
  else if (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > MAX_STOCK) fail('stock', `在庫数は0〜${MAX_STOCK.toLocaleString()}の整数で入力してください。`);

  if (!errors.saleStart && !errors.saleEnd && input.saleStart && input.saleEnd && new Date(input.saleEnd) <= new Date(input.saleStart)) {
    fail('saleEnd', '販売終了日時は販売開始日時より後にしてください。');
  }
  if (!errors.saleEnd && input.saleEnd && new Date(input.saleEnd) < (context.now ?? new Date()) && input.saleStatus === 'on-sale') {
    warn('saleEnd', '販売終了日時が過ぎているため、購入者画面では「販売終了」になります。');
  }

  const shipping = input.shipping ?? {};
  if (shipping.fee !== null && shipping.fee !== undefined && (!Number.isInteger(shipping.fee) || shipping.fee < 0 || shipping.fee > 99999)) {
    fail('shippingFee', '個別送料は0〜99,999円の整数で入力してください（標準送料なら空欄）。');
  }
  if (shipping.leadMax != null && (shipping.leadMin < 0 || shipping.leadMax > MAX_LEAD_DAYS || shipping.leadMin > shipping.leadMax)) {
    fail('lead', `発送目安は0〜${MAX_LEAD_DAYS}営業日の範囲で、短い方を先に入力してください。`);
  } else if (context.requireLead && shipping.leadMax == null) {
    fail('lead', '発送目安を入力してください（出品元から発送するため、注文後◯〜◯営業日を決めておきます）。');
  }

  if (!SALE_STATUSES[input.saleStatus]) fail('saleStatus', '販売状況を選んでください。');
  else if (input.saleStatus === 'on-sale') {
    const missing = publishBlockers({ ...input, source: context.requireLead ? 'admin' : 'seed', provenance: input.provenance ?? context.provenance });
    if (missing.length) fail('saleStatus', `販売中にするには「${missing.join('」「')}」を確かめて入力してください（出品元に確認中のままでは、購入者画面に断定した表示が出るため）。`);
  }
  if ((input.images ?? []).length > MAX_IMAGES) fail('images', `商品画像は${MAX_IMAGES}枚までです。`);
  if (input.saleStatus === 'on-sale' && !(input.images ?? []).length && !context.hasFallbackImage) {
    warn('images', '商品画像がありません。購入者画面にはイラストが出ます。');
  }
  return { errors, warnings, ok: Object.keys(errors).length === 0 };
}
