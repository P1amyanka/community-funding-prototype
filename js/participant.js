import { db } from './supabase.js';
import { app, date, esc, fail, ferr, getRichText, loading, money, richEditor, richText, toast } from './utils.js';
import { getActiveParticipantCommunity } from './navigation.js';
import { requireParticipant } from './participant-account.js';
import { POLL_TYPES, choiceCard, myChoiceStatus } from './polls.js';

const isUrl = value => /^https?:\/\//i.test(String(value || '').trim());

function paymentBlock(value) {
  if (!value) return '';
  const safe = esc(value);
  return isUrl(value)
    ? `<p class="status-text">Перейдіть за посиланням для оплати:</p><a class="button" href="${safe}" target="_blank" rel="noopener noreferrer">Перейти до оплати</a>`
    : `<p class="status-text">Скопіюйте реквізити для оплати:</p><div class="link-box"><input id="paymentValue" readonly value="${safe}"><button onclick="copyPaymentValue()">Копіювати</button></div>`;
}

const refreshButton = id => `<button class="ghost" onclick="refreshMyInitiative('${esc(id)}')">Оновити</button>`;

function cardStatus(item) {
  if (item.status === 'open') {
    return item.own_max_amount !== null && item.own_max_amount !== undefined
      ? { tag: 'ok', label: 'Відповіли', line: `Ваш максимум: <strong>${money(item.own_max_amount)}</strong>` }
      : { tag: '', label: 'Нове', line: 'Вкажіть, скільки готові внести' };
  }
  if (item.feasible === true) {
    return { tag: 'ok', label: 'Зібрано', line: item.own_recommended_amount !== null && item.own_recommended_amount !== undefined ? `Ваш внесок: <strong>${money(item.own_recommended_amount)}</strong>` : 'Раунд завершено' };
  }
  if (item.feasible === false) return { tag: '', label: 'Не зібрано', line: 'Менеджер може відкрити новий раунд' };
  return { tag: 'ok', label: 'Раунд завершено', line: '' };
}

// --- List in the cabinet -----------------------------------------------------

export async function myInitiatives() {
  if (!await requireParticipant('my-initiatives')) return;
  const community = await getActiveParticipantCommunity();
  if (!community) return;

  const { data, error } = await db.rpc('get_my_polls_v21_rpc', { p_community_id: community.id });
  if (error) return fail(error.message);
  const items = data || [];
  const cards = items.length ? items.map(item => {
    if (item.poll_type === 'choice') {
      const c = myChoiceStatus(item);
      return choiceCard({ ...item, answers_count: null }, `#/me/polls/${esc(item.id)}`, { cls: c.cls, label: c.label });
    }
    const s = cardStatus(item);
    return `<article class="initiative-card">
      <div class="initiative-card-head">
        <div><p class="poll-type-label">${POLL_TYPES.budget}</p><h3>${esc(item.title)}</h3><p class="caption">Раунд ${item.round_number}${item.deadline ? ` · до ${date(item.deadline)}` : ''}</p></div>
        <span class="tag ${s.tag}">${s.label}</span>
      </div>
      ${s.line ? `<p class="status-text">${s.line}</p>` : ''}
      <a class="initiative-open" href="#/me/initiatives/${esc(item.id)}">Відкрити →</a>
    </article>`;
  }).join('') : '<div class="privacy">У цій спільноті ще немає опитувань.</div>';

  app.innerHTML = `<section class="hero account-hero tab-hero"><h1>Опитування</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="account-section"><div class="initiative-list">${cards}</div></section>`;
}

// --- One initiative ----------------------------------------------------------

