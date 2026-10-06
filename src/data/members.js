// デモ会員。氏名・会社・住所・契約番号はすべて架空（番地「9-9-9」「99」は実在しない番号にしている）。
// 本番では会員情報・契約情報は通信契約側の基盤から受け取る想定。
export const PAYMENT_METHODS = [
  // paidOnConfirm: 確定時点で精算済みとして扱う（請求書は月末締め）。それ以外は waitingLabel の状態で支払いを待つ
  { id: 'invoice', label: '請求書払い', detail: '月末締め・翌月末払い（法人・個人事業主）', note: '与信審査は本番で実施します（モックでは省略）。', paidOnConfirm: true },
  { id: 'card', label: 'クレジットカード', detail: 'VISA / Mastercard / JCB / AMEX', note: 'カード情報は決済代行会社の画面で入力し、当サイトには保存しません。', paidOnConfirm: true },
  { id: 'paypay', label: 'PayPay', detail: '注文確定後に PayPay アプリで支払い', note: '30分以内にお支払いください（モックでは連携しません）。', waitingLabel: 'お支払い待ち' },
  { id: 'bank', label: '銀行振込', detail: '前払い・入金確認後に出荷', note: '振込先は注文完了画面とメールでお知らせします。', waitingLabel: '入金待ち' },
];

export const paymentById = (id) => PAYMENT_METHODS.find((method) => method.id === id);

export const DEMO_ACCOUNTS = [
  {
    id: 'minato',
    loginId: 'demo@genba-yard.example',
    memberNo: 'GY-24-08812',
    password: 'genba2026',
    demoLabel: 'リピート会員（登録情報あり）',
    name: '中村 拓也',
    company: '株式会社ミナト電設',
    position: '工事部 主任',
    trade: '電気工事',
    favoriteCategoryIds: ['power', 'electric', 'measure'],
    contract: { plan: 'ビジネスプラン（5回線）', contractNo: 'GTW-2410-08812', since: '2024年10月' },
    corporate: {
      name: '株式会社ミナト電設',
      representative: '代表取締役 港 修一',
      address: '〒135-0061 東京都江東区豊洲9-9-9 ミナトビル2F',
      tel: '03-0000-1234',
      billingContact: '経理部 小川 様',
      terms: '月末締め・翌月末払い',
      receiptName: '株式会社ミナト電設',
    },
    addresses: [
      {
        id: 'hq',
        label: '本社',
        recipient: '株式会社ミナト電設 工事部 中村 拓也',
        postal: '135-0061',
        address: '東京都江東区豊洲9-9-9 ミナトビル2F',
        tel: '03-0000-1234',
        place: '1F 受付へ',
      },
      {
        id: 'site-toyosu',
        label: '現場：豊洲六丁目 新築工事',
        recipient: '仮設事務所 中村 拓也',
        postal: '135-0052',
        address: '東京都江東区豊洲6-99 新築工事現場 仮設事務所',
        tel: '090-0000-5678',
        place: 'ゲート横の資材置き場（平日8:00–17:00受取可）',
      },
      {
        id: 'site-ariake',
        label: '現場：有明 倉庫改修',
        recipient: '現場代理人 佐々木 様',
        postal: '135-0063',
        address: '東京都江東区有明9-99 倉庫改修工事 現場事務所',
        tel: '090-0000-9012',
        place: '現場事務所へ手渡し',
      },
    ],
    seed: {
      favoriteIds: ['nd-lx4g', 'kn-cs165'],
      ownedBatteries: ['KX18'],
      savedPaymentIds: ['invoice', 'card'],
      lastPaymentId: 'invoice',
      lastAddressId: 'site-toyosu',
    },
  },
  {
    id: 'sato',
    loginId: 'first@genba-yard.example',
    memberNo: 'GY-26-10231',
    password: 'genba2026',
    demoLabel: '初めて購入する会員',
    name: '佐藤 大輔',
    company: 'サトウ内装（個人事業主）',
    position: '代表',
    trade: '内装工事',
    favoriteCategoryIds: ['power', 'measure', 'battery'],
    contract: { plan: 'ライトプラン（1回線）', contractNo: 'GTW-2609-10231', since: '2026年9月' },
    corporate: {
      name: 'サトウ内装',
      representative: '佐藤 大輔',
      address: '〒210-0000 神奈川県川崎市川崎区9-9-9',
      tel: '090-0000-3456',
      billingContact: '佐藤 大輔 様',
      terms: '—',
      receiptName: 'サトウ内装',
    },
    addresses: [
      {
        id: 'contract',
        label: '契約住所（現場つながるWi-Fi）',
        recipient: 'サトウ内装 佐藤 大輔',
        postal: '210-0000',
        address: '神奈川県川崎市川崎区9-9-9',
        tel: '090-0000-3456',
        place: '玄関前',
        fromContract: true,
      },
    ],
    seed: {
      favoriteIds: [],
      ownedBatteries: [],
      savedPaymentIds: [],
      lastPaymentId: null,
      lastAddressId: null,
    },
  },
];
