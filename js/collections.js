import { db } from './supabase.js';
import { getActiveManagerCommunity, syncManagerNavigation } from './navigation.js';
import { app, esc, ferr, money, plural, redirect, W } from './utils.js';
import { state } from './state.js';
import { amountOne, collectionStatusTag, duesTiles, monthDots, splitBar } from './dues-ui.js';
import { currentSchoolYear, dueToDate, duesLine, hasDues, isClosed, memberDues, monthsElapsed, schoolMonths, schoolYearLabel } from './dues.js';

const months = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
let contributionMembers = [];
let selectedContributionMember = null;

async function requireSession(active = 'collections') {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    redirect('#/login');
    return null;
  }
  await syncManagerNavigation(active);
  return data.session;
}


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

const collectionTag = c => c.frequency === 'monthly'
  ? `Щомісяця${c.school_year ? ` · ${schoolYearLabel(Number(c.school_year))}` : ''}`
  : 'Одноразово';

const amountLine = c => hasDues(c)
  ? `${money(c.amount_per_member)} з учасника${c.frequency === 'monthly' ? ' на місяць' : ''}`
  : '';

function progressBlock(collected, expected) {
  const pct = expected > 0 ? Math.min(100, Math.round(collected / expected * 100)) : 0;
  return `<div class="dues-progress"><div class="dues-progress-bar"><span style="width:${pct}%"></span></div>
    <div class="dues-progress-caption"><strong>${money(collected)}</strong> з ${money(expected)} на сьогодні</div></div>`;
}

export async function collections() {
  const session = await requireSession('collections');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Збори</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">Створити спільноту</a></div></section>';
    return;
  }

  const { data, error } = await db.rpc('get_my_collections_v16_rpc');
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const rows = (data || []).filter(x => x.community_id === community.id);
  const card = c => {
    const body = hasDues(c)
      ? `<p class="caption collection-amount-line">${amountLine(c)}</p>${progressBlock(Number(c.total_amount), dueToDate(c) * Number(c.active_members_count || 0))}`
      : `<div class="collection-summary">
          <span><strong>${money(c.total_amount)}</strong><small>зібрано</small></span>
          <span><strong>${c.contributors_count}</strong><small>${plural(c.contributors_count, ...W.members)}</small></span>
          <span><strong>${c.contributions_count}</strong><small>${plural(c.contributions_count, ...W.contributions)}</small></span>
        </div>`;
    return `<article class="collection-card">
      <div class="collection-card-head">
        <div><h3>${esc(c.name)}</h3></div>
        ${collectionStatusTag(c, collectionTag(c))}
      </div>
      ${body}
      <a class="initiative-open" href="#/collections/${esc(c.id)}">Відкрити →</a>
    </article>`;
  };
  const active = rows.filter(c => !isClosed(c));
  const finished = rows.filter(isClosed);
  const cards = active.length ? active.map(card).join('')
    : `<div class="privacy">${finished.length ? 'Активних зборів немає.' : 'У цій спільноті ще немає зборів.'}</div>`;

  app.innerHTML = `<section class="hero account-hero tab-hero"><h1>Збори</h1><p class="lead">${esc(community.name)}</p></section>
    <div class="account-create create-main"><a class="button" href="#/collections/new">Створити збір</a></div>
    <section class="account-section"><div class="collection-list">${cards}</div></section>
    ${finished.length ? `<section class="account-section"><h2>Завершені</h2><div class="collection-list finished-list">${finished.map(card).join('')}</div></section>` : ''}`;
}

