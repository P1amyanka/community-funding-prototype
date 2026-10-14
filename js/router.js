import { db } from './supabase.js';
import { home } from './home.js';
import { myInitiative, myInitiatives } from './participant.js';
import { initiative, initiatives, newInitiative } from './manager.js';
import { about, feedback } from './info-pages.js';
import { login } from './auth.js';
import { communities, community, editCommunity, editMember, members, newCommunity, newMember } from './communities.js';
import { collection, collections, newCollection, statistics } from './collections.js';
import { announcements, myAnnouncements, newAnnouncement } from './announcements.js';
import { myCollection, myCollections, myStatistics } from './participant-account.js';
import { closeManagerMenu, hideManagerNavigation } from './navigation.js';
import { app, fail } from './utils.js';

export function parts() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function route(x) {
  location.hash = x;
}

async function finishAuthRedirect() {
  app.innerHTML = '<section class="card"><h2>Входимо…</h2><p class="caption" style="margin-top:10px">Перевіряємо посилання з листа.</p></section>';
  const { data, error } = await db.auth.getSession();
  if (error) return fail(error.message);
  if (!data?.session) return fail('Не вдалося завершити вхід. Спробуйте запросити нове посилання.');

  history.replaceState(null, '', `${location.pathname}#/login`);
  login();
}

function outdatedLink() {
  app.innerHTML = `<section class="card"><h2>Посилання більше не діє</h2>
    <p class="status-text">Ініціативи тепер живуть у спільнотах. Увійдіть у свій кабінет, щоб побачити їх у розділі «Ініціативи».</p>
    <div class="buttons"><a class="button" href="#/login">Увійти</a></div></section>`;
}

export function router() {
  closeManagerMenu();
  document.body.classList.remove('on-landing');
  document.getElementById('topbarLogin')?.classList.add('hidden');
  const rawHash = location.hash;
  if (rawHash.includes('access_token=') || rawHash.includes('refresh_token=')) return finishAuthRedirect();

  const [k, t, section] = parts();
  if (!k) return home();
  if (k === 'about') { hideManagerNavigation(); return about(); }
  if (k === 'feedback') { hideManagerNavigation(); return feedback(); }
  if (k === 'login') return login();
  if (k === 'announcements' && t === 'new') return newAnnouncement();
  if (k === 'announcements') return announcements();
  if (k === 'me' && t === 'announcements') return myAnnouncements();
  if (k === 'me' && t === 'initiatives' && section) return myInitiative(section);
  if (k === 'me' && t === 'initiatives') return myInitiatives();
  if (k === 'me' && t === 'collections' && section) return myCollection(section);
  if (k === 'me' && t === 'collections') return myCollections();
  if (k === 'me' && t === 'statistics') return myStatistics();
  if (k === 'initiatives' && t === 'new') return newInitiative();
  if (k === 'initiatives' && t) return initiative(t);
  if (k === 'initiatives') return initiatives();
  if (k === 'collections' && t === 'new') return newCollection();
  if (k === 'collections' && t) return collection(t);
  if (k === 'collections') return collections();
  if (k === 'statistics') return statistics();
  if (k === 'members' && t === 'new') return newMember();
  if (k === 'members' && t && section === 'edit') return editMember(t);
  if (k === 'members') return members();
  if (k === 'community' && t && section === 'edit') return editCommunity(t);
  if (k === 'community' && t === 'edit') return editCommunity();
  if (k === 'communities' && t === 'new') return newCommunity();
  if (k === 'communities') return communities();
  if (k === 'community' && t && section === 'new-member') return newMember(t);
  if (k === 'community' && t) return community(t, section || 'members');
  if (k === 'r' || k === 'manage' || k === 'new-initiative') { hideManagerNavigation(); return outdatedLink(); }
  fail('Невідоме посилання.');
}
