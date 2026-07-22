import { CONFIG } from './config.js';

export function allocationV02(target, proposals) {
  const t = Math.max(0, Math.round(Number(target || 0) * 100));
  const clean = proposals.map((p, index) => ({ ...p, index, maxCents: Math.max(0, Math.round(Number(p.max_amount || 0) * 100)) }));
  const sum = clean.reduce((s, p) => s + p.maxCents, 0);
  if (sum < t) return { feasible: false, sumMax: sum / 100, gap: (t - sum) / 100, rows: clean.map(p => ({ ...p, max: p.maxCents / 100, recommended: p.maxCents / 100 })) };
  let remaining = t, active = [...clean].sort((a, b) => a.maxCents - b.maxCents || a.index - b.index), assigned = new Map();
  while (active.length) {
    const share = Math.floor(remaining / active.length), capped = active.filter(p => p.maxCents <= share);
    if (!capped.length) break;
    capped.forEach(p => { assigned.set(p.index, p.maxCents); remaining -= p.maxCents; });
    active = active.filter(p => !assigned.has(p.index));
  }
  if (active.length) {
    const base = Math.floor(remaining / active.length); let rest = remaining - base * active.length;
    active.forEach(p => { assigned.set(p.index, Math.min(p.maxCents, base + (rest > 0 ? 1 : 0))); if (rest > 0) rest--; });
  }
  return { feasible: true, sumMax: sum / 100, gap: 0, rows: clean.map(p => ({ ...p, max: p.maxCents / 100, recommended: (assigned.get(p.index) || 0) / 100 })) };
}

export function proposalsWithoutTarget(proposals) {
  const rows = proposals.map(p => ({ ...p, max: Number(p.max_amount || 0), recommended: null }));
  const sumMax = rows.reduce((s, p) => s + p.max, 0);
  return { feasible: null, sumMax, averageMax: rows.length ? sumMax / rows.length : 0, gap: null, rows };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(r, a) {
  const hasTarget = r.target_amount !== null && r.target_amount !== undefined;
  const lines = [hasTarget
    ? ['Ідентифікація', 'Максимальна сума внеску', 'Розрахований внесок', 'Ініціатива', 'Алгоритм'].join(';')
    : ['Ідентифікація', 'Максимальна сума внеску', 'Ініціатива', 'Режим'].join(';')];
  a.rows.forEach(x => lines.push(hasTarget
    ? [csvEscape(x.participant_label), x.max.toFixed(2), x.recommended !== null ? x.recommended.toFixed(2) : '', csvEscape(r.title), CONFIG.ALLOCATION_VERSION].join(';')
    : [csvEscape(x.participant_label), x.max.toFixed(2), csvEscape(r.title), 'average-without-budget'].join(';')));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), l = document.createElement('a');
  l.href = URL.createObjectURL(blob); l.download = `initiative-${r.participant_token}-${hasTarget ? CONFIG.ALLOCATION_VERSION : 'average'}.csv`; l.click(); URL.revokeObjectURL(l.href);
}
