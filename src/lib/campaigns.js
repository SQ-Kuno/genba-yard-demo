import { SEASONAL_CAMPAIGNS, EVERGREEN_CAMPAIGN, TIME_SALE, WEEKEND_SALE } from '../data/campaigns.js';

const atMonthDay = (year, monthDay, endOfDay = false) => {
  const [month, day] = monthDay.split('-').map(Number);
  return endOfDay ? new Date(year, month - 1, day, 23, 59, 59) : new Date(year, month - 1, day, 0, 0, 0);
};

// 今年・来年分の開催期間を並べて、現在開催中と次回を引けるようにする
function scheduleAround(now) {
  const year = now.getFullYear();
  return [year, year + 1].flatMap((y) =>
    SEASONAL_CAMPAIGNS.map((campaign) => ({
      ...campaign,
      startsAt: atMonthDay(y, campaign.start),
      endsAt: atMonthDay(y, campaign.end, true),
    })),
  );
}

export function getActiveSeasonal(now = new Date()) {
  return scheduleAround(now).find((campaign) => campaign.startsAt <= now && now <= campaign.endsAt) ?? null;
}

export function getNextSeasonal(now = new Date()) {
  return scheduleAround(now)
    .filter((campaign) => campaign.startsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)[0];
}

// トップの大型バナーに出すキャンペーン。季節キャンペーンが無ければ常設の会員価格訴求（期限なし）
export function getHeroCampaign(now = new Date()) {
  return getActiveSeasonal(now) ?? { ...EVERGREEN_CAMPAIGN, endsAt: null, items: {} };
}

export function campaignLead(campaign, { batteryName = null, answeredWithout = false } = {}) {
  if (!batteryName && answeredWithout && campaign.leadWithoutBattery) return campaign.leadWithoutBattery;
  return campaign.lead.replace('{battery}', batteryName ?? 'バッテリー');
}

export function getTimeSaleEnd(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
}

// 1970-01-01 からの日数（ローカル日付）。曜日ではなく日数で回すので、同じ商品が毎週同じ曜日に固定されない
const dayIndex = (now) => Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);

export const timeSaleProductIds = (now = new Date()) => TIME_SALE.rotation[dayIndex(now) % TIME_SALE.rotation.length];
export const weekendSaleProductIds = () => Object.keys(WEEKEND_SALE.items);
export const seasonalSaleProductIds = (now = new Date()) => Object.keys(getActiveSeasonal(now)?.items ?? {});

const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

// 開催中なら今の週末、平日なら次の土曜0:00〜日曜23:59:59
export function getWeekendWindow(now = new Date()) {
  const saturday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getDay() === 0) saturday.setDate(saturday.getDate() - 1);
  else saturday.setDate(saturday.getDate() + ((6 - now.getDay()) % 7));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59);
  return { startsAt: saturday, endsAt: sunday, isActive: isWeekend(now) };
}

// 商品に今かかっている期間限定価格（無ければ null）。重なったときは最も安い価格を採る
export function getActiveSale(productId, now = new Date()) {
  const candidates = [];
  if (timeSaleProductIds(now).includes(productId)) {
    candidates.push({ kind: 'timesale', label: 'TIME SALE', price: TIME_SALE.prices[productId], endsAt: getTimeSaleEnd(now) });
  }
  const weekend = getWeekendWindow(now);
  if (weekend.isActive && WEEKEND_SALE.items[productId]) {
    candidates.push({ kind: 'weekend', label: '週末限定', price: WEEKEND_SALE.items[productId], endsAt: weekend.endsAt });
  }
  const seasonal = getActiveSeasonal(now);
  if (seasonal?.items[productId]) {
    candidates.push({ kind: 'seasonal', label: seasonal.name, price: seasonal.items[productId], endsAt: seasonal.endsAt });
  }
  return candidates.sort((a, b) => a.price - b.price)[0] ?? null;
}
