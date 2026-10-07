import { db } from './supabase.js';
import { getActiveManagerCommunity, syncManagerNavigation } from './navigation.js';
import { app, date, esc, ferr, money } from './utils.js';

async function requireSession(active) {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    location.hash = '#/login';
    return null;
  }
  await syncManagerNavigation(active);
  return data.session;
}

const communityTabs = (communityId, active) => `
  <nav class="community-tabs" aria-label="Спільнота">
    <a class="community-tab ${active === 'members' ? 'active' : ''}" href="#/community/${esc(communityId)}/members">Учасники</a>
    <a class="community-tab ${active === 'initiatives' ? 'active' : ''}" href="#/community/${esc(communityId)}/initiatives">Ініціативи</a>
  </nav>`;

const initiativeCard = item => {
  const closed = item.status !== 'open';
  const finance = item.target_amount !== null && item.target_amount !== undefined
    ? `<div class="initiative-finance"><strong>${money(item.sum_max)}</strong><span>із ${money(item.target_amount)} цілі</span></div>`
    : `<div class="initiative-finance"><strong>${money(item.sum_max)}</strong><span>сума максимумів</span></div>`;
  const meta = closed
    ? `Раунд ${item.round_number} · Завершено ${date(item.closed_at)}`
    : `Раунд ${item.round_number} · Учасників: ${item.proposals_count}`;

  return `<article class="initiative-card">
    <div class="initiative-card-head">
      <div><h3>${esc(item.title)}</h3><p class="caption">${meta}</p></div>
      <span class="tag ${closed ? 'ok' : ''}">${closed ? 'Завершена' : 'Активна'}</span>
    </div>
    ${finance}
    <a class="initiative-open" href="#/manage/${esc(item.manager_token)}">Відкрити →</a>
  </article>`;
};

const memberCard = (m, showCommunity = true) => {
  const search = [m.full_name, m.email || '', m.community_name || ''].join(' ').toLocaleLowerCase('uk-UA');
  const access = m.email
    ? m.user_id
      ? '<span class="member-access-status">Доступ активний</span>'
      : `<button class="secondary small member-access-button" onclick="sendMemberAccess('${esc(m.id)}','${esc(m.email)}')">Надіслати доступ</button>`
    : '';
  return `<article class="member-card" data-member-search="${esc(search)}">
    <div class="member-card-main"><h3>${esc(m.full_name)}</h3><p class="caption">${m.email ? esc(m.email) : 'Email не вказано'}</p>${access}</div>
    ${showCommunity ? `<a class="community-chip" href="#/community/${esc(m.community_id)}/members">${esc(m.community_name)}</a>` : `<span class="tag ok">${m.status === 'active' ? 'Активний' : 'Неактивний'}</span>`}
  </article>`;
};

export function filterMembers() {
  const input = document.getElementById('memberSearch');
  if (!input) return;
  const q = input.value.trim().toLocaleLowerCase('uk-UA');
  document.querySelectorAll('[data-member-search]').forEach(card => {
    card.classList.toggle('hidden', q && !card.dataset.memberSearch.includes(q));
  });
  const visible = [...document.querySelectorAll('[data-member-search]')].some(card => !card.classList.contains('hidden'));
  const empty = document.getElementById('memberSearchEmpty');
  if (empty) empty.classList.toggle('hidden', visible || !q);
}

