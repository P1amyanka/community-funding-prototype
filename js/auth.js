import { db } from './supabase.js';
import { app, esc, ferr, redirect } from './utils.js';
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

// Where to go after signing in (set when a signed-out person opens a shared link).
// localStorage, because the email link may open in a new tab; kept for a day.
const AFTER_LOGIN_KEY = 'comfundy:afterLogin';
export function rememberAfterLogin(hash) {
  try { localStorage.setItem(AFTER_LOGIN_KEY, JSON.stringify({ hash, at: Date.now() })); } catch {}
}
function takeAfterLogin() {
  try {
    const saved = JSON.parse(localStorage.getItem(AFTER_LOGIN_KEY) || 'null');
    localStorage.removeItem(AFTER_LOGIN_KEY);
    if (saved?.hash?.startsWith('#/') && Date.now() - saved.at < 864e5) return saved.hash;
  } catch {}
  return null;
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
    const target = takeAfterLogin();
    if (target) {
      redirect(target);
      return;
    }
    const { data: roles } = await db.rpc('get_my_account_roles_v11_rpc');
    const role = roles?.[0];
    if (role?.is_manager) {
      redirect('#/announcements');
      return;
    }
    if (role?.is_participant) {
      redirect('#/me/announcements');
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
      <div id="authSuccess" class="privacy hidden" style="margin-top:14px"></div>
    </section>`;
  resumeResendTimer();
}

// ---------- Resend timer: one link per minute ----------
// The time of the last send is kept in sessionStorage, so the countdown
// survives re-rendering the page (e.g. going back and forth).
const RESEND_SECONDS = 60;
const SENT_KEY = 'comfundy:linkSent';
let resendTicker = null;

function remember(email, seconds = RESEND_SECONDS) {
  try { sessionStorage.setItem(SENT_KEY, JSON.stringify({ email, until: Date.now() + seconds * 1000 })); } catch {}
}
function recall() {
  try { return JSON.parse(sessionStorage.getItem(SENT_KEY) || 'null'); } catch { return null; }
}
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function renderResend() {
  const button = document.getElementById('authBtn');
  const box = document.getElementById('authSuccess');
  const saved = recall();
  if (!button || !box || !saved) { clearInterval(resendTicker); return; }
  const left = Math.ceil((saved.until - Date.now()) / 1000);
  box.classList.remove('hidden');
  if (left > 0) {
    button.disabled = true;
    button.textContent = 'Посилання надіслано';
    box.innerHTML = `Ми надіслали посилання для входу на <strong>${esc(saved.email)}</strong>. Перевірте пошту.<br><span class="resend-note">Надіслати ще раз можна через ${mmss(left)}</span>`;
  } else {
    clearInterval(resendTicker);
    button.disabled = false;
    button.textContent = 'Надіслати ще раз';
    box.innerHTML = `Лист на <strong>${esc(saved.email)}</strong> не прийшов? Перевірте папку «Спам» або надішліть посилання ще раз.`;
  }
}

function startResendTimer() {
  clearInterval(resendTicker);
  renderResend();
  resendTicker = setInterval(renderResend, 1000);
}

function resumeResendTimer() {
  const saved = recall();
  if (!saved) return;
  const input = document.getElementById('authEmail');
  if (input && !input.value) input.value = saved.email;
  startResendTimer();
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

  const wasResend = Boolean(recall());
  button.disabled = true;
  button.textContent = 'Надсилаємо...';
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectUrl },
  });

  if (error) {
    // Supabase limits how often a link can be requested; show it as our countdown.
    const wait = Number((error.message || '').match(/after (\d+) second/)?.[1]);
    if (wait) {
      remember(email, wait);
      return startResendTimer();
    }
    button.disabled = false;
    button.textContent = wasResend ? 'Надіслати ще раз' : 'Надіслати посилання';
    return ferr(errorBox, error.message);
  }
  remember(email);
  window.comfundyTrack?.('login-link-sent');
  startResendTimer();
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
