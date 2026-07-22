import { home } from './home.js';
import { participant, thanks } from './participant.js';
import { manager } from './manager.js';
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
  if (k === 'r' && t) return participant(t);
  if (k === 'manage' && t) return manager(t);
  if (k === 'thanks') return thanks();
  fail('Невідоме посилання.');
}
