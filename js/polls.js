// Опитування типу «Варіанти»: менеджер задає 2–10 варіантів, батьки голосують.
// Тип «Бюджет» (скільки кожен готовий внести) — у manager.js / participant.js.
import { db } from './supabase.js';
import { app, date, esc, fail, ferr, getRichText, loading, redirect, richEditor, richText, toast } from './utils.js';
import { syncManagerNavigation } from './navigation.js';
import { requireParticipant } from './participant-account.js';

export const POLL_TYPES = { budget: 'Бюджет', choice: 'Варіанти' };
const MAX_OPTIONS = 10;

const pct = (votes, total) => (total ? Math.round((votes / total) * 100) : 0);

// --- Lists: a card for a «Варіанти» poll --------------------------------------

export function choiceCard(item, href, extraTag = null) {
  const closed = item.status !== 'open';
  const answers = item.answers_count ?? null;
  const meta = closed
    ? `Завершено${item.closed_at ? ` ${date(item.closed_at)}` : ''}`
    : `${answers !== null ? `Відповідей: ${answers}` : 'Голосування'}${item.deadline ? ` · до ${date(item.deadline)}` : ''}`;
  const tag = extraTag || { cls: closed ? 'ok' : '', label: closed ? 'Завершено' : 'Активне' };
  return `<article class="initiative-card">
    <div class="initiative-card-head">
      <div><p class="poll-type-label">${POLL_TYPES.choice}</p><h3>${esc(item.title)}</h3><p class="caption">${meta}</p></div>
      <span class="tag ${tag.cls}">${tag.label}</span>
    </div>
    ${item.leading_option ? `<p class="status-text">Лідирує: <strong>${esc(item.leading_option)}</strong></p>` : ''}
    <a class="initiative-open" href="${href}">Відкрити →</a>
  </article>`;
}

// --- Manager: create ------------------------------------------------------------

const optionRow = (value = '', i = 0) => `<div class="poll-option-row">
    <input class="poll-option-input" value="${esc(value)}" maxlength="200" placeholder="Варіант ${i + 1}">
    <button type="button" class="poll-option-remove" aria-label="Прибрати варіант" onclick="removePollOption(this)">×</button>
  </div>`;

export function choiceFields() {
  return `<label>Назва опитування</label><input id="choiceTitle" placeholder="Наприклад: що подаруємо вчительці?">
      <label>Опис <span class="muted">необовʼязково</span></label>${richEditor('choiceDescription', '', 'Деталі, якщо потрібно')}
      <label>Варіанти</label>
      <div id="pollOptions">${optionRow('', 0)}${optionRow('', 1)}</div>
      <button type="button" class="link-button poll-option-add" id="addOptionBtn" onclick="addPollOption()">+ Додати варіант</button>
      <label class="check-row"><input id="allowMultiple" type="checkbox"><span>Можна обрати кілька варіантів</span></label>
      <label>Дедлайн <span class="muted">необовʼязково</span></label><input id="choiceDeadline" type="datetime-local">
      <p class="field-note">Ви бачитимете, хто за що проголосував. Батьки бачать лише кількість голосів — після того, як проголосують самі.</p>
      <div class="buttons"><button id="createChoiceBtn" onclick="createChoicePoll()">Створити опитування</button></div><div id="createChoiceError" class="error hidden"></div>`;
}

function renumberOptions() {
  const rows = [...document.querySelectorAll('#pollOptions .poll-option-row')];
  rows.forEach((row, i) => { row.querySelector('input').placeholder = `Варіант ${i + 1}`; });
  rows.forEach(row => { row.querySelector('.poll-option-remove').disabled = rows.length <= 2; });
  const add = document.getElementById('addOptionBtn');
  if (add) add.classList.toggle('hidden', rows.length >= MAX_OPTIONS);
}

