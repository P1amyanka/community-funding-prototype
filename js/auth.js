import { db } from './supabase.js';
import { app, esc, ferr } from './utils.js';

const redirectUrl = `${window.location.origin}${window.location.pathname}`;

export async function login() {
  const { data, error } = await db.auth.getSession();
  if (error) {
    app.innerHTML = `<section class="card"><h2>Увійти</h2><div class="error">${esc(error.message)}</div></section>`;
    return;
  }

  const session = data?.session;
  if (session) {
    app.innerHTML = `<section class="hero"><h1>Акаунт</h1><p class="lead">Ви увійшли в Comfundy.</p></section>
      <section class="card"><h2>${esc(session.user.email || 'Менеджер')}</h2>
      <p class="caption" style="margin-top:10px">Наступним кроком тут зʼявиться список ваших ініціатив.</p>
      <div class="buttons"><button class="secondary" onclick="signOutManager()">Вийти</button></div>
      <div id="authError" class="error hidden"></div></section>`;
    return;
  }

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
  login();
}
