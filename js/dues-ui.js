// Shared bits for showing dues: green = paid, terracotta = owed.
import { money } from './utils.js';

// One number per row: the debt (terracotta) if there is one, otherwise what was paid (green).
export const amountOne = (paid, left) => left > 0
  ? `<strong class="amt debt">${money(left)}</strong>`
  : `<strong class="amt paid">${money(paid)}</strong>`;

// Thin two-colour bar: green = paid, terracotta = still owed.
export const splitBar = (paid, left) => {
  const total = paid + left;
  if (total <= 0) return '<span class="split-bar empty"></span>';
  const p = Math.round(paid / total * 100);
  return `<span class="split-bar" aria-hidden="true"><i class="paid" style="width:${p}%"></i><i class="debt" style="width:${100 - p}%"></i></span>`;
};

// Nine dots (September–May): paid / owed / not yet due.
export const monthDots = d => `<span class="month-dots" aria-hidden="true">${d.months.map((mo, i) => {
  const cls = i < d.covered ? 'paid' : i < d.elapsed ? 'owed' : 'future';
  return `<i class="${cls}${i === d.elapsed - 1 ? ' current' : ''}" title="${mo.long}"></i>`;
}).join('')}</span>`;

export const duesTiles = (paid, left) => `<div class="dues-tiles">
    <div class="dues-tile paid"><strong>${money(paid)}</strong><span>внесено</span></div>
    <div class="dues-tile ${left > 0 ? 'debt' : 'paid'}"><strong>${money(left)}</strong><span>борг</span></div>
  </div>`;
