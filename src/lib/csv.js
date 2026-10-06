// CSV の読み書きと、商品一括登録の読み取り・検証。
// 出品元から届く商品リストは、Excel で保存した Shift_JIS（CP932）が多いので、UTF-8 として読めなければ Shift_JIS で読み直す。
import { validateProduct, readInteger, readDateTime, readLead, normalizeJan, normalizeText, categoryFromText, CONDITIONS, CHANNELS, MAX_PRICE, MAX_STOCK } from './product-rules.js';
import { REFERENCE_LABELS } from './pricing.js';
import { LIFECYCLES } from '../data/categories.js';
import { UNKNOWN } from './market.js';

export const MAX_ROWS = 2000;
const BOM = '﻿';

// バイト列 → 文字列（UTF-8 は BOM を外す）。読めた文字コードも返す
export function decodeCsv(buffer) {
  const bytes = new Uint8Array(buffer);
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('shift_jis').decode(bytes), encoding: 'Shift_JIS' };
  }
}

// RFC 4180 に沿って読む（"..." の中のカンマ・改行・"" を扱う）。
// { rows: [{ cells, line（その行が始まるファイル上の行番号） }], error（引用符が閉じていないとき） }
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let quoteLine = 0;
  const endRow = () => {
    row.push(field);
    if (row.some((cell) => cell.trim() !== '')) rows.push({ cells: row, line: rowLine });
    row = [];
    field = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else {
        if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line += 1;
        field += char;
      }
    } else if (char === '"' && field === '') { quoted = true; quoteLine = line; }
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else field += char;
  }
  if (quoted) return { rows, error: `${quoteLine}行目から始まる「"」が閉じていません。説明文などの中の「"」は「""」と2つ重ねるか、引用符を閉じてください（この行より後は読めません）。` };
  if (field !== '' || row.length) endRow();
  return { rows, error: '' };
}

// 表計算ソフトで数式として動く書き出し（=・+・-・@ で始まるセル）を、先頭に ' を付けて文字として出す
const FORMULA_START = /^[=+\-@\t\r]/;
const escapeCell = (value) => {
  if (typeof value === 'number') return String(value);
  let text = String(value ?? '');
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// 配列 → CSV（Excel で文字化けしないよう BOM 付き UTF-8 にするのは呼び出し側）。数値は数値のまま、文字は数式にならないように出す
export const toCsv = (rows) => rows.map((cells) => cells.map(escapeCell).join(',')).join('\r\n');

// 一括登録の列。見出しは日本語・英語・業界でよく使う呼び方のどれでもよい（全角・半角スペースは無視）
export const IMPORT_COLUMNS = [
  { key: 'sellerId', label: 'seller_id', aliases: ['seller_id', 'sellerid', '出品元id', '出品元'], note: '出品元一覧の ID（例：S001）。空欄なら取込画面で選んだ出品元' },
  { key: 'name', label: '商品名', aliases: ['商品名', 'name', '品名'], required: true },
  { key: 'maker', label: 'メーカー', aliases: ['メーカー', 'メーカー名', 'maker', 'brand', 'ブランド'], required: true },
  { key: 'model', label: '型番', aliases: ['型番', '品番', 'model'], required: true },
  { key: 'jan', label: 'JAN', aliases: ['jan', 'janコード', 'jancode', 'ean'], required: true, note: '13桁または8桁（先頭0が落ちたものは補います。指数表記は不可）' },
  { key: 'category', label: 'カテゴリー', aliases: ['カテゴリー', 'カテゴリ', 'category', '分類', '部門'], required: true, note: 'カテゴリー名または ID（例：電動工具 / power）' },
  { key: 'referencePrice', label: '通常価格', aliases: ['通常価格', '通常販売価格', '希望小売価格', 'メーカー希望小売価格', '上代', '定価', '標準価格', 'regular_price'], required: true, note: '税込の円（12,800 や ¥12,800 も可。金額のカンマは "12,800" のように引用符で囲む）' },
  { key: 'memberPrice', label: '会員価格', aliases: ['会員価格', '会員限定価格', 'member_price'], required: true, note: '税込の円。通常価格以下' },
  { key: 'stock', label: '在庫数', aliases: ['在庫数', '在庫', '販売可能在庫数', '在庫数量', '数量', 'stock'], required: true, note: '販売可能数（0以上の整数）' },
  { key: 'saleStart', label: '販売開始日', aliases: ['販売開始日', '販売開始日時', 'sale_start'], note: '2026/10/06 または 2026/10/06 10:00（日本時間）' },
  { key: 'saleEnd', label: '販売終了日', aliases: ['販売終了日', '販売終了日時', 'sale_end'], note: '日付だけなら 23:59 まで' },
  { key: 'lead', label: '発送目安', aliases: ['発送目安', '出荷目安', 'lead_time'], note: '注文後2〜3営業日／翌営業日／即日（14時締め）。空欄は出品元の既定の発送目安' },
  { key: 'description', label: '商品説明', aliases: ['商品説明', '説明', 'description'] },
  { key: 'lifecycle', label: '商品の区分', aliases: ['商品の区分', '区分', 'lifecycle'], note: '現行品／型落ち／モデルチェンジ／廃番／終売／絶版。空欄は「確認中」（販売中にできない）' },
  { key: 'condition', label: '状態', aliases: ['状態', '商品の状態', 'condition'], note: '新品・未使用／外箱に傷み・開封済み／展示品。空欄は「確認中」（販売中にできない）' },
  { key: 'channel', label: '流通', aliases: ['流通', '流通区分', 'channel'], note: '国内正規流通品。空欄は「確認中」（販売中にできない）' },
  { key: 'referencePriceType', label: '通常価格の種類', aliases: ['通常価格の種類', '比較価格の種類', 'price_type'], note: 'メーカー希望小売価格／発売時のメーカー希望小売価格／当マーケットの通常価格。空欄は「確認中」（割引率を出さない）' },
  { key: 'shippingFee', label: '個別送料', aliases: ['個別送料', '送料', 'shipping_fee'], note: '個別送料の円（空欄は標準送料）' },
  { key: 'sellerSku', label: '出品者商品コード', aliases: ['出品者商品コード', '商品コード', '自社品番', '商品管理番号', '品番コード', 'sku', 'seller_sku'], note: '出品元の商品コード（照合・ピッキング用）' },
];

const LABEL_OF = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.key, column.label]));
// validateProduct の項目 → CSV の列名
const ERROR_COLUMNS = { ...LABEL_OF, categoryId: 'カテゴリー', saleStatus: '商品の区分・状態・流通', fulfillerId: 'seller_id', shippingFee: '個別送料', images: '画像' };