export async function myInitiative(id, silent = false) {
  if (!silent && !await requireParticipant('my-initiatives')) return;
  if (!silent) loading('Завантажуємо опитування');
  const { data, error } = await db.rpc('get_my_initiative_v15_rpc', { p_initiative_id: id });
  if (error) return fail(error.message);
  const r = data && data[0];
  if (!r) return fail('Опитування не знайдено.');

  const closed = r.status !== 'open';
  const hasTarget = r.target_amount !== null && r.target_amount !== undefined;
  const hasProposal = r.own_max_amount !== null && r.own_max_amount !== undefined;
  const confirmed = closed && hasTarget && r.feasible === true;
  const notFunded = closed && hasTarget && r.feasible === false;
  const closedWithoutTarget = closed && !hasTarget;
  const details = hasTarget || r.deadline
    ? `<section class="card compact"><div class="stats">${hasTarget ? `<div class="stat"><strong>${money(r.target_amount)}</strong><span>необхідна сума</span></div>` : ''}${r.deadline ? `<div class="stat"><strong>${date(r.deadline)}</strong><span>дедлайн</span></div>` : ''}</div></section>`
    : '';

  let content;
  if (!closed) {
    const accepted = hasProposal
      ? `<div class="privacy"><b>Відповідь прийнято.</b><br>Ви вказали максимальний внесок <strong>${money(r.own_max_amount)}</strong>. До завершення раунду відповідь можна змінити.</div>`
      : '';
    const commentField = r.comments_enabled
      ? `<label>Коментар <span class="muted">необовʼязково</span></label>${richEditor('comment', r.own_comment || '', 'Напишіть коментар для менеджерів')}<p class="field-note">Коментар бачать лише менеджери спільноти.</p>`
      : '';
    content = `${accepted}<div class="title-row"><div><h2>${hasProposal ? 'Змінити відповідь' : 'Ваша відповідь'}</h2><p class="caption">Інші учасники не бачать вашої суми. Менеджери спільноти бачать відповіді з іменами.</p></div><div class="step">${r.round_number}</div></div>
      <label>Максимальна сума, яку готові внести, грн</label><input id="maxAmount" type="number" min="0" inputmode="decimal" value="${hasProposal ? esc(r.own_max_amount) : ''}">
      ${commentField}
      <div class="buttons"><button id="submitBtn" onclick="submitProposal('${esc(id)}')">${hasProposal ? 'Зберегти зміни' : 'Надіслати відповідь'}</button>${refreshButton(id)}</div><div id="submitError" class="error hidden"></div>`;
  } else if (confirmed) {
    content = `<div class="status"><div class="status-main">Мету досягнуто</div>${hasProposal ? `<p class="status-text">Ваш внесок — <strong>${money(r.own_recommended_amount)}</strong>.</p>` : '<p class="status-text">Раунд завершено успішно. Ви не відповідали в цьому раунді.</p>'}${paymentBlock(r.payment_details)}</div><div class="buttons">${refreshButton(id)}</div>`;
  } else if (notFunded) {
    content = `<div class="status"><div class="status-main">Мету не досягнуто</div><p class="status-text">Не вистачає: <strong>${money(r.gap)}</strong>. Менеджер може відкрити новий раунд.</p></div><div class="buttons">${refreshButton(id)}</div>`;
  } else if (closedWithoutTarget) {
    content = `<div class="status"><div class="status-main">Раунд завершено</div><p class="status-text">Менеджер завершив збір відповідей.</p>${paymentBlock(r.payment_details)}</div><div class="buttons">${refreshButton(id)}</div>`;
  } else {
    content = `<div class="privacy"><b>Раунд завершено.</b> Очікуйте подальших дій менеджера.</div><div class="buttons">${refreshButton(id)}</div>`;
  }

  app.innerHTML = `<a class="page-back" href="#/me/initiatives">← Опитування</a>
    <section class="hero"><p class="eyebrow">${esc(r.community_name)}</p><h1>${esc(r.title)}</h1><div class="lead rich-content">${richText(r.description, 'Опитування «Бюджет».')}</div></section>${details}<section class="card">${content}</section>`;
}

export function refreshMyInitiative(id) {
  myInitiative(id);
}

export async function submitProposal(id) {
  const e = document.getElementById('submitError');
  const i = document.getElementById('maxAmount');
  const commentEditor = document.getElementById('comment');
  const max = Number(i.value);
  e.classList.add('hidden');
  if (i.value === '') return ferr(e, 'Вкажіть максимальну суму.');
  if (!Number.isFinite(max) || max < 0) return ferr(e, 'Сума не може бути відʼємною.');

  const b = document.getElementById('submitBtn');
  b.disabled = true;
  b.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('submit_my_proposal_v15_rpc', {
    p_initiative_id: id,
    p_max_amount: max,
    p_comment: commentEditor ? (getRichText('comment') || null) : null,
  });
  b.disabled = false;
  b.textContent = 'Зберегти зміни';
  if (error) return ferr(e, error.message);
  toast('Відповідь прийнято');
  myInitiative(id, true);
}

export function copyPaymentValue() {
  const x = document.getElementById('paymentValue');
  navigator.clipboard.writeText(x.value).then(() => toast('Реквізити скопійовано'));
}
