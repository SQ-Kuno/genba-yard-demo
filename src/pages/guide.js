import { html } from '../lib/html.js';
import { yen } from '../lib/format.js';
import { SITE } from '../config/site.js';
import { PAYMENT_METHODS } from '../data/members.js';
import { Breadcrumb } from '../components/Common.js';

const SECTIONS = [
  {
    id: 'shipping',
    title: '送料・お届け',
    body: html`
      <p>送料は全国一律 ${yen(SITE.shipping.fee)}、${yen(SITE.shipping.freeThreshold)}（税込）以上のご注文で無料です。${SITE.shipping.sameDayCutoffHour}:00までのご注文は翌日、それ以降は翌々日のお届け予定です（在庫品・国内配送。北海道・沖縄は＋1日）。</p>
      <p>マイページで現場を登録しておくと、購入手続きで選ぶだけで現場へ直送できます。受取人と置き場所も一緒に登録できます。</p>`,
  },
  {
    id: 'returns',
    title: '返品・キャンセル・初期不良',
    body: html`
      <p>ご注文の確定後、出荷前であればキャンセルできます。お客様都合の返品は未開封品に限り、到着後${SITE.returnDays}日以内に承ります（返送料はお客様負担）。</p>
      <p>1契約で購入できる同一商品は、今回の放出分の累計で${SITE.orderLimit.default}点まで（数量限定品は${SITE.orderLimit.limited}点）です。まとめ買いは見積で承ります。転売目的と判断したご注文は、当方からお取り消しすることがあります（ご連絡のうえ、お支払い済みの代金は返金します）。</p>
      <p>初期不良は到着後${SITE.initialDefectDays}日以内にご連絡ください。同じ商品と交換し、在庫がない場合は返金します。</p>`,
  },
  {
    id: 'warranty',
    title: '保証・メーカーサポート',
    body: html`
      <p>すべての商品にメーカー保証が付きます。保証は購入日から数え、マイページの納品書・領収書が購入の証明になります。</p>
      <p>型落ち・廃番の商品でも、メーカーサポート・修理・部品供給・バッテリー互換の状況を商品ごとに表示しています。サポートが終了予定のものは、その時期も明記しています。</p>`,
  },
  {
    id: 'payment',
    title: 'お支払い方法',
    body: html`<ul class="guide__list">${PAYMENT_METHODS.map((method) => html`<li><strong>${method.label}</strong>：${method.detail}。${method.note}</li>`)}</ul>`,
  },
  {
    id: 'price',
    title: '価格表示について',
    body: html`
      <p>表示価格はすべて税込です。割引率は、その商品自体のメーカー希望小売価格（メーカーがカタログで公表した価格を税込に換算したもの${SITE.pricing.showRateAgainstLaunchMsrp ? '。生産を終えた商品は発売時の価格' : '。現在も公表されている価格がある商品だけ'}）との比較です。自店の過去の価格や、後継機など別の商品の価格とは比べていません。</p>
      <p>TIME SALE は毎日 0:00〜23:59 に開催し、対象は毎日入れ替わります（同じ商品の次の登場は、早くても3日後）。週末限定SALEは毎週土日に、決まった商品を同じ価格で出しています。季節のSALEは、期間中だけ対象商品の価格が下がり、終了後は会員価格に戻ります。残りの数は実在庫を表示しています。</p>`,
  },
  {
    id: 'law',
    title: '特定商取引法に基づく表記',
    body: html`
      <dl class="info-list">
        <div><dt>販売事業者</dt><dd>${SITE.operator}</dd></div>
        <div><dt>運営責任者</dt><dd>【要差し替え：運営責任者名】</dd></div>
        <div><dt>所在地・電話番号</dt><dd>【要差し替え：所在地・電話番号】（本番公開時に記載します）</dd></div>
        <div><dt>お問い合わせ</dt><dd>会員サポート ${SITE.support.tel}（${SITE.support.hours}）</dd></div>
        <div><dt>販売価格・送料</dt><dd>各商品ページと本ページに記載</dd></div>
        <div><dt>引渡時期</dt><dd>ご注文確定（銀行振込は入金確認）後、通常1〜2日でお届け（北海道・沖縄は2〜3日）</dd></div>
        <div><dt>販売数量の制限</dt><dd>1契約で購入できる同一商品は、今回の放出分の累計で${SITE.orderLimit.default}点まで（数量限定品は${SITE.orderLimit.limited}点）です。まとめ買いは見積で承ります。</dd></div>
        <div><dt>返品・キャンセル</dt><dd>本ページ「返品・キャンセル・初期不良」をご覧ください（転売目的と判断したご注文の取り消しを含みます）</dd></div>
      </dl>`,
  },
];

export function render({ query }) {
  return {
    title: 'ご利用ガイド',
    view: html`
      ${Breadcrumb([{ label: 'ご利用ガイド' }])}
      <div class="container narrow guide">
        <header class="page-title">
          <p class="eyebrow">GUIDE</p>
          <h1 class="page-title__title">ご利用ガイド</h1>
        </header>
        <nav class="guide__toc" aria-label="目次">${SECTIONS.map((section) => html`<a class="quick__item" href="#/guide?s=${section.id}">${section.title}</a>`)}</nav>
        ${SECTIONS.map((section) => html`
          <section class="guide__section" id="guide-${section.id}" aria-labelledby="guide-${section.id}-title">
            <h2 id="guide-${section.id}-title">${section.title}</h2>
            ${section.body}
          </section>`)}
      </div>`,
    mount(root) {
      const target = query.get('s');
      if (target) document.getElementById(`guide-${target}`)?.scrollIntoView();
    },
  };
}
