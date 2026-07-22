import { db } from './supabase.js';
import { app, date, esc, fail, ferr, loading, money } from './utils.js';
import { route } from './router.js';

export async function participant(token) {
  loading('Завантажуємо ініціативу');
  const { data, error } = await db.rpc('get_round_for_participant_rpc', { p_participant_token: token });
  if (error) return fail(error.message); const r = data && data[0]; if (!r) return fail('Ініціативу не знайдено.');
  const closed = r.status !== 'open', hasTarget = r.target_amount !== null && r.target_amount !== undefined;
  const details = hasTarget || r.deadline ? `<section class="card compact"><div class="stats">${hasTarget ? `<div class="stat"><strong>${money(r.target_amount)}</strong><span>необхідна сума</span></div>` : ''}${r.deadline ? `<div class="stat"><strong>${date(r.deadline)}</strong><span>дедлайн</span></div>` : ''}</div></section>` : '';
  app.innerHTML = `<section class="hero"><h1>${esc(r.title)}</h1><p class="lead">${esc(r.description || 'Спільна фінансова ініціатива.')}</p></section>${details}
      <section class="card"><div class="title-row"><div><h2>Ваша пропозиція</h2><p class="caption">Інші учасники не бачать вашу пропозицію.</p></div><div class="step">2</div></div>
      ${closed ? '<div class="privacy"><b>Ініціативу завершено.</b> Нові пропозиції не приймаються.</div>' : `<label>Як вас ідентифікувати?</label><input id="label" placeholder="Наприклад: кв. 24, Іваненко або Олена"><label>Максимальна сума внеску</label><input id="maxAmount" type="number" min="0"><div class="buttons"><button id="submitBtn" onclick="submitProposal('${esc(token)}')">Надіслати пропозицію</button></div><div id="submitError" class="error hidden"></div>`}</section>`;
}

export async function submitProposal(token) {
  const e = document.getElementById('submitError'), label = document.getElementById('label').value.trim(), i = document.getElementById('maxAmount'), max = Number(i.value);
  e.classList.add('hidden'); if (!label) return ferr(e, 'Вкажіть, як вас ідентифікувати.'); if (i.value === '') return ferr(e, 'Максимальна сума внеску обовʼязкова.'); if (max < 0) return ferr(e, 'Сума не може бути відʼємною.');
  const b = document.getElementById('submitBtn'); b.disabled = true; b.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('submit_proposal_rpc', { p_participant_token: token, p_participant_label: label, p_min_amount: 0, p_max_amount: max });
  b.disabled = false; b.textContent = 'Надіслати пропозицію'; if (error) return ferr(e, error.message); route('/thanks');
}

export function thanks() {
  app.innerHTML = '<section class="card"><div class="title-row"><div><h2>Дякуємо!</h2><p class="caption">Ваша пропозиція збережена.</p></div><div class="step">✓</div></div><div class="status"><div class="status-main">Ініціатива триває</div><p class="status-text">Після завершення ви дізнаєтесь результат.</p></div></section>';
}
