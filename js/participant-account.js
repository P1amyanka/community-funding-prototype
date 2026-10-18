import { db } from './supabase.js';
import { app, count, esc, money, plural, redirect, W } from './utils.js';
import { getActiveParticipantCommunity, syncParticipantNavigation } from './navigation.js';
import { coveredRange, hasDues, isClosed, memberDues, schoolYearLabel } from './dues.js';
import { amountOne, collectionStatusTag, duesTiles, monthDots, splitBar } from './dues-ui.js';

const months = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

export async function requireParticipant(active = 'my-collections') {
  const { data } = await db.auth.getSession();
  if (!data?.session) {
    redirect('#/login');
    return null;
  }
  await db.rpc('claim_my_memberships_v11_rpc');
  const { data: roles, error } = await db.rpc('get_my_account_roles_v11_rpc');
  if (error) {
    app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
    return null;
  }
  const role = roles?.[0];
  if (!role?.is_participant) {
    app.innerHTML = '<section class="card"><div class="privacy">Для цього email не знайдено активного профілю учасника.</div></section>';
    return null;
  }
  await syncParticipantNavigation(active, role);
  return data.session;
}


const periodLabel = item => {
  if (!item.period_type) return 'Період не вказано';
  if (item.period_type === 'month') return `${months[(item.month || 1) - 1]} ${item.year}`;
  if (item.period_type === 'half_year') return `${item.half_year === 2 ? 'II' : 'I'} півріччя ${item.year}`;
  if (item.period_type === 'year') return `${item.year} рік`;
  return 'Період не вказано';
};

const collectionTag = c => c.frequency === 'monthly'
  ? `Щомісяця${c.school_year ? ` · ${schoolYearLabel(Number(c.school_year))}` : ''}`
  : 'Одноразово';

const isUrl = value => /^https?:\/\//i.test(String(value || '').trim());

function paymentBlock(value) {
  if (!value) return '';
  const safe = esc(value);
  return isUrl(value)
    ? `<a class="button pay-button" href="${safe}" target="_blank" rel="noopener noreferrer">Перейти до оплати</a>`
    : `<p class="caption" style="margin:12px 0 4px">Реквізити для оплати</p><div class="link-box"><input id="paymentValue" readonly value="${safe}"><button onclick="copyPaymentValue()">Копіювати</button></div>`;
}

function duesHeadline(c, d) {
  if (d.state === 'upcoming') return { big: money(0), small: `збір почнеться у вересні ${c.school_year}`, cls: '' };
  if (d.left > 0) return { big: money(d.left), small: 'залишилось сплатити', cls: 'debt' };
  const small = c.frequency !== 'monthly' ? 'дякуємо!' : d.covered >= d.months.length ? 'за весь навчальний рік' : `${coveredRange(d)} — дякуємо!`;
  return { big: 'Усе сплачено', small, cls: 'ok' };
}

function monthStrip(d) {
  return `<div class="month-strip">${d.months.map((mo, i) => {
    const cls = i < d.covered ? 'paid' : i < d.elapsed ? 'owed' : 'future';
    return `<div class="month-chip ${cls}${i === d.elapsed - 1 ? ' current' : ''}"><span>${mo.short}</span><b>${cls === 'paid' ? '✓' : cls === 'owed' ? '•' : ''}</b></div>`;
  }).join('')}</div>`;
}

export async function myCollections() {
  const session = await requireParticipant('my-collections');
  if (!session) return;
  const community = await getActiveParticipantCommunity();
  if (!community) return;

  const { data, error } = await db.rpc('get_my_participant_collections_v16_rpc');
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;

  const items = (data || []).filter(x => x.community_id === community.id)
    .sort((a, b) => isClosed(a) - isClosed(b));
  const cards = items.length ? items.map(c => {
    let body;
    if (hasDues(c)) {
      const d = memberDues(c, Number(c.personal_amount));
      const h = duesHeadline(c, d);
      body = `<div class="personal-total ${h.cls}"><strong>${h.big}</strong><span>${esc(h.small)}</span></div>
        <p class="caption">Ви внесли ${money(c.personal_amount)} · ${money(c.amount_per_member)}${c.frequency === 'monthly' ? ' на місяць' : ''}</p>`;
    } else {
      body = `<div class="personal-total"><strong>${money(c.personal_amount)}</strong><span>ви внесли</span></div>
        <p class="caption">${count(c.personal_contributions_count, W.contributions)}</p>`;
    }
    return `<article class="collection-card participant-collection-card">
      <div class="collection-card-head">
        <div><h3>${esc(c.name)}</h3></div>
        ${collectionStatusTag(c, collectionTag(c))}
      </div>
      ${body}
      <a class="initiative-open" href="#/me/collections/${esc(c.id)}">Відкрити →</a>
    </article>`;
  }).join('') : '<div class="privacy">У цій спільноті ще немає зборів.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Мої збори</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="account-section"><div class="collection-list">${cards}</div></section>`;
}