function collectionForm(c = null) {
  const year = currentSchoolYear();
  const years = [year - 1, year, year + 1];
  const selectedYear = c?.school_year ? Number(c.school_year) : year;
  const monthly = (c?.frequency || 'once') === 'monthly';
  return `
      <label>Назва</label><input id="collectionName" value="${esc(c?.name || '')}" placeholder="Наприклад: Фонд класу">
      <label>Регулярність</label>
      <select id="collectionFrequency" onchange="toggleCollectionFields()">
        <option value="once" ${monthly ? '' : 'selected'}>Одноразово</option>
        <option value="monthly" ${monthly ? 'selected' : ''}>Щомісяця протягом навчального року</option>
      </select>
      <div id="schoolYearField" class="${monthly ? '' : 'hidden'}">
        <label>Навчальний рік</label>
        <select id="collectionSchoolYear">${years.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${schoolYearLabel(y)} (вересень–травень)</option>`).join('')}</select>
      </div>
      <label><span id="amountLabel">${monthly ? 'Сума з учасника на місяць, грн' : 'Сума з учасника, грн'}</span> <span class="muted">необовʼязково</span></label>
      <input id="collectionAmount" type="number" min="1" step="1" inputmode="decimal" value="${c?.amount_per_member ?? ''}" placeholder="Наприклад: 500">
      <p class="field-note">Якщо вказати суму, Comfundy покаже, хто скільки має внести і хто ще не здав.</p>
      <label>Реквізити для оплати <span class="muted">необовʼязково</span></label>
      <input id="collectionPayment" type="text" value="${esc(c?.payment_details || '')}" placeholder="Посилання на банку або номер картки">
      <p class="field-note">Учасники побачать їх у своєму кабінеті.</p>`;
}

export function toggleCollectionFields() {
  const monthly = document.getElementById('collectionFrequency')?.value === 'monthly';
  document.getElementById('schoolYearField')?.classList.toggle('hidden', !monthly);
  const label = document.getElementById('amountLabel');
  if (label) label.textContent = monthly ? 'Сума з учасника на місяць, грн' : 'Сума з учасника, грн';
}

function readCollectionForm(errorBox) {
  const name = document.getElementById('collectionName')?.value.trim() || '';
  const frequency = document.getElementById('collectionFrequency')?.value || 'once';
  const amountRaw = document.getElementById('collectionAmount')?.value.trim() || '';
  const amount = amountRaw === '' ? null : Number(amountRaw);
  const schoolYear = frequency === 'monthly' ? Number(document.getElementById('collectionSchoolYear')?.value) : null;
  const payment = document.getElementById('collectionPayment')?.value.trim() || '';
  if (!name) { ferr(errorBox, 'Вкажіть назву збору.'); return null; }
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) { ferr(errorBox, 'Сума має бути більшою за 0.'); return null; }
  return { name, frequency, amount, schoolYear, payment };
}

export async function newCollection() {
  const session = await requireSession('collections');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Новий збір</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">Створити спільноту</a></div></section>';
    return;
  }

  app.innerHTML = `<a class="page-back" href="#/collections">← Збори</a>
    <section class="hero account-hero"><h1>Новий збір</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="card">
      <input id="collectionCommunity" type="hidden" value="${esc(community.id)}">
      ${collectionForm()}
      <div class="buttons"><button id="createCollectionBtn" onclick="createCollection()">Створити збір</button></div>
      <div id="collectionError" class="error hidden"></div>
    </section>`;
}

export async function createCollection() {
  const communityId = document.getElementById('collectionCommunity')?.value || '';
  const button = document.getElementById('createCollectionBtn');
  const errorBox = document.getElementById('collectionError');
  errorBox.classList.add('hidden');
  if (!communityId) return ferr(errorBox, 'Оберіть спільноту.');
  const f = readCollectionForm(errorBox);
  if (!f) return;

  button.disabled = true;
  button.textContent = 'Створюємо...';
  const { data, error } = await db.rpc('create_collection_v16_rpc', {
    p_community_id: communityId,
    p_name: f.name,
    p_frequency: f.frequency,
    p_amount_per_member: f.amount,
    p_school_year: f.schoolYear,
    p_payment_details: f.payment || null,
  });
  button.disabled = false;
  button.textContent = 'Створити збір';
  if (error) return ferr(errorBox, error.message);

  const id = data?.[0]?.id;
  redirect(id ? `#/collections/${id}` : '#/collections');
}

