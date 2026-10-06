// リピート会員の過去の注文・見積。日付は「何日前」で持ち、いつデモしても自然な時系列になるようにする。
// 価格は購入当時の価格（現在の価格とは別に記録する）。
// status … 運用の状態（lib/orders.js の ORDER_STATUSES）。shipment … 出品元からの発送（配送会社・追跡番号は架空）
export const SEED_ORDERS = {
  minato: [
    {
      id: 'GY-284417',
      daysAgo: 3,
      paymentId: 'invoice',
      addressId: 'site-toyosu',
      items: [
        { productId: 'gl-hv01', qty: 3, price: 7980 },
      ],
      status: 'delivered',
      shipment: { carrier: 'yamato', trackingNo: '0000-0000-1001', shippedDaysAgo: 2, deliveredDaysAgo: 1 },
    },
    {
      id: 'GY-264821',
      daysAgo: 24,
      paymentId: 'invoice',
      addressId: 'site-toyosu',
      items: [
        { productId: 'bs-ws16', qty: 2, price: 2680 },
        { productId: 'nd-ct300', qty: 1, price: 11800 },
      ],
      status: 'completed',
      shipment: { carrier: 'sagawa', trackingNo: '0000-0000-1002', shippedDaysAgo: 23, deliveredDaysAgo: 22 },
    },
    {
      id: 'GY-251179',
      daysAgo: 64,
      paymentId: 'card',
      addressId: 'hq',
      items: [
        { productId: 'kn-kb185', qty: 2, price: 10800 },
        { productId: 'kn-kc18q', qty: 1, price: 5480 },
      ],
      status: 'completed',
      shipment: { carrier: 'yamato', trackingNo: '0000-0000-1003', shippedDaysAgo: 63, deliveredDaysAgo: 62 },
    },
    {
      id: 'GY-240937',
      daysAgo: 107,
      paymentId: 'invoice',
      addressId: 'site-ariake',
      items: [
        { productId: 'gl-hs2', qty: 2, price: 19800 },
      ],
      status: 'completed',
      shipment: { carrier: 'japanpost', trackingNo: '0000-0000-1004', shippedDaysAgo: 106, deliveredDaysAgo: 104 },
    },
  ],
  sato: [],
};

export const SEED_QUOTES = {
  minato: [
    {
      id: 'Q-30213',
      title: '豊洲六丁目 新築工事 電動工具一式（増員3名分）',
      daysAgo: 18,
      validDays: 30,
      status: '回答済み',
      items: [
        { productId: 'kn-id180', qty: 3, price: 15980 },
        { productId: 'kn-dd180', qty: 3, price: 12180 },
        { productId: 'kn-kb185', qty: 4, price: 10280 },
        { productId: 'kn-kc18q', qty: 2, price: 5180 },
      ],
    },
    {
      id: 'Q-30187',
      title: '有明 倉庫改修 照明・安全用品',
      daysAgo: 45,
      validDays: 30,
      status: '期限切れ',
      items: [
        { productId: 'gl-wl5000', qty: 6, price: 13100 },
        { productId: 'gl-hs2', qty: 4, price: 18800 },
      ],
    },
  ],
  sato: [],
};

