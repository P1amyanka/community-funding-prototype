// Dues for collections with a fixed amount per member.
//
// One-off collection: each member owes `amount_per_member` once.
// Monthly collection: each member owes `amount_per_member` for every month of the
// school year (September of `school_year` .. May of the next year) that has started.
// Payments are treated as a balance: 1 500 грн at 500 грн/month covers
// September, October and November, whatever period a contribution was tagged with.

export const SCHOOL_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5];
const SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
const LONG_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const LONG = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];

export const schoolYearLabel = y => `${y}–${y + 1}`;

// The school year that is current (or next) for a date: Sep–Aug belongs to the year it starts in.
export const currentSchoolYear = (today = new Date()) => (today.getMonth() + 1 >= 9 ? today.getFullYear() : today.getFullYear() - 1);

export function schoolMonths(year) {
  return SCHOOL_MONTHS.map(m => ({ month: m, year: m >= 9 ? year : year + 1, short: SHORT[m - 1], long: LONG[m - 1] }));
}

// How many school-year months have started by `today` (0..9).
export function monthsElapsed(year, today = new Date()) {
  const idx = (today.getFullYear() - year) * 12 + (today.getMonth() + 1) - 9;
  return Math.max(0, Math.min(SCHOOL_MONTHS.length, idx + 1));
}

// A finished collection keeps its history but no longer asks anyone for money.
export const isClosed = c => c?.status === 'closed';

export const hasDues = c => c && !isClosed(c) && c.amount_per_member !== null && c.amount_per_member !== undefined && Number(c.amount_per_member) > 0
  && (c.frequency !== 'monthly' || Number.isInteger(Number(c.school_year)));

// Amount every member should have paid by `today`.
export function dueToDate(c, today = new Date()) {
  const amount = Number(c.amount_per_member);
  if (c.frequency === 'monthly') return amount * monthsElapsed(Number(c.school_year), today);
  return amount;
}

// Status of one member for a collection, given the total they have paid into it.
export function memberDues(c, paid, today = new Date()) {
  const amount = Number(c.amount_per_member);
  const due = dueToDate(c, today);
  const left = Math.max(0, Math.round((due - paid) * 100) / 100);
  if (c.frequency !== 'monthly') {
    return { due, paid, left, state: paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'none', covered: null, elapsed: null };
  }
  const months = schoolMonths(Number(c.school_year));
  const elapsed = monthsElapsed(Number(c.school_year), today);
  const covered = Math.min(months.length, Math.floor((paid + 0.001) / amount));
  const state = elapsed === 0 ? 'upcoming' : covered >= elapsed ? 'paid' : paid > 0 ? 'partial' : 'none';
  const paidUntil = covered > 0 ? months[covered - 1] : null;
  return { due, paid, left, state, covered, elapsed, months, paidUntil };
}

// "за вересень" / "за вересень–листопад"
export function coveredRange(d) {
  if (!d.covered) return '';
  const first = d.months[0].long;
  const last = d.months[d.covered - 1].long;
  return d.covered === 1 ? `за ${first}` : `за ${first}–${last}`;
}

// Secondary line for a member row (the amount owed is shown separately).
export function duesLine(d, c) {
  if (c.frequency !== 'monthly') {
    if (d.state === 'paid') return 'Здано';
    return d.state === 'partial' ? `Внесено ${fmt(d.paid)} з ${fmt(c.amount_per_member)}` : 'Ще не внесено';
  }
  if (d.state === 'upcoming') return `Збір почнеться у вересні ${c.school_year}`;
  if (d.state === 'paid') return d.covered >= d.months.length ? 'Сплачено за весь рік' : `Усе вчасно · сплачено ${coveredRange(d)}`;
  return d.covered ? `Сплачено ${coveredRange(d)}` : 'Ще нічого не сплачено';
}

const fmt = n => Math.round(Number(n || 0)).toLocaleString('uk-UA') + ' грн';
