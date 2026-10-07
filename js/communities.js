import { db } from './supabase.js';
import { accountNav } from './auth.js';
import { app, date, esc, ferr, money } from './utils.js';

async function requireSession() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    location.hash = '#/login';
    return null;
  }
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

export async function communities() {
  const session = await requireSession();
  if (!session) return;

  app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1><p class="lead">${esc(session.user.email || '')}</p></section>
    ${accountNav('communities')}
    <section class="card"><div class="privacy">Завантажуємо спільноти...</div></section>`;

  const { data, error } = await db.rpc('get_my_communities_v06_rpc');
  if (error) return app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1></section>${accountNav('communities')}<section class="card"><div class="error">${esc(error.message)}</div></section>`;

  const list = data || [];
  const cards = list.length ? list.map(c => `
    <article class="community-card">
      <div>
        <h3>${esc(c.name)}</h3>
        ${c.description ? `<p class="caption community-description">${esc(c.description)}</p>` : ''}
      </div>
      <div class="community-meta"><span>Учасників: <strong>${c.members_count}</strong></span><span>Ініціатив: <strong>${c.initiatives_count}</strong></span></div>
      <a class="initiative-open" href="#/community/${esc(c.id)}/members">Відкрити →</a>
    </article>`).join('') : '<div class="privacy">У вас ще немає спільнот.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Спільноти</h1><p class="lead">${esc(session.user.email || '')}</p></section>
    ${accountNav('communities')}
    <section class="card community-create-card">
      <h2>Створити спільноту</h2>
      <label>Назва</label><input id="communityName" placeholder="Наприклад: ОСББ Піонер 2007">
      <label>Опис <span class="muted">необовʼязково</span></label><textarea id="communityDescription" placeholder="Коротко опишіть спільноту"></textarea>
      <div class="buttons"><button id="createCommunityBtn" onclick="createCommunity()">Створити спільноту</button></div>
      <div id="communityError" class="error hidden"></div>
    </section>
    <section class="account-section"><h2>Мої спільноти</h2><div class="community-list">${cards}</div></section>`;
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
  location.hash = id ? `#/community/${id}/members` : '#/communities';
}

export async function members() {
  const session = await requireSession();
  if (!session) return;

  app.innerHTML = `<section class="hero account-hero"><h1>Учасники</h1><p class="lead">${esc(session.user.email || '')}</p></section>
    ${accountNav('members')}
    <section class="card"><div class="privacy">Завантажуємо учасників...</div></section>`;

  const { data, error } = await db.rpc('get_my_members_v06_rpc', { p_community_id: null });
  if (error) return app.innerHTML = `<section class="hero account-hero"><h1>Учасники</h1></section>${accountNav('members')}<section class="card"><div class="error">${esc(error.message)}</div></section>`;

  const rows = (data || []).length ? data.map(m => `
    <article class="member-card">
      <div><h3>${esc(m.full_name)}</h3><p class="caption">${m.email ? esc(m.email) : 'Email не вказано'}</p></div>
      <a class="community-chip" href="#/community/${esc(m.community_id)}/members">${esc(m.community_name)}</a>
    </article>`).join('') : '<div class="privacy">Учасників ще немає. Додайте їх у конкретній спільноті.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Учасники</h1><p class="lead">${esc(session.user.email || '')}</p></section>
    ${accountNav('members')}
    <section class="account-section"><div class="member-list">${rows}</div></section>`;
}

export async function community(communityId, section = 'members') {
  const session = await requireSession();
  if (!session) return;
  const active = section === 'initiatives' ? 'initiatives' : 'members';

  const { data: communityRows, error: communityError } = await db.rpc('get_my_community_v06_rpc', {
    p_community_id: communityId,
  });
  if (communityError) return app.innerHTML = `<section class="card"><div class="error">${esc(communityError.message)}</div></section>`;

  const item = communityRows?.[0];
  if (!item) return app.innerHTML = '<section class="card"><div class="error">Спільноту не знайдено.</div></section>';

  const header = `<section class="hero community-hero"><p class="eyebrow">Спільнота</p><h1>${esc(item.name)}</h1>${item.description ? `<p class="lead">${esc(item.description)}</p>` : ''}</section>
    ${accountNav('communities')}
    ${communityTabs(communityId, active)}`;

  if (active === 'members') {
    const { data, error } = await db.rpc('get_my_members_v06_rpc', { p_community_id: communityId });
    if (error) return app.innerHTML = header + `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
    const rows = (data || []).length ? data.map(m => `
      <article class="member-card">
        <div><h3>${esc(m.full_name)}</h3><p class="caption">${m.email ? esc(m.email) : 'Email не вказано'}</p></div>
        <span class="tag ok">${m.status === 'active' ? 'Активний' : 'Неактивний'}</span>
      </article>`).join('') : '<div class="privacy">У цій спільноті ще немає учасників.</div>';

    app.innerHTML = header + `
      <section class="card">
        <h2>Додати учасника</h2>
        <label>Імʼя / ПІБ</label><input id="memberName" placeholder="Наприклад: Ірина Протас">
        <label>Email <span class="muted">необовʼязково</span></label><input id="memberEmail" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com">
        <div class="buttons"><button id="addMemberBtn" onclick="addCommunityMember('${esc(communityId)}')">Додати учасника</button></div>
        <div id="memberError" class="error hidden"></div>
      </section>
      <section class="account-section"><h2>Учасники · ${item.members_count}</h2><div class="member-list">${rows}</div></section>`;
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

export async function addCommunityMember(communityId) {
  const nameInput = document.getElementById('memberName');
  const emailInput = document.getElementById('memberEmail');
  const button = document.getElementById('addMemberBtn');
  const errorBox = document.getElementById('memberError');
  const fullName = nameInput?.value.trim() || '';
  const email = emailInput?.value.trim() || '';

  errorBox.classList.add('hidden');
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
  community(communityId, 'members');
}
