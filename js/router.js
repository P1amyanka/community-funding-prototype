import { db } from './supabase.js';
import { home } from './home.js';
import { participant } from './participant.js';
import { manager } from './manager.js';
import { about, feedback } from './info-pages.js';
import { login } from './auth.js';
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
  const rawHash = location.hash;
  if (rawHash.includes('access_token=') || rawHash.includes('refresh_token=')) return finishAuthRedirect();

  const [k, t] = parts();
  if (!k) return home();
  if (k === 'about') return about();
  if (k === 'feedback') return feedback();
  if (k === 'login') return login();
  if (k === 'r' && t) return participant(t);
  if (k === 'manage' && t) return manager(t);
  fail('Невідоме посилання.');
}
