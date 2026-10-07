import { db } from './supabase.js';
import { getActiveManagerCommunity, syncManagerNavigation } from './navigation.js';
import { app, date, esc, ferr, money } from './utils.js';

const months = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
let contributionMembers = [];
let selectedContributionMember = null;

async function requireSession(active = 'collections') {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    location.hash = '#/login';
    return null;
  }
  await syncManagerNavigation(active);
  return data.session;
}

const frequencyLabel = value => value === 'monthly' ? 'Щомісяця' : 'Одноразово';

const periodLabel = item => {
  if (!item.period_type) return '';
  if (item.period_type === 'month') return `${months[(item.month || 1) - 1]} ${item.year}`;
  if (item.period_type === 'half_year') return `${item.half_year === 2 ? 'II' : 'I'} півріччя ${item.year}`;
  if (item.period_type === 'year') return `${item.year} рік`;
  return '';
};

const createdLabel = value => {
  if (!value) return '';
  return new Intl.DateTimeFormat('uk-UA', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  }).format(new Date(value));
};

export async function collections() {
  const session = await requireSession('collections');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Збори</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">+ Створити спільноту</a></div></section>';
    return;
  }

  const { data, error } = await db.rpc('get_my_collections_v10_rpc');
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const rows = (data || []).filter(x => x.community_id === community.id);
  const cards = rows.length ? rows.map(c => `
    <article class="collection-card">
      <div class="collection-card-head">
        <div><h3>${esc(c.name)}</h3></div>
        <span class="tag ok">${frequencyLabel(c.frequency)}</span>
      </div>
      <div class="collection-summary">
        <span><strong>${money(c.total_amount)}</strong><small>зібрано</small></span>
        <span><strong>${c.contributors_count}</strong><small>учасників</small></span>
        <span><strong>${c.contributions_count}</strong><small>внесків</small></span>
      </div>
      <a class="initiative-open" href="#/collections/${esc(c.id)}">Відкрити →</a>
    </article>`).join('') : '<div class="privacy">У цій спільноті ще немає зборів.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Збори</h1><p class="lead">${esc(community.name)}</p></section>
    <div class="account-create"><a class="button" href="#/collections/new">+ Створити збір</a></div>
    <section class="account-section"><div class="collection-list">${cards}</div></section>`;
}

export async function newCollection() {
  const session = await requireSession('collections');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Новий збір</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">+ Створити спільноту</a></div></section>';
    return;
  }

  app.innerHTML = `<section class="hero account-hero"><h1>Новий збір</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="card">
      <input id="collectionCommunity" type="hidden" value="${esc(community.id)}">
      <label>Назва</label><input id="collectionName" placeholder="Наприклад: Екскурсія класу">
      <label>Регулярність</label>
      <select id="collectionFrequency">
        <option value="once" selected>Одноразово</option>
        <option value="monthly">Щомісяця</option>
      </select>
      <div class="buttons"><button id="createCollectionBtn" onclick="createCollection()">Створити збір</button></div>
      <div id="collectionError" class="error hidden"></div>
    </section>`;
}

export async function createCollection() {
  const communityId = document.getElementById('collectionCommunity')?.value || '';
  const name = document.getElementById('collectionName')?.value.trim() || '';
  const frequency = document.getElementById('collectionFrequency')?.value || 'once';
  const button = document.getElementById('createCollectionBtn');
  const errorBox = document.getElementById('collectionError');

  errorBox.classList.add('hidden');
  if (!communityId) return ferr(errorBox, 'Оберіть спільноту.');
  if (!name) return ferr(errorBox, 'Вкажіть назву збору.');
  localStorage.setItem('comfundy:lastCommunityId', communityId);

  button.disabled = true;
  button.textContent = 'Створюємо...';
  const { data, error } = await db.rpc('create_collection_v10_rpc', {
    p_community_id: communityId,
    p_name: name,
    p_frequency: frequency,
  });
  button.disabled = false;
  button.textContent = 'Створити збір';
  if (error) return ferr(errorBox, error.message);

  const id = data?.[0]?.id;
  location.hash = id ? `#/collections/${id}` : '#/collections';
}

