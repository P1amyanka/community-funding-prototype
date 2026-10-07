import { db } from './supabase.js';
import { app, esc, ferr } from './utils.js';
import { getActiveManagerCommunity, getActiveParticipantCommunity, syncManagerNavigation, syncParticipantNavigation } from './navigation.js';

const publishedLabel = value => new Intl.DateTimeFormat('uk-UA', {
  day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
}).format(new Date(value));

const card = a => `<article class="announcement-card">
  <h3>${esc(a.title)}</h3>
  <p>${esc(a.body)}</p>
  <div class="announcement-date">${publishedLabel(a.created_at)}</div>
</article>`;

export async function announcements() {
  await syncManagerNavigation('announcements');
  const community = await getActiveManagerCommunity();
  if (!community) {
    app.innerHTML = '<section class="hero account-hero"><h1>Оголошення</h1></section><section class="card"><div class="privacy">Спочатку створіть спільноту.</div><div class="buttons"><a class="button" href="#/communities/new">+ Створити спільноту</a></div></section>';
    return;
  }
  const { data, error } = await db.rpc('get_manager_announcements_v12_rpc', { p_community_id: community.id });
  if (error) return app.innerHTML = `<section class="card"><div class="error">${esc(error.message)}</div></section>`;
  const items = data || [];
  app.innerHTML = `<section class="hero account-hero"><h1>Оголошення</h1><p class="lead">${esc(community.name)}</p></section>
    <div class="account-create"><a class="button" href="#/announcements/new">+ Створити оголошення</a></div>
    <section class="account-section"><div class="announcement-list">${items.length ? items.map(card).join('') : '<div class="privacy">Оголошень ще немає.</div>'}</div></section>`;
}

export async function newAnnouncement() {
  await syncManagerNavigation('announcements');
  const community = await getActiveManagerCommunity();
  if (!community) return announcements();
  app.innerHTML = `<section class="hero account-hero"><h1>Нове оголошення</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="card">
      <label>Заголовок</label><input id="announcementTitle" placeholder="Наприклад: Екскурсія у пʼятницю">
      <label>Текст</label><textarea id="announcementBody" placeholder="Напишіть оголошення"></textarea>
      <div class="buttons"><button id="createAnnouncementBtn" onclick="createAnnouncement()">Опублікувати</button></div>
      <div id="announcementError" class="error hidden"></div>
    </section>`;
}

export async function createAnnouncement() {
  const community = await getActiveManagerCommunity();
  const title = document.getElementById('announcementTitle')?.value.trim() || '';
  const body = document.getElementById('announcementBody')?.value.trim() || '';
  const button = document.getElementById('createAnnouncementBtn');
  const errorBox = document.getElementById('announcementError');
  if (!community) return ferr(errorBox, 'Спільноту не знайдено.');
  if (!title) return ferr(errorBox, 'Вкажіть заголовок.');
  if (!body) return ferr(errorBox, 'Вкажіть текст оголошення.');
  button.disabled = true; button.textContent = 'Публікуємо...';
  const { error } = await db.rpc('create_announcement_v12_rpc', { p_community_id: community.id, p_title: title, p_body: body });
  button.disabled = false; button.textContent = 'Опублікувати';
  if (error) return ferr(errorBox, error.message);
  location.hash = '#/announcements';
}

export async function myAnnouncements() {
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData?.session) {
    location.hash = '#/login';
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
  app.innerHTML = `<section class="hero account-hero"><h1>Оголошення</h1><p class="lead">${esc(community.name)}</p></section>
    <section class="account-section"><div class="announcement-list">${items.length ? items.map(card).join('') : '<div class="privacy">Оголошень ще немає.</div>'}</div></section>`;
}