export async function editCollection(collectionId) {
  const session = await requireSession('collections');
  if (!session) return;
  const { data, error } = await db.rpc('get_collection_v16_rpc', { p_collection_id: collectionId });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const c = data?.[0];
  if (!c) return app.innerHTML = '<section class="card"><div class="error">Збір не знайдено.</div></section>';

  app.innerHTML = `<a class="page-back" href="#/collections/${esc(c.id)}">← ${esc(c.name)}</a>
    <section class="hero account-hero"><h1>Налаштування збору</h1><p class="lead">${esc(c.community_name)}</p></section>
    <section class="card">
      <input id="collectionId" type="hidden" value="${esc(c.id)}">
      ${collectionForm(c)}
      <div class="buttons"><button id="saveCollectionBtn" onclick="saveCollection()">Зберегти</button></div>
      <div id="collectionError" class="error hidden"></div>
    </section>
    ${collectionStateCard(c)}`;
}

function collectionStateCard(c) {
  const closed = isClosed(c);
  const toggle = closed
    ? `<button id="collectionStatusBtn" class="secondary" onclick="setCollectionStatus('${esc(c.id)}','active')">Відновити збір</button>`
    : `<button id="collectionStatusBtn" class="secondary" onclick="setCollectionStatus('${esc(c.id)}','closed')">Завершити збір</button>`;
  const remove = Number(c.contributions_count) > 0 ? ''
    : `<button id="deleteCollectionBtn" class="secondary contribution-delete" onclick="deleteCollection('${esc(c.id)}')">Видалити збір</button>`;
  return `<section class="card compact"><div class="buttons stacked-buttons">${toggle}${remove}</div>
      <div id="collectionStateError" class="error hidden"></div></section>`;
}

export async function setCollectionStatus(collectionId, status) {
  const closing = status === 'closed';
  if (closing && !confirm('Завершити збір? Учасники більше не бачитимуть боргу, нові внески не додаватимуться. Історія і статистика збережуться, збір можна буде відновити.')) return;
  const button = document.getElementById('collectionStatusBtn');
  const errorBox = document.getElementById('collectionStateError');
  if (button) { button.disabled = true; button.textContent = 'Зберігаємо...'; }
  const { error } = await db.rpc('set_collection_status_v18_rpc', { p_collection_id: collectionId, p_status: status });
  if (error) {
    if (button) { button.disabled = false; button.textContent = closing ? 'Завершити збір' : 'Відновити збір'; }
    return ferr(errorBox, error.message);
  }
  redirect(`#/collections/${collectionId}`);
}

export async function deleteCollection(collectionId) {
  if (!confirm('Видалити збір? Це не можна скасувати.')) return;
  const button = document.getElementById('deleteCollectionBtn');
  const errorBox = document.getElementById('collectionStateError');
  if (button) { button.disabled = true; button.textContent = 'Видаляємо...'; }
  const { error } = await db.rpc('delete_collection_v18_rpc', { p_collection_id: collectionId });
  if (error) {
    if (button) { button.disabled = false; button.textContent = 'Видалити збір'; }
    return ferr(errorBox, error.message);
  }
  redirect('#/collections');
}

export async function saveCollection() {
  const collectionId = document.getElementById('collectionId')?.value || '';
  const button = document.getElementById('saveCollectionBtn');
  const errorBox = document.getElementById('collectionError');
  errorBox.classList.add('hidden');
  const f = readCollectionForm(errorBox);
  if (!f) return;

  button.disabled = true;
  button.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('update_collection_v16_rpc', {
    p_collection_id: collectionId,
    p_name: f.name,
    p_frequency: f.frequency,
    p_amount_per_member: f.amount,
    p_school_year: f.schoolYear,
    p_payment_details: f.payment || null,
  });
  button.disabled = false;
  button.textContent = 'Зберегти';
  if (error) return ferr(errorBox, error.message);
  redirect(`#/collections/${collectionId}`);
}