export async function collection(collectionId) {
  const session = await requireSession('collections');
  if (!session) return;
  const activeCommunity = await getActiveManagerCommunity();

  const [{ data: collectionRows, error: collectionError }, { data: contributions, error: contributionsError }] = await Promise.all([
    db.rpc('get_collection_v10_rpc', { p_collection_id: collectionId }),
    db.rpc('get_collection_contributions_v10_rpc', { p_collection_id: collectionId }),
  ]);
  if (collectionError) return app.innerHTML = `<section class="card"><div class="error">${esc(collectionError.message)}</div></section>`;
  if (contributionsError) return app.innerHTML = `<section class="card"><div class="error">${esc(contributionsError.message)}</div></section>`;

  const item = collectionRows?.[0];
  if (!item) return app.innerHTML = '<section class="card"><div class="error">Збір не знайдено.</div></section>';
  if (activeCommunity && item.community_id !== activeCommunity.id) {
    return app.innerHTML = '<section class="card"><div class="privacy">Цей збір належить іншій спільноті. Перемкніть активну спільноту в меню.</div></section>';
  }

  const history = (contributions || []).length ? contributions.map(c => `
    <article class="contribution-card">
      <div class="contribution-head">
        <div><h3>${esc(c.member_name)}</h3><strong class="contribution-amount">${money(c.amount)}</strong></div>
        ${periodLabel(c) ? `<span class="collection-period">${esc(periodLabel(c))}</span>` : ''}
      </div>
      ${c.note ? `<p class="contribution-note">${esc(c.note)}</p>` : ''}
      <div class="contribution-created">${createdLabel(c.created_at)}</div>
    </article>`).join('') : '<div class="privacy">Внесків ще немає.</div>';

  app.innerHTML = `<section class="hero collection-hero">
      <p class="eyebrow">${esc(item.community_name)}</p>
      <h1>${esc(item.name)}</h1>
      <span class="tag ok">${frequencyLabel(item.frequency)}</span>
    </section>
    <div class="account-create"><button onclick="openContributionDrawer('${esc(item.id)}','${esc(item.community_id)}')">+ Додати внесок</button></div>
    <section class="simple-stats" aria-label="Статистика збору">
      <div class="simple-stats-primary"><strong>${money(item.total_amount)}</strong><span>зібрано</span></div>
      <div class="simple-stats-meta"><strong>${item.contributors_count}</strong> учасників · <strong>${item.contributions_count}</strong> внесків</div>
    </section>
    <section class="account-section"><h2>Історія внесків</h2><div class="contribution-list">${history}</div></section>`;
}

export async function openContributionDrawer(collectionId, communityId) {
  selectedContributionMember = null;
  const { data, error } = await db.rpc('get_my_members_v06_rpc', { p_community_id: communityId });
  if (error) return alert(error.message);
  contributionMembers = (data || []).filter(x => x.status === 'active');

  const overlay = document.createElement('div');
  overlay.id = 'contributionDrawer';
  overlay.className = 'drawer-overlay contribution-overlay';
  overlay.innerHTML = `
    <button class="drawer-backdrop" aria-label="Закрити" onclick="closeContributionDrawer()"></button>
    <aside class="comment-drawer contribution-drawer" role="dialog" aria-modal="true" aria-labelledby="contributionDrawerTitle">
      <div class="drawer-head"><div><h2 id="contributionDrawerTitle">Додати внесок</h2><p class="caption">Учасник і сума — обов’язкові.</p></div><button class="drawer-close" aria-label="Закрити" onclick="closeContributionDrawer()">×</button></div>
      <div class="contribution-form">
        <label>Учасник</label>
        <div class="autosuggest">
          <input id="contributionMemberSearch" autocomplete="off" placeholder="Почніть вводити імʼя" oninput="filterContributionMembers()">
          <input id="contributionMemberId" type="hidden">
          <div id="contributionMemberOptions" class="autosuggest-options hidden"></div>
        </div>
        <label>Сума</label><input id="contributionAmount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Наприклад: 500">
        <label>За який період <span class="muted">необовʼязково</span></label>
        <select id="contributionPeriod" onchange="updateContributionPeriodFields()">
          <option value="">Не вказано</option>
          <option value="month">Місяць</option>
          <option value="half_year">Пів року</option>
          <option value="year">Рік</option>
        </select>
        <div id="contributionPeriodFields"></div>
        <label>Примітка <span class="muted">необовʼязково</span></label>
        <textarea id="contributionNote" placeholder="Наприклад: оплата готівкою"></textarea>
        <div class="buttons"><button id="saveContributionBtn" onclick="saveContribution('${esc(collectionId)}')">Додати внесок</button></div>
        <div id="contributionError" class="error hidden"></div>
      </div>
    </aside>`;
  document.body.appendChild(overlay);
  document.getElementById('contributionMemberSearch')?.focus();
}

export function closeContributionDrawer() {
  document.getElementById('contributionDrawer')?.remove();
}

export function filterContributionMembers() {
  const input = document.getElementById('contributionMemberSearch');
  const box = document.getElementById('contributionMemberOptions');
  const hidden = document.getElementById('contributionMemberId');
  if (!input || !box || !hidden) return;

  selectedContributionMember = null;
  hidden.value = '';
  const q = input.value.trim().toLocaleLowerCase('uk-UA');
  if (!q) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const matches = contributionMembers.filter(m => [m.full_name, m.email || ''].join(' ').toLocaleLowerCase('uk-UA').includes(q)).slice(0,8);
  box.innerHTML = matches.length
    ? matches.map(m => `<button type="button" class="autosuggest-option" onclick="selectContributionMember('${esc(m.id)}')"><strong>${esc(m.full_name)}</strong>${m.email ? `<span>${esc(m.email)}</span>` : ''}</button>`).join('')
    : '<div class="autosuggest-empty">Нічого не знайдено</div>';
  box.classList.remove('hidden');
}

