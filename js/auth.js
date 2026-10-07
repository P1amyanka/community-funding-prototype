import { db } from './supabase.js';
import { app, date, esc, ferr, money } from './utils.js';
import { getActiveManagerCommunity, syncManagerNavigation, closeManagerMenu } from './navigation.js';

const redirectUrl = `${window.location.origin}${window.location.pathname}`;

export async function updateAccountNav() {
  const link = document.getElementById('accountNavLink');
  if (!link) return;
  const { data } = await db.auth.getSession();
  link.textContent = data?.session ? 'Кабінет' : 'Увійти';
  link.href = '#/login';
}

const initiativeCard = (item, closed = false) => {
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

async function renderAccount(session) {
  await syncManagerNavigation('initiatives');
  const community = await getActiveManagerCommunity();

  const { data: allInitiatives, error } = await db.rpc('get_my_initiatives_v06_rpc', { p_community_id: null });
  if (error) {
    app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
    return;
  }

  const all = allInitiatives || [];
  const legacy = all.filter(x => !x.community_id);
  const legacyHtml = legacy.length
    ? `<section class="account-section"><h2>Старі ініціативи</h2><div class="privacy" style="margin-bottom:12px">Ці ініціативи були створені до появи спільнот.</div><div class="initiative-list">${legacy.map(x => initiativeCard(x, x.status !== 'open')).join('')}</div></section>`
    : '';

  if (!community) {
    app.innerHTML = `<section class="hero account-hero"><h1>Мої ініціативи</h1></section>
      <section class="card"><div class="privacy">Створіть нову ініціативу — спільнота <strong>«Моя спільнота»</strong> буде створена автоматично.</div>
      <div class="buttons"><a class="button" href="#/new-initiative">+ Створити ініціативу</a></div></section>
      ${legacyHtml}`;
    return;
  }

  const items = all.filter(x => x.community_id === community.id);
  const active = items.filter(x => x.status === 'open');
  const closed = items.filter(x => x.status !== 'open');
  const activeHtml = active.length
    ? active.map(x => initiativeCard(x, false)).join('')
    : '<div class="privacy">Активних ініціатив немає.</div>';
  const closedHtml = closed.length
    ? closed.map(x => initiativeCard(x, true)).join('')
    : '<div class="privacy">Завершених ініціатив немає.</div>';

  app.innerHTML = `<section class="hero account-hero"><h1>Мої ініціативи</h1><p class="lead">${esc(community.name)}</p></section>
    <div class="account-create"><a class="button" href="#/new-initiative">+ Створити ініціативу</a></div>
    <section class="account-section"><h2>Активні</h2><div class="initiative-list">${activeHtml}</div></section>
    <section class="account-section"><h2>Завершені</h2><div class="initiative-list">${closedHtml}</div></section>
    ${legacyHtml}`;
}

export async function login() {
  const { data, error } = await db.auth.getSession();
  if (error) {
    app.innerHTML = `<section class="card"><h2>Увійти</h2><div class="error">${esc(error.message)}</div></section>`;
    return;
  }

  const session = data?.session;
  await updateAccountNav();
  if (session) {
    await db.rpc('claim_my_memberships_v11_rpc');
    const { data: roles } = await db.rpc('get_my_account_roles_v11_rpc');
    const role = roles?.[0];
    if (role?.is_manager) return renderAccount(session);
    if (role?.is_participant) {
      location.hash = '#/me/collections';
      return;
    }
    return renderAccount(session);
  }
  await syncManagerNavigation(null);

  app.innerHTML = `<section class="hero"><h1>Увійти</h1><p class="lead">Отримайте одноразове посилання для входу на email.</p></section>
    <section class="card">
      <label>Email</label><input id="authEmail" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com">
      <p class="field-note">Якщо акаунта ще немає, він буде створений після переходу за посиланням із листа.</p>
      <div class="buttons"><button id="authBtn" onclick="sendManagerMagicLink()">Надіслати посилання</button></div>
      <div id="authError" class="error hidden"></div>
      <div id="authSuccess" class="privacy hidden" style="margin-top:14px">Перевірте пошту. Ми надіслали одноразове посилання для входу.</div>
    </section>`;
}

export async function sendManagerMagicLink() {
  const input = document.getElementById('authEmail');
  const button = document.getElementById('authBtn');
  const errorBox = document.getElementById('authError');
  const successBox = document.getElementById('authSuccess');
  if (!input || !button || !errorBox || !successBox) return;

  const email = input.value.trim();
  errorBox.classList.add('hidden');
  successBox.classList.add('hidden');
  if (!email || !input.checkValidity()) return ferr(errorBox, 'Перевірте правильність email.');

  button.disabled = true;
  button.textContent = 'Надсилаємо...';
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl },
  });
  button.disabled = false;
  button.textContent = 'Надіслати посилання';

  if (error) return ferr(errorBox, error.message);
  successBox.classList.remove('hidden');
}

export async function signOutManager() {
  const errorBox = document.getElementById('authError');
  const { error } = await db.auth.signOut();
  if (error && errorBox) return ferr(errorBox, error.message);
  closeManagerMenu();
  await updateAccountNav();
  await syncManagerNavigation(null);
  login();
}