// ログインしない、ほかの会員（すべて架空）。管理画面の注文一覧・販売分析を、デモでも実際の運用に近い量で見せるため
const site = (label, recipient, postal, address, tel) => ({ id: 'main', label, recipient, postal, address, tel, place: '' });
export const SEED_MEMBERS = [
  { id: 'm01', memberNo: 'GY-24-03317', company: '東和設備工業 株式会社（架空）', name: '東 和也', trade: '設備（空調・衛生）', plan: 'ビジネスプラン（10回線）', address: site('本社資材置場', '東和設備工業 資材課', '330-0000', '【デモ】埼玉県さいたま市○○区9-9', '048-000-3317') },
  { id: 'm02', memberNo: 'GY-24-05120', company: '有限会社 北辰電工（架空）', name: '北村 健', trade: '電気工事', plan: 'ビジネスプラン（5回線）', address: site('現場：川崎 物流倉庫新築', '現場代理人 北村', '210-0000', '【デモ】神奈川県川崎市○○区9-99', '090-0000-5120') },
  { id: 'm03', memberNo: 'GY-25-00841', company: '石井内装（個人事業）（架空）', name: '石井 拓真', trade: '内装', plan: '個人事業主プラン（1回線）', address: site('自宅兼作業場', '石井 拓真', '272-0000', '【デモ】千葉県市川市○○9-9-9', '090-0000-0841') },
  { id: 'm04', memberNo: 'GY-24-07712', company: '株式会社 青葉建設（架空）', name: '青木 聡', trade: '大工・木工事', plan: 'ビジネスプラン（10回線）', address: site('工務部 倉庫', '青葉建設 工務部', '225-0000', '【デモ】神奈川県横浜市○○区9-9', '045-000-7712') },
  { id: 'm05', memberNo: 'GY-25-02209', company: '丸の内電設 株式会社（架空）', name: '丸山 直樹', trade: '電気工事', plan: 'ビジネスプラン（20回線）', address: site('現場：品川 オフィス改修', '丸の内電設 現場事務所', '108-0000', '【デモ】東京都港区○○9-9-9', '03-0000-2209') },
  { id: 'm06', memberNo: 'GY-25-03356', company: '湊外構（個人事業）（架空）', name: '湊 大地', trade: '外構・土木', plan: '個人事業主プラン（1回線）', address: site('作業場', '湊 大地', '343-0000', '【デモ】埼玉県越谷市○○9-9', '090-0000-3356') },
  { id: 'm07', memberNo: 'GY-24-09981', company: '株式会社 彩色工房（架空）', name: '小林 彩', trade: '塗装', plan: 'ビジネスプラン（5回線）', address: site('本社', '彩色工房 資材担当', '187-0000', '【デモ】東京都小平市○○9-9', '042-000-9981') },
  { id: 'm08', memberNo: 'GY-25-01175', company: '東邦メンテナンス 株式会社（架空）', name: '藤田 学', trade: '設備（空調・衛生）', plan: 'ビジネスプラン（5回線）', address: site('東京営業所', '東邦メンテナンス 東京営業所', '120-0000', '【デモ】東京都足立区○○9-9-9', '03-0000-1175') },
];

