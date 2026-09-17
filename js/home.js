import { db } from './supabase.js';
import { app, esc, ferr, getRichText, richEditor, toast } from './utils.js';
import { route } from './router.js';

export async function home() {
  const { data } = await db.auth.getSession();
  const session = data?.session || null;
  const managerEmailBlock = session
    ? `<div class="email-delivery-block"><div class="privacy">Ви увійшли як <strong>${esc(session.user.email || '')}</strong>. Ініціатива автоматично зʼявиться в «Мої ініціативи».</div></div>`
    : `<div class="email-delivery-block">
        <label>Відправити посилання на email <span class="muted">необовʼязково</span></label>
        <input id="managerEmail" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com">
      </div>`;

  app.innerHTML = `<section class="card"><h2>Створити ініціативу</h2><p class="lead form-intro">Опишіть ініціативу та надішліть учасникам посилання. Кожен приватно зазначить максимальну суму внеску.</p>
      <label>Назва ініціативи</label><input id="title" placeholder="Наприклад: зона барбекю у дворі">
      <label>Опис</label>${richEditor('description', '', 'Опишіть, що саме планується зробити')}
      <label>Бюджет, грн <span class="muted">необовʼязково</span></label><input id="target" type="number" min="1" placeholder="Наприклад: 12000">
      <label>Платіжні реквізити <span class="muted">необовʼязково</span></label><input id="paymentDetails" type="text" inputmode="text" placeholder="Посилання або номер картки">
      <label>Дедлайн <span class="muted">необовʼязково</span></label><input id="deadline" type="datetime-local">
      <label>Кількість учасників <span class="muted">необовʼязково</span></label><input id="expected" type="number" min="1" placeholder="Напр. 24">
      <label class="check-row"><input id="commentsEnabled" type="checkbox" checked><span>Дозволити коментарі учасникам</span></label>
      ${managerEmailBlock}
      <div class="buttons"><button id="createBtn" onclick="createRound()">Створити ініціативу</button></div><div id="createError" class="error hidden"></div></section>`;
}

export async function createRound() {
  const b = document.getElementById('createBtn'), e = document.getElementById('createError'), title = document.getElementById('title').value.trim(),
    description = getRichText('description'), targetRaw = document.getElementById('target').value.trim(),
    target = targetRaw === '' ? null : Number(targetRaw), paymentDetails = document.getElementById('paymentDetails').value.trim(),
    d = document.getElementById('deadline').value, n = document.getElementById('expected').value,
    commentsEnabled = document.getElementById('commentsEnabled').checked,
    managerEmailInput = document.getElementById('managerEmail');

  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData?.session || null;
  const managerEmail = session?.user?.email || managerEmailInput?.value.trim() || '';
  const shouldSendManagerLink = !session && Boolean(managerEmail);

  e.classList.add('hidden');
  if (!title) return ferr(e, 'Вкажіть назву ініціативи.');
  if (target !== null && (!Number.isFinite(target) || target <= 0)) return ferr(e, 'Бюджет має бути більшим за 0.');
  if (managerEmailInput && managerEmail && !managerEmailInput.checkValidity()) return ferr(e, 'Перевірте правильність email.');
  b.disabled = true; b.textContent = 'Створюємо...';
  const { data, error } = await db.rpc('create_initiative_v04_rpc', {
    p_title: title,
    p_description: description || null,
    p_target_amount: target,
    p_deadline: d ? new Date(d).toISOString() : null,
    p_expected_participants: n ? Number(n) : null,
    p_payment_details: paymentDetails || null,
    p_comments_enabled: commentsEnabled,
    p_manager_email: managerEmail || null,
  });
  if (error) {
    b.disabled = false; b.textContent = 'Створити ініціативу';
    return ferr(e, error.message);
  }
  const r = data && data[0];
  if (!r) {
    b.disabled = false; b.textContent = 'Створити ініціативу';
    return ferr(e, 'Ініціативу не створено.');
  }

  let emailError = null;
  if (shouldSendManagerLink) {
    const result = await db.functions.invoke('send-manager-link', {
      body: { managerToken: r.manager_token },
    });
    emailError = result.error;
  }

  b.disabled = false; b.textContent = 'Створити ініціативу';
  if (shouldSendManagerLink) {
    toast(emailError ? 'Ініціативу створено, але лист не відправлено' : 'Посилання відправлено на email');
  }
  route(`/manage/${r.manager_token}`);
}