export function addPollOption() {
  const box = document.getElementById('pollOptions');
  if (!box || box.children.length >= MAX_OPTIONS) return;
  box.insertAdjacentHTML('beforeend', optionRow('', box.children.length));
  renumberOptions();
  box.lastElementChild.querySelector('input').focus();
}

export function removePollOption(button) {
  const box = document.getElementById('pollOptions');
  if (!box || box.children.length <= 2) return;
  button.closest('.poll-option-row')?.remove();
  renumberOptions();
}

export function initChoiceFields() { renumberOptions(); }

export async function createChoicePoll() {
  const b = document.getElementById('createChoiceBtn');
  const e = document.getElementById('createChoiceError');
  const communityId = document.getElementById('communityId')?.value || '';
  const title = document.getElementById('choiceTitle').value.trim();
  const description = getRichText('choiceDescription');
  const options = [...document.querySelectorAll('#pollOptions .poll-option-input')].map(x => x.value.trim()).filter(Boolean);
  const unique = [...new Set(options.map(x => x.toLocaleLowerCase('uk-UA')))];
  const deadline = document.getElementById('choiceDeadline').value;

  e.classList.add('hidden');
  if (!title) return ferr(e, 'Вкажіть назву опитування.');
  if (unique.length < 2) return ferr(e, 'Додайте щонайменше 2 різні варіанти.');

  b.disabled = true; b.textContent = 'Створюємо...';
  const { data, error } = await db.rpc('create_choice_poll_v21_rpc', {
    p_community_id: communityId,
    p_title: title,
    p_description: description || null,
    p_options: options,
    p_allow_multiple: document.getElementById('allowMultiple').checked,
    p_deadline: deadline ? new Date(deadline).toISOString() : null,
  });
  b.disabled = false; b.textContent = 'Створити опитування';
  if (error) return ferr(e, error.message);
  redirect(data ? `#/polls/${data}` : '#/initiatives');
}

// --- Manager: results ------------------------------------------------------------

const resultBar = (o, total, mine = false) => `<div class="poll-result${mine ? ' is-mine' : ''}">
    <div class="poll-result-head"><span>${esc(o.label)}${mine ? ' <span class="muted">· ваш вибір</span>' : ''}</span><strong>${o.votes} · ${pct(o.votes, total)}%</strong></div>
    <div class="dues-progress-bar"><span style="width:${pct(o.votes, total)}%"></span></div>
  </div>`;

