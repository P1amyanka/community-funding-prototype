import { db } from './supabase.js';
import { app, date, esc, ferr, money } from './utils.js';

const redirectUrl = `${window.location.origin}${window.location.pathname}`;

export async function updateAccountNav() {
  const link = document.getElementById('accountNavLink');
  if (!link) return;
  const { data } = await db.auth.getSession();
  link.textContent = data?.session ? 'Мої ініціативи' : 'Увійти';
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
  app.innerHTML = `<section class="hero"><h1>Мої ініціативи</h1><p class="lead">${esc(session.user.email || '')}</p></section>
    <section class="card"><div class="privacy">Завантажуємо ваші ініціативи...</div></section>`;

  const { data: initiatives, error } = await db.rpc('get_my_initiatives_v04_rpc');
  if (error) {
    app.innerHTML = `<section class="hero"><h1>Мої ініціативи</h1><p class="lead">${esc(session.user.email || '')}</p></section>
      <section class="card"><div class="error">${esc(error.message)}</div>
      <div class="buttons"><button class="secondary" onclick="signOutManager()">Вийти</button></div></section>`;
    return;
  }

  const items = initiatives || [];
  const active = items.filter(x => x.status === 'open');
  const closed = items.filter(x => x.status !== 'open');
  const activeHtml = active.length
    ? active.map(x => initiativeCard(x, false)).join('')
    : '<div class="privacy">Активних ініціатив немає.</div>';
  const closedHtml = closed.length
    ? closed.map(x => initiativeCard(x, true)).join('')
    : '<div class="privacy">Завершених ініціатив немає.</div>';

  app.innerHTML = `<section class="hero account-hero"><div><h1>Мої ініціативи</h1><p class="lead">${esc(session.user.email || '')}</p></div></section>
    <div class="account-create"><a class="button" href="#/">+ Створити ініціативу</a></div>
    <section class="account-section"><h2>Активні</h2><div class="initiative-list">${activeHtml}</div></section>
    <section class="account-section"><h2>Завершені</h2><div class="initiative-list">${closedHtml}</div></section>
    <section class="account-actions"><button class="secondary" onclick="signOutManager()">Вийти</button><div id="authError" class="error hidden"></div></section>`;
}

export async function login() {
  const { data, error } = await db.auth.getSession();
  if (error) {
    app.innerHTML = `<section class="card"><h2>Увійти</h2><div class="error">${esc(error.message)}</div></section>`;
    return;
  }

  const session = data?.session;
  await updateAccountNav();
  if (session) return renderAccount(session);

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
    options: {
      emailRedirectTo: redirectUrl,
    },
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
  await updateAccountNav();
  login();
}
