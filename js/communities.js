import { db } from './supabase.js';
import { getActiveManagerCommunity, syncManagerNavigation } from './navigation.js';
import { app, esc, ferr, plural, redirect, toast, W } from './utils.js';

async function requireSession(active) {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    redirect('#/login');
    return null;
  }
  await syncManagerNavigation(active);
  return data.session;
}

const memberStatus = m => {
  if (m.status !== 'active') return '<span class="row-status warn">Неактивний</span>';
  if (!m.email) return '<span class="row-status muted">Без email</span>';
  if (m.user_id) return '<span class="row-status ok">Кабінет підключено</span>';
  return `<button class="secondary small member-access-button" onclick="sendMemberAccess('${esc(m.id)}','${esc(m.email)}')">Надіслати доступ</button>`;
};

const memberCard = m => {
  const search = [m.full_name, m.email || '', m.community_name || ''].join(' ').toLocaleLowerCase('uk-UA');
  return `<article class="list-row member-row ${m.status !== 'active' ? 'is-inactive' : ''}" data-member-search="${esc(search)}">
    <a class="list-row-main" href="#/members/${esc(m.id)}" aria-label="Відкрити: ${esc(m.full_name)}">
      <strong>${esc(m.full_name)}</strong>
      <small>${m.email ? esc(m.email) : 'Email не вказано'}</small>
    </a>
    <div class="list-row-side">${memberStatus(m)}</div>
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

  app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1></section>
    <div class="account-create"><a class="button" href="#/communities/new">Створити спільноту</a></div>
    <section class="card"><div class="privacy">Завантажуємо спільноти...</div></section>`;

  const { data, error } = await db.rpc('get_my_communities_v06_rpc');
  if (error) return app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1></section><section class="card"><div class="error">${esc(error.message)}</div></section>`;

  const list = data || [];
  const active = await getActiveManagerCommunity();
  const gear = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  const rows = list.length ? `<div class="list-rows community-rows">${list.map(item => {
    const isActive = item.id === active?.id;
    const meta = [`${item.members_count} ${plural(item.members_count, ...W.members)}`, item.description].filter(Boolean).map(esc).join(' · ');
    return `
      <div class="list-row community-row ${isActive ? 'is-active' : ''}" role="button" tabindex="0" aria-label="Відкрити спільноту ${esc(item.name)}"
        onclick="activateCommunity('${esc(item.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
        <span class="list-row-main"><strong>${esc(item.name)}${isActive ? ' <span class="row-status ok">Активна</span>' : ''}</strong><small>${meta}</small></span>
        <span class="list-row-side">
          <a class="community-row-settings" href="#/community/${esc(item.id)}/edit" onclick="event.stopPropagation()" aria-label="Налаштування спільноти ${esc(item.name)}" title="Налаштування">${gear}</a>
          <svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </span>
      </div>`;
  }).join('')}</div>` : '<div class="privacy">У вас ще немає спільнот.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1></section>
    <div class="account-create"><a class="button" href="#/communities/new">Створити спільноту</a></div>
    <section class="account-section">${rows}</section>`;
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
  redirect('#/communities');
}

export async function members() {
  const session = await requireSession('members');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Учасники</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">Створити спільноту</a></div></section>';
    return;
  }

  const { data, error } = await db.rpc('get_my_members_v06_rpc', { p_community_id: community.id });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const rows = (data || []).length ? data.map(m => memberCard(m)).join('') : '<div class="privacy">У цій спільноті ще немає учасників.</div>';

  app.innerHTML = `<section class="hero account-hero tab-hero"><h1>Учасники</h1><p class="lead">${esc(community.name)}</p></section>
    <div class="account-create"><a class="button" href="#/members/new">Додати учасника</a></div>
    <div class="member-search"><span aria-hidden="true">⌕</span><input id="memberSearch" type="search" placeholder="Пошук за імʼям або email" oninput="filterMembers()"></div>
    <section class="account-section"><div class="list-rows">${rows}</div><div id="memberSearchEmpty" class="privacy hidden">Нічого не знайдено.</div></section>`;
}

