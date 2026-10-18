import { db } from './supabase.js';
import { app, esc, ferr, redirect } from './utils.js';
import { rememberAfterLogin } from './auth.js';
import { state } from './state.js';
import { getActiveManagerCommunity, getActiveParticipantCommunity, getManagerCommunities, getParticipantCommunities, syncManagerNavigation, syncParticipantNavigation } from './navigation.js';

const publishedLabel = value => new Intl.DateTimeFormat('uk-UA', {
  day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
}).format(new Date(value));

const card = a => `<article class="announcement-card">
  <h3>${esc(a.title)}</h3>
  <p>${esc(a.body)}</p>
  <div class="announcement-date">${publishedLabel(a.created_at)}</div>
</article>`;

// Manager view: the same card with an edit link (delete lives on the edit page).
const managerCard = a => `<article class="announcement-card">
  <h3>${esc(a.title)}</h3>
  <p>${esc(a.body)}</p>
  <div class="announcement-date announcement-footer">
    <span>${publishedLabel(a.created_at)}</span>
    <span class="announcement-actions">
      <button class="comment-link announcement-share" onclick="shareAnnouncement('${esc(a.id)}')">Поділитися</button>
      <a class="announcement-edit" href="#/announcements/${esc(a.id)}/edit">Змінити</a>
    </span>
  </div>
</article>`;

const announcementForm = (a, buttonId, buttonLabel, action) => `<section class="card">
      <label>Заголовок</label><input id="announcementTitle" value="${esc(a?.title || '')}" placeholder="Наприклад: Екскурсія у пʼятницю">
      <label>Текст</label><textarea id="announcementBody" placeholder="Напишіть оголошення">${esc(a?.body || '')}</textarea>
      <div class="buttons"><button id="${buttonId}" onclick="${action}">${buttonLabel}</button></div>
      <div id="announcementError" class="error hidden"></div>
    </section>`;

function readAnnouncementForm(errorBox) {
  const title = document.getElementById('announcementTitle')?.value.trim() || '';
  const body = document.getElementById('announcementBody')?.value.trim() || '';
  if (!title) { ferr(errorBox, 'Вкажіть заголовок.'); return null; }
  if (!body) { ferr(errorBox, 'Вкажіть текст оголошення.'); return null; }
  return { title, body };
}

export async function announcements() {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData?.session) {
    redirect('#/login');
    return;
  }
  await syncManagerNavigation('announcements');
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Оголошення</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">Створити спільноту</a></div></section>';
    return;
  }
  const { data, error } = await db.rpc('get_manager_announcements_v12_rpc', { p_community_id: community.id });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const items = data || [];
  state.shareAnnouncements = new Map(items.map(a => [a.id, a]));
  app.innerHTML = `<section class="hero account-hero tab-hero"><h1>Оголошення</h1><p class="lead">${esc(community.name)}</p></section>
    <div class="account-create create-main"><a class="button" href="#/announcements/new">Створити оголошення</a></div>
    <section class="account-section"><div class="announcement-list">${items.length ? items.map(managerCard).join('') : '<div class="privacy">Оголошень ще немає.</div>'}</div></section>`;
}

export async function newAnnouncement() {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData?.session) {
    redirect('#/login');
    return;
  }
  await syncManagerNavigation('announcements');
  const community = await getActiveManagerCommunity();
  if (!community) return announcements();
  app.innerHTML = `<section class="hero account-hero"><h1>Нове оголошення</h1><p class="lead">${esc(community.name)}</p></section>
    ${announcementForm(null, 'createAnnouncementBtn', 'Опублікувати', 'createAnnouncement()')}`;
}

export async function createAnnouncement() {
  const community = await getActiveManagerCommunity();
  const button = document.getElementById('createAnnouncementBtn');
  const errorBox = document.getElementById('announcementError');
  if (!community) return ferr(errorBox, 'Спільноту не знайдено.');
  const f = readAnnouncementForm(errorBox);
  if (!f) return;
  const { title, body } = f;
  button.disabled = true; button.textContent = 'Публікуємо...';
  const { error } = await db.rpc('create_announcement_v12_rpc', { p_community_id: community.id, p_title: title, p_body: body });
  button.disabled = false; button.textContent = 'Опублікувати';
  if (error) return ferr(errorBox, error.message);
  redirect('#/announcements');
}

