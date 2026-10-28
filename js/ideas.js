// «Що зробити далі?»: менеджери ставлять ❤️ запланованим можливостям.
import { db } from './supabase.js';
import { app, esc, fail, loading, redirect, toast } from './utils.js';
import { syncManagerNavigation } from './navigation.js';

const STATUS = {
  in_progress: 'Робимо',
  planned: 'Плануємо',
  done: 'Готово',
};

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20Z"/></svg>';

let sortMode = 'popular';

const ideaCard = i => {
  const done = i.status === 'done';
  return `<article class="idea-card${done ? ' is-done' : ''}">
    <div class="idea-text"><h3>${esc(i.title)}</h3>${i.description ? `<p>${esc(i.description)}</p>` : ''}</div>
    ${done
      ? `<span class="idea-likes" aria-label="Лайків: ${i.votes}">${HEART}<span>${i.votes}</span></span>`
      : `<button class="idea-like${i.my_vote ? ' is-on' : ''}" data-idea-id="${esc(i.id)}" aria-pressed="${i.my_vote}" aria-label="${i.my_vote ? 'Прибрати лайк' : 'Мені це потрібно'}" onclick="toggleIdeaVote('${esc(i.id)}')">${HEART}<span>${i.votes}</span></button>`}
  </article>`;
};

const sorters = {
  popular: (a, b) => b.votes - a.votes || 0,
  new: (a, b) => new Date(b.created_at) - new Date(a.created_at),
};

function render(items) {
  const groups = ['in_progress', 'planned', 'done']
    .map(status => [status, items.filter(i => i.status === status).sort(sorters[sortMode])])
    .filter(([, list]) => list.length);
  app.innerHTML = `<section class="hero account-hero"><h1>Що зробити далі?</h1>
      <p class="lead">Поставте ❤️ тому, що вам потрібно. Ми робимо спершу те, що набирає найбільше голосів.</p></section>
    <div class="idea-sort" role="group" aria-label="Сортування">
      <button class="idea-sort-btn${sortMode === 'popular' ? ' is-active' : ''}" onclick="setIdeaSort('popular')">Популярні</button>
      <button class="idea-sort-btn${sortMode === 'new' ? ' is-active' : ''}" onclick="setIdeaSort('new')">Нові</button>
    </div>
    ${groups.map(([status, list]) => `<section class="account-section"><h2>${STATUS[status]}</h2><div class="idea-list">${list.map(ideaCard).join('')}</div></section>`).join('')}
    <section class="card idea-suggest"><h2>Своя ідея?</h2><p class="status-text">Напишіть, чого вам бракує в Comfundy, — додамо в перелік.</p>
      <div class="buttons"><a class="button secondary" href="#/feedback">Запропонувати</a></div></section>`;
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

export function setIdeaSort(mode) {
  sortMode = mode;
  render(window.__comfundyIdeas || []);
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
