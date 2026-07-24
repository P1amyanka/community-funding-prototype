import { db } from './supabase.js';
import { state } from './state.js';
import { allocationV02, downloadCsv, proposalsWithoutTarget } from './equilibrium.js';
import { app, copyInput, date, esc, fail, ferr, loading, money, purl, toast } from './utils.js';

const historyCsv = item => {
  const rows = Array.isArray(item.proposals) ? item.proposals : [];
  const lines = [['Учасник', 'Максимум', 'Розрахований внесок', 'Раунд'].join(';')];
  rows.forEach(x => lines.push([x.participant_label, x.max, x.recommended ?? '', item.round_number].join(';')));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `round-${item.round_number}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

const datetimeLocalValue = value => {
  if (!value) return '';
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export async function manager(token) {
  loading('Завантажуємо кабінет менеджера');
  const [{ data: rd, error: re }, { data: p, error: pe }, { data: h, error: he }] = await Promise.all([
    db.rpc('get_manager_state_v04_rpc', { p_manager_token: token }),
    db.rpc('get_manager_proposals_v04_rpc', { p_manager_token: token }),
    db.rpc('get_round_history_v04_rpc', { p_manager_token: token }),
  ]);
  if (re) return fail(re.message);
  if (pe) return fail(pe.message);
  if (he) return fail(he.message);

  const r = rd && rd[0];
  if (!r) return fail('Ініціативу не знайдено.');

  const proposals = p || [];
  const history = h || [];
  const hasTarget = r.target_amount !== null && r.target_amount !== undefined;
  const allocation = hasTarget ? allocationV02(r.target_amount, proposals) : proposalsWithoutTarget(proposals);
  const closed = r.status !== 'open';
  const expected = r.expected_participants ? `${proposals.length} із ${r.expected_participants}` : String(proposals.length);

  const statusContent = hasTarget
    ? `<div class="status-main">${allocation.feasible ? 'Мета досяжна' : `Не вистачає ${money(allocation.gap)}`}</div>`
    : `<div class="status-main">${proposals.length ? `Середня пропозиція — ${money(allocation.averageMax)}` : 'Ще немає пропозицій'}</div>`;

  const historyHtml = history.length
    ? history.map((x, i) => `<div class="history-item"><div><strong>Раунд ${x.round_number}</strong><small>${x.feasible === true ? 'Мету досягнуто' : x.feasible === false ? `Не вистачило ${money(x.gap)}` : 'Без бюджету'} · ${date(x.closed_at)}</small></div><button class="secondary small" onclick="downloadHistoryCsv(${i})">CSV</button></div>`).join('')
    : '<div class="privacy">Завершених раундів ще немає.</div>';

  app.innerHTML = `<section class="hero"><h1>Кабінет менеджера</h1><p class="lead">${esc(r.title)}</p></section>
    <section class="card"><div class="title-row"><div><h2>Раунд ${r.round_number}</h2><p class="caption">${esc(r.description || '')}</p></div><span class="tag ${closed ? 'ok' : ''}">${closed ? 'Раунд завершено' : 'Збір триває'}</span></div>
    <div class="status">${statusContent}<div class="stats">${hasTarget ? `<div class="stat"><strong>${money(r.target_amount)}</strong><span>ціль</span></div>` : ''}<div class="stat"><strong>${expected}</strong><span>подали пропозиції</span></div>${r.deadline ? `<div class="stat"><strong>${date(r.deadline)}</strong><span>дедлайн</span></div>` : ''}</div></div>
    <label>Посилання для учасників</label><div class="link-box"><input id="participantLink" readonly value="${esc(purl(r.participant_token))}"><button onclick="copyInput('participantLink')">Копіювати</button></div>
    <div class="buttons">${closed ? `<button onclick="showNextRoundForm('${esc(token)}')">Новий раунд</button><button class="secondary" onclick="downloadCsv(state.currentRound,state.currentAllocation)">Завантажити CSV</button>` : `<button class="danger" onclick="closeRound('${esc(token)}')">Завершити раунд</button>`}<button class="ghost" onclick="manager('${esc(token)}')">Оновити</button></div>
    <div id="managerError" class="error hidden"></div></section>
    <section class="card compact"><h2>Пропозиції поточного раунду</h2><div class="table" style="margin-top:12px"><div class="row header"><span>Учасник</span><span>Максимум</span><span>Внесок</span></div>${allocation.rows.length ? allocation.rows.map(x => `<div class="row"><strong>${esc(x.participant_label)}</strong><span>${money(x.max)}</span><span>${closed && allocation.feasible ? money(x.recommended) : '—'}</span></div>`).join('') : '<div class="privacy">Поки немає пропозицій.</div>'}</div></section>
    <section class="card compact"><h2>Історія раундів</h2><div class="history-list">${historyHtml}</div></section>`;

  state.currentRound = r;
  state.currentAllocation = allocation;
  state.roundHistory = history;
}

export function showNextRoundForm(token) {
  const r = state.currentRound;
  if (!r) return;

  app.innerHTML = `<section class="hero"><h1>Ви створюєте новий раунд</h1><p class="lead">Підтвердьте дані ініціативи або змініть їх перед відкриттям нового раунду.</p></section>
    <section class="card"><div class="title-row"><div><h2>Новий раунд</h2><p class="caption">Посилання для учасників і менеджера залишаться незмінними.</p></div><div class="step">${r.round_number + 1}</div></div>
    <label>Назва ініціативи</label><input id="nextTitle" value="${esc(r.title)}">
    <label>Опис</label><textarea id="nextDescription">${esc(r.description || '')}</textarea>
    <label>Бюджет, грн <span class="muted">необовʼязково</span></label><input id="nextTarget" type="number" min="1" value="${r.target_amount ?? ''}">
    <label>Платіжні реквізити <span class="muted">необовʼязково</span></label><input id="nextPaymentDetails" type="text" value="${esc(r.payment_details || '')}" placeholder="Посилання або номер картки">
    <div class="grid"><div><label>Дедлайн <span class="muted">необовʼязково</span></label><input id="nextDeadline" type="datetime-local" value="${datetimeLocalValue(r.deadline)}"></div>
    <div><label>Кількість учасників <span class="muted">необовʼязково</span></label><input id="nextExpected" type="number" min="1" value="${r.expected_participants ?? ''}"></div></div>
    <div class="buttons"><button id="confirmNextRoundBtn" onclick="startNextRound('${esc(token)}')">Підтвердити</button></div>
    <div id="managerError" class="error hidden"></div></section>`;
}

export async function closeRound(token) {
  if (!confirm('Завершити поточний раунд? Після цього внески не можна буде змінювати.')) return;
  const { error } = await db.rpc('close_round_v04_rpc', { p_manager_token: token });
  if (error) return ferr(document.getElementById('managerError'), error.message);
  toast('Раунд завершено');
  manager(token);
}

export async function startNextRound(token) {
  const errorBox = document.getElementById('managerError');
  const button = document.getElementById('confirmNextRoundBtn');
  const title = document.getElementById('nextTitle').value.trim();
  const description = document.getElementById('nextDescription').value.trim();
  const targetRaw = document.getElementById('nextTarget').value.trim();
  const target = targetRaw === '' ? null : Number(targetRaw);
  const paymentDetails = document.getElementById('nextPaymentDetails').value.trim();
  const deadline = document.getElementById('nextDeadline').value;
  const expectedRaw = document.getElementById('nextExpected').value.trim();
  const expected = expectedRaw === '' ? null : Number(expectedRaw);

  errorBox.classList.add('hidden');
  if (!title) return ferr(errorBox, 'Вкажіть назву ініціативи.');
  if (target !== null && (!Number.isFinite(target) || target <= 0)) return ferr(errorBox, 'Бюджет має бути більшим за 0.');
  if (expected !== null && (!Number.isInteger(expected) || expected <= 0)) return ferr(errorBox, 'Кількість учасників має бути більшою за 0.');

  button.disabled = true;
  button.textContent = 'Підтверджуємо...';
  const { error } = await db.rpc('start_next_round_v04_rpc', {
    p_manager_token: token,
    p_title: title,
    p_description: description || null,
    p_target_amount: target,
    p_deadline: deadline ? new Date(deadline).toISOString() : null,
    p_expected_participants: expected,
    p_payment_details: paymentDetails || null,
  });
  button.disabled = false;
  button.textContent = 'Підтвердити';
  if (error) return ferr(errorBox, error.message);

  toast('Новий раунд відкрито');
  manager(token);
}

export function downloadHistoryCsv(index) {
  historyCsv(state.roundHistory[index]);
}

export { copyInput, downloadCsv };
