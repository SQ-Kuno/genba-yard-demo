// 出品元（SELLER）。社名・担当者・連絡先・住所はすべて架空（メールは example ドメイン、番地は実在しない番号）。
// PoC では運営者（ADMIN）が登録・編集し、商品ごとに「どの出品元の商品か」を選ぶ。SELLER 自身はログインしない。
//
// 役割を分けて持つ（将来の「在庫はメーカー・販売は小売・発送はメーカー」のような組み合わせに備える）:
//   roles.holdsStock … 在庫を持つ（SELLER）
//   roles.sells      … 販売者になる（MERCHANT。特定商取引法の販売業者表示の対象）
//   roles.ships      … 購入者へ発送する（FULFILLMENT）
// EC の運営者（PLATFORM）は config/site.js の operator。
// accountIds … 将来 SELLER アカウントを発行したときに、ログインできる担当者を紐付ける（PoC では空）
// defaultLead … 発送目安の既定（注文後◯〜◯営業日で発送）。商品ごとに入れないときに使う

export const SELLER_KINDS = {
  retailer: '小売（ホームセンター等）',
  maker: 'メーカー',
  wholesaler: '卸・商社',
};

export const SELLER_STATUSES = {
  active: { label: '取引中', tone: 'ok' },
  paused: { label: '一時停止', tone: 'warn' },
  ended: { label: '取引終了', tone: 'neutral' },
};

const place = (label, postal, address, tel) => ({ label, postal, address, tel });

export const SEED_SELLERS = [
  {
    id: 'S001',
    name: 'ホームセンターA（デモ）',
    kind: 'retailer',
    contactName: '山田 一郎（架空）',
    email: 'ec-support@hc-a.example',
    tel: '03-0000-0101',
    shipFrom: place('ホームセンターA 東日本物流センター', '000-0101', '【デモ】埼玉県○○市物流団地9-9', '048-000-0101'),
    returnTo: place('ホームセンターA 返品受付', '000-0101', '【デモ】埼玉県○○市物流団地9-9', '048-000-0102'),
    status: 'active',
    roles: { holdsStock: true, sells: true, ships: true },
    accountIds: [],
    note: '型落ち・廃番の店舗在庫と倉庫在庫を出品。平日14時までの受注は当日出荷。',
    defaultLead: { leadMin: 0, leadMax: 1 }, // 新規商品・CSV の発送目安を空欄にしたときに使う
    createdDaysAgo: 120,
  },
  {
    id: 'S002',
    name: 'カナメ工機（デモ）',
    kind: 'maker',
    contactName: '佐々木 誠（架空）',
    email: 'outlet@kaname-tools.example',
    tel: '06-0000-0202',
    shipFrom: place('カナメ工機 部品センター', '000-0202', '【デモ】大阪府○○市工業団地9-9', '06-0000-0203'),
    returnTo: place('カナメ工機 サービスセンター', '000-0202', '【デモ】大阪府○○市工業団地9-9', '06-0000-0204'),
    status: 'active',
    roles: { holdsStock: true, sells: true, ships: true },
    accountIds: [],
    note: 'KANAME ブランドのメーカー保有在庫（モデルチェンジ前の型番）。',
    defaultLead: { leadMin: 2, leadMax: 3 },
    createdDaysAgo: 110,
  },
  {
    id: 'S003',
    name: 'ノルダ計測（デモ）',
    kind: 'maker',
    contactName: '高橋 由美（架空）',
    email: 'market@norda-instruments.example',
    tel: '052-000-0303',
    shipFrom: place('ノルダ計測 出荷課', '000-0303', '【デモ】愛知県○○市計測町9-9', '052-000-0304'),
    returnTo: place('ノルダ計測 校正・修理センター', '000-0303', '【デモ】愛知県○○市計測町9-9', '052-000-0305'),
    status: 'active',
    roles: { holdsStock: true, sells: true, ships: true },
    accountIds: [],
    note: 'NORDA ブランドの計測器。出荷前に精度検査を実施。',
    defaultLead: { leadMin: 2, leadMax: 4 },
    createdDaysAgo: 95,
  },
];