export async function communities() {
  const session = await requireSession('communities');
  if (!session) return;

  app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1><p class="lead">${esc(session.user.email || '')}</p></section>
    <div class="account-create"><a class="button" href="#/communities/new">+ Створити спільноту</a></div>
    <section class="card"><div class="privacy">Завантажуємо спільноти...</div></section>`;

  const { data, error } = await db.rpc('get_my_communities_v06_rpc');
  if (error) return app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1></section><section class="card"><div class="error">${esc(error.message)}</div></section>`;

  const list = data || [];
  const cards = list.length ? list.map(c => `
    <article class="community-card">
      <div>
        <h3>${esc(c.name)}</h3>
        ${c.description ? `<p class="caption community-description">${esc(c.description)}</p>` : ''}
      </div>
      <div class="community-meta"><span>Учасників: <strong>${c.members_count}</strong></span><span>Ініціатив: <strong>${c.initiatives_count}</strong></span></div>
      <button class="secondary small" onclick="activateCommunity('${esc(c.id)}')">Зробити активною</button>
    </article>`).join('') : '<div class="privacy">У вас ще немає спільнот.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1><p class="lead">${esc(session.user.email || '')}</p></section>
    <div class="account-create"><a class="button" href="#/communities/new">+ Створити спільноту</a></div>
    <section class="account-section"><h2>Мої спільноти</h2><div class="community-list">${cards}</div></section>`;
}

export async function newCommunity() {
  const session = await requireSession('communities');
  if (!session) return;
  app.innerHTML = `<section class="hero account-hero"><h1>Нова спільнота</h1><p class="lead">Створіть постійний простір для учасників та ініціатив.</p></section>
    <section class="card">
      <label>Назва</label><input id="communityName" placeholder="Наприклад: 5-А клас">
      <label>Опис <span class="muted">необовʼязково</span></label><textarea id="communityDescription" placeholder="Коротко опишіть спільноту"></textarea>
      <div class="buttons"><button id="createCommunityBtn" onclick="createCommunity()">Створити спільноту</button></div>
      <div id="communityError" class="error hidden"></div>
    </section>`;
}

export async function createCommunity() {
  const name = document.getElementById('communityName')?.value.trim() || '';
  const description = document.getElementById('communityDescription')?.value.trim() || '';
  const errorBox = document.getElementById('communityError');
  const button = document.getElementById('createCommunityBtn');
  if (!name) return ferr(errorBox, 'Вкажіть назву спільноти.');

  errorBox.classList.add('hidden');
  button.disabled = true;
  button.textContent = 'Створюємо...';
  const { data, error } = await db.rpc('create_community_v06_rpc', {
    p_name: name,
    p_description: description || null,
  });
  button.disabled = false;
  button.textContent = 'Створити спільноту';
  if (error) return ferr(errorBox, error.message);

  const id = data?.[0]?.id;
  if (id) localStorage.setItem('comfundy:managerCommunityId', id);
  location.hash = '#/members';
}

export async function members() {
  const session = await requireSession('members');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Учасники</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">+ Створити спільноту</a></div></section>';
    return;
  }

  const { data, error } = await db.rpc('get_my_members_v06_rpc', { p_community_id: community.id });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const rows = (data || []).length ? data.map(m => memberCard(m, false)).join('') : '<div class="privacy">У цій спільноті ще немає учасників.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Учасники</h1><p class="lead">${esc(community.name)}</p></section>
    <div class="account-create"><a class="button" href="#/members/new">+ Додати учасника</a></div>
    <div class="member-search"><span aria-hidden="true">⌕</span><input id="memberSearch" type="search" placeholder="Пошук за імʼям або email" oninput="filterMembers()"></div>
    <section class="account-section"><div class="member-list">${rows}</div><div id="memberSearchEmpty" class="privacy hidden">Нічого не знайдено.</div></section>`;
}

export async function newMember(communityId = null) {
  const session = await requireSession('members');
  if (!session) return;

  const { data: communitiesList, error } = await db.rpc('get_my_communities_v06_rpc');
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const list = communitiesList || [];

  if (!communityId && !list.length) {
    app.innerHTML = `<section class="hero account-hero"><h1>Новий учасник</h1></section>
      <section class="card"><div class="privacy">Спочатку створіть спільноту, до якої можна додати учасника.</div><div class="buttons"><a class="button" href="#/communities/new">+ Створити спільноту</a></div></section>`;
    return;
  }

  const selected = communityId ? list.find(c => c.id === communityId) : null;
  if (communityId && !selected) return app.innerHTML = '<section class="card"><div class="error">Спільноту не знайдено.</div></section>';

  const communityField = selected
    ? `<div class="privacy">Спільнота: <strong>${esc(selected.name)}</strong></div><input id="memberCommunity" type="hidden" value="${esc(selected.id)}">`
    : `<label>Спільнота</label><select id="memberCommunity">${list.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>`;

  app.innerHTML = `<section class="hero account-hero"><h1>Новий учасник</h1><p class="lead">Додайте учасника до спільноти.</p></section>
    <section class="card">
      ${communityField}
      <label>Імʼя / ПІБ</label><input id="memberName" placeholder="Наприклад: Ірина Протас">
      <label>Email <span class="muted">необовʼязково</span></label><input id="memberEmail" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com">
      <div class="buttons"><button id="addMemberBtn" onclick="addCommunityMember()">Додати учасника</button></div>
      <div id="memberError" class="error hidden"></div>
    </section>`;
}

