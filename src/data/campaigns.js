// キャンペーン定義。運用時はこのファイルを差し替えるだけで切り替わる。
//
// 期間限定をうたう以上、次を守る（tests/check-data.mjs で検査している）:
//   - 期間中は items の価格が実際に下がり、期間が終われば会員価格に戻る（中身のないカウントダウンにしない）
//   - 季節キャンペーンは連続させない（終わった翌日に次を始めて「常にSALE中」にしない）・年間の半分未満
//   - 価格は会員価格より下・安全用品は対象にしない
//   - TIME SALE・週末限定の価格は、同じ商品の季節SALE価格より安くする（重なった日にTIME SALEの棚に別の価格が出ないように）

// 毎年同じ月日で回る季節キャンペーン。items は「商品ID: 期間中の価格（税込）」
// lead の {battery} は会員の手持ちバッテリー名に置き換わる（未回答なら「バッテリー」）。
// 「他メーカーの電池」「使っていない」と答えた会員には leadWithoutBattery を出す（無ければ lead）
export const SEASONAL_CAMPAIGNS = [
  {
    id: 'new-year', title: 'NEW YEAR SALE', name: '新春SALE', start: '01-04', end: '01-12', lead: '仕事始めの道具を、会員価格で。',
    items: { 'kn-id180': 15480, 'kn-kb185': 9800, 'gl-wl5000': 12480, 'bs-ws16': 2480 },
  },
  {
    id: 'fiscal', title: 'FISCAL YEAR-END SALE', name: '決算SALE', start: '03-10', end: '03-20', lead: 'メーカー・販売店の決算期にあわせた限定放出。',
    items: { 'kn-cs165': 26800, 'kn-gd100': 16800, 'bs-tb500': 8980, 'nd-dm50': 7980 },
  },
  {
    id: 'new-term', title: 'NEW TERM SALE', name: '新年度SALE', start: '04-01', end: '04-10', lead: '新しく入る仲間の一式を、まとめて。',
    items: { 'kn-dd180': 11280, 'kn-kb185': 9800, 'kn-kc18q': 4980, 'bs-ws16': 2480 },
  },
  {
    id: 'golden-week', title: 'GOLDEN WEEK SALE', name: 'GW SALE', start: '04-29', end: '05-06', lead: '連休明けの現場に、間に合わせる。',
    items: { 'nd-lx4g': 89800, 'gl-wl5000': 12480, 'kn-cs165': 26800 },
  },
  {
    id: 'summer', title: 'SUMMER SITE SALE', name: '夏の現場応援SALE', start: '07-15', end: '07-31', lead: '日の長い季節の照明と予備電池を。',
    items: { 'gl-wl5000': 12480, 'kn-kb185': 9800, 'kn-gd100': 16800 },
  },
  {
    id: 'members-special', title: 'MEMBERS SPECIAL SALE', name: '会員限定SALE', start: '10-01', end: '10-12',
    lead: '手持ちの{battery}で動く、一つ前の名機を会員価格で。', leadWithoutBattery: '電池を選ばない道具も、会員価格で。',
    // 見出しの約束（手持ちのバッテリーで動く前モデル）に合わせ、KX18 の前モデルを中心に選ぶ
    items: { 'kn-id180': 15480, 'kn-dd180': 11280, 'kn-kb185': 9800, 'gl-wl5000': 12480, 'nd-lx4g': 89800, 'bs-rs38': 27800 },
  },
  {
    id: 'halloween', title: 'HALLOWEEN NIGHT SALE', name: 'ハロウィンSALE', start: '10-24', end: '10-31', lead: '日が短くなる季節に、照明と電熱ウェアを。',
    items: { 'gl-wl5000': 12480, 'gl-hv01': 6980, 'kn-kb185': 9800 },
  },
  {
    id: 'year-end', title: 'YEAR-END SALE', name: '年末SALE', start: '12-10', end: '12-25', lead: '今年の締めくくりに、来年の道具を。',
    items: { 'kn-id180': 15480, 'kn-cs165': 26800, 'bs-tb500': 8980, 'bs-rs38': 27800 },
  },
];

// 季節キャンペーンが無い時期に出す常設の訴求（期限・SALE をうたわない）
export const EVERGREEN_CAMPAIGN = {
  id: 'members-price',
  title: 'MEMBERS PRICE',
  name: '会員価格',
  lead: '手持ちの{battery}で動く、一つ前の名機を会員価格で。',
  leadWithoutBattery: '電池を選ばない道具も、会員価格で。',
};

// 毎日 0:00〜23:59:59 の TIME SALE。14日周期で1日2品、同じ商品の次の登場は早くても3日後（添字の差3以上）。
// rotation の添字は「1970-01-01 からの日数 % 14」（lib/campaigns.js の dayIndex）
export const TIME_SALE = {
  title: 'TIME SALE',
  name: '本日のTIME SALE',
  prices: {
    'kn-id180': 14980,
    'kn-dd180': 10980,
    'kn-cs165': 25800,
    'kn-kb185': 9480,
    'kn-kc18q': 4680,
    'nd-dm50': 7480,
    'bs-ws16': 2380,
    'gl-wl5000': 11980,
    'gl-hv01': 6780,
  },
  rotation: [
    ['kn-kb185', 'gl-wl5000'],
    ['bs-ws16', 'kn-cs165'],
    ['gl-hv01', 'nd-dm50'],
    ['kn-id180', 'kn-kc18q'],
    ['kn-dd180', 'gl-wl5000'],
    ['kn-kb185', 'gl-hv01'],
    ['kn-cs165', 'kn-id180'],
    ['bs-ws16', 'kn-kc18q'],
    ['kn-dd180', 'nd-dm50'],
    ['kn-cs165', 'gl-hv01'],
    ['gl-wl5000', 'kn-kb185'],
    ['nd-dm50', 'bs-ws16'],
    ['kn-kc18q', 'kn-dd180'],
    ['kn-id180', 'gl-hv01'],
  ],
};

// 土日だけの価格
export const WEEKEND_SALE = {
  title: 'WEEKEND SALE',
  name: '週末限定SALE',
  items: { 'kn-gd100': 16480, 'bs-tb500': 8680 },
};