const stateOrder = { none: 0, partial: 1, upcoming: 2, paid: 3 };


export async function collection(collectionId) {
  const session = await requireSession('collections');
  if (!session) return;
  const activeCommunity = await getActiveManagerCommunity();

  const [{ data: collectionRows, error: collectionError }, { data: contributions, error: contributionsError }] = await Promise.all([
    db.rpc('get_collection_v16_rpc', { p_collection_id: collectionId }),
    db.rpc('get_collection_contributions_v10_rpc', { p_collection_id: collectionId }),
  ]);
  if (collectionError) return app.innerHTML = `<section class="card"><div class="error">${esc(collectionError.message)}</div></section>`;
  if (contributionsError) return app.innerHTML = `<section class="card"><div class="error">${esc(contributionsError.message)}</div></section>`;

  const item = collectionRows?.[0];
  if (!item) return app.innerHTML = '<section class="card"><div class="error">Збір не знайдено.</div></section>';
  if (activeCommunity && item.community_id !== activeCommunity.id) {
    return app.innerHTML = '<section class="card"><div class="privacy">Цей збір належить іншій спільноті. Перемкніть активну спільноту в меню.</div></section>';
  }

  state.currentContributions = contributions || [];
  const history = (contributions || []).length ? contributions.map(c => `
    <article class="list-row contribution-row is-editable" role="button" tabindex="0" aria-label="Змінити внесок: ${esc(c.member_name)}, ${money(c.amount)}"
      onclick="openContributionDrawer('${esc(item.id)}','${esc(item.community_id)}','${esc(c.id)}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
      <div class="list-row-main">
        <strong>${esc(c.member_name)}</strong>
        <small>${[periodLabel(c), createdLabel(c.created_at)].filter(Boolean).map(esc).join(' · ')}</small>
        ${c.note ? `<small class="row-note">${esc(c.note)}</small>` : ''}
      </div>
      <div class="list-row-side"><strong class="row-amount">${money(c.amount)}</strong><svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></div>
    </article>`).join('') : '<div class="privacy">Внесків ще немає.</div>';

  app.innerHTML = `<a class="page-back" href="#/collections" aria-label="Повернутися до зборів">← Збори</a>
    <section class="hero collection-hero">
      <p class="eyebrow">${esc(item.community_name)}</p>
      <h1>${esc(item.name)}</h1>
      <div class="collection-hero-meta">${collectionStatusTag(item, collectionTag(item))}${amountLine(item) ? `<span class="caption">${amountLine(item)}</span>` : ''}</div>
    </section>
    <div class="account-create collection-actions">${isClosed(item)
      ? '<p class="caption closed-note">Збір завершено. Відновити його можна в налаштуваннях.</p>'
      : `<button onclick="openContributionDrawer('${esc(item.id)}','${esc(item.community_id)}')">Додати внесок</button>`}<a class="collection-settings-link" href="#/collections/${esc(item.id)}/edit">Налаштування</a></div>
    <a class="list-rows stats-link" href="#/statistics/collections/${esc(item.id)}">
      <span class="list-row"><span class="list-row-main"><strong>Зібрано ${money(item.total_amount)}</strong></span><span class="list-row-side"><span class="collection-settings-link">Статистика збору</span><svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span></span>
    </a>
    <section class="account-section"><h2>Історія внесків</h2><div class="list-rows">${history}</div></section>`;
}

