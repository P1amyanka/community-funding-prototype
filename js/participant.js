import { db } from './supabase.js';
import { app, date, esc, fail, ferr, loading, money, toast } from './utils.js';

let participantPoll = null;
const keyName = token => `equilibrium-participant-${token}`;
const getParticipantKey = token => {
  let value = localStorage.getItem(keyName(token));
  if (!value) { value = crypto.randomUUID(); localStorage.setItem(keyName(token), value); }
  return value;
};
const isUrl = value => /^https?:\/\//i.test(String(value || '').trim());

function paymentBlock(value) {
  if (!value) return '';
  const safe = esc(value);
  return isUrl(value)
    ? `<p class="status-text">Перейдіть за посиланням для оплати:</p><a class="button" href="${safe}" target="_blank" rel="noopener noreferrer">Перейти до оплати</a>`
    : `<p class="status-text">Скопіюйте реквізити для оплати:</p><div class="link-box"><input id="paymentValue" readonly value="${safe}"><button onclick="copyPaymentValue()">Копіювати</button></div>`;
}

export async function participant(token, silent = false) {
  if (!silent) loading('Завантажуємо ініціативу');
  const participantKey = getParticipantKey(token);
  const { data, error } = await db.rpc('get_participant_state_v04_rpc', { p_participant_token: token, p_participant_key: participantKey });
  if (error) return fail(error.message); const r = data && data[0]; if (!r) return fail('Ініціативу не знайдено.');
  const closed = r.status !== 'open', hasTarget = r.target_amount !== null && r.target_amount !== undefined, hasProposal = r.own_max_amount !== null && r.own_max_amount !== undefined;
  const confirmed = closed && r.feasible === true;
  const notFunded = closed && r.feasible === false;
  const details = hasTarget || r.deadline ? `<section class="card compact"><div class="stats">${hasTarget ? `<div class="stat"><strong>${money(r.target_amount)}</strong><span>необхідна сума</span></div>` : ''}${r.deadline ? `<div class="stat"><strong>${date(r.deadline)}</strong><span>дедлайн</span></div>` : ''}</div></section>` : '';
  let content;
  if (!closed) {
    content = `<div class="title-row"><div><h2>${hasProposal ? 'Ваша пропозиція' : 'Додайте пропозицію'}</h2><p class="caption">Інші учасники не бачать вашу пропозицію.</p></div><div class="step">${r.round_number}</div></div>
      <label>Як вас ідентифікувати?</label><input id="label" value="${esc(r.own_label || '')}" placeholder="Наприклад: кв. 24, Іваненко або Олена">
      <label>Максимальна сума внеску</label><input id="maxAmount" type="number" min="0" value="${hasProposal ? esc(r.own_max_amount) : ''}">
      <div class="buttons"><button id="submitBtn" onclick="submitProposal('${esc(token)}')">${hasProposal ? 'Зберегти зміни' : 'Надіслати пропозицію'}</button></div><div id="submitError" class="error hidden"></div>`;
  } else if (confirmed) {
    content = `<div class="status"><div class="status-main">Ініціатива підтверджена</div>${hasProposal ? `<p class="status-text">Ваш внесок — <strong>${money(r.own_recommended_amount)}</strong>.</p>` : '<p class="status-text">Раунд завершено успішно.</p>'}${paymentBlock(r.payment_details)}</div>`;
  } else if (notFunded) {
    content = `<div class="status"><div class="status-main">Мету не досягнуто</div><p class="status-text">Не вистачає: <strong>${money(r.gap)}</strong>. Менеджер може відкрити новий раунд.</p></div>`;
  } else {
    content = '<div class="privacy"><b>Раунд завершено.</b> Очікуйте подальших дій менеджера.</div>';
  }
  app.innerHTML = `<section class="hero"><h1>${esc(r.title)}</h1><p class="lead">${esc(r.description || 'Спільна фінансова ініціатива.')}</p></section>${details}<section class="card">${content}</section>`;
  clearInterval(participantPoll);
  participantPoll = setInterval(() => {
    const [k, current] = location.hash.replace(/^#\/?/, '').split('/');
    if (k === 'r' && current === token) participant(token, true); else clearInterval(participantPoll);
  }, 5000);
}

export async function submitProposal(token) {
  const e = document.getElementById('submitError'), label = document.getElementById('label').value.trim(), i = document.getElementById('maxAmount'), max = Number(i.value);
  e.classList.add('hidden'); if (!label) return ferr(e, 'Вкажіть, як вас ідентифікувати.'); if (i.value === '') return ferr(e, 'Максимальна сума внеску обовʼязкова.'); if (max < 0) return ferr(e, 'Сума не може бути відʼємною.');
  const b = document.getElementById('submitBtn'); b.disabled = true; b.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('upsert_proposal_v04_rpc', { p_participant_token: token, p_participant_key: getParticipantKey(token), p_participant_label: label, p_max_amount: max });
  b.disabled = false; b.textContent = 'Зберегти зміни'; if (error) return ferr(e, error.message);
  toast('Пропозицію збережено'); participant(token, true);
}

export function copyPaymentValue() {
  const x = document.getElementById('paymentValue');
  navigator.clipboard.writeText(x.value).then(() => toast('Реквізити скопійовано'));
}
