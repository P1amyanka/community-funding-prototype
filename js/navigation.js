import { db } from './supabase.js';
import { esc } from './utils.js';

const MANAGER_COMMUNITY_KEY = 'comfundy:managerCommunityId';
const PARTICIPANT_COMMUNITY_KEY = 'comfundy:participantCommunityId';

const managerItems = [
  ['announcements', '#/announcements', 'Оголошення'],
  ['collections', '#/collections', 'Збори'],
  ['initiatives', '#/login', 'Ініціативи'],
  ['members', '#/members', 'Учасники'],
  ['statistics', '#/statistics', 'Статистика'],
];

const participantItems = [
  ['my-announcements', '#/me/announcements', 'Оголошення'],
  ['my-collections', '#/me/collections', 'Мої збори'],
  ['my-statistics', '#/me/statistics', 'Статистика'],
];

async function session() {
  const { data } = await db.auth.getSession();
  return data?.session || null;
}

export async function getManagerCommunities() {
  const { data, error } = await db.rpc('get_my_communities_v06_rpc');
  if (error) throw error;
  return data || [];
}

export async function getActiveManagerCommunity() {
  const communities = await getManagerCommunities();
  if (!communities.length) return null;
  const stored = localStorage.getItem(MANAGER_COMMUNITY_KEY);
  const active = communities.find(c => c.id === stored) || communities[0];
  if (active.id !== stored) localStorage.setItem(MANAGER_COMMUNITY_KEY, active.id);
  return active;
}

export async function getParticipantCommunities() {
  const { data, error } = await db.rpc('get_my_participant_memberships_v11_rpc');
  if (error) throw error;
  const unique = [];
  const seen = new Set();
  (data || []).forEach(m => {
    if (!seen.has(m.community_id)) {
      seen.add(m.community_id);
      unique.push({ id: m.community_id, name: m.community_name });
    }
  });
  return unique;
}

export async function getActiveParticipantCommunity() {
  const communities = await getParticipantCommunities();
  if (!communities.length) return null;
  const stored = localStorage.getItem(PARTICIPANT_COMMUNITY_KEY);
  const active = communities.find(c => c.id === stored) || communities[0];
  if (active.id !== stored) localStorage.setItem(PARTICIPANT_COMMUNITY_KEY, active.id);
  return active;
}

const communitySelector = (communities, active, handler, manage = false) => {
  if (!communities.length) {
    return manage
      ? '<div class="menu-community-empty">Спільноту ще не створено.</div><a class="menu-community-action" href="#/communities/new" onclick="closeManagerMenu()">+ Створити спільноту</a>'
      : '<div class="menu-community-empty">Немає активної спільноти.</div>';
  }
  const options = communities.map(c => `<option value="${esc(c.id)}" ${c.id === active?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<div class="menu-community">
      <span>Спільнота</span>
      <select onchange="${handler}(this.value)">${options}</select>
      ${manage ? '<div class="menu-community-actions"><a href="#/community/edit" onclick="closeManagerMenu()">Редагувати</a><a href="#/communities" onclick="closeManagerMenu()">Керувати</a></div>' : ''}
    </div>`;
};

export async function syncManagerNavigation(active = null, forceVisible = false) {
  const button = document.getElementById('managerMenuButton');
  const links = document.getElementById('managerMenuLinks');
  const account = document.getElementById('managerMenuAccount');
  if (!button || !links || !account) return;

  const currentSession = await session();
  const visible = forceVisible || Boolean(currentSession);
  button.classList.toggle('hidden', !visible);

  let communities = [];
  let activeCommunity = null;
  if (currentSession) {
    try {
      communities = await getManagerCommunities();
      if (communities.length) {
        const stored = localStorage.getItem(MANAGER_COMMUNITY_KEY);
        activeCommunity = communities.find(c => c.id === stored) || communities[0];
        localStorage.setItem(MANAGER_COMMUNITY_KEY, activeCommunity.id);
      }
    } catch {}
  }

  links.innerHTML = `${communitySelector(communities, activeCommunity, 'switchManagerCommunity', true)}
    <div class="manager-menu-separator"></div>
    ${managerItems.map(([key, href, label]) =>
      `<a class="manager-menu-link ${active === key ? 'active' : ''}" href="${href}" onclick="closeManagerMenu()">${label}</a>`
    ).join('')}`;

  let switchLink = '';
  if (currentSession) {
    const { data: roles } = await db.rpc('get_my_account_roles_v11_rpc');
    if (roles?.[0]?.is_participant) switchLink = '<a class="manager-menu-switch" href="#/me/collections" onclick="closeManagerMenu()">Мій кабінет</a>';
  }
  account.innerHTML = currentSession
    ? `${switchLink}<div class="manager-menu-email">${esc(currentSession.user.email || '')}</div><button class="manager-menu-signout" onclick="signOutManager()">Вийти</button>`
    : '<a class="manager-menu-login" href="#/login" onclick="closeManagerMenu()">Увійти</a>';
}

export async function syncParticipantNavigation(active = 'my-collections', role = null) {
  const button = document.getElementById('managerMenuButton');
  const links = document.getElementById('managerMenuLinks');
  const account = document.getElementById('managerMenuAccount');
  if (!button || !links || !account) return;

  const currentSession = await session();
  if (!currentSession) {
    button.classList.add('hidden');
    return;
  }
  button.classList.remove('hidden');

  let communities = [];
  let activeCommunity = null;
  try {
    communities = await getParticipantCommunities();
    if (communities.length) {
      const stored = localStorage.getItem(PARTICIPANT_COMMUNITY_KEY);
      activeCommunity = communities.find(c => c.id === stored) || communities[0];
      localStorage.setItem(PARTICIPANT_COMMUNITY_KEY, activeCommunity.id);
    }
  } catch {}

  links.innerHTML = `${communitySelector(communities, activeCommunity, 'switchParticipantCommunity', false)}
    <div class="manager-menu-separator"></div>
    ${participantItems.map(([key, href, label]) =>
      `<a class="manager-menu-link ${active === key ? 'active' : ''}" href="${href}" onclick="closeManagerMenu()">${label}</a>`
    ).join('')}`;

  let roles = role;
  if (!roles) {
    const { data: roleRows } = await db.rpc('get_my_account_roles_v11_rpc');
    roles = roleRows?.[0] || null;
  }
  const switchLink = roles?.is_manager
    ? '<a class="manager-menu-switch" href="#/login" onclick="closeManagerMenu()">Кабінет менеджера</a>'
    : '';
  account.innerHTML = `${switchLink}<div class="manager-menu-email">${esc(currentSession.user.email || '')}</div><button class="manager-menu-signout" onclick="signOutManager()">Вийти</button>`;
}

export function switchManagerCommunity(id) {
  if (!id) return;
  localStorage.setItem(MANAGER_COMMUNITY_KEY, id);
  closeManagerMenu();
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function switchParticipantCommunity(id) {
  if (!id) return;
  localStorage.setItem(PARTICIPANT_COMMUNITY_KEY, id);
  closeManagerMenu();
  window.dispatchEvent(new HashChangeEvent('hashchange'));
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
