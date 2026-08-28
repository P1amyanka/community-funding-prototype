import { db } from './supabase.js';
import { state } from './state.js';
import { allocationV02, downloadCsv, proposalsWithoutTarget } from './equilibrium.js';
import { app, copyInput, date, esc, fail, ferr, getRichText, loading, money, purl, richEditor, richText, toast } from './utils.js';

let managerPoll = null;

const historyCsv = item => {
  const rows = Array.isArray(item.proposals) ? item.proposals : [];
  const lines = [['Учасник', 'Максимум', 'Розрахований внесок', 'Коментар', 'Раунд'].join(';')];
  rows.forEach(x => lines.push([x.participant_label, x.max, x.recommended ?? '', csvValue(x.comment), item.round_number].join(';')));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `round-${item.round_number}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

const csvValue = value => {
  const s = String(value ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const datetimeLocalValue = value => {
  if (!value) return '';
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

function startManagerPolling(token) {
  clearInterval(managerPoll);
  managerPoll = setInterval(() => {
    const [kind, current] = location.hash.replace(/^#\/?/, '').split('/');
    if (kind === 'manage' && current === token && !document.getElementById('nextTitle') && !document.getElementById('commentDrawer')) {
      manager(token, true);
    } else if (kind !== 'manage' || current !== token) {
      clearInterval(managerPoll);
    }
  }, 5000);
}

export async function manager(token, silent = false) {
  if (!silent) loading('Завантажуємо кабінет менеджера');
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
  const proposalTitle = closed ? 'Пропозиції останнього раунду' : 'Пропозиції поточного раунду';

  const statusContent = hasTarget
    ? `<div class="status-main">${allocation.feasible ? 'Мета досяжна' : `Не вистачає ${money(allocation.gap)}`}</div>`
    : `<div class="status-main">${proposals.length ? 'Фінансова готовність спільноти' : 'Ще немає пропозицій'}</div>`;

  const proposalStats = proposals.length
    ? `<div class="stats"><div class="stat"><strong>${expected}</strong><span>подали пропозиції</span></div><div class="stat"><strong>${money(allocation.minimumMax)}</strong><span>мінімум</span></div><div class="stat"><strong>${money(allocation.maximumMax)}</strong><span>максимум</span></div><div class="stat"><strong>${money(allocation.medianMax)}</strong><span>медіана</span></div><div class="stat"><strong>${money(allocation.averageMax)}</strong><span>середнє</span></div></div>`
    : `<div class="stats"><div class="stat"><strong>${expected}</strong><span>подали пропозиції</span></div></div>`;

  const historyHtml = history.length
    ? history.map((x, i) => `<div class="history-item"><div><strong>Раунд ${x.round_number}</strong><small>${x.feasible === true ? 'Мету досягнуто' : x.feasible === false ? `Не вистачило ${money(x.gap)}` : 'Без бюджету'} · ${date(x.closed_at)}</small></div><button class="secondary small" onclick="downloadHistoryCsv(${i})">CSV</button></div>`).join('')
    : '<div class="privacy">Завершених раундів ще немає.</div>';

  const commentsColumn = r.comments_enabled;
  const tableHeader = commentsColumn
    ? '<div class="row header comments-row"><span>Учасник</span><span>Максимум</span><span>Внесок</span><span>Коментар</span></div>'
    : '<div class="row header"><span>Учасник</span><span>Максимум</span><span>Внесок</span></div>';
  const tableRows = allocation.rows.length
    ? allocation.rows.map((x, i) => commentsColumn
      ? `<div class="row comments-row"><strong>${esc(x.participant_label)}</strong><span>${money(x.max)}</span><span>${closed && allocation.feasible ? money(x.recommended) : '—'}</span><span>${x.comment ? `<button class="comment-link" onclick="showProposalComment(${i})">Переглянути</button>` : '—'}</span></div>`
      : `<div class="row"><strong>${esc(x.participant_label)}</strong><span>${money(x.max)}</span><span>${closed && allocation.feasible ? money(x.recommended) : '—'}</span></div>`).join('')
    : '<div class="privacy">Поки немає пропозицій.</div>';

  app.innerHTML = `<section class="hero"><h1>Кабінет менеджера</h1><p class="lead">${esc(r.title)}</p></section>
    <section class="card"><div class="title-row"><div><h2>Раунд ${r.round_number}</h2><div class="caption rich-content">${richText(r.description)}</div></div><span class="tag ${closed ? 'ok' : ''}">${closed ? 'Раунд завершено' : 'Збір триває'}</span></div>
    <div class="status">${statusContent}${proposalStats}${hasTarget ? `<div class="stats"><div class="stat"><strong>${money(r.target_amount)}</strong><span>ціль</span></div>${r.deadline ? `<div class="stat"><strong>${date(r.deadline)}</strong><span>дедлайн</span></div>` : ''}</div>` : r.deadline ? `<div class="stats"><div class="stat"><strong>${date(r.deadline)}</strong><span>дедлайн</span></div></div>` : ''}</div>
    <label>Посилання для учасників</label><div class="link-box"><input id="participantLink" readonly value="${esc(purl(r.participant_token))}"><button onclick="copyInput('participantLink')">Копіювати</button></div>
    <div class="buttons">${closed ? `<button onclick="showNextRoundForm('${esc(token)}')">Новий раунд</button><button class="secondary" onclick="downloadCsv(state.currentRound,state.currentAllocation)">Завантажити CSV</button>` : `<button id="closeRoundBtn" class="danger" onclick="closeRound('${esc(token)}')">Завершити раунд</button>`}<button class="ghost" onclick="manager('${esc(token)}')">Оновити</button></div>
    <div id="managerError" class="error hidden"></div></section>
    <section class="card compact"><h2>${proposalTitle}</h2><div class="table" style="margin-top:12px">${tableHeader}${tableRows}</div></section>
    <section class="card compact"><h2>Історія раундів</h2><div class="history-list">${historyHtml}</div></section>`;

  state.currentRound = r;
  state.currentAllocation = allocation;
  state.roundHistory = history;
  startManagerPolling(token);
}

export function showProposalComment(index) {
  const row = state.currentAllocation?.rows?.[index];
  if (!row || !row.comment) return;
  clearInterval(managerPoll);
  const overlay = document.createElement('div');
  overlay.id = 'commentDrawer';
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `<button class="drawer-backdrop" aria-label="Закрити" onclick="closeProposalComment()"></button><aside class="comment-drawer" role="dialog" aria-modal="true" aria-labelledby="commentDrawerTitle"><div class="drawer-head"><div><h2 id="commentDrawerTitle">Коментар до внеску</h2><p class="caption">${esc(row.participant_label)} · Максимальна сума: ${money(row.max)}</p></div><button class="drawer-close" aria-label="Закрити" onclick="closeProposalComment()">×</button></div><div class="comment-text">${esc(row.comment)}</div></aside>`;
  document.body.appendChild(overlay);
}

export function closeProposalComment() {
  const drawer = document.getElementById('commentDrawer');
  if (drawer) drawer.remove();
  const [kind, token] = location.hash.replace(/^#\/?/, '').split('/');
  if (kind === 'manage' && token) startManagerPolling(token);
}

export function showNextRoundForm(token) {
  clearInterval(managerPoll);
  const r = state.currentRound;
  if (!r) return;
  app.innerHTML = `<section class="hero"><h1>Ви створюєте новий раунд</h1><p class="lead">Підтвердьте дані ініціативи або змініть їх перед відкриттям нового раунду.</p></section>
    <section class="card"><div class="title-row"><div><h2>Новий раунд</h2><p class="caption">Посилання для учасників і менеджера залишаться незмінними.</p></div><div class="step">${r.round_number + 1}</div></div>
    <label>Назва ініціативи</label><input id="nextTitle" value="${esc(r.title)}">
    <label>Опис</label>${richEditor('nextDescription', r.description || '', 'Опишіть, що саме планується зробити')}
    <label>Бюджет, грн <span class="muted">необовʼязково</span></label><input id="nextTarget" type="number" min="1" value="${r.target_amount ?? ''}">
    <label>Платіжні реквізити <span class="muted">необовʼязково</span></label><input id="nextPaymentDetails" type="text" value="${esc(r.payment_details || '')}" placeholder="Посилання або номер картки">
    <label>Дедлайн <span class="muted">необовʼязково</span></label><input id="nextDeadline" type="datetime-local" value="${datetimeLocalValue(r.deadline)}">
    <label>Кількість учасників <span class="muted">необовʼязково</span></label><input id="nextExpected" type="number" min="1" value="${r.expected_participants ?? ''}">
    <div class="buttons"><button id="confirmNextRoundBtn" onclick="startNextRound('${esc(token)}')">Підтвердити</button></div>
    <div id="managerError" class="error hidden"></div></section>`;
}

export async function closeRound(token) {
  const errorBox = document.getElementById('managerError');
  const button = document.getElementById('closeRoundBtn');
  if (!button) return;
  errorBox.classList.add('hidden');
  button.disabled = true;
  button.textContent = 'Завершуємо...';
  const { error } = await db.rpc('close_round_v04_rpc', { p_manager_token: token });
  if (error) {
    button.disabled = false;
    button.textContent = 'Завершити раунд';
    return ferr(errorBox, error.message);
  }
  toast('Раунд завершено');
  manager(token);
}

export async function startNextRound(token) {
  const errorBox = document.getElementById('managerError');
  const button = document.getElementById('confirmNextRoundBtn');
  const title = document.getElementById('nextTitle').value.trim();
  const description = getRichText('nextDescription');
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
