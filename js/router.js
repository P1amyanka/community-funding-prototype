import { db } from './supabase.js';
import { home, newInitiative } from './home.js';
import { participant } from './participant.js';
import { manager } from './manager.js';
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
  const claimToken = new URLSearchParams(location.search).get('claim');
  const { data, error } = await db.auth.getSession();
  if (error) return fail(error.message);
  if (!data?.session) return fail('Не вдалося завершити вхід. Спробуйте запросити нове посилання.');

  if (claimToken) {
    const { error: claimError } = await db.rpc('claim_initiative_v04_rpc', {
      p_manager_token: claimToken,
    });
    if (claimError) return fail(claimError.message);
  }

  history.replaceState(null, '', `${location.pathname}#/login`);
  login();
}

export function router() {
  closeManagerMenu();
  const rawHash = location.hash;
  if (rawHash.includes('access_token=') || rawHash.includes('refresh_token=')) return finishAuthRedirect();

  const [k, t, section] = parts();
  if (!k) return home();
  if (k === 'new-initiative') return newInitiative();
  if (k === 'about') { hideManagerNavigation(); return about(); }
  if (k === 'feedback') { hideManagerNavigation(); return feedback(); }
  if (k === 'login') return login();
  if (k === 'announcements' && t === 'new') return newAnnouncement();
  if (k === 'announcements') return announcements();
  if (k === 'me' && t === 'announcements') return myAnnouncements();
  if (k === 'me' && t === 'collections' && section) return myCollection(section);
  if (k === 'me' && t === 'collections') return myCollections();
  if (k === 'me' && t === 'statistics') return myStatistics();
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
  if (k === 'community' && t && section === 'new-initiative') return newInitiative(t);
  if (k === 'community' && t && section === 'new-member') return newMember(t);
  if (k === 'community' && t) return community(t, section || 'members');
  if (k === 'r' && t) { hideManagerNavigation(); return participant(t); }
  if (k === 'manage' && t) return manager(t);
  fail('Невідоме посилання.');
}