export async function myCollection(collectionId) {
  const session = await requireParticipant('my-collections');
  if (!session) return;
  const activeCommunity = await getActiveParticipantCommunity();

  const [{ data: rows, error }, { data: contributions, error: contributionsError }] = await Promise.all([
    db.rpc('get_my_participant_collection_v16_rpc', { p_collection_id: collectionId }),
    db.rpc('get_my_participant_contributions_v11_rpc', { p_collection_id: collectionId }),
  ]);
  if (error || contributionsError) {
    const msg = error?.message || contributionsError?.message;
    return app.innerHTML = `<section class="card"><div class="error">${esc(msg)}</div></section>`;
  }

  const item = rows?.[0];
  if (!item) return app.innerHTML = '<section class="card"><div class="error">Збір не знайдено.</div></section>';
  if (activeCommunity && item.community_id !== activeCommunity.id) {
    return app.innerHTML = '<section class="card"><div class="privacy">Цей збір належить іншій спільноті. Перемкніть активну спільноту в меню.</div></section>';
  }

  const history = (contributions || []).length ? contributions.map(c => `
    <article class="list-row contribution-row">
      <div class="list-row-main"><strong>${esc(periodLabel(c))}</strong>${c.note ? `<small class="row-note">${esc(c.note)}</small>` : ''}</div>
      <div class="list-row-side"><strong class="row-amount">${money(c.amount)}</strong></div>
    </article>`).join('') : '<div class="privacy">У вас ще немає внесків у цей збір.</div>';

  let status;
  if (hasDues(item)) {
    const d = memberDues(item, Number(item.personal_amount));
    const h = duesHeadline(item, d);
    status = `<section class="card dues-card">
        <div class="personal-total ${h.cls}"><strong>${h.big}</strong><span>${esc(h.small)}</span></div>
        <p class="caption">Ви внесли ${money(item.personal_amount)} · ${money(item.amount_per_member)} з учасника${item.frequency === 'monthly' ? ' на місяць' : ''}</p>
        ${item.frequency === 'monthly' ? monthStrip(d) : ''}
        ${d.left > 0 || d.state === 'upcoming' ? paymentBlock(item.payment_details) : ''}
        ${d.left > 0 ? '<p class="field-note">Після оплати менеджер позначить ваш внесок — він зʼявиться нижче.</p>' : ''}
      </section>`;
  } else {
    status = `<section class="simple-stats">
        <div class="simple-stats-primary"><strong>${money(item.personal_amount)}</strong><span>ви внесли</span></div>
        <div class="simple-stats-meta"><strong>${item.personal_contributions_count}</strong> ${plural(item.personal_contributions_count, ...W.contributions)}</div>
      </section>${isClosed(item)
        ? '<p class="caption closed-note">Збір завершено — більше нічого вносити не потрібно.</p>'
        : item.payment_details ? `<section class="card compact">${paymentBlock(item.payment_details)}</section>` : ''}`;
  }

  app.innerHTML = `<a class="page-back" href="#/me/collections" aria-label="Повернутися до моїх зборів">← Мої збори</a>
    <section class="hero collection-hero">
      <p class="eyebrow">${esc(item.community_name)}</p>
      <h1>${esc(item.name)}</h1>
      ${collectionStatusTag(item, collectionTag(item))}
    </section>
    ${status}
    <section class="account-section"><h2>Мої внески</h2><div class="list-rows">${history}</div></section>`;
}

const announcementDate = value => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' }).format(new Date(value));
const RECENT_DAYS = 14;

