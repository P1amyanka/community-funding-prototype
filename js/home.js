import { db } from './supabase.js';
import { app, ferr } from './utils.js';
import { route } from './router.js';

export function home() {
  app.innerHTML = `<section class="hero"><h1>Створіть ініціативу.</h1><p class="lead">Опишіть ініціативу та надішліть учасникам посилання. Кожен приватно зазначить максимальну суму внеску.</p></section>
      <section class="card"><div class="title-row"><div><h2>Створити ініціативу</h2><p class="caption">Після створення відкриється кабінет менеджера з посиланням для учасників.</p></div><div class="step">1</div></div>
      <label>Назва ініціативи</label><input id="title" placeholder="Наприклад: зона барбекю у дворі">
      <label>Опис</label><textarea id="description" placeholder="Опишіть, що саме планується зробити"></textarea>
      <label>Бюджет, грн <span class="muted">необовʼязково</span></label><input id="target" type="number" min="1" placeholder="Наприклад: 12000">
      <label>Посилання на Банку, Конверт або номер картки <span class="muted">необовʼязково</span></label><input id="paymentDetails" type="text" inputmode="text" placeholder="https://send.monobank.ua/... або 4441 1111 2222 3333">
      <div class="grid"><div><label>Дедлайн <span class="muted">необовʼязково</span></label><input id="deadline" type="datetime-local"></div>
      <div><label>Кількість учасників <span class="muted">необовʼязково</span></label><input id="expected" type="number" min="1" placeholder="Напр. 24"></div></div>
      <div class="buttons"><button id="createBtn" onclick="createRound()">Створити ініціативу</button></div><div id="createError" class="error hidden"></div></section>`;
}

export async function createRound() {
  const b = document.getElementById('createBtn'), e = document.getElementById('createError'), title = document.getElementById('title').value.trim(),
    description = document.getElementById('description').value.trim(), targetRaw = document.getElementById('target').value.trim(),
    target = targetRaw === '' ? null : Number(targetRaw), paymentDetails = document.getElementById('paymentDetails').value.trim(),
    d = document.getElementById('deadline').value, n = document.getElementById('expected').value;
  e.classList.add('hidden');
  if (!title) return ferr(e, 'Вкажіть назву ініціативи.');
  if (target !== null && (!Number.isFinite(target) || target <= 0)) return ferr(e, 'Бюджет має бути більшим за 0.');
  b.disabled = true; b.textContent = 'Створюємо...';
  const { data, error } = await db.rpc('create_initiative_v04_rpc', {
    p_title: title,
    p_description: description || null,
    p_target_amount: target,
    p_deadline: d ? new Date(d).toISOString() : null,
    p_expected_participants: n ? Number(n) : null,
    p_payment_details: paymentDetails || null,
  });
  b.disabled = false; b.textContent = 'Створити ініціативу';
  if (error) return ferr(e, error.message);
  const r = data && data[0]; if (!r) return ferr(e, 'Ініціативу не створено.');
  route(`/manage/${r.manager_token}`);
}