export async function editAnnouncement(announcementId) {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData?.session) {
    redirect('#/login');
    return;
  }
  await syncManagerNavigation('announcements');
  const community = await getActiveManagerCommunity();
  if (!community) return announcements();
  const { data, error } = await db.rpc('get_manager_announcements_v12_rpc', { p_community_id: community.id });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const a = (data || []).find(x => x.id === announcementId);
  if (!a) return app.innerHTML = '<section class="card"><div class="error">Оголошення не знайдено.</div></section>';
  app.innerHTML = `<a class="page-back" href="#/announcements">← Оголошення</a>
    <section class="hero account-hero"><h1>Змінити оголошення</h1><p class="lead">${esc(community.name)}</p></section>
    <input id="announcementId" type="hidden" value="${esc(a.id)}">
    ${announcementForm(a, 'saveAnnouncementBtn', 'Зберегти', 'saveAnnouncement()')}
    <section class="card compact"><div class="buttons"><button id="deleteAnnouncementBtn" class="secondary contribution-delete" onclick="deleteAnnouncement('${esc(a.id)}')">Видалити оголошення</button></div></section>`;
}

export async function saveAnnouncement() {
  const id = document.getElementById('announcementId')?.value || '';
  const button = document.getElementById('saveAnnouncementBtn');
  const errorBox = document.getElementById('announcementError');
  errorBox.classList.add('hidden');
  const f = readAnnouncementForm(errorBox);
  if (!f) return;
  button.disabled = true; button.textContent = 'Зберігаємо...';
  const { error } = await db.rpc('update_announcement_v18_rpc', { p_announcement_id: id, p_title: f.title, p_body: f.body });
  button.disabled = false; button.textContent = 'Зберегти';
  if (error) return ferr(errorBox, error.message);
  redirect('#/announcements');
}

export async function deleteAnnouncement(announcementId) {
  if (!confirm('Видалити оголошення? Учасники більше його не побачать. Це не можна скасувати.')) return;
  const { error } = await db.rpc('delete_announcement_v18_rpc', { p_announcement_id: announcementId });
  if (error) return alert(error.message);
  redirect('#/announcements');
}

export async function myAnnouncements() {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData?.session) {
    redirect('#/login');
    return;
  }
  await db.rpc('claim_my_memberships_v11_rpc');
  const { data: roles } = await db.rpc('get_my_account_roles_v11_rpc');
  if (!roles?.[0]?.is_participant) {
    app.innerHTML = '<section class="card"><div class="privacy">Для цього email не знайдено активного профілю учасника.</div></section>';
    return;
  }
  await syncParticipantNavigation('my-announcements', roles[0]);
  const community = await getActiveParticipantCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Оголошення</h1></section><section class="card"><div class="privacy">Для цього акаунта не знайдено активної спільноти.</div></section>';
    return;
  }
  const { data, error } = await db.rpc('get_participant_announcements_v12_rpc', { p_community_id: community.id });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const items = data || [];
  app.innerHTML = `<section class="hero account-hero tab-hero"><h1>Оголошення</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="account-section"><div class="announcement-list">${items.length ? items.map(card).join('') : '<div class="privacy">Оголошень ще немає.</div>'}</div></section>`;
}

// ---------- Sharing an announcement to a messenger group ----------

const SITE = 'https://comfundy.com/';
export const announcementLink = id => `${SITE}#/a/${id}`;

function shareText(a) {
  const body = a.body.replace(/\s+/g, ' ').trim();
  const excerpt = body.length > 200 ? `${body.slice(0, 197).replace(/\s+\S*$/, '')}…` : body;
  return `📢 ${a.title}\n\n${excerpt}`;
}

export async function shareAnnouncement(id) {
  // Shared module state: the page and the button handler may be different module copies.
  const a = state.shareAnnouncements?.get(id);
  if (!a) return;
  const text = shareText(a);
  const url = announcementLink(id);
  // Phones: the system share sheet (Viber, Telegram, WhatsApp…).
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: a.title, text: `${text}\n\nЧитати повністю:`, url }); return; }
    catch (e) { if (e?.name === 'AbortError') return; }
  }
  openShareDrawer(text, url);
}

