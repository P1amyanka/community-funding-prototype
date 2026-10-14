import { db } from './supabase.js';
import { app, esc, ferr } from './utils.js';
import { syncManagerNavigation, closeManagerMenu } from './navigation.js';

const redirectUrl = `${window.location.origin}${window.location.pathname}`;

export async function updateAccountNav() {
  const link = document.getElementById('accountNavLink');
  if (!link) return;
  const { data } = await db.auth.getSession();
  link.textContent = data?.session ? 'Кабінет' : 'Увійти';
  link.href = '#/login';
}

async function renderWelcome(session) {
  await syncManagerNavigation(null);
  app.innerHTML = `<section class="hero account-hero"><h1>Вітаємо в Comfundy</h1><p class="lead">${esc(session.user.email || '')}</p></section>
    <section class="card">
      <h2>Створіть спільноту</h2>
      <p class="caption" style="margin-top:8px">Наприклад, свій клас або батьківську групу. Потім додайте учасників і запросіть інших менеджерів.</p>
      <div class="buttons"><a class="button" href="#/communities/new">Створити спільноту</a></div>
    </section>
    <section class="card compact">
      <p class="caption">Вас додали до спільноти як учасника або менеджера? Попросіть менеджера перевірити, що вказано саме цей email.</p>
    </section>`;
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
    if (role?.is_manager) {
      location.hash = '#/announcements';
      return;
    }
    if (role?.is_participant) {
      location.hash = '#/me';
      return;
    }
    return renderWelcome(session);
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