// 取り込まない列のうち、会員に見せてはいけない情報（原価など）
const COST_COLUMNS = ['原価', '仕入価格', '仕入れ価格', '卸価格', '下代', '掛率', 'cost'];

const normalizeHeader = (value) => String(value).replace(BOM, '').replace(/[\s　]/g, '').toLowerCase();
const COLUMN_OF = new Map(IMPORT_COLUMNS.flatMap((column) => column.aliases.map((alias) => [normalizeHeader(alias), column])));

// 「メーカー希望小売価格」「発売時のメーカー希望小売価格」「当マーケットの通常価格」または msrp などの ID。空欄は確認中
const referenceTypeFromText = (value) => {
  if (!value) return { value: 'unconfirmed', error: '' };
  const found = Object.entries(REFERENCE_LABELS).find(([id, label]) => id === value || label.label === value || label.short === value)?.[0];
  return found ? { value: found, error: '' } : { value: null, error: `「${value}」は使えません（メーカー希望小売価格／発売時のメーカー希望小売価格／当マーケットの通常価格）。` };
};

const LIFECYCLE_WORDS = [[/現行/, 'current'], [/型落|旧型|旧モデル/, 'previous'], [/モデルチェンジ|リニューアル/, 'model-change'], [/廃番|生産終了|製造終了/, 'discontinued'], [/終売/, 'sales-ended'], [/絶版/, 'out-of-print']];
const lifecycleFromText = (value) => {
  if (!value) return { value: 'unknown', error: '' };
  const byLabel = Object.entries(LIFECYCLES).find(([id, item]) => id === value || item.label === value)?.[0];
  const found = byLabel ?? LIFECYCLE_WORDS.find(([pattern]) => pattern.test(value))?.[1];
  return found ? { value: found, error: '' } : { value: null, error: `「${value}」は区分として読めません（現行品／型落ち／モデルチェンジ／廃番／終売／絶版）。` };
};

const conditionFromText = (value) => {
  if (!value) return { value: UNKNOWN, error: '' };
  if (/展示/.test(value)) return { value: CONDITIONS[2], error: '' };
  if (/箱|開封済|難|潰/.test(value)) return { value: CONDITIONS[1], error: '' };
  if (/新品|未使用|未開封/.test(value)) return { value: CONDITIONS[0], error: '' };
  return { value: null, error: `「${value}」は状態として読めません（新品・未使用／外箱に傷み・開封済み／展示品。中古品は扱いません）。` };
};

