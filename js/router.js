import { home } from './home.js';
import { participant } from './participant.js';
import { manager } from './manager.js';
import { about, feedback } from './info-pages.js';
import { fail } from './utils.js';

export function parts() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function route(x) {
  location.hash = x;
}

export function router() {
  const [k, t] = parts();
  if (!k) return home();
  if (k === 'about') return about();
  if (k === 'feedback') return feedback();
  if (k === 'r' && t) return participant(t);
  if (k === 'manage' && t) return manager(t);
  fail('Невідоме посилання.');
}