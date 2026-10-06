// バッテリーの規格（プラットフォーム）。商品の battery.platform から参照する。
// 会員がマイページで「手持ちのバッテリー」を登録すると、一覧に「手持ちで動く」が付く。
export const BATTERY_PLATFORMS = [
  {
    id: 'KX18',
    name: 'KANAME KX18（18V）',
    shortName: 'KX18',
    brandId: 'kaname',
    since: '2014年',
    batteries: ['KB-183（3.0Ah）', 'KB-185（5.0Ah）', 'KB-185S（5.0Ah・現行）', 'KB-186S（6.0Ah・現行）'],
    chargers: ['KC-18Q（急速・終売）', 'KC-18QU（急速・USB出力付・現行）'],
  },
  {
    id: 'BP72',
    name: 'NORDA BP-72（7.2V 測定器用）',
    shortName: 'BP-72',
    brandId: 'norda',
    since: '2019年',
    batteries: ['BP-72（7.2V 2.5Ah）'],
    chargers: ['BC-72（専用充電器）'],
  },
];

export const platformById = (id) => BATTERY_PLATFORMS.find((platform) => platform.id === id);
