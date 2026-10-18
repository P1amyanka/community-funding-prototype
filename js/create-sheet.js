// «+» on phones: «Що створити?» — внесок, оголошення або збір в активній спільноті.
import { esc } from './utils.js';

const ICON = {
  contribution: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
  announcement: '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  collection: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/>',
};

const sheetOption = (icon, title, text, action) => `<button class="sheet-option" onclick="${action}">
    <i><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[icon]}</svg></i>
    <span class="sheet-option-text"><strong>${title}</strong><span>${text}</span></span>
    <svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
  </button>`;

export function openCreateSheet(communityId = localStorage.getItem('comfundy:managerCommunityId') || '') {
  closeCreateSheet();
  const overlay = document.createElement('div');
  overlay.id = 'createSheet';
  overlay.className = 'drawer-overlay create-sheet-overlay';
  overlay.innerHTML = `
    <button class="drawer-backdrop" aria-label="Закрити" onclick="closeCreateSheet()"></button>
    <aside class="comment-drawer create-sheet" role="dialog" aria-modal="true" aria-labelledby="createSheetTitle">
      <div class="drawer-head"><h2 id="createSheetTitle">Що створити?</h2><button class="drawer-close" aria-label="Закрити" onclick="closeCreateSheet()">×</button></div>
      ${sheetOption('contribution', 'Внесок', 'Позначити, що учасник оплатив збір', `closeCreateSheet();openContributionDrawer('','${esc(communityId)}')`)}
      ${sheetOption('announcement', 'Оголошення', 'Новина чи нагадування для всіх учасників', "closeCreateSheet();location.hash='#/announcements/new'")}
      ${sheetOption('collection', 'Збір', 'Гроші на щось спільне — разово чи щомісяця', "closeCreateSheet();location.hash='#/collections/new'")}
    </aside>`;
  document.body.appendChild(overlay);
  document.addEventListener('keydown', closeOnEscape);
}

function closeOnEscape(event) {
  if (event.key === 'Escape') closeCreateSheet();
}

export function closeCreateSheet() {
  document.getElementById('createSheet')?.remove();
  document.removeEventListener('keydown', closeOnEscape);
}