function openShareDrawer(text, url) {
  closeShareDrawer();
  const full = `${text}\n\nЧитати повністю: ${url}`;
  const overlay = document.createElement('div');
  overlay.id = 'shareDrawer';
  overlay.className = 'drawer-overlay';
  overlay.innerHTML = `
    <button class="drawer-backdrop" aria-label="Закрити" onclick="closeShareDrawer()"></button>
    <aside class="comment-drawer share-drawer" role="dialog" aria-modal="true" aria-labelledby="shareTitle">
      <div class="drawer-head"><div><h2 id="shareTitle">Поділитися в групу</h2><p class="caption">Батьки відкриють повний текст у своєму кабінеті Comfundy.</p></div><button class="drawer-close" aria-label="Закрити" onclick="closeShareDrawer()">×</button></div>
      <pre class="share-preview">${esc(full)}</pre>
      <div class="buttons share-buttons">
        <a class="button" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}" target="_blank" rel="noopener" onclick="closeShareDrawer()">Telegram</a>
        <a class="button" href="viber://forward?text=${encodeURIComponent(full)}" onclick="closeShareDrawer()">Viber</a>
        <button class="secondary" id="shareCopyBtn" onclick="copyShareText()">Копіювати текст</button>
      </div>
    </aside>`;
  overlay.dataset.text = full;
  document.body.appendChild(overlay);
}

export function closeShareDrawer() {
  document.getElementById('shareDrawer')?.remove();
}

export async function copyShareText() {
  const text = document.getElementById('shareDrawer')?.dataset.text || '';
  const button = document.getElementById('shareCopyBtn');
  try {
    await navigator.clipboard.writeText(text);
    if (button) button.textContent = 'Скопійовано ✓';
  } catch {
    if (button) button.textContent = 'Не вдалося скопіювати';
  }
}

// ---------- #/a/<id>: the link from the messenger ----------

export async function sharedAnnouncement(id) {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData?.session) {
    rememberAfterLogin(`#/a/${id}`);
    return redirect('#/login');
  }
  app.innerHTML = '<section class="card"><div class="privacy">Відкриваємо оголошення…</div></section>';
  await db.rpc('claim_my_memberships_v11_rpc');

  // Is it in one of my communities as a participant, or as a manager?
  const [participantOf, managerOf] = await Promise.all([
    getParticipantCommunities().catch(() => []),
    getManagerCommunities().catch(() => []),
  ]);
  for (const c of participantOf) {
    const { data } = await db.rpc('get_participant_announcements_v12_rpc', { p_community_id: c.id });
    const a = (data || []).find(x => x.id === id);
    if (a) {
      localStorage.setItem('comfundy:participantCommunityId', c.id);
      await syncParticipantNavigation('my-announcements');
      return renderSingle(a, c, '#/me/announcements');
    }
  }
  for (const c of managerOf) {
    const { data } = await db.rpc('get_manager_announcements_v12_rpc', { p_community_id: c.id });
    const a = (data || []).find(x => x.id === id);
    if (a) {
      localStorage.setItem('comfundy:managerCommunityId', c.id);
      await syncManagerNavigation('announcements');
      return renderSingle(a, c, '#/announcements');
    }
  }
  app.innerHTML = `<section class="card"><h2>Оголошення не знайдено</h2>
    <p class="status-text">Можливо, його видалили, або ви ще не учасник цієї спільноти. Попросіть менеджера класу додати вас з цим email.</p>
    <div class="buttons"><a class="button" href="#/login">До кабінету</a></div></section>`;
}

function renderSingle(a, community, back) {
  app.innerHTML = `<a class="page-back" href="${back}">← Усі оголошення</a>
    <section class="hero account-hero"><p class="eyebrow">${esc(community.name)}</p></section>
    <article class="announcement-card announcement-single">
      <h1>${esc(a.title)}</h1>
      <p>${esc(a.body)}</p>
      <div class="announcement-date">${publishedLabel(a.created_at)}</div>
    </article>`;
}
