import { db } from './supabase.js';
import { state } from './state.js';
import { allocationV02, downloadCsv, proposalsWithoutTarget } from './equilibrium.js';
import { app, copyInput, date, esc, fail, loading, money, purl, toast } from './utils.js';

export async function manager(token) {
  loading('Завантажуємо кабінет менеджера');
  const [{ data: rd, error: re }, { data: p, error: pe }] = await Promise.all([db.rpc('get_manager_round_rpc', { p_manager_token: token }), db.rpc('get_manager_proposals_rpc', { p_manager_token: token })]);
  if (re) return fail(re.message); if (pe) return fail(pe.message); const r = rd && rd[0]; if (!r) return fail('Ініціативу не знайдено.');
  const proposals = p || [], hasTarget = r.target_amount !== null && r.target_amount !== undefined, a = hasTarget ? allocationV02(r.target_amount, proposals) : proposalsWithoutTarget(proposals),
    pct = hasTarget ? Math.min(100, a.sumMax / Number(r.target_amount || 1) * 100) : 0, answered = proposals.length,
    expected = r.expected_participants ? `${answered} із ${r.expected_participants}` : String(answered), closed = r.status !== 'open';
  const statusContent = hasTarget
    ? `<div class="status-label"><span class="dot ${a.feasible ? 'ok' : ''}"></span><span>${a.feasible ? 'Необхідну суму можна зібрати' : 'Поки що суми недостатньо'}</span></div><div class="status-main">${a.feasible ? 'Мета досяжна' : `Не вистачає ${money(a.gap)}`}</div><div class="meter"><div class="bar" style="width:${pct}%"></div></div>`
    : `<div class="status-label"><span class="dot neutral"></span><span>Попередня оцінка без бюджету</span></div><div class="status-main">${answered ? `Середня пропозиція — ${money(a.averageMax)}` : 'Ще немає пропозицій'}</div><p class="status-text">Оскільки бюджет не заданий, алгоритм розподілу не застосовується. Система показує середню максимальну суму, яку готові внести учасники.</p>`;
  app.innerHTML = `<section class="hero"><h1>Кабінет менеджера</h1><p class="lead">${esc(r.title)}</p></section>
      <section class="card"><div class="title-row"><div><h2>Поточний стан</h2><p class="caption">${esc(r.description || '')}</p></div><span class="tag ${closed ? 'ok' : ''}">${closed ? 'Ініціативу завершено' : 'Збір пропозицій триває'}</span></div>
      <div class="status">${statusContent}<div class="stats">${hasTarget
        ? `<div class="stat"><strong>${money(r.target_amount)}</strong><span>ціль</span></div><div class="stat"><strong>${money(a.sumMax)}</strong><span>сума максимумів</span></div>`
        : `<div class="stat"><strong>${money(a.averageMax)}</strong><span>середня пропозиція</span></div><div class="stat"><strong>${money(a.sumMax)}</strong><span>сума пропозицій</span></div>`}
      <div class="stat"><strong>${expected}</strong><span>подали пропозиції</span></div>${r.deadline ? `<div class="stat"><strong>${date(r.deadline)}</strong><span>дедлайн</span></div>` : ''}</div></div>
      <label>Посилання для учасників</label><div class="link-box"><input id="participantLink" readonly value="${esc(purl(r.participant_token))}"><button onclick="copyInput('participantLink')">Копіювати</button></div>
      <div class="buttons">${closed ? '<button class="secondary" onclick="downloadCsv(state.currentRound,state.currentAllocation)">Завантажити CSV</button>' : `<button class="danger" onclick="closeRound('${esc(token)}')">Завершити ініціативу</button>`}<button class="ghost" onclick="manager('${esc(token)}')">Оновити</button></div></section>
      <section class="card compact"><h2>Пропозиції</h2><p class="caption">${hasTarget ? 'Цей список бачить тільки менеджер.' : 'Для ініціативи без бюджету показані фактичні пропозиції учасників без розрахованого внеску.'}</p><div class="table" style="margin-top:12px">
      <div class="row header" style="${hasTarget ? '' : 'grid-template-columns:1.4fr .9fr'}"><span>Учасник</span><span>Максимум</span>${hasTarget ? '<span>Внесок</span>' : ''}</div>
      ${a.rows.length ? a.rows.map(x => `<div class="row" style="${hasTarget ? '' : 'grid-template-columns:1.4fr .9fr'}"><strong>${esc(x.participant_label)}</strong><span>${money(x.max)}</span>${hasTarget ? `<span>${a.feasible ? money(x.recommended) : '—'}</span>` : ''}</div>`).join('') : '<div class="privacy">Поки немає пропозицій. Надішліть учасникам посилання.</div>'}</div></section>`;
  state.currentRound = r; state.currentAllocation = a;
}

export async function closeRound(token) {
  if (!confirm('Завершити ініціативу? Після цього нові пропозиції не прийматимуться.')) return;
  const { error } = await db.rpc('close_round_rpc', { p_manager_token: token });
  if (error) return toast(error.message); toast('Ініціативу завершено'); manager(token);
}

export { copyInput, downloadCsv };