export async function choicePoll(id) {
  const { data: s } = await db.auth.getSession();
  if (!s?.session) return redirect('#/login');
  await syncManagerNavigation('initiatives');
  loading('Завантажуємо опитування');
  const { data: p, error } = await db.rpc('get_choice_poll_v21_rpc', { p_initiative_id: id });
  if (error || !p) return fail(error?.message || 'Опитування не знайдено.');

  const closed = p.status !== 'open';
  const total = p.voters_count || 0;
  const names = list => `<ul class="poll-names">${list.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
  const results = p.options.map(o => `${resultBar(o, total)}
      ${o.voters.length ? `<details class="poll-voters"><summary>Хто обрав</summary>${names(o.voters)}</details>` : ''}`).join('');
  const notVoted = p.not_voted.length
    ? `<section class="card"><details class="poll-voters poll-not-voted"><summary><strong>Ще не відповіли · ${p.not_voted.length}</strong></summary>${names(p.not_voted)}</details></section>`
    : '';

  app.innerHTML = `<a class="page-back" href="#/initiatives">← Опитування</a>
    <section class="hero"><p class="eyebrow">${POLL_TYPES.choice}${p.allow_multiple ? ' · можна кілька' : ''}</p><h1>${esc(p.title)}</h1>${p.description ? `<div class="lead rich-content">${richText(p.description)}</div>` : ''}
      <p class="caption">${closed ? `Завершено ${date(p.closed_at)}` : p.deadline ? `Відповіді до ${date(p.deadline)}` : 'Без дедлайну'} · Проголосували: ${total}</p></section>
    <section class="card"><h2>Результати</h2>${results}</section>
    ${notVoted}
    <div class="buttons">${closed
      ? `<button class="secondary" onclick="setChoicePollStatus('${esc(p.id)}','open')">Відкрити знову</button>`
      : `<button onclick="setChoicePollStatus('${esc(p.id)}','closed')">Завершити опитування</button>`}</div>`;
}

export async function setChoicePollStatus(id, status) {
  if (status === 'closed' && !confirm('Завершити опитування? Батьки більше не зможуть голосувати.')) return;
  const { error } = await db.rpc('set_choice_poll_status_v21_rpc', { p_initiative_id: id, p_status: status });
  if (error) return toast(error.message, 4000);
  toast(status === 'closed' ? 'Опитування завершено' : 'Опитування знову відкрите');
  choicePoll(id);
}

// --- Participant ------------------------------------------------------------------

export function myChoiceStatus(item) {
  if (item.status !== 'open') return { cls: 'ok', label: 'Завершено', line: 'Подивіться результати' };
  return item.own_voted
    ? { cls: 'ok', label: 'Ви відповіли', line: 'Відповідь можна змінити до завершення' }
    : { cls: '', label: 'Чекає на вашу відповідь', line: 'Оберіть варіант' };
}

export async function myChoicePoll(id) {
  if (!await requireParticipant('my-initiatives')) return;
  loading('Завантажуємо опитування');
  const { data: p, error } = await db.rpc('get_my_choice_poll_v21_rpc', { p_initiative_id: id });
  if (error || !p) return fail(error?.message || 'Опитування не знайдено.');

  const open = p.status === 'open' && !(p.deadline && new Date(p.deadline) < new Date());
  const inputType = p.allow_multiple ? 'checkbox' : 'radio';
  const form = open ? `<section class="card">
      <h2>${p.voted ? 'Ваша відповідь' : 'Ваш вибір'}</h2>
      <p class="caption">${p.allow_multiple ? 'Можна обрати кілька варіантів.' : 'Оберіть один варіант.'}</p>
      <div class="poll-choices">${p.options.map(o => `<label class="check-row poll-choice"><input type="${inputType}" name="pollChoice" value="${esc(o.id)}" ${o.mine ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>
      <div class="buttons"><button id="voteBtn" onclick="submitChoiceVote('${esc(p.id)}')">${p.voted ? 'Змінити відповідь' : 'Відповісти'}</button></div>
      <div id="voteError" class="error hidden"></div>
    </section>` : '';
  const total = p.voters_count || 0;
  const results = p.show_results
    ? `<section class="card"><h2>${open ? 'Поки що' : 'Результати'}</h2><p class="caption">Відповіли: ${total}</p>${p.options.map(o => resultBar(o, total, o.mine)).join('')}</section>`
    : '';

  app.innerHTML = `<a class="page-back" href="#/me/initiatives">← Опитування</a>
    <section class="hero"><p class="eyebrow">${esc(p.community_name)}</p><h1>${esc(p.title)}</h1>${p.description ? `<div class="lead rich-content">${richText(p.description)}</div>` : ''}
      <p class="caption">${p.status !== 'open' ? 'Опитування завершено' : p.deadline ? `Відповіді до ${date(p.deadline)}` : ''}</p></section>
    ${form}${results}`;
}

export async function submitChoiceVote(id) {
  const ids = [...document.querySelectorAll('input[name="pollChoice"]:checked')].map(x => x.value);
  const e = document.getElementById('voteError');
  const b = document.getElementById('voteBtn');
  e.classList.add('hidden');
  if (!ids.length) return ferr(e, 'Оберіть варіант.');
  b.disabled = true; b.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('submit_my_vote_v21_rpc', { p_initiative_id: id, p_option_ids: ids });
  b.disabled = false;
  if (error) { b.textContent = 'Відповісти'; return ferr(e, error.message); }
  toast('Відповідь збережено');
  myChoicePoll(id);
}