const channelFromText = (value) => {
  if (!value) return { value: UNKNOWN, error: '' };
  if (/並行|海外/.test(value)) return { value: null, error: '並行輸入品は扱いません。' };
  return /国内|正規/.test(value) ? { value: CHANNELS[0], error: '' } : { value: null, error: `「${value}」は流通として読めません（国内正規流通品）。` };
};

// 更新（同じ出品元・同じ JAN）で変わる項目
export const UPDATE_LABELS = { stock: '在庫', referencePrice: '通常価格', memberPrice: '会員価格', saleStart: '販売開始', saleEnd: '販売終了' };

// CSV の文字列から、登録できる行と問題のある行を作る（何行目・どの列・何が問題か）。
// 同じ出品元・同じ JAN の商品が登録済みなら「更新」（在庫・通常価格・会員価格・販売期間だけを変える）として扱う。
// context: { sellers, products, saleStatus, now, defaultSellerId（seller_id が空欄の行の出品元）, availableOf（商品 → 販売可能数）, fileName, encoding }
export function readImport(text, context) {
  const { sellers, products, saleStatus = 'draft', now = new Date(), defaultSellerId = '', availableOf = (product) => product.stock, fileName = '', encoding = '' } = context;
  const parsed = parseCsv(text.replace(/^﻿/, ''));
  const fileErrors = parsed.error ? [parsed.error] : [];
  const fileNotes = [];
  const all = parsed.rows;
  if (!all.length) return { fileErrors: ['CSV に行がありません。'], fileNotes, rows: [], counts: null };
  if (all.length > MAX_ROWS + 10) return { fileErrors: [`行が多すぎます（${all.length}行）。${MAX_ROWS}行ずつに分けてください。`], fileNotes, rows: [], counts: null };
  // 見出しの上にタイトル行・注記行が付いていることがあるので、見出しの行を最初の10行から探す
  const known = (cells) => cells.filter((cell) => COLUMN_OF.has(normalizeHeader(cell))).length;
  const found = all.slice(0, 10).findIndex((row) => known(row.cells) >= 3);
  if (found < 0) {
    const tabbed = all[0].cells.length === 1 && /\t/.test(all[0].cells[0]);
    return {
      fileErrors: [tabbed
        ? 'タブ区切りのファイルです。表計算ソフトで「CSV（カンマ区切り）」として保存し直してください。'
        : `見出しの行が見つかりません。${all[0].line}行目から10行のうちに「商品名」「型番」「JAN」などの見出しを入れてください（見本のCSVを参照）。`],
      fileNotes,
      rows: [],
      counts: null,
    };
  }
  const header = all[found];
  if (found > 0) {
    const span = found === 1 ? `${all[0].line}行目` : `${all[0].line}〜${all[found - 1].line}行目`;
    fileNotes.push(`見出しの上の${found}行（${span}・タイトルや注記）は読み飛ばしました。`);
  }
  const columnIndex = {};
  const unused = [];
  header.cells.forEach((cell, index) => {
    const column = COLUMN_OF.get(normalizeHeader(cell));
    if (column && !(column.key in columnIndex)) columnIndex[column.key] = index;
    else if (cell.trim()) unused.push(cell.trim());
  });
  const cost = unused.filter((cell) => COST_COLUMNS.map(normalizeHeader).includes(normalizeHeader(cell)));
  const other = unused.filter((cell) => !cost.includes(cell));
  if (cost.length) fileNotes.push(`「${cost.join('」「')}」の列は取り込みません（会員に見せない情報のため）。`);
  if (other.length) fileNotes.push(`取り込まない列：「${other.join('」「')}」。商品の状態に関わる内容（箱潰れ・展示品など）は「状態」の列に書いてください。`);
  IMPORT_COLUMNS.filter((column) => column.required && !(column.key in columnIndex)).forEach((column) => {
    fileErrors.push(`${header.line}行目（見出し）に「${column.label}」の列がありません。`);
  });
  if (!('sellerId' in columnIndex) && !defaultSellerId) fileErrors.push(`${header.line}行目（見出し）に「seller_id」の列がありません。列を足すか、取込画面で出品元を選んでください。`);
  if (fileErrors.length) return { fileErrors, fileNotes, rows: [], counts: null };

  const seenJans = new Map();
  const result = [];
  let skipped = 0;
  all.slice(found + 1).forEach(({ cells, line }) => {
    const raw = Object.fromEntries(Object.entries(columnIndex).map(([key, i]) => [key, normalizeText(cells[i] ?? '')]));
    // 見出しの下の注記行（※で始まる）と、末尾の合計行は商品ではないので読み飛ばす
    if (/^[※*＊]/.test(String(cells[0] ?? '').trim())) {
      fileNotes.push(`${line}行目は注記として読み飛ばしました。`);
      skipped += 1;
      return;
    }
    if (!raw.jan && !raw.model && cells.some((cell) => /^(合計|小計|計)$/.test(cell.trim()))) {
      fileNotes.push(`${line}行目は合計行として読み飛ばしました。`);
      skipped += 1;
      return;
    }
    const problems = [];
    const add = (column, message) => problems.push({ column, message });
    const notes = [];
    if (cells.length !== header.cells.length) {
      add('（行全体）', `列の数が見出しと違います（見出し${header.cells.length}列・この行${cells.length}列）。金額のカンマは "12,800" のように引用符で囲んでください。`);
    }
    const readErrors = {};
    const take = (key, read) => {
      if (read.error) readErrors[key] ??= read.error; // 先に見つけた具体的な理由（税抜など）を残す
      return read.value;
    };
    const category = categoryFromText(raw.category);
    if (raw.category && !category) readErrors.categoryId = `「${raw.category}」は登録されていないカテゴリーです。`;
    const sellerId = (raw.sellerId || defaultSellerId).toUpperCase();
    const seller = sellers.find((item) => item.id === sellerId);
    if (raw.sellerId && !seller) readErrors.sellerId = `「${raw.sellerId}」は登録されていない出品元です。`;
    const leadRead = readLead(raw.lead);
    let lead = take('lead', leadRead);
    if (leadRead.warning) notes.push(leadRead.warning);
    if (!raw.lead && seller?.defaultLead) {
      lead = seller.defaultLead;
      notes.push(`発送目安が空欄のため、出品元の既定（注文後${lead.leadMin}〜${lead.leadMax}営業日）にしました。`);
    }
    const shippingFee = take('shippingFee', readInteger(raw.shippingFee, { label: '個別送料', max: 99999, unit: '円' }));
    ['referencePrice', 'memberPrice'].forEach((key) => {
      if (/税抜|税別/.test(raw[key] ?? '')) readErrors[key] = '税抜の金額です。税込の金額で入力してください。';
    });
    const product = {
      sellerId,
      name: raw.name,
      maker: raw.maker,
      model: raw.model,
      jan: normalizeJan(raw.jan),
      categoryId: category?.id ?? '',
      lifecycle: take('lifecycle', lifecycleFromText(raw.lifecycle)) ?? 'unknown',
      referencePrice: take('referencePrice', readInteger(raw.referencePrice, { label: '通常価格', min: 1, max: MAX_PRICE, required: true, unit: '円・税込' })),
      referencePriceType: take('referencePriceType', referenceTypeFromText(raw.referencePriceType)) ?? 'unconfirmed',
      memberPrice: take('memberPrice', readInteger(raw.memberPrice, { label: '会員価格', min: 1, max: MAX_PRICE, required: true, unit: '円・税込' })),
      stock: take('stock', readInteger(raw.stock, { label: '在庫数', max: MAX_STOCK, required: true })),
      saleStart: take('saleStart', readDateTime(raw.saleStart, { label: '販売開始日' })),
      saleEnd: take('saleEnd', readDateTime(raw.saleEnd, { label: '販売終了日', endOfDay: true })),
      description: raw.description ?? '',
      sellerSku: raw.sellerSku ?? '',
      provenance: {
        condition: take('condition', conditionFromText(raw.condition)) ?? UNKNOWN,
        channel: take('channel', channelFromText(raw.channel)) ?? UNKNOWN,
      },
      saleStatus,
      shipping: { fee: shippingFee, leadMin: lead?.leadMin ?? null, leadMax: lead?.leadMax ?? null },
      importSource: { fileName, encoding, line, header: header.cells, cells, importedAt: now.toISOString() },
    };
    // 同じ出品元・同じ JAN の登録済み商品があれば「更新」
    const existing = product.jan && products.find((item) => item.sellerId === sellerId && item.jan === product.jan);
    // 出品元が申告していない区分・状態・流通のままでは販売中にしない（下書きで登録して、確かめてから公開する）
    if (saleStatus === 'on-sale' && (product.lifecycle === 'unknown' || product.provenance.condition === UNKNOWN || product.provenance.channel === UNKNOWN)) {
      product.saleStatus = 'draft';
      if (!existing) notes.push('区分・状態・流通のどれかが空欄のため、下書きで登録します（確かめてから販売中にしてください）。');
    }
    const { errors, warnings } = validateProduct(product, { sellers, products, now, readErrors, currentId: existing?.id ?? null, requireLead: !existing });
    Object.entries(errors).forEach(([key, message]) => add(ERROR_COLUMNS[key] ?? key, message));
    Object.values(warnings).forEach((message) => notes.push(message));
    Object.entries({ name: raw.name, maker: raw.maker, model: raw.model, description: raw.description }).forEach(([key, value]) => {
      if (/^[=+\-@]/.test(value ?? '')) notes.push(`「${LABEL_OF[key]}」が「${value.slice(0, 1)}」で始まっています。表計算ソフトで数式として扱われないか確かめてください。`);
    });
    // 型番が表計算ソフトで日付に化けていないか（例：10-2 → 2026/10/2）
    if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(raw.model ?? '')) notes.push('型番が日付になっています。表計算ソフトで列を「文字列」にして保存し直してください。');
    // 同じファイルの中で、同じ出品元の同じ JAN（別の出品元なら同じ JAN でもよい）
    const janKey = `${sellerId}:${product.jan}`;
    if (product.jan && !errors.jan) {
      if (seenJans.has(janKey)) add('JAN', `${seenJans.get(janKey)}行目と同じ出品元・同じJANコードです。`);
      else seenJans.set(janKey, line);
    }
    let changes = null;
    if (existing && !problems.length) {
      changes = {};
      const fields = { referencePrice: product.referencePrice, memberPrice: product.memberPrice, ...(raw.saleStart ? { saleStart: product.saleStart } : {}), ...(raw.saleEnd ? { saleEnd: product.saleEnd } : {}) };
      Object.entries(fields).forEach(([key, value]) => { if (existing[key] !== value) changes[key] = { from: existing[key], to: value }; });
      const available = availableOf(existing);
      if (available !== product.stock) changes.stock = { from: available, to: product.stock };
      notes.push(`登録済みの ${existing.id}（${existing.model}）を更新します。変わるのは在庫・通常価格・会員価格・販売期間（空欄は変えない）だけです。`);
    }
    result.push({ line, raw, product, problems, warnings: notes, mode: existing ? 'update' : 'create', targetId: existing?.id ?? null, changes });
  });
  const ok = result.filter((row) => !row.problems.length);
  return {
    fileErrors: [],
    fileNotes,
    rows: result,
    counts: { data: result.length + skipped, create: ok.filter((row) => row.mode === 'create').length, update: ok.filter((row) => row.mode === 'update').length, error: result.length - ok.length, skipped },
  };
}

