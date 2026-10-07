import { db } from './supabase.js';
import { esc } from './utils.js';

const items = [
  ['collections', '#/collections', 'Збори'],
  ['initiatives', '#/login', 'Ініціативи'],
  ['members', '#/members', 'Учасники'],
  ['communities', '#/communities', 'Спільноти'],
  ['statistics', '#/statistics', 'Статистика'],
];

export async function syncManagerNavigation(active = null, forceVisible = false) {
  const button = document.getElementById('managerMenuButton');
  const drawer = document.getElementById('managerMenuDrawer');
  const links = document.getElementById('managerMenuLinks');
  const account = document.getElementById('managerMenuAccount');
  if (!button || !drawer || !links || !account) return;

  const { data } = await db.auth.getSession();
  const session = data?.session || null;
  const visible = forceVisible || Boolean(session);
  button.classList.toggle('hidden', !visible);

  links.innerHTML = items.map(([key, href, label]) =>
    `<a class="manager-menu-link ${active === key ? 'active' : ''}" href="${href}" onclick="closeManagerMenu()">${label}</a>`
  ).join('');

  account.innerHTML = session
    ? `<div class="manager-menu-email">${esc(session.user.email || '')}</div><button class="manager-menu-signout" onclick="signOutManager()">Вийти</button>`
    : '<a class="manager-menu-login" href="#/login" onclick="closeManagerMenu()">Увійти</a>';
}

export function hideManagerNavigation() {
  closeManagerMenu();
  const button = document.getElementById('managerMenuButton');
  if (button) button.classList.add('hidden');
}

export function openManagerMenu() {
  const drawer = document.getElementById('managerMenuDrawer');
  if (!drawer) return;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('menu-open');
}

export function closeManagerMenu() {
  const drawer = document.getElementById('managerMenuDrawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('menu-open');
}
