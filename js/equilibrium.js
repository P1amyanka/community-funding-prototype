import { CONFIG } from './config.js';
import { richTextToPlainText } from './utils.js';

function proposalStats(rows) {
  const values = rows.map(x => Number(x.max || 0)).sort((a, b) => a - b);
  const count = values.length;
  const sumMax = values.reduce((sum, value) => sum + value, 0);
  const middle = Math.floor(count / 2);
  const medianMax = count
    ? (count % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2)
    : 0;
  return {
    count,
    sumMax,
    minimumMax: count ? values[0] : null,
    maximumMax: count ? values[count - 1] : null,
    medianMax: count ? medianMax : null,
    averageMax: count ? sumMax / count : null,
  };
}

export function allocationV02(target, proposals) {
  const t = Math.max(0, Math.round(Number(target || 0) * 100));
  const clean = proposals.map((p, index) => ({ ...p, index, maxCents: Math.max(0, Math.round(Number(p.max_amount || 0) * 100)) }));
  const sum = clean.reduce((s, p) => s + p.maxCents, 0);
  const baseRows = clean.map(p => ({ ...p, max: p.maxCents / 100, recommended: p.maxCents / 100 }));
  const stats = proposalStats(baseRows);

  if (sum < t) return { feasible: false, gap: (t - sum) / 100, rows: baseRows, ...stats };

  let remaining = t;
  let active = [...clean].sort((a, b) => a.maxCents - b.maxCents || a.index - b.index);
  const assigned = new Map();
  while (active.length) {
    const share = Math.floor(remaining / active.length);
    const capped = active.filter(p => p.maxCents <= share);
    if (!capped.length) break;
    capped.forEach(p => { assigned.set(p.index, p.maxCents); remaining -= p.maxCents; });
    active = active.filter(p => !assigned.has(p.index));
  }
  if (active.length) {
    const base = Math.floor(remaining / active.length);
    let rest = remaining - base * active.length;
    active.forEach(p => {
      assigned.set(p.index, Math.min(p.maxCents, base + (rest > 0 ? 1 : 0)));
      if (rest > 0) rest--;
    });
  }

  const rows = clean.map(p => ({ ...p, max: p.maxCents / 100, recommended: (assigned.get(p.index) || 0) / 100 }));
  return { feasible: true, gap: 0, rows, ...proposalStats(rows) };
}

export function proposalsWithoutTarget(proposals) {
  const rows = proposals.map(p => ({ ...p, max: Number(p.max_amount || 0), recommended: null }));
  return { feasible: null, gap: null, rows, ...proposalStats(rows) };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(r, a) {
  const hasTarget = r.target_amount !== null && r.target_amount !== undefined;
  const hasComments = Boolean(r.comments_enabled);
  const header = hasTarget
    ? ['Ідентифікація', 'Максимальна сума внеску', 'Розрахований внесок']
    : ['Ідентифікація', 'Максимальна сума внеску'];
  if (hasComments) header.push('Коментар');
  header.push('Ініціатива', hasTarget ? 'Алгоритм' : 'Режим');
  const lines = [header.join(';')];

  a.rows.forEach(x => {
    const row = hasTarget
      ? [csvEscape(x.participant_label), x.max.toFixed(2), x.recommended !== null ? x.recommended.toFixed(2) : '']
      : [csvEscape(x.participant_label), x.max.toFixed(2)];
    if (hasComments) row.push(csvEscape(richTextToPlainText(x.comment)));
    row.push(csvEscape(r.title), hasTarget ? CONFIG.ALLOCATION_VERSION : 'statistics-without-budget');
    lines.push(row.join(';'));
  });

  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const l = document.createElement('a');
  l.href = URL.createObjectURL(blob);
  l.download = `initiative-${r.participant_token}-${hasTarget ? CONFIG.ALLOCATION_VERSION : 'statistics'}.csv`;
  l.click();
  URL.revokeObjectURL(l.href);
}
