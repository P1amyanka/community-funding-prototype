import { db } from './supabase.js';
import { state } from './state.js';
import { allocationV02, downloadCsv, proposalsWithoutTarget } from './equilibrium.js';
import { app, date, esc, fail, ferr, getRichText, loading, money, redirect, richEditor, richText, richTextToPlainText, toast } from './utils.js';
import { getActiveManagerCommunity, syncManagerNavigation } from './navigation.js';

let managerPoll = null;

async function requireManager() {
  const { data } = await db.auth.getSession();
  if (!data?.session) {
    redirect('#/login');
    return null;
  }
  await syncManagerNavigation('initiatives');
  return data.session;
}

const noCommunity = title => `<section class="hero account-hero"><h1>${title}</h1></section>
  <section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">Створити спільноту</a></div></section>`;

const csvValue = value => {
  const s = String(value ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const historyCsv = item => {
  const rows = Array.isArray(item.proposals) ? item.proposals : [];
  const lines = [['Учасник', 'Максимум', 'Розрахований внесок', 'Коментар', 'Раунд'].join(';')];
  rows.forEach(x => lines.push([csvValue(x.participant_label), x.max, x.recommended ?? '', csvValue(richTextToPlainText(x.comment)), item.round_number].join(';')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
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

const initiativeCard = item => {
  const closed = item.status !== 'open';
  const finance = item.target_amount !== null && item.target_amount !== undefined
    ? `<div class="initiative-finance"><strong>${money(item.sum_max)}</strong><span>із ${money(item.target_amount)} цілі</span></div>`
    : `<div class="initiative-finance"><strong>${money(item.sum_max)}</strong><span>сума максимумів</span></div>`;
  const meta = closed
    ? `Раунд ${item.round_number} · Завершено ${date(item.closed_at)}`
    : `Раунд ${item.round_number} · Відповідей: ${item.proposals_count}`;
  return `<article class="initiative-card">
    <div class="initiative-card-head">
      <div><h3>${esc(item.title)}</h3><p class="caption">${meta}</p></div>
      <span class="tag ${closed ? 'ok' : ''}">${closed ? 'Завершена' : 'Активна'}</span>
    </div>
    ${finance}
    <a class="initiative-open" href="#/initiatives/${esc(item.id)}">Відкрити →</a>
  </article>`;
};

// --- List --------------------------------------------------------------------

export async function initiatives() {
  if (!await requireManager()) return;
  const community = await getActiveManagerCommunity();
  if (!community) return app.innerHTML = noCommunity('Ініціативи');

  const { data, error } = await db.rpc('get_community_initiatives_v15_rpc', { p_community_id: community.id });
  if (error) return fail(error.message);
  const items = data || [];
  const active = items.filter(x => x.status === 'open');
  const closed = items.filter(x => x.status !== 'open');

  app.innerHTML = `<section class="hero account-hero tab-hero"><h1>Ініціативи</h1><p class="lead">${esc(community.name)}</p></section>
    <div class="account-create"><a class="button" href="#/initiatives/new">Створити ініціативу</a></div>
    <section class="account-section"><h2>Активні</h2><div class="initiative-list">${active.length ? active.map(initiativeCard).join('') : '<div class="privacy">Активних ініціатив немає.</div>'}</div></section>
    <section class="account-section"><h2>Завершені</h2><div class="initiative-list">${closed.length ? closed.map(initiativeCard).join('') : '<div class="privacy">Завершених ініціатив немає.</div>'}</div></section>`;
}

// --- Create ------------------------------------------------------------------

export async function newInitiative() {
  if (!await requireManager()) return;
  const community = await getActiveManagerCommunity();
  if (!community) return app.innerHTML = noCommunity('Нова ініціатива');

  app.innerHTML = `<a class="page-back" href="#/initiatives">← Ініціативи</a>
    <section class="card"><h2>Створити ініціативу</h2><p class="lead form-intro">Опишіть ідею. Кожен учасник у своєму кабінеті вкаже максимальну суму, яку готовий внести; інші учасники цих сум не бачать.</p>
      <div class="privacy community-context">Спільнота: <strong>${esc(community.name)}</strong></div>
      <input id="communityId" type="hidden" value="${esc(community.id)}">
      <label>Назва ініціативи</label><input id="title" placeholder="Наприклад: новий принтер для класу">
      <label>Опис</label>${richEditor('description', '', 'Опишіть, що саме планується зробити')}
      <label>Бюджет, грн <span class="muted">необовʼязково</span></label><input id="target" type="number" min="1" placeholder="Наприклад: 12000">
      <label>Платіжні реквізити <span class="muted">необовʼязково</span></label><input id="paymentDetails" type="text" inputmode="text" placeholder="Посилання або номер картки">
      <label>Дедлайн <span class="muted">необовʼязково</span></label><input id="deadline" type="datetime-local">
      <label>Очікувана кількість відповідей <span class="muted">необовʼязково</span></label><input id="expected" type="number" min="1" value="${community.members_count || ''}">
      <p class="field-note">За замовчуванням — кількість активних учасників спільноти.</p>
      <label class="check-row"><input id="commentsEnabled" type="checkbox" checked><span>Дозволити коментарі учасникам</span></label>
      <div class="buttons"><button id="createBtn" onclick="createInitiative()">Створити ініціативу</button></div><div id="createError" class="error hidden"></div></section>`;
}

export async function createInitiative() {
  const b = document.getElementById('createBtn');
  const e = document.getElementById('createError');
  const communityId = document.getElementById('communityId')?.value || '';
  const title = document.getElementById('title').value.trim();
  const description = getRichText('description');
  const targetRaw = document.getElementById('target').value.trim();
  const target = targetRaw === '' ? null : Number(targetRaw);
  const paymentDetails = document.getElementById('paymentDetails').value.trim();
  const deadline = document.getElementById('deadline').value;
  const expectedRaw = document.getElementById('expected').value.trim();
  const expected = expectedRaw === '' ? null : Number(expectedRaw);
  const commentsEnabled = document.getElementById('commentsEnabled').checked;

  e.classList.add('hidden');
  if (!title) return ferr(e, 'Вкажіть назву ініціативи.');
  if (target !== null && (!Number.isFinite(target) || target <= 0)) return ferr(e, 'Бюджет має бути більшим за 0.');
  if (expected !== null && (!Number.isInteger(expected) || expected <= 0)) return ferr(e, 'Кількість має бути більшою за 0.');

  b.disabled = true; b.textContent = 'Створюємо...';
  const { data, error } = await db.rpc('create_initiative_v15_rpc', {
    p_community_id: communityId,
    p_title: title,
    p_description: description || null,
    p_target_amount: target,
    p_deadline: deadline ? new Date(deadline).toISOString() : null,
    p_expected_participants: expected,
    p_payment_details: paymentDetails || null,
    p_comments_enabled: commentsEnabled,
  });
  b.disabled = false; b.textContent = 'Створити ініціативу';
  if (error) return ferr(e, error.message);
  const id = data?.[0]?.id;
  redirect(id ? `#/initiatives/${id}` : '#/initiatives');
}

// --- One initiative ----------------------------------------------------------

function startManagerPolling(id) {
  clearInterval(managerPoll);
  managerPoll = setInterval(() => {
    const [kind, current] = location.hash.replace(/^#\/?/, '').split('/');
    if (kind === 'initiatives' && current === id && !document.getElementById('nextTitle') && !document.getElementById('commentDrawer')) {
      initiative(id, true);
    } else if (kind !== 'initiatives' || current !== id) {
      clearInterval(managerPoll);
    }
  }, 5000);
}

export async function initiative(id, silent = false) {
  if (!silent && !await requireManager()) return;
  if (!silent) loading('Завантажуємо ініціативу');
  const [{ data: rd, error: re }, { data: p, error: pe }, { data: h, error: he }] = await Promise.all([
    db.rpc('get_initiative_v15_rpc', { p_initiative_id: id }),
    db.rpc('get_initiative_proposals_v15_rpc', { p_initiative_id: id }),
    db.rpc('get_initiative_round_history_v15_rpc', { p_initiative_id: id }),
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
  const expectedCount = r.expected_participants || r.active_members_count;
  const expected = expectedCount ? `${proposals.length} із ${expectedCount}` : String(proposals.length);
  const proposalTitle = closed ? 'Відповіді останнього раунду' : 'Відповіді поточного раунду';

  const statusContent = hasTarget
    ? `<div class="status-main">${allocation.feasible ? 'Мета досяжна' : `Не вистачає ${money(allocation.gap)}`}</div>`
    : `<div class="status-main">${proposals.length ? 'Фінансова готовність спільноти' : 'Ще немає відповідей'}</div>`;

  const proposalStats = proposals.length
    ? `<div class="simple-stats-meta"><strong>${expected}</strong> відповіли · медіана <strong>${money(allocation.medianMax)}</strong> · середнє <strong>${money(allocation.averageMax)}</strong><div class="simple-stats-detail">мін ${money(allocation.minimumMax)} · макс ${money(allocation.maximumMax)}</div></div>`
    : `<div class="simple-stats-meta"><strong>${expected}</strong> відповіли</div>`;

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
    : '<div class="privacy">Поки немає відповідей.</div>';

  app.innerHTML = `<a class="page-back" href="#/initiatives">← Ініціативи</a>
    <section class="hero"><p class="eyebrow">${esc(r.community_name)}</p><h1>${esc(r.title)}</h1></section>
    <section class="card"><div class="title-row"><div><h2>Раунд ${r.round_number}</h2><div class="caption rich-content">${richText(r.description)}</div></div><span class="tag ${closed ? 'ok' : ''}">${closed ? 'Раунд завершено' : 'Збір відповідей'}</span></div>
    <div class="status simple-status">${statusContent}${hasTarget ? `<div class="simple-stats-primary"><strong>${money(allocation.sumMax)}</strong><span>із ${money(r.target_amount)} цілі</span></div>` : proposals.length ? `<div class="simple-stats-primary"><strong>${money(allocation.sumMax)}</strong><span>сума максимумів</span></div>` : ''}${proposalStats}${r.deadline ? `<div class="simple-stats-detail">Дедлайн: ${date(r.deadline)}</div>` : ''}</div>
    ${closed ? '' : '<div class="privacy" style="margin-top:14px">Учасники бачать цю ініціативу у своєму кабінеті в розділі «Ініціативи». Суми одне одного вони не бачать.</div>'}
    <div class="buttons">${closed ? `<button onclick="showNextRoundForm('${esc(id)}')">Новий раунд</button><button class="secondary" onclick="downloadCurrentCsv()">Завантажити CSV</button>` : `<button id="closeRoundBtn" class="danger" onclick="closeRound('${esc(id)}')">Завершити раунд</button>`}<button class="ghost" onclick="initiative('${esc(id)}')">Оновити</button></div>
    <div id="managerError" class="error hidden"></div></section>
    <section class="card compact"><h2>${proposalTitle}</h2><div class="table" style="margin-top:12px">${tableHeader}${tableRows}</div></section>
    <section class="card compact"><h2>Історія раундів</h2><div class="history-list">${historyHtml}</div></section>`;

  state.currentRound = r;
  state.currentAllocation = allocation;
  state.roundHistory = history;
  startManagerPolling(id);
}

export function showProposalComment(index) {
  const row = state.currentAllocation?.rows?.[index];
  if (!row || !row.comment) return;
  clearInterval(managerPoll);
  const overlay = document.createElement('div');
  overlay.id = 'commentDrawer';
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `<button class="drawer-backdrop" aria-label="Закрити" onclick="closeProposalComment()"></button><aside class="comment-drawer" role="dialog" aria-modal="true" aria-labelledby="commentDrawerTitle"><div class="drawer-head"><div><h2 id="commentDrawerTitle">Коментар до відповіді</h2><p class="caption">${esc(row.participant_label)} · Максимальна сума: ${money(row.max)}</p></div><button class="drawer-close" aria-label="Закрити" onclick="closeProposalComment()">×</button></div><div class="comment-text rich-content">${richText(row.comment)}</div></aside>`;
  document.body.appendChild(overlay);
}

export function closeProposalComment() {
  const drawer = document.getElementById('commentDrawer');
  if (drawer) drawer.remove();
  const [kind, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (kind === 'initiatives' && id) startManagerPolling(id);
}

export function showNextRoundForm(id) {
  clearInterval(managerPoll);
  const r = state.currentRound;
  if (!r) return;
  app.innerHTML = `<section class="hero"><h1>Ви створюєте новий раунд</h1><p class="lead">Підтвердьте дані ініціативи або змініть їх перед відкриттям нового раунду.</p></section>
    <section class="card"><div class="title-row"><div><h2>Новий раунд</h2><p class="caption">Учасники побачать новий раунд у своєму кабінеті; попередні відповіді не переносяться.</p></div><div class="step">${r.round_number + 1}</div></div>
    <label>Назва ініціативи</label><input id="nextTitle" value="${esc(r.title)}">
    <label>Опис</label>${richEditor('nextDescription', r.description || '', 'Опишіть, що саме планується зробити')}
    <label>Бюджет, грн <span class="muted">необовʼязково</span></label><input id="nextTarget" type="number" min="1" value="${r.target_amount ?? ''}">
    <label>Платіжні реквізити <span class="muted">необовʼязково</span></label><input id="nextPaymentDetails" type="text" value="${esc(r.payment_details || '')}" placeholder="Посилання або номер картки">
    <label>Дедлайн <span class="muted">необовʼязково</span></label><input id="nextDeadline" type="datetime-local" value="${datetimeLocalValue(r.deadline)}">
    <label>Очікувана кількість відповідей <span class="muted">необовʼязково</span></label><input id="nextExpected" type="number" min="1" value="${r.expected_participants ?? ''}">
    <label class="check-row"><input id="nextCommentsEnabled" type="checkbox" ${r.comments_enabled ? 'checked' : ''}><span>Дозволити коментарі учасникам</span></label>
    <div class="buttons"><button id="confirmNextRoundBtn" onclick="startNextRound('${esc(id)}')">Підтвердити</button><button class="ghost" onclick="initiative('${esc(id)}')">Скасувати</button></div>
    <div id="managerError" class="error hidden"></div></section>`;
}

export async function closeRound(id) {
  const errorBox = document.getElementById('managerError');
  const button = document.getElementById('closeRoundBtn');
  if (!button) return;
  errorBox.classList.add('hidden');
  button.disabled = true;
  button.textContent = 'Завершуємо...';
  const { error } = await db.rpc('close_initiative_round_v15_rpc', { p_initiative_id: id });
  if (error) {
    button.disabled = false;
    button.textContent = 'Завершити раунд';
    return ferr(errorBox, error.message);
  }
  toast('Раунд завершено');
  initiative(id);
}

export async function startNextRound(id) {
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
  const commentsEnabled = document.getElementById('nextCommentsEnabled').checked;

  errorBox.classList.add('hidden');
  if (!title) return ferr(errorBox, 'Вкажіть назву ініціативи.');
  if (target !== null && (!Number.isFinite(target) || target <= 0)) return ferr(errorBox, 'Бюджет має бути більшим за 0.');
  if (expected !== null && (!Number.isInteger(expected) || expected <= 0)) return ferr(errorBox, 'Кількість має бути більшою за 0.');

  button.disabled = true;
  button.textContent = 'Підтверджуємо...';
  const { error } = await db.rpc('start_initiative_round_v15_rpc', {
    p_initiative_id: id,
    p_title: title,
    p_description: description || null,
    p_target_amount: target,
    p_deadline: deadline ? new Date(deadline).toISOString() : null,
    p_expected_participants: expected,
    p_payment_details: paymentDetails || null,
    p_comments_enabled: commentsEnabled,
  });
  button.disabled = false;
  button.textContent = 'Підтвердити';
  if (error) return ferr(errorBox, error.message);

  toast('Новий раунд відкрито');
  initiative(id);
}

export function downloadCurrentCsv() {
  if (state.currentRound && state.currentAllocation) downloadCsv(state.currentRound, state.currentAllocation);
}

export function downloadHistoryCsv(index) {
  historyCsv(state.roundHistory[index]);
}

export { downloadCsv };