// 一括登録の見本（ダウンロード用）。架空の商品
export function importTemplate() {
  const columns = IMPORT_COLUMNS.map((column) => column.key);
  const row = (values) => columns.map((key) => values[key] ?? '');
  return toCsv([
    IMPORT_COLUMNS.map((column) => column.label),
    row({ sellerId: 'S001', name: '18V コードレスジグソー（本体のみ）', maker: 'KANAME', model: 'JS-180', jan: '2010000000182', category: '電動工具', referencePrice: '29700', memberPrice: '15800', stock: '6', saleStart: '2026/10/10', saleEnd: '2026/11/30', lead: '注文後2〜3営業日', description: 'モデルチェンジ前の在庫品。', lifecycle: 'モデルチェンジ', condition: '新品・未使用', channel: '国内正規流通品', referencePriceType: 'メーカー希望小売価格', sellerSku: 'HC-A-001' }),
    row({ sellerId: 'S001', name: 'スチール工具箱 2段 400mm', maker: 'BANSHO', model: 'TB-400', jan: '2010000000199', category: '工具収納', referencePrice: '7480', memberPrice: '4980', stock: '10', lead: '翌営業日', description: '旧パッケージ品。外箱に擦れあり。', lifecycle: '型落ち', condition: '外箱に傷み', channel: '国内正規流通品', referencePriceType: 'メーカー希望小売価格', shippingFee: '1100', sellerSku: 'HC-A-002' }),
  ]);
}