export async function myHome() {
  const session = await requireParticipant('my-home');
  if (!session) return;
  const community = await getActiveParticipantCommunity();
  if (!community) return;

  const [{ data: cols, error: e1 }, { data: inits, error: e2 }, { data: ann, error: e3 }] = await Promise.all([
    db.rpc('get_my_participant_collections_v16_rpc'),
    db.rpc('get_my_initiatives_v15_rpc', { p_community_id: community.id }),
    db.rpc('get_participant_announcements_v12_rpc', { p_community_id: community.id }),
  ]);
  const err = e1 || e2 || e3;
  if (err) return app.innerHTML = `<section class="card"><div class="error">${esc(err.message)}</div></section>`;


  const toPay = (cols || []).filter(c => c.community_id === community.id && hasDues(c))
    .map(c => ({ c, d: memberDues(c, Number(c.personal_amount)) }))
    .filter(x => x.d.left > 0)
    .sort((a, b) => b.d.left - a.d.left);
  const toAnswer = (inits || []).filter(i => i.status === 'open' && (i.own_max_amount === null || i.own_max_amount === undefined));
  const cutoff = Date.now() - RECENT_DAYS * 864e5;
  const fresh = (ann || []).filter(a => new Date(a.created_at).getTime() >= cutoff).slice(0, 3);
  const latest = fresh.length ? fresh : (ann || []).slice(0, 1);

  const annBlock = `<section class="account-section"><div class="section-head-row"><h2>Оголошення</h2>${(ann || []).length ? '<a class="collection-settings-link" href="#/me/announcements">Усі →</a>' : ''}</div>
      ${latest.length ? `<div class="announcement-list">${latest.map(a => `<article class="announcement-card compact-announcement">
        <h3>${esc(a.title)}</h3><p>${esc(a.body)}</p><div class="announcement-date">${announcementDate(a.created_at)}</div></article>`).join('')}</div>` : '<div class="privacy">Оголошень ще немає.</div>'}</section>`;

  const payBlock = `<section class="account-section"><div class="section-head-row"><h2>Збори</h2><a class="collection-settings-link" href="#/me/collections">Усі →</a></div>
      ${toPay.length ? `<div class="list-rows">${toPay.map(({ c, d }) => `
      <a class="list-row list-row-link" href="#/me/collections/${esc(c.id)}">
        <span class="list-row-main"><strong>${esc(c.name)}</strong>${c.frequency === 'monthly' ? monthDots(d) : splitBar(d.paid, d.left)}</span>
        <span class="list-row-side"><strong class="amt debt">${money(d.left)}</strong><svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span>
      </a>`).join('')}</div>` : '<div class="privacy home-ok">Усе сплачено.</div>'}</section>`;

  const answerBlock = toAnswer.length ? `<section class="account-section"><div class="section-head-row"><h2>Ініціативи</h2><a class="collection-settings-link" href="#/me/initiatives">Усі →</a></div><div class="list-rows">${toAnswer.map(i => `
      <a class="list-row list-row-link" href="#/me/initiatives/${esc(i.id)}">
        <span class="list-row-main"><strong>${esc(i.title)}</strong>${i.deadline ? `<small>до ${announcementDate(i.deadline)}</small>` : ''}</span>
        <span class="list-row-side"><svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span>
      </a>`).join('')}</div></section>` : '';

  app.innerHTML = `<section class="hero account-hero"><h1>Головна</h1><p class="lead">${esc(community.name)}</p></section>
    ${annBlock}${payBlock}${answerBlock}`;
}

export async function myStatistics() {
  const session = await requireParticipant('my-statistics');
  if (!session) return;
  const community = await getActiveParticipantCommunity();
  if (!community) return;

  const { data, error } = await db.rpc('get_my_participant_collections_v16_rpc');
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;

  const items = (data || []).filter(c => c.community_id === community.id)
    .sort((a, b) => isClosed(a) - isClosed(b)).map(c => {
    const paid = Number(c.personal_amount);
    const d = hasDues(c) ? memberDues(c, paid) : null;
    return { c, paid, d, left: d ? d.left : 0 };
  });
  const paid = items.reduce((s, x) => s + x.paid, 0);
  const left = items.reduce((s, x) => s + x.left, 0);

  const rows = items.map(({ c, paid, d, left }) => {
    const visual = d ? (c.frequency === 'monthly' ? monthDots(d) : splitBar(paid, left)) : '';
    return `<a class="list-row list-row-link" href="#/me/collections/${esc(c.id)}">
      <span class="list-row-main"><strong>${esc(c.name)}</strong>${visual}</span>
      <span class="list-row-side">${amountOne(paid, left)}<svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span></a>`;
  }).join('') || '<div class="privacy">У цій спільноті ще немає зборів.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Статистика</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="card dues-card">${duesTiles(paid, left)}</section>
    <section class="account-section"><h2>Мої збори</h2><div class="list-rows">${rows}</div></section>`;
}
