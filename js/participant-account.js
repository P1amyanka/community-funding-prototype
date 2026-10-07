import { db } from './supabase.js';
import { app, esc, money } from './utils.js';
import { getActiveParticipantCommunity, syncParticipantNavigation } from './navigation.js';

const months = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

async function requireParticipant(active = 'my-collections') {
  const { data } = await db.auth.getSession();
  if (!data?.session) {
    location.hash = '#/login';
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

const frequencyLabel = value => value === 'monthly' ? 'Щомісяця' : 'Одноразово';

const periodLabel = item => {
  if (!item.period_type) return 'Період не вказано';
  if (item.period_type === 'month') return `${months[(item.month || 1) - 1]} ${item.year}`;
  if (item.period_type === 'half_year') return `${item.half_year === 2 ? 'II' : 'I'} півріччя ${item.year}`;
  if (item.period_type === 'year') return `${item.year} рік`;
  return 'Період не вказано';
};

export async function myCollections() {
  const session = await requireParticipant('my-collections');
  if (!session) return;
  const community = await getActiveParticipantCommunity();
  if (!community) return;

  const { data, error } = await db.rpc('get_my_participant_collections_v11_rpc');
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;

  const items = (data || []).filter(x => x.community_id === community.id);
  const cards = items.length ? items.map(c => `
    <article class="collection-card participant-collection-card">
      <div class="collection-card-head">
        <div><h3>${esc(c.name)}</h3></div>
        <span class="tag ok">${frequencyLabel(c.frequency)}</span>
      </div>
      <div class="personal-total"><strong>${money(c.personal_amount)}</strong><span>ви внесли</span></div>
      <p class="caption">${c.personal_contributions_count} внесків</p>
      <a class="initiative-open" href="#/me/collections/${esc(c.id)}">Відкрити →</a>
    </article>`).join('') : '<div class="privacy">У цій спільноті ще немає зборів.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Мої збори</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="account-section"><div class="collection-list">${cards}</div></section>`;
}

export async function myCollection(collectionId) {
  const session = await requireParticipant('my-collections');
  if (!session) return;

  const [{ data: rows, error }, { data: contributions, error: contributionsError }] = await Promise.all([
    db.rpc('get_my_participant_collection_v11_rpc', { p_collection_id: collectionId }),
    db.rpc('get_my_participant_contributions_v11_rpc', { p_collection_id: collectionId }),
  ]);
  if (error || contributionsError) {
    const msg = error?.message || contributionsError?.message;
    return app.innerHTML = `<section class="card"><div class="error">${esc(msg)}</div></section>`;
  }

  const item = rows?.[0];
  if (!item) return app.innerHTML = '<section class="card"><div class="error">Збір не знайдено.</div></section>';

  const history = (contributions || []).length ? contributions.map(c => `
    <article class="contribution-card participant-contribution-card">
      <div class="contribution-head">
        <strong class="contribution-amount">${money(c.amount)}</strong>
        <span class="collection-period">${esc(periodLabel(c))}</span>
      </div>
      ${c.note ? `<p class="contribution-note">${esc(c.note)}</p>` : ''}
    </article>`).join('') : '<div class="privacy">У вас ще немає внесків у цей збір.</div>';

  app.innerHTML = `<section class="hero collection-hero">
      <p class="eyebrow">${esc(item.community_name)}</p>
      <h1>${esc(item.name)}</h1>
      <span class="tag ok">${frequencyLabel(item.frequency)}</span>
    </section>
    <section class="simple-stats">
      <div class="simple-stats-primary"><strong>${money(item.personal_amount)}</strong><span>ви внесли</span></div>
      <div class="simple-stats-meta"><strong>${item.personal_contributions_count}</strong> внесків</div>
    </section>
    <section class="account-section"><h2>Мої внески</h2><div class="contribution-list">${history}</div></section>`;
}

export async function myStatistics() {
  const session = await requireParticipant('my-statistics');
  if (!session) return;
  const community = await getActiveParticipantCommunity();
  if (!community) return;

  const [{ data: totals, error }, { data: periods, error: periodsError }, { data: collections, error: collectionsError }] = await Promise.all([
    db.rpc('get_participant_community_stats_v12_rpc', { p_community_id: community.id }),
    db.rpc('get_participant_community_period_stats_v12_rpc', { p_community_id: community.id }),
    db.rpc('get_my_participant_collections_v11_rpc'),
  ]);
  if (error || periodsError || collectionsError) {
    const msg = error?.message || periodsError?.message || collectionsError?.message;
    return app.innerHTML = `<section class="card"><div class="error">${esc(msg)}</div></section>`;
  }

  const t = totals?.[0] || { total_amount:0, contributions_count:0, collections_count:0 };
  const scopedCollections = (collections || []).filter(c => c.community_id === community.id && Number(c.personal_contributions_count) > 0);
  const byCollections = scopedCollections.map(c => `
    <div class="stats-row"><div><strong>${esc(c.name)}</strong><span>${c.personal_contributions_count} внесків</span></div><strong>${money(c.personal_amount)}</strong></div>`).join('') || '<div class="privacy">Внесків ще немає.</div>';
  const byPeriods = (periods || []).map(p => `
    <div class="stats-row"><div><strong>${esc(periodLabel(p))}</strong><span>${p.contributions_count} внесків</span></div><strong>${money(p.total_amount)}</strong></div>`).join('') || '<div class="privacy">Періоди ще не вказані.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Статистика</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="simple-stats">
      <div class="simple-stats-primary"><strong>${money(t.total_amount)}</strong><span>всього внесено</span></div>
      <div class="simple-stats-meta"><strong>${t.contributions_count}</strong> внесків · <strong>${t.collections_count}</strong> зборів</div>
    </section>
    <section class="account-section"><h2>По зборах</h2><div class="stats-list">${byCollections}</div></section>
    <section class="account-section"><h2>По періодах</h2><div class="stats-list">${byPeriods}</div></section>`;
}
