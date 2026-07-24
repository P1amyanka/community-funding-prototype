import { db } from './supabase.js';
import { state } from './state.js';
import { allocationV02, downloadCsv, proposalsWithoutTarget } from './equilibrium.js';
import { app, copyInput, date, esc, fail, ferr, loading, money, purl, toast } from './utils.js';

const historyCsv = item => {
  const rows = Array.isArray(item.proposals) ? item.proposals : [];
  const lines = [['Учасник', 'Максимум', 'Розрахований внесок', 'Раунд'].join(';')];
  rows.forEach(x => lines.push([x.participant_label, x.max, x.recommended ?? '', item.round_number].join(';')));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `round-${item.round_number}.csv`; a.click(); URL.revokeObjectURL(a.href);
};

export async function manager(token) {
  loading('Завантажуємо кабінет менеджера');
  const [{ data: rd, error: re }, { data: p, error: pe }, { data: h, error: he }] = await Promise.all([
    db.rpc('get_manager_state_v04_rpc', { p_manager_token: token }),
    db.rpc('get_manager_proposals_v04_rpc', { p_manager_token: token }),
    db.rpc('get_round_history_v04_rpc', { p_manager_token: token }),
  ]);
  if (re) return fail(re.message); if (pe) return fail(pe.message); if (he) return fail(he.message);
  const r = rd && rd[0]; if (!r) return fail('Ініціативу не знайдено.');
  const proposals = p || [], history = h || [], hasTarget = r.target_amount !== null && r.target_amount !== undefined,
    a = hasTarget ? allocationV02(r.target_amount, proposals) : proposalsWithoutTarget(proposals), closed = r.status !== 'open',
    expected = r.expected_participants ? `${proposals.length} із ${r.expected_participants}` : String(proposals.length);
  const statusContent = hasTarget
    ? `<div class="status-main">${a.feasible ? 'Мета досяжна' : `Не вистачає ${money(a.gap)}`}</div>`
    : `<div class="status-main">${proposals.length ? `Середня пропозиція — ${money(a.averageMax)}` : 'Ще немає пропозицій'}</div>`;
  const historyHtml = history.length ? history.map((x, i) => `<div class="history-item"><div><strong>Раунд ${x.round_number}</strong><small>${x.feasible === true ? 'Мету досягнуто' : x.feasible === false ? `Не вистачило ${money(x.gap)}` : 'Без бюджету'} · ${date(x.closed_at)}</small></div><button class="secondary small" onclick="downloadHistoryCsv(${i})">CSV</button></div>`).join('') : '<div class="privacy">Завершених раундів ще немає.</div>';
  app.innerHTML = `<section class="hero"><h1>Кабінет менеджера</h1><p class="lead">${esc(r.title)}</p></section>
    <section class="card"><div class="title-row"><div><h2>Раунд ${r.round_number}</h2><p class="caption">${esc(r.description || '')}</p></div><span class="tag ${closed ? 'ok' : ''}">${closed ? 'Раунд завершено' : 'Збір триває'}</span></div>
    <div class="status">${statusContent}<div class="stats">${hasTarget ? `<div class="stat"><strong>${money(r.target_amount)}</strong><span>ціль</span></div>` : ''}<div class="stat"><strong>${expected}</strong><span>подали пропозиції</span></div>${r.deadline ? `<div class="stat"><strong>${date(r.deadline)}</strong><span>дедлайн</span></div>` : ''}</div></div>
    <label>Посилання для учасників</label><div class="link-box"><input id="participantLink" readonly value="${esc(purl(r.participant_token))}"><button onclick="copyInput('participantLink')">Копіювати</button></div>
    <div class="buttons">${closed ? `<button onclick="showNextRoundForm()">Новий раунд</button><button class="secondary" onclick="downloadCsv(state.currentRound,state.currentAllocation)">Завантажити CSV</button>` : `<button class="danger" onclick="closeRound('${esc(token)}')">Завершити раунд</button>`}<button class="ghost" onclick="manager('${esc(token)}')">Оновити</button></div>
    <div id="nextRoundForm" class="hidden"><label>Новий дедлайн <span class="muted">необовʼязково</span></label><input id="nextDeadline" type="datetime-local"><button onclick="startNextRound('${esc(token)}')">Відкрити новий раунд</button></div><div id="managerError" class="error hidden"></div></section>
    <section class="card compact"><h2>Пропозиції поточного раунду</h2><div class="table" style="margin-top:12px"><div class="row header"><span>Учасник</span><span>Максимум</span><span>Внесок</span></div>${a.rows.length ? a.rows.map(x => `<div class="row"><strong>${esc(x.participant_label)}</strong><span>${money(x.max)}</span><span>${closed && a.feasible ? money(x.recommended) : '—'}</span></div>`).join('') : '<div class="privacy">Поки немає пропозицій.</div>'}</div></section>
    <section class="card compact"><h2>Історія раундів</h2><div class="history-list">${historyHtml}</div></section>`;
  state.currentRound = r; state.currentAllocation = a; state.roundHistory = history;
}

export async function closeRound(token) {
  if (!confirm('Завершити поточний раунд? Після цього внески не можна буде змінювати.')) return;
  const { error } = await db.rpc('close_round_v04_rpc', { p_manager_token: token });
  if (error) return ferr(document.getElementById('managerError'), error.message);
  toast('Раунд завершено'); manager(token);
}

export function showNextRoundForm() { document.getElementById('nextRoundForm').classList.remove('hidden'); }
export async function startNextRound(token) {
  const value = document.getElementById('nextDeadline').value;
  const { error } = await db.rpc('start_next_round_v04_rpc', { p_manager_token: token, p_deadline: value ? new Date(value).toISOString() : null });
  if (error) return ferr(document.getElementById('managerError'), error.message);
  toast('Новий раунд відкрито'); manager(token);
}
export function downloadHistoryCsv(index) { historyCsv(state.roundHistory[index]); }
export { copyInput, downloadCsv };