export async function newMember(communityId = null) {
  const session = await requireSession('members');
  if (!session) return;

  const { data: communitiesList, error } = await db.rpc('get_my_communities_v06_rpc');
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const list = communitiesList || [];

  if (!communityId && !list.length) {
    app.innerHTML = `<section class="hero account-hero"><h1>Новий учасник</h1></section>
      <section class="card"><div class="privacy">Спочатку створіть спільноту, до якої можна додати учасника.</div><div class="buttons"><a class="button" href="#/communities/new">Створити спільноту</a></div></section>`;
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

export async function community(communityId) {
  const session = await requireSession('communities');
  if (!session) return;
  const { data: rows, error } = await db.rpc('get_my_community_v06_rpc', { p_community_id: communityId });
  if (error || !rows?.[0]) {
    app.innerHTML = `<section class="card"><div class="error">${esc(error?.message || 'Спільноту не знайдено.')}</div></section>`;
    return;
  }
  localStorage.setItem('comfundy:managerCommunityId', communityId);
  redirect('#/announcements');
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
  redirect('#/members');
}


export async function editMember(memberId) {
  const session = await requireSession('members');
  if (!session) return;
  const community = await getActiveManagerCommunity();
  if (!community) {
    redirect('#/members');
    return;
  }

  const { data, error } = await db.rpc('get_my_members_v06_rpc', { p_community_id: community.id });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const member = (data || []).find(m => m.id === memberId);
  if (!member) return app.innerHTML = '<section class="card"><div class="error">Учасника не знайдено в активній спільноті.</div></section>';

  app.innerHTML = `<a class="page-back" href="#/members" aria-label="Повернутися до учасників">← Учасники</a>
    <section class="hero account-hero"><h1>Редагувати учасника</h1><p class="lead">${esc(community.name)}</p></section>
    <a class="list-rows stats-link" href="#/members/${esc(member.id)}">
      <span class="list-row"><span class="list-row-main"><strong>${esc(member.full_name)}</strong></span><span class="list-row-side"><span class="collection-settings-link">Збори учасника</span><svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></span></span>
    </a>
    <section class="card">
      <input id="editMemberId" type="hidden" value="${esc(member.id)}">
      <label>Імʼя / ПІБ</label><input id="editMemberName" value="${esc(member.full_name)}">
      <label>Email <span class="muted">необовʼязково</span></label><input id="editMemberEmail" type="email" inputmode="email" autocomplete="email" value="${esc(member.email || '')}" placeholder="name@example.com">
      <label>Статус</label>
      <select id="editMemberStatus">
        <option value="active" ${member.status === 'active' ? 'selected' : ''}>Активний</option>
        <option value="inactive" ${member.status === 'inactive' ? 'selected' : ''}>Неактивний</option>
      </select>
      <p class="field-note">Не активний учасник не має доступу до кабінету учасника.</p>
      <p class="field-note">Якщо змінити email, доступ учасника потрібно буде надіслати повторно на нову адресу.</p>
      <div class="buttons"><button id="saveMemberBtn" onclick="saveMember()">Зберегти</button></div>
      <div id="memberEditError" class="error hidden"></div>
    </section>`;
}

export async function saveMember() {
  const memberId = document.getElementById('editMemberId')?.value || '';
  const nameInput = document.getElementById('editMemberName');
  const emailInput = document.getElementById('editMemberEmail');
  const fullName = nameInput?.value.trim() || '';
  const email = emailInput?.value.trim() || '';
  const status = document.getElementById('editMemberStatus')?.value || 'active';
  const button = document.getElementById('saveMemberBtn');
  const errorBox = document.getElementById('memberEditError');

  errorBox.classList.add('hidden');
  if (!memberId) return ferr(errorBox, 'Учасника не знайдено.');
  if (!fullName) return ferr(errorBox, 'Вкажіть імʼя учасника.');
  if (email && !emailInput.checkValidity()) return ferr(errorBox, 'Перевірте правильність email.');

  button.disabled = true;
  button.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('update_community_member_v13_rpc', {
    p_member_id: memberId,
    p_full_name: fullName,
    p_email: email || null,
    p_status: status,
  });
  button.disabled = false;
  button.textContent = 'Зберегти';
  if (error) return ferr(errorBox, error.message);
  redirect('#/members');
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

export async function editCommunity(communityId = null) {
  const session = await requireSession('communities');
  if (!session) return;

  let community = null;
  if (communityId) {
    const { data, error } = await db.rpc('get_my_community_v06_rpc', { p_community_id: communityId });
    if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
    community = data?.[0] || null;
  } else {
    community = await getActiveManagerCommunity();
  }

  if (!community) return newCommunity();

  app.innerHTML = `<section class="hero account-hero"><h1>Редагувати спільноту</h1></section>
    <section class="card">
      <input id="editCommunityId" type="hidden" value="${esc(community.id)}">
      <label>Назва</label><input id="editCommunityName" value="${esc(community.name)}">
      <label>Опис <span class="muted">необовʼязково</span></label><textarea id="editCommunityDescription">${esc(community.description || '')}</textarea>
      <div class="buttons"><button id="saveCommunityBtn" onclick="saveCommunity()">Зберегти</button></div>
      <div id="communityEditError" class="error hidden"></div>
    </section>
    <section class="account-section">
      <h2>Менеджери</h2>
      <p class="caption">Усі менеджери мають однакові права: учасники, збори, внески, оголошення, статистика та ініціативи цієї спільноти.</p>
      <div id="managerList" class="member-list" style="margin-top:12px"><div class="privacy">Завантажуємо менеджерів...</div></div>
    </section>
    <section class="card">
      <h2>Додати менеджера</h2>
      <label>Email</label><input id="newManagerEmail" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com">
      <p class="field-note">Людина отримає посилання для входу. Доступ зʼявиться після першого входу з цим email.</p>
      <div class="buttons"><button id="addManagerBtn" onclick="addCommunityManager()">Додати менеджера</button></div>
      <div id="managerError" class="error hidden"></div>
    </section>`;
  await renderManagers(community.id);
}

const managerCard = (m, canRemove) => `<article class="member-card">
    <div class="member-card-main">
      <h3>${esc(m.email || '—')}${m.is_me ? ' <span class="muted">(ви)</span>' : ''}</h3>
      ${m.is_active
        ? '<span class="member-access-status">Доступ активний</span>'
        : `<span class="tag" style="display:inline-flex;margin-top:10px">Запрошено · ще не входив(-ла)</span>
           <button class="secondary small member-access-button" onclick="sendManagerInvite('${esc(m.id)}','${esc(m.email)}')">Надіслати посилання ще раз</button>`}
    </div>
    ${canRemove ? `<button class="ghost small" onclick="removeCommunityManager('${esc(m.id)}',${m.is_me ? 'true' : 'false'})">${m.is_me ? 'Вийти з менеджерів' : 'Прибрати'}</button>` : ''}
  </article>`;

async function renderManagers(communityId) {
  const box = document.getElementById('managerList');
  if (!box) return;
  const { data, error } = await db.rpc('get_community_managers_v14_rpc', { p_community_id: communityId });
  if (error) {
    box.innerHTML = `<div class="error">${esc(error.message)}</div>`;
    return;
  }
  const list = data || [];
  const activeCount = list.filter(m => m.is_active).length;
  box.innerHTML = list.map(m => managerCard(m, !m.is_active || activeCount > 1)).join('');
}

async function sendLoginLink(email) {
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;
  return db.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl } });
}