export function selectContributionMember(memberId) {
  const member = contributionMembers.find(m => m.id === memberId);
  if (!member) return;
  selectedContributionMember = member;
  document.getElementById('contributionMemberId').value = member.id;
  document.getElementById('contributionMemberSearch').value = member.full_name;
  document.getElementById('contributionMemberOptions').classList.add('hidden');
}

export function updateContributionPeriodFields() {
  const type = document.getElementById('contributionPeriod')?.value || '';
  const box = document.getElementById('contributionPeriodFields');
  if (!box) return;
  const currentYear = new Date().getFullYear();

  if (!type) return box.innerHTML = '';
  if (type === 'month') {
    box.innerHTML = `<label>Місяць</label><select id="contributionMonth">${months.map((m,i) => `<option value="${i+1}" ${i === new Date().getMonth() ? 'selected' : ''}>${m}</option>`).join('')}</select>
      <label>Рік</label><input id="contributionYear" type="number" min="2000" max="2100" value="${currentYear}">`;
    return;
  }
  if (type === 'half_year') {
    box.innerHTML = `<label>Півріччя</label><select id="contributionHalfYear"><option value="1">I півріччя</option><option value="2">II півріччя</option></select>
      <label>Рік</label><input id="contributionYear" type="number" min="2000" max="2100" value="${currentYear}">`;
    return;
  }
  box.innerHTML = `<label>Рік</label><input id="contributionYear" type="number" min="2000" max="2100" value="${currentYear}">`;
}

export async function saveContribution(collectionId) {
  const memberId = document.getElementById('contributionMemberId')?.value || '';
  const amount = Number(document.getElementById('contributionAmount')?.value || 0);
  const periodType = document.getElementById('contributionPeriod')?.value || '';
  const month = document.getElementById('contributionMonth')?.value;
  const halfYear = document.getElementById('contributionHalfYear')?.value;
  const year = document.getElementById('contributionYear')?.value;
  const note = document.getElementById('contributionNote')?.value.trim() || '';
  const button = document.getElementById('saveContributionBtn');
  const errorBox = document.getElementById('contributionError');

  errorBox.classList.add('hidden');
  if (!memberId) return ferr(errorBox, 'Оберіть учасника зі списку.');
  if (!Number.isFinite(amount) || amount <= 0) return ferr(errorBox, 'Сума має бути більшою за 0.');

  button.disabled = true;
  button.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('create_collection_contribution_v10_rpc', {
    p_collection_id: collectionId,
    p_member_id: memberId,
    p_amount: amount,
    p_period_type: periodType || null,
    p_month: periodType === 'month' ? Number(month) : null,
    p_half_year: periodType === 'half_year' ? Number(halfYear) : null,
    p_year: periodType ? Number(year) : null,
    p_note: note || null,
  });
  button.disabled = false;
  button.textContent = 'Додати внесок';
  if (error) return ferr(errorBox, error.message);

  closeContributionDrawer();
  collection(collectionId);
}

export async function statistics() {
  const session = await requireSession('statistics');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Статистика</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div></section>';
    return;
  }

  const [{ data: totals, error: totalsError }, { data: members, error: membersError }, { data: collectionsData, error: collectionsError }] = await Promise.all([
    db.rpc('get_manager_community_stats_v12_rpc', { p_community_id: community.id }),
    db.rpc('get_manager_community_member_stats_v12_rpc', { p_community_id: community.id }),
    db.rpc('get_my_collections_v10_rpc'),
  ]);
  if (totalsError || membersError || collectionsError) {
    const msg = totalsError?.message || membersError?.message || collectionsError?.message || 'Не вдалося завантажити статистику.';
    return app.innerHTML = `<section class="card"><div class="error">${esc(msg)}</div></section>`;
  }

  const t = totals?.[0] || { total_amount:0, contributions_count:0, contributors_count:0, collections_count:0 };
  const scopedCollections = (collectionsData || []).filter(x => x.community_id === community.id);
  const byCollections = scopedCollections.length ? scopedCollections.map(c => `
    <div class="stats-row"><div><strong>${esc(c.name)}</strong></div><strong>${money(c.total_amount)}</strong></div>`).join('') : '<div class="privacy">Зборів ще немає.</div>';
  const byMembers = (members || []).length ? members.map(m => `
    <div class="stats-row"><div><strong>${esc(m.member_name)}</strong><span>${m.contributions_count} внесків</span></div><strong>${money(m.total_amount)}</strong></div>`).join('') : '<div class="privacy">Внесків ще немає.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Статистика</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="collection-stats statistics-overview">
      <div><strong>${money(t.total_amount)}</strong><span>всього внесено</span></div>
      <div><strong>${t.contributors_count}</strong><span>учасників</span></div>
      <div><strong>${t.contributions_count}</strong><span>внесків</span></div>
      <div><strong>${t.collections_count}</strong><span>зборів</span></div>
    </section>
    <section class="account-section"><h2>По зборах</h2><div class="stats-list">${byCollections}</div></section>
    <section class="account-section"><h2>По учасниках</h2><div class="stats-list">${byMembers}</div></section>`;
}