// ほかの会員の注文（すべて架空）。直近の数件は「注文受付」「発送準備中」「入金待ち」のまま置き、
// 管理画面を開いた直後から対応すべき注文が見えるようにする。hoursAgo（直近）か daysAgo で日時を持つ
const ship = (carrier, trackingNo, shippedDaysAgo, deliveredDaysAgo = null) => ({ carrier, trackingNo, shippedDaysAgo, deliveredDaysAgo });
export const SEED_MEMBER_ORDERS = [
  { id: 'GY-130421', memberId: 'm01', hoursAgo: 3, paymentId: 'card', items: [{ productId: 'kn-id180', qty: 2, price: 16800 }], status: 'received' },
  { id: 'GY-130388', memberId: 'm02', hoursAgo: 9, paymentId: 'invoice', items: [{ productId: 'kn-kb185', qty: 2, price: 10800 }, { productId: 'kn-kc18q', qty: 1, price: 5480 }], status: 'preparing' },
  { id: 'GY-130352', memberId: 'm03', hoursAgo: 20, paymentId: 'bank', paid: false, items: [{ productId: 'nd-dm50', qty: 1, price: 8980 }], status: 'received' },
  { id: 'GY-130297', memberId: 'm04', daysAgo: 1, paymentId: 'card', items: [{ productId: 'gl-wl5000', qty: 2, price: 13800 }], status: 'shipped', shipment: ship('sagawa', '0000-0000-2004', 0) },
  { id: 'GY-130233', memberId: 'm05', daysAgo: 2, paymentId: 'invoice', items: [{ productId: 'kn-dd180', qty: 3, price: 12800 }], status: 'shipped', shipment: ship('yamato', '0000-0000-2005', 1) },
  { id: 'GY-130151', memberId: 'm02', daysAgo: 4, paymentId: 'invoice', items: [{ productId: 'bs-ws16', qty: 5, price: 2680 }], status: 'delivered', shipment: ship('yamato', '0000-0000-2006', 3, 2) },
  { id: 'GY-130102', memberId: 'm06', daysAgo: 5, paymentId: 'paypay', items: [{ productId: 'gl-hv01', qty: 2, price: 7980 }], status: 'delivered', shipment: ship('japanpost', '0000-0000-2007', 4, 3) },
  { id: 'GY-130077', memberId: 'm07', daysAgo: 6, paymentId: 'card', items: [{ productId: 'kn-cs165', qty: 1, price: 28800 }], status: 'cancelled', cancelReason: 'お客様のご都合（出荷前のキャンセル）' },
  { id: 'GY-129940', memberId: 'm01', daysAgo: 9, paymentId: 'card', items: [{ productId: 'nd-lx4g', qty: 1, price: 98000 }], status: 'completed', shipment: ship('yamato', '0000-0000-2009', 8, 7) },
  { id: 'GY-129871', memberId: 'm08', daysAgo: 11, paymentId: 'invoice', items: [{ productId: 'kn-gd100', qty: 2, price: 18800 }], status: 'completed', shipment: ship('sagawa', '0000-0000-2010', 10, 9) },
  { id: 'GY-129805', memberId: 'm03', daysAgo: 13, paymentId: 'card', items: [{ productId: 'bs-tb500', qty: 1, price: 9800 }], status: 'completed', shipment: ship('seino', '0000-0000-2011', 12, 10) },
  { id: 'GY-129688', memberId: 'm04', daysAgo: 16, paymentId: 'invoice', items: [{ productId: 'kn-id180', qty: 3, price: 16800 }, { productId: 'kn-kb185', qty: 3, price: 10800 }], status: 'completed', shipment: ship('yamato', '0000-0000-2012', 15, 14) },
  { id: 'GY-129590', memberId: 'm05', daysAgo: 19, paymentId: 'card', items: [{ productId: 'nd-ct300', qty: 1, price: 11800 }], status: 'refunded', shipment: ship('yamato', '0000-0000-2013', 18, 17), cancelReason: '初期不良（表示部の欠け）。返品を受け付け、返金済み' },
  { id: 'GY-129512', memberId: 'm06', daysAgo: 22, paymentId: 'invoice', items: [{ productId: 'gl-hs2', qty: 2, price: 19800 }], status: 'completed', shipment: ship('sagawa', '0000-0000-2014', 21, 20) },
  { id: 'GY-129433', memberId: 'm07', daysAgo: 26, paymentId: 'card', items: [{ productId: 'kn-dd180', qty: 1, price: 12800 }, { productId: 'bs-ws16', qty: 2, price: 2680 }], status: 'completed', shipment: ship('yamato', '0000-0000-2015', 25, 24) },
  { id: 'GY-129310', memberId: 'm08', daysAgo: 33, paymentId: 'invoice', items: [{ productId: 'kn-kc18q', qty: 2, price: 5480 }], status: 'completed', shipment: ship('japanpost', '0000-0000-2016', 32, 30) },
  { id: 'GY-129244', memberId: 'm02', daysAgo: 38, paymentId: 'invoice', items: [{ productId: 'bs-rs38', qty: 1, price: 29800 }], status: 'completed', shipment: ship('yamato', '0000-0000-2017', 37, 36) },
  { id: 'GY-129101', memberId: 'm01', daysAgo: 45, paymentId: 'card', items: [{ productId: 'gl-wl5000', qty: 1, price: 13800 }, { productId: 'gl-hv01', qty: 1, price: 7980 }], status: 'completed', shipment: ship('sagawa', '0000-0000-2018', 44, 43) },
  { id: 'GY-128977', memberId: 'm05', daysAgo: 52, paymentId: 'card', items: [{ productId: 'kn-gd100', qty: 1, price: 18800 }], status: 'completed', shipment: ship('yamato', '0000-0000-2019', 51, 50) },
  { id: 'GY-128860', memberId: 'm03', daysAgo: 58, paymentId: 'invoice', items: [{ productId: 'nd-dm50', qty: 2, price: 8980 }], status: 'completed', shipment: ship('yamato', '0000-0000-2020', 57, 56) },
  { id: 'GY-128705', memberId: 'm06', daysAgo: 70, paymentId: 'card', items: [{ productId: 'kn-kv180', qty: 2, price: 11800 }], status: 'completed', shipment: ship('sagawa', '0000-0000-2021', 69, 68) },
];