export async function addCommunityManager() {
  const communityId = document.getElementById('editCommunityId')?.value || '';
  const input = document.getElementById('newManagerEmail');
  const button = document.getElementById('addManagerBtn');
  const errorBox = document.getElementById('managerError');
  const email = input?.value.trim() || '';

  errorBox.classList.add('hidden');
  if (!email || !input.checkValidity()) return ferr(errorBox, 'Перевірте правильність email.');

  button.disabled = true;
  button.textContent = 'Додаємо...';
  const { error } = await db.rpc('add_community_manager_v14_rpc', { p_community_id: communityId, p_email: email });
  if (error) {
    button.disabled = false;
    button.textContent = 'Додати менеджера';
    return ferr(errorBox, error.message);
  }
  const { error: mailError } = await sendLoginLink(email);
  button.disabled = false;
  button.textContent = 'Додати менеджера';
  input.value = '';
  toast(mailError ? 'Менеджера додано, але лист не відправлено' : 'Менеджера додано, посилання надіслано');
  await renderManagers(communityId);
}

export async function sendManagerInvite(managerId, email) {
  if (!email) return;
  const button = [...document.querySelectorAll('.member-access-button')].find(x => x.getAttribute('onclick')?.includes(managerId));
  if (button) { button.disabled = true; button.textContent = 'Надсилаємо...'; }
  const { error } = await sendLoginLink(email);
  if (button) { button.disabled = false; button.textContent = error ? 'Спробувати ще раз' : 'Посилання надіслано'; }
  if (error) alert(error.message);
}

export async function removeCommunityManager(managerId, isMe) {
  const communityId = document.getElementById('editCommunityId')?.value || '';
  const question = isMe
    ? 'Вийти з менеджерів цієї спільноти? Ви втратите до неї доступ.'
    : 'Прибрати цього менеджера? Він втратить доступ до спільноти.';
  if (!confirm(question)) return;
  const { error } = await db.rpc('remove_community_manager_v14_rpc', { p_manager_id: managerId });
  if (error) return alert(error.message);
  if (isMe) {
    if (localStorage.getItem('comfundy:managerCommunityId') === communityId) localStorage.removeItem('comfundy:managerCommunityId');
    redirect('#/communities');
    return;
  }
  toast('Менеджера прибрано');
  await renderManagers(communityId);
}

export async function saveCommunity() {
  const communityId = document.getElementById('editCommunityId')?.value || '';
  const name = document.getElementById('editCommunityName')?.value.trim() || '';
  const description = document.getElementById('editCommunityDescription')?.value.trim() || '';
  const button = document.getElementById('saveCommunityBtn');
  const errorBox = document.getElementById('communityEditError');
  if (!communityId) return ferr(errorBox, 'Спільноту не знайдено.');
  if (!name) return ferr(errorBox, 'Вкажіть назву спільноти.');
  button.disabled = true; button.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('update_community_v12_rpc', { p_community_id: communityId, p_name: name, p_description: description || null });
  button.disabled = false; button.textContent = 'Зберегти';
  if (error) return ferr(errorBox, error.message);
  redirect('#/communities');
}
