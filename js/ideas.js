// «Що додати в Comfundy?»: менеджери ставлять ❤️ запланованим можливостям.
import { db } from './supabase.js';
import { app, esc, fail, ferr, loading, redirect, toast } from './utils.js';
import { syncManagerNavigation } from './navigation.js';

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20Z"/></svg>';

const ideaCard = i => {
  const done = i.status === 'done';
  return `<article class="idea-card${done ? ' is-done' : ''}">
    <div class="idea-text"><h3>${esc(i.title)}</h3>${i.description ? `<p>${esc(i.description)}</p>` : ''}</div>
    ${done
      ? `<span class="idea-likes" aria-label="Лайків: ${i.votes}">${HEART}<span>${i.votes}</span></span>`
      : `<button class="idea-like${i.my_vote ? ' is-on' : ''}" data-idea-id="${esc(i.id)}" aria-pressed="${i.my_vote}" aria-label="${i.my_vote ? 'Прибрати лайк' : 'Мені це потрібно'}" onclick="toggleIdeaVote('${esc(i.id)}')">${HEART}<span>${i.votes}</span></button>`}
  </article>`;
};

function render(items) {
  const list = items.filter(i => i.status !== 'done').sort((a, b) => b.votes - a.votes);
  app.innerHTML = `<section class="hero account-hero"><h1>Що додати в Comfundy?</h1></section>
    <div class="account-create"><a class="button" href="#/ideas/new">Запропонувати ідею</a></div>
    <div class="member-search"><span aria-hidden="true">⌕</span><input id="ideaSearch" type="search" placeholder="Пошук" oninput="filterIdeas()"></div>
    <section class="account-section"><div class="idea-list">${list.map(ideaCard).join('')}</div><div id="ideaSearchEmpty" class="privacy hidden">Нічого не знайдено. Запропонуйте свою ідею.</div></section>`;
}

export async function ideas() {
  const { data: s } = await db.auth.getSession();
  if (!s?.session) return redirect('#/login');
  await syncManagerNavigation('ideas');
  loading('Завантажуємо');
  const { data, error } = await db.rpc('get_feature_ideas_v22_rpc');
  if (error) return fail(error.message);
  window.__comfundyIdeas = data || [];
  render(window.__comfundyIdeas);
}

export function filterIdeas() {
  const q = (document.getElementById('ideaSearch')?.value || '').trim().toLocaleLowerCase('uk-UA');
  let shown = 0;
  document.querySelectorAll('.idea-card').forEach(card => {
    const hit = !q || card.textContent.toLocaleLowerCase('uk-UA').includes(q);
    card.classList.toggle('hidden', !hit);
    if (hit) shown += 1;
  });
  document.getElementById('ideaSearchEmpty')?.classList.toggle('hidden', shown > 0);
}

export async function toggleIdeaVote(id) {
  const button = document.querySelector(`.idea-like[data-idea-id="${CSS.escape(id)}"]`);
  if (button) button.disabled = true;
  const { data, error } = await db.rpc('toggle_feature_idea_vote_v22_rpc', { p_idea_id: id });
  if (button) button.disabled = false;
  if (error) return toast(error.message, 4000);
  const row = data?.[0];
  const item = (window.__comfundyIdeas || []).find(i => i.id === id);
  if (item && row) { item.my_vote = row.my_vote; item.votes = row.votes; }
  if (button && row) {
    button.classList.toggle('is-on', row.my_vote);
    button.setAttribute('aria-pressed', String(row.my_vote));
    button.setAttribute('aria-label', row.my_vote ? 'Прибрати лайк' : 'Мені це потрібно');
    button.querySelector('span').textContent = row.votes;
  }
}

// --- Запропонувати ідею --------------------------------------------------------

export async function newIdea() {
  const { data: s } = await db.auth.getSession();
  if (!s?.session) return redirect('#/login');
  await syncManagerNavigation('ideas');
  app.innerHTML = `<a class="page-back" href="#/ideas">← Що додати в Comfundy?</a>
    <section class="card"><h2>Нова ідея</h2>
      <label>Назва</label><input id="ideaTitle" maxlength="120" placeholder="Наприклад: нагадування в Viber">
      <label>Опис</label><textarea id="ideaDescription" maxlength="2000" placeholder="Що саме і навіщо це вашому класу"></textarea>
      <div class="buttons"><button id="ideaBtn" onclick="submitIdea()">Надіслати</button></div>
      <div id="ideaError" class="error hidden"></div>
    </section>`;
}

export async function submitIdea() {
  const title = document.getElementById('ideaTitle')?.value.trim() || '';
  const description = document.getElementById('ideaDescription')?.value.trim() || '';
  const e = document.getElementById('ideaError');
  const b = document.getElementById('ideaBtn');
  e.classList.add('hidden');
  if (!title) return ferr(e, 'Вкажіть назву ідеї.');
  if (!description) return ferr(e, 'Опишіть ідею.');
  b.disabled = true; b.textContent = 'Надсилаємо...';
  const { error } = await db.rpc('suggest_feature_idea_v22_rpc', { p_title: title, p_description: description });
  b.disabled = false; b.textContent = 'Надіслати';
  if (error) return ferr(e, error.message);
  toast('Дякуємо! Ідею отримали — додамо в перелік після перегляду', 4000);
  redirect('#/ideas');
}
