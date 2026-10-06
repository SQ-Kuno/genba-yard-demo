// 発送登録で選ぶ配送会社。追跡番号の桁数は目安で、合わなくても登録はできる（注意を出すだけ）。
// 根拠は docs/00-domain-format-admin.md §4：西濃・福山・日本郵便は公式の案内、ヤマト・佐川の12桁は二次情報。
// 「その他」は形式を確かめない
export const CARRIERS = [
  { id: 'yamato', name: 'ヤマト運輸', digits: [12] },
  { id: 'sagawa', name: '佐川急便', digits: [12] },
  { id: 'japanpost', name: '日本郵便', digits: [11, 12, 13] },
  { id: 'seino', name: '西濃運輸', digits: [10] },
  { id: 'fukuyama', name: '福山通運', digits: [10, 11] },
  { id: 'other', name: 'その他（自社便・チャーター便など）', digits: null },
];

export const carrierById = (id) => CARRIERS.find((carrier) => carrier.id === id) ?? null;
