import { db } from './supabase.js';
import { esc } from './utils.js';

const MANAGER_COMMUNITY_KEY = 'comfundy:managerCommunityId';
const PARTICIPANT_COMMUNITY_KEY = 'comfundy:participantCommunityId';

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h5v-6h4v6h5V9"/>',
  announcements: '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/>',
  collections: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/>',
  initiatives: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z"/>',
  members: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/><path d="M17 14.2a5 5 0 0 1 3.5 4.8"/>',
  communities: '<path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  statistics: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  ideas: '<path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20Z"/>',
};
// Circular arrows: switch between the manager's and the participant's cabinet.
const SWITCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/></svg>';
const cabinetSwitch = (href, label) => `<a class="manager-menu-switch" href="${href}" onclick="closeManagerMenu()">${SWITCH_ICON}<span>${label}</span></a>`;

const iconFor = key => ICONS[key.replace(/^my-/, '')] || '';

function renderTabBar(items, active) {
  const bar = document.getElementById('tabBar');
  if (!bar) return;
  bar.style.setProperty('--tabs', items.length);
  bar.innerHTML = items.map(([key, href, label]) => `<a class="tab-item ${active === key ? 'active' : ''}" href="${href}" ${active === key ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true">${iconFor(key)}</svg><span>${label}</span></a>`).join('');
  bar.classList.remove('hidden');
  // Phones: the tabs scroll sideways, so bring the current one into view.
  const current = bar.querySelector('.tab-item.active');
  if (current) bar.scrollLeft = current.offsetLeft - (bar.clientWidth - current.offsetWidth) / 2;
}

function setCreateFab(visible) {
  document.getElementById('createFab')?.classList.toggle('hidden', !visible);
}

function hideTabBar() {
  document.getElementById('tabBar')?.classList.add('hidden');
  document.getElementById('communityPill')?.classList.add('hidden');
  setCreateFab(false);
}

function setCommunityPill(name) {
  const pill = document.getElementById('communityPill');
  if (!pill) return;
  if (!name) return pill.classList.add('hidden');
  pill.innerHTML = `<span>${esc(name)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
  pill.classList.remove('hidden');
}

const managerItems = [
  ['announcements', '#/announcements', 'Оголошення'],
  ['collections', '#/collections', 'Збори'],
  ['initiatives', '#/initiatives', 'Опитування'],
  ['members', '#/members', 'Учасники'],
  ['communities', '#/communities', 'Спільноти'],
  ['statistics', '#/statistics', 'Статистика'],
];

const participantItems = [
  ['my-announcements', '#/me/announcements', 'Оголошення'],
  ['my-collections', '#/me/collections', 'Збори'],
  ['my-initiatives', '#/me/initiatives', 'Опитування'],
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
      ? '<div class="menu-community-empty">Спільноту ще не створено.</div>'
      : '<div class="menu-community-empty">Немає активної спільноти.</div>';
  }
  if (communities.length < 2) {
    return `<div class="menu-community menu-community-fixed">
      <span>Спільнота</span>
      <strong>${esc(active?.name || '')}</strong>
    </div>`;
  }
  const options = communities.map(c => `<option value="${esc(c.id)}" ${c.id === active?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<div class="menu-community">
      <span>Спільнота</span>
      <select onchange="${handler}(this.value)">${options}</select>
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
  document.body.classList.toggle('in-cabinet', visible);

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

  if (visible) {
    renderTabBar(managerItems.filter(([key]) => key !== 'communities'), active);
    setCommunityPill(activeCommunity?.name || null);
    setCreateFab(Boolean(activeCommunity) && managerItems.some(([key]) => key === active && key !== 'communities'));
  } else {
    hideTabBar();
  }

  links.innerHTML = `${communitySelector(communities, activeCommunity, 'switchManagerCommunity', true)}
    <div class="manager-menu-separator"></div>
    ${managerItems.map(([key, href, label]) =>
      `<a class="manager-menu-link ${key === 'communities' ? '' : 'menu-section'} ${active === key ? 'active' : ''}" href="${href}" onclick="closeManagerMenu()"><svg viewBox="0 0 24 24" aria-hidden="true">${iconFor(key)}</svg>${label}</a>`
    ).join('')}
    <a class="manager-menu-link ${active === 'ideas' ? 'active' : ''}" href="#/ideas" onclick="closeManagerMenu()"><svg viewBox="0 0 24 24" aria-hidden="true">${iconFor('ideas')}</svg>Що додати в Comfundy?</a>`;

  let switchLink = '';
  if (currentSession) {
    const { data: roles } = await db.rpc('get_my_account_roles_v11_rpc');
    if (roles?.[0]?.is_participant) switchLink = cabinetSwitch('#/me', 'Перейти в кабінет учасника');
  }
  account.innerHTML = currentSession
    ? `${switchLink}<a class="manager-menu-feedback" href="#/feedback" onclick="closeManagerMenu()">Зворотний зв'язок</a><div class="manager-menu-email">${esc(currentSession.user.email || '')}</div><button class="manager-menu-signout" onclick="signOutManager()">Вийти</button>`
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
    document.body.classList.remove('in-cabinet');
    hideTabBar();
    return;
  }
  button.classList.remove('hidden');
  document.body.classList.add('in-cabinet');

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

  renderTabBar(participantItems, active);
  setCommunityPill(activeCommunity?.name || null);
  setCreateFab(false);

  links.innerHTML = `${communitySelector(communities, activeCommunity, 'switchParticipantCommunity', false)}
    <div class="manager-menu-separator"></div>
    ${participantItems.map(([key, href, label]) =>
      `<a class="manager-menu-link menu-section ${active === key ? 'active' : ''}" href="${href}" onclick="closeManagerMenu()"><svg viewBox="0 0 24 24" aria-hidden="true">${iconFor(key)}</svg>${label}</a>`
    ).join('')}
    <a class="manager-menu-link ${active === 'my-ideas' ? 'active' : ''}" href="#/me/ideas" onclick="closeManagerMenu()"><svg viewBox="0 0 24 24" aria-hidden="true">${iconFor('ideas')}</svg>Що додати в Comfundy?</a>`;

  let roles = role;
  if (!roles) {
    const { data: roleRows } = await db.rpc('get_my_account_roles_v11_rpc');
    roles = roleRows?.[0] || null;
  }
  const switchLink = roles?.is_manager ? cabinetSwitch('#/announcements', 'Перейти в кабінет менеджера') : '';
  account.innerHTML = `${switchLink}<a class="manager-menu-feedback" href="#/feedback" onclick="closeManagerMenu()">Зворотний зв'язок</a><div class="manager-menu-email">${esc(currentSession.user.email || '')}</div><button class="manager-menu-signout" onclick="signOutManager()">Вийти</button>`;
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
  document.body.classList.remove('in-cabinet');
  hideTabBar();
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