export async function openContributionDrawer(collectionId, communityId, contributionId = null) {
  selectedContributionMember = null;
  const editing = contributionId ? state.currentContributions.find(c => c.id === contributionId) : null;
  if (contributionId && !editing) return;
  const { data, error } = await db.rpc('get_my_members_v06_rpc', { p_community_id: communityId });
  if (error) return alert(error.message);
  contributionMembers = (data || []).filter(x => x.status === 'active' || x.id === editing?.member_id);
  const idArg = editing ? `,'${esc(editing.id)}'` : '';

  // Opened from «+ → Внесок»: the collection is chosen in the form.
  let collectionPicker = '';
  if (!collectionId && !editing) {
    const { data: cols, error: colsError } = await db.rpc('get_my_collections_v16_rpc');
    if (colsError) return alert(colsError.message);
    const open = (cols || []).filter(c => c.community_id === communityId && !isClosed(c));
    if (!open.length) {
      const empty = document.createElement('div');
      empty.id = 'contributionDrawer';
      empty.className = 'drawer-overlay contribution-overlay';
      empty.innerHTML = `<button class="drawer-backdrop" aria-label="Закрити" onclick="closeContributionDrawer()"></button>
        <aside class="comment-drawer contribution-drawer" role="dialog" aria-modal="true" aria-labelledby="contributionDrawerTitle">
          <div class="drawer-head"><h2 id="contributionDrawerTitle">Додати внесок</h2><button class="drawer-close" aria-label="Закрити" onclick="closeContributionDrawer()">×</button></div>
          <div class="privacy">Спочатку створіть збір — внесок додається до збору.</div>
          <div class="buttons"><a class="button" href="#/collections/new" onclick="closeContributionDrawer()">Створити збір</a></div>
        </aside>`;
      document.body.appendChild(empty);
      return;
    }
    collectionPicker = `<label>Збір</label><select id="contributionCollection">${open.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>`;
  }

  const overlay = document.createElement('div');
  overlay.id = 'contributionDrawer';
  overlay.className = 'drawer-overlay contribution-overlay';
  overlay.innerHTML = `
    <button class="drawer-backdrop" aria-label="Закрити" onclick="closeContributionDrawer()"></button>
    <aside class="comment-drawer contribution-drawer" role="dialog" aria-modal="true" aria-labelledby="contributionDrawerTitle">
      <div class="drawer-head"><div><h2 id="contributionDrawerTitle">${editing ? 'Змінити внесок' : 'Додати внесок'}</h2><p class="caption">Учасник і сума — обов’язкові.</p></div><button class="drawer-close" aria-label="Закрити" onclick="closeContributionDrawer()">×</button></div>
      <div class="contribution-form">
        ${collectionPicker}
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
        <div id="contributionError" class="error hidden"></div>
      </div>
      <div class="contribution-actions">
        <button id="saveContributionBtn" onclick="saveContribution('${esc(collectionId)}'${idArg})">${editing ? 'Зберегти зміни' : 'Додати внесок'}</button>
        ${editing ? `<button id="deleteContributionBtn" class="secondary contribution-delete" onclick="deleteContribution('${esc(collectionId)}','${esc(editing.id)}')">Видалити внесок</button>` : ''}
      </div>
    </aside>`;
  document.body.appendChild(overlay);
  if (editing) {
    const member = contributionMembers.find(m => m.id === editing.member_id);
    if (member) selectContributionMember(member.id);
    document.getElementById('contributionAmount').value = editing.amount;
    document.getElementById('contributionPeriod').value = editing.period_type || '';
    updateContributionPeriodFields();
    if (editing.period_type === 'month') document.getElementById('contributionMonth').value = editing.month;
    if (editing.period_type === 'half_year') document.getElementById('contributionHalfYear').value = editing.half_year;
    if (editing.period_type) document.getElementById('contributionYear').value = editing.year;
    document.getElementById('contributionNote').value = editing.note || '';
  } else {
    document.getElementById('contributionMemberSearch')?.focus();
  }
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

export async function saveContribution(collectionId, contributionId = null) {
  const fromPicker = !collectionId;
  if (fromPicker) collectionId = document.getElementById('contributionCollection')?.value || '';
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
  if (!collectionId) return ferr(errorBox, 'Оберіть збір.');
  if (!memberId) return ferr(errorBox, 'Оберіть учасника зі списку.');
  if (!Number.isFinite(amount) || amount <= 0) return ferr(errorBox, 'Сума має бути більшою за 0.');

  const label = contributionId ? 'Зберегти зміни' : 'Додати внесок';
  button.disabled = true;
  button.textContent = 'Зберігаємо...';
  const { error } = await db.rpc(contributionId ? 'update_collection_contribution_v17_rpc' : 'create_collection_contribution_v10_rpc', {
    ...(contributionId ? { p_contribution_id: contributionId } : { p_collection_id: collectionId }),
    p_member_id: memberId,
    p_amount: amount,
    p_period_type: periodType || null,
    p_month: periodType === 'month' ? Number(month) : null,
    p_half_year: periodType === 'half_year' ? Number(halfYear) : null,
    p_year: periodType ? Number(year) : null,
    p_note: note || null,
  });
  button.disabled = false;
  button.textContent = label;
  if (error) return ferr(errorBox, error.message);

  closeContributionDrawer();
  if (fromPicker) location.hash = `#/collections/${collectionId}`;
  else collection(collectionId);
}

export async function deleteContribution(collectionId, contributionId) {
  const c = state.currentContributions.find(x => x.id === contributionId);
  const what = c ? `${c.member_name}, ${money(c.amount)}` : 'цей внесок';
  if (!confirm(`Видалити внесок (${what})? Це не можна скасувати.`)) return;
  const button = document.getElementById('deleteContributionBtn');
  const errorBox = document.getElementById('contributionError');
  if (button) { button.disabled = true; button.textContent = 'Видаляємо...'; }
  const { error } = await db.rpc('delete_collection_contribution_v17_rpc', { p_contribution_id: contributionId });
  if (error) {
    if (button) { button.disabled = false; button.textContent = 'Видалити внесок'; }
    return ferr(errorBox, error.message);
  }
  closeContributionDrawer();
  collection(collectionId);
}

// ---------- Statistics: by collection / by member ----------

function paidByMember(contributions) {
  const map = new Map();
  (contributions || []).forEach(c => map.set(c.member_id, (map.get(c.member_id) || 0) + Number(c.amount)));
  return map;
}

function duesPanel(item, members, contributions) {
  const paidBy = paidByMember(contributions);
  const active = members.filter(m => m.status === 'active');

  if (!hasDues(item)) {
    const rows = active.map(m => ({ m, paid: paidBy.get(m.id) || 0 })).sort((a, b) => b.paid - a.paid || a.m.full_name.localeCompare(b.m.full_name, 'uk'));
    return `<section class="card dues-card">
        <div class="dues-tiles"><div class="dues-tile paid"><strong>${money(item.total_amount)}</strong><span>внесено</span></div>
          <div class="dues-tile"><strong>${item.contributions_count}</strong><span>${plural(item.contributions_count, ...W.contributions)}</span></div></div>
        <p class="caption" style="margin-top:12px"><a href="#/collections/${esc(item.id)}/edit">Вкажіть суму з учасника</a>, щоб бачити борги.</p></section>
      <section class="account-section"><h2>Оплати учасників</h2><div class="list-rows">${rows.map(({ m, paid }) => `
        <article class="list-row"><div class="list-row-main"><strong>${esc(m.full_name)}</strong></div>
          <div class="list-row-side">${amountOne(paid, 0)}</div></article>`).join('') || '<div class="privacy">Немає активних учасників.</div>'}</div></section>`;
  }

  const rows = active.map(m => ({ m, d: memberDues(item, paidBy.get(m.id) || 0) }))
    .sort((a, b) => stateOrder[a.d.state] - stateOrder[b.d.state] || b.d.left - a.d.left || a.m.full_name.localeCompare(b.m.full_name, 'uk'));
  const debtors = rows.filter(r => r.d.left > 0);
  const debtTotal = debtors.reduce((s, r) => s + r.d.left, 0);
  const expected = dueToDate(item) * active.length;
  const monthly = item.frequency === 'monthly';

  const pct = expected > 0 ? Math.min(100, Math.round(Number(item.total_amount) / expected * 100)) : 0;
  const summary = `<section class="card dues-card">
      ${duesTiles(Number(item.total_amount), debtTotal)}
      <div class="dues-progress"><div class="dues-progress-bar"><span style="width:${pct}%"></span></div>
        <div class="dues-progress-caption">${pct}% від ${money(expected)} на сьогодні</div></div>
    </section>`;

  const list = `<section class="account-section member-dues-list"><h2>Оплати учасників</h2><div class="list-rows">${rows.map(({ m, d }) => `
      <article class="list-row">
        <div class="list-row-main"><strong>${esc(m.full_name)}</strong>${monthly ? monthDots(d) : splitBar(d.paid, d.left)}</div>
        <div class="list-row-side">${amountOne(d.paid, d.left)}</div>
      </article>`).join('') || '<div class="privacy">Немає активних учасників.</div>'}</div>
      ${monthly ? '<p class="caption dots-legend"><i class="paid"></i> внесено <i class="owed"></i> борг <i></i> ще не настав</p>' : ''}</section>`;

  let grid = '';
  if (monthly && rows.length) {
    const months = schoolMonths(Number(item.school_year));
    const elapsed = monthsElapsed(Number(item.school_year));
    const byName = [...rows].sort((a, b) => a.m.full_name.localeCompare(b.m.full_name, 'uk'));
    grid = `<section class="account-section month-grid-section"><h2>По місяцях</h2>
      <div class="month-grid-wrap"><table class="month-grid">
        <thead><tr><th></th>${months.map((mo, i) => `<th class="${i === elapsed - 1 ? 'current' : ''}">${mo.short}</th>`).join('')}</tr></thead>
        <tbody>${byName.map(({ m, d }) => `<tr><th title="${esc(m.full_name)}">${esc(m.full_name)}</th>${months.map((mo, i) => {
          const cls = i < d.covered ? 'paid' : i < elapsed ? 'owed' : 'future';
          return `<td class="${cls}${i === elapsed - 1 ? ' current' : ''}" title="${esc(m.full_name)} · ${mo.long} ${mo.year}">${cls === 'paid' ? '✓' : cls === 'owed' ? '•' : ''}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="caption month-grid-legend"><span class="lg paid">✓</span> внесено <span class="lg owed">•</span> борг <span class="lg future"></span> ще не настав</p>
    </section>`;
  }
  return summary + list + grid;
}



export async function statistics(view = 'collections', collectionId = null) {
  // Statistics show collections only; a member's page lives under «Учасники».
  if (view === 'members') return redirect(collectionId ? `#/members/${collectionId}` : '#/statistics');
  const session = await requireSession('statistics');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Статистика</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div></section>';
    return;
  }

  const [{ data: collectionsData, error: collectionsError }, { data: membersData, error: membersError }] = await Promise.all([
    db.rpc('get_my_collections_v16_rpc'),
    db.rpc('get_my_members_v06_rpc', { p_community_id: community.id }),
  ]);
  if (collectionsError || membersError) {
    const msg = collectionsError?.message || membersError?.message || 'Не вдалося завантажити статистику.';
    return app.innerHTML = `<section class="card"><div class="error">${esc(msg)}</div></section>`;
  }

  const list = (collectionsData || []).filter(x => x.community_id === community.id)
    .sort((a, b) => isClosed(a) - isClosed(b));
  const members = membersData || [];
  const head = `<section class="hero account-hero tab-hero"><h1>Статистика</h1><p class="lead">${esc(community.name)}</p></section>`;

  if (!list.length) {
    app.innerHTML = `${head}<div class="privacy">Зборів ще немає.</div>`;
    return;
  }

  const selected = list.find(c => c.id === collectionId) || list[0];
  const { data: contributions, error } = await db.rpc('get_collection_contributions_v10_rpc', { p_collection_id: selected.id });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const picker = list.length > 1
    ? `<nav class="stats-tabs stats-picker" aria-label="Збори">${list.map(c => `<a class="${c.id === selected.id ? 'active' : ''}" href="#/statistics/collections/${esc(c.id)}" ${c.id === selected.id ? 'aria-current="page"' : ''}>${esc(c.name)}</a>`).join('')}</nav>`
    : '';
  app.innerHTML = `${head}${picker}
    <div class="stats-collection-head"><div><h2>${esc(selected.name)}</h2><p class="caption">${collectionTag(selected)}${amountLine(selected) ? ` · ${amountLine(selected)}` : ''}</p></div>
      <a class="collection-settings-link" href="#/collections/${esc(selected.id)}">Історія внесків →</a></div>
    ${duesPanel(selected, members, contributions || [])}`;
  document.querySelector('.stats-picker a.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

// One member: paid and owed across the community's collections (opened from «Учасники»).
export async function memberStats(memberId) {
  const session = await requireSession('members');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) return redirect('#/members');

  const [{ data: collectionsData, error: collectionsError }, { data: membersData, error: membersError }] = await Promise.all([
    db.rpc('get_my_collections_v16_rpc'),
    db.rpc('get_my_members_v06_rpc', { p_community_id: community.id }),
  ]);
  if (collectionsError || membersError) {
    return app.innerHTML = `<section class="card"><div class="error">${esc((collectionsError || membersError).message)}</div></section>`;
  }
  const m = (membersData || []).find(x => x.id === memberId);
  if (!m) return app.innerHTML = '<a class="page-back" href="#/members">← Учасники</a><section class="card"><div class="privacy">Учасника не знайдено.</div></section>';
  const list = (collectionsData || []).filter(x => x.community_id === community.id);
  const results = await Promise.all(list.map(c => db.rpc('get_collection_contributions_v10_rpc', { p_collection_id: c.id })));
  const failed = results.find(r => r.error);
  if (failed) return app.innerHTML = `<section class="card"><div class="error">${esc(failed.error.message)}</div></section>`;

  const per = list.map((c, i) => {
    const paid = paidByMember(results[i].data).get(m.id) || 0;
    const left = hasDues(c) && m.status === 'active' ? memberDues(c, paid).left : 0;
    return { c, paid, left };
  });
  const paid = per.reduce((s, x) => s + x.paid, 0);
  const left = per.reduce((s, x) => s + x.left, 0);
  const rows = per.map(x => {
    const monthly = x.c.frequency === 'monthly' && hasDues(x.c) && m.status === 'active';
    const visual = monthly ? monthDots(memberDues(x.c, x.paid)) : hasDues(x.c) ? splitBar(x.paid, x.left) : '';
    return `<a class="list-row list-row-link" href="#/statistics/collections/${esc(x.c.id)}">
      <span class="list-row-main"><strong>${esc(x.c.name)}</strong>${visual}</span>
      <span class="list-row-side">${amountOne(x.paid, x.left)}<svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span></a>`;
  }).join('') || '<div class="privacy">Зборів ще немає.</div>';

  app.innerHTML = `<a class="page-back" href="#/members">← Учасники</a>
    <section class="hero account-hero"><p class="eyebrow">${esc(community.name)}</p><h1>${esc(m.full_name)}</h1>
      <p class="caption">${m.email ? esc(m.email) : 'Email не вказано'}${m.status !== 'active' ? ' · неактивний' : ''}</p></section>
    <section class="card dues-card">${duesTiles(paid, left)}</section>
    <section class="account-section"><h2>Збори</h2><div class="list-rows">${rows}</div></section>
    <a class="collection-settings-link" href="#/members/${esc(m.id)}/edit">Змінити дані учасника →</a>`;
}
