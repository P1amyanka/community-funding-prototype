import { db } from './supabase.js';
import { esc } from './utils.js';

const managerItems = [
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

  links.innerHTML = managerItems.map(([key, href, label]) =>
    `<a class="manager-menu-link ${active === key ? 'active' : ''}" href="${href}" onclick="closeManagerMenu()">${label}</a>`
  ).join('');

  let switchLink = '';
  if (session) {
    const { data: roles } = await db.rpc('get_my_account_roles_v11_rpc');
    if (roles?.[0]?.is_participant) switchLink = '<a class="manager-menu-switch" href="#/me/collections" onclick="closeManagerMenu()">Мій кабінет</a>';
  }
  account.innerHTML = session
    ? `${switchLink}<div class="manager-menu-email">${esc(session.user.email || '')}</div><button class="manager-menu-signout" onclick="signOutManager()">Вийти</button>`
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


export async function syncParticipantNavigation(active = 'my-collections', role = null) {
  const button = document.getElementById('managerMenuButton');
  const drawer = document.getElementById('managerMenuDrawer');
  const links = document.getElementById('managerMenuLinks');
  const account = document.getElementById('managerMenuAccount');
  if (!button || !drawer || !links || !account) return;

  const { data } = await db.auth.getSession();
  const session = data?.session || null;
  if (!session) {
    button.classList.add('hidden');
    return;
  }
  button.classList.remove('hidden');

  const participantItems = [
    ['my-collections', '#/me/collections', 'Мої збори'],
    ['my-statistics', '#/me/statistics', 'Статистика'],
  ];
  links.innerHTML = participantItems.map(([key, href, label]) =>
    `<a class="manager-menu-link ${active === key ? 'active' : ''}" href="${href}" onclick="closeManagerMenu()">${label}</a>`
  ).join('');

  let roles = role;
  if (!roles) {
    const { data: roleRows } = await db.rpc('get_my_account_roles_v11_rpc');
    roles = roleRows?.[0] || null;
  }
  const switchLink = roles?.is_manager
    ? '<a class="manager-menu-switch" href="#/login" onclick="closeManagerMenu()">Кабінет менеджера</a>'
    : '';
  account.innerHTML = `${switchLink}<div class="manager-menu-email">${esc(session.user.email || '')}</div><button class="manager-menu-signout" onclick="signOutManager()">Вийти</button>`;
}
