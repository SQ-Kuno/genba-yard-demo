// 架空ブランド。実在メーカーの名称・配色（青緑・緑・赤・黄・青など）と重ならないよう設定している。
// 名称は商標未確認【要確認】
export const BRANDS = [
  {
    id: 'kaname',
    name: 'KANAME',
    nameKana: 'カナメ',
    tagline: '現場の要になる、18Vプラットフォーム。',
    description: '国内の建築・設備業向けに電動工具を展開する架空ブランド。18V「KX18」バッテリーを2014年から変えずに使い続けられることを約束しており、旧モデルと現行モデルで電池を共有できる。',
    genres: ['電動工具', 'バッテリー・充電器'],
    design: 'マットグラファイトの本体に銅色のアクセント。角を落とした直線的なシルエット。',
    accent: '#b4703c',
  },
  {
    id: 'norda',
    name: 'NORDA',
    nameKana: 'ノルダ',
    tagline: '測る、確かめる、残す。',
    description: '墨出し器・距離計・電気計測器を扱う架空の計測器ブランド。出荷前の精度検査と、販売終了後の校正サービスを長く続けることで知られる。',
    genres: ['測定工具', '電設用品（計測器）'],
    design: 'ホワイトの筐体にアイスブルーの窓。屋外でも視認しやすい高コントラストの表示部。',
    accent: '#5aa7c7',
  },
  {
    id: 'bansho',
    name: 'BANSHO',
    nameKana: 'バンショウ',
    tagline: '番匠の手に、長く残る道具を。',
    description: '手工具・電工手工具・工具収納の架空ブランド。黒染めの鋼と藍色の樹脂を組み合わせた意匠で、ラチェット類は永久保証。',
    genres: ['手工具', '電設用品（手工具）', '工具収納'],
    design: '黒染め鋼 × 藍色。刻印とヘアライン仕上げで工芸品のような質感。',
    accent: '#2f4a7a',
  },
  {
    id: 'groundline',
    name: 'GROUNDLINE',
    nameKana: 'グラウンドライン',
    tagline: '現場の環境を、先につくる。',
    description: '作業灯・安全用品・作業用品の架空ブランド。KANAME の KX18 バッテリーとの公式互換を持つ製品が多い。',
    genres: ['現場用品', '安全用品', '作業用品'],
    design: 'サンドベージュとブラックの2トーン。屋外で汚れが目立ちにくい配色。',
    accent: '#a08a62',
  },
];

// 管理画面で登録した、ブランド一覧にないメーカーは「maker:メーカー名」の ID で持つ（名前だけのブランドとして扱う）
export const brandById = (id) => BRANDS.find((brand) => brand.id === id)
  ?? (String(id).startsWith('maker:') ? { id, name: id.slice(6), nameKana: '', tagline: '', description: '', genres: [], accent: '#5b6474' } : undefined);