export async function community(communityId, section = 'members') {
  const session = await requireSession('communities');
  if (!session) return;
  const active = section === 'initiatives' ? 'initiatives' : 'members';

  const { data: communityRows, error: communityError } = await db.rpc('get_my_community_v06_rpc', {
    p_community_id: communityId,
  });
  if (communityError) return app.innerHTML = `<section class="card"><div class="error">${esc(communityError.message)}</div></section>`;

  const item = communityRows?.[0];
  if (!item) return app.innerHTML = '<section class="card"><div class="error">Спільноту не знайдено.</div></section>';

  const header = `<section class="hero community-hero"><p class="eyebrow">Спільнота</p><h1>${esc(item.name)}</h1>${item.description ? `<p class="lead">${esc(item.description)}</p>` : ''}</section>
    ${communityTabs(communityId, active)}`;

  if (active === 'members') {
    const { data, error } = await db.rpc('get_my_members_v06_rpc', { p_community_id: communityId });
    if (error) return app.innerHTML = header + `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
    const rows = (data || []).length ? data.map(m => memberCard(m, false)).join('') : '<div class="privacy">У цій спільноті ще немає учасників.</div>';

    app.innerHTML = header + `
      <div class="account-create"><a class="button" href="#/community/${esc(communityId)}/new-member">+ Додати учасника</a></div>
      <div class="member-search"><span aria-hidden="true">⌕</span><input id="memberSearch" type="search" placeholder="Пошук за імʼям або email" oninput="filterMembers()"></div>
      <section class="account-section"><h2>Учасники · ${item.members_count}</h2><div class="member-list">${rows}</div><div id="memberSearchEmpty" class="privacy hidden">Нічого не знайдено.</div></section>`;
    return;
  }

  const { data, error } = await db.rpc('get_my_initiatives_v06_rpc', { p_community_id: communityId });
  if (error) return app.innerHTML = header + `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const initiatives = data || [];
  const cards = initiatives.length ? initiatives.map(initiativeCard).join('') : '<div class="privacy">У цій спільноті ще немає ініціатив.</div>';

  app.innerHTML = header + `
    <div class="account-create"><a class="button" href="#/community/${esc(communityId)}/new-initiative">+ Створити ініціативу</a></div>
    <section class="account-section"><h2>Ініціативи · ${item.initiatives_count}</h2><div class="initiative-list">${cards}</div></section>`;
}

export async function addCommunityMember() {
  const communityId = document.getElementById('memberCommunity')?.value || '';
  const nameInput = document.getElementById('memberName');
  const emailInput = document.getElementById('memberEmail');
  const button = document.getElementById('addMemberBtn');
  const errorBox = document.getElementById('memberError');
  const fullName = nameInput?.value.trim() || '';
  const email = emailInput?.value.trim() || '';

  errorBox.classList.add('hidden');
  if (!communityId) return ferr(errorBox, 'Оберіть спільноту.');
  if (!fullName) return ferr(errorBox, 'Вкажіть імʼя учасника.');
  if (email && !emailInput.checkValidity()) return ferr(errorBox, 'Перевірте правильність email.');

  button.disabled = true;
  button.textContent = 'Додаємо...';
  const { error } = await db.rpc('create_community_member_v06_rpc', {
    p_community_id: communityId,
    p_full_name: fullName,
    p_email: email || null,
  });
  button.disabled = false;
  button.textContent = 'Додати учасника';
  if (error) return ferr(errorBox, error.message);
  location.hash = '#/members';
}


export async function sendMemberAccess(memberId, email) {
  if (!email) return;
  const button = [...document.querySelectorAll('.member-access-button')].find(x => x.getAttribute('onclick')?.includes(memberId));
  if (button) {
    button.disabled = true;
    button.textContent = 'Надсилаємо...';
  }
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl },
  });
  if (button) {
    button.disabled = false;
    button.textContent = error ? 'Спробувати ще раз' : 'Посилання надіслано';
  }
  if (error) alert(error.message);
}


export async function activateCommunity(id) {
  if (!id) return;
  localStorage.setItem('comfundy:managerCommunityId', id);
  location.hash = '#/announcements';
}

export async function editCommunity() {
  const session = await requireSession('communities');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) return newCommunity();
  app.innerHTML = `<section class="hero account-hero"><h1>Редагувати спільноту</h1></section>
    <section class="card">
      <label>Назва</label><input id="editCommunityName" value="${esc(community.name)}">
      <label>Опис <span class="muted">необовʼязково</span></label><textarea id="editCommunityDescription">${esc(community.description || '')}</textarea>
      <div class="buttons"><button id="saveCommunityBtn" onclick="saveCommunity()">Зберегти</button></div>
      <div id="communityEditError" class="error hidden"></div>
    </section>`;
}

export async function saveCommunity() {
  const community = await getActiveManagerCommunity();
  const name = document.getElementById('editCommunityName')?.value.trim() || '';
  const description = document.getElementById('editCommunityDescription')?.value.trim() || '';
  const button = document.getElementById('saveCommunityBtn');
  const errorBox = document.getElementById('communityEditError');
  if (!community) return ferr(errorBox, 'Спільноту не знайдено.');
  if (!name) return ferr(errorBox, 'Вкажіть назву спільноти.');
  button.disabled = true; button.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('update_community_v12_rpc', { p_community_id: community.id, p_name: name, p_description: description || null });
  button.disabled = false; button.textContent = 'Зберегти';
  if (error) return ferr(errorBox, error.message);
  location.hash = '#/announcements';
}
