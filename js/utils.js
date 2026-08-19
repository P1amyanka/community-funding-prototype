export const app = document.getElementById('app');

export const money = n => Math.round(Number(n || 0)).toLocaleString('uk-UA') + ' грн';
export const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

const allowedRichTags = new Set(['B', 'STRONG', 'UL', 'OL', 'LI', 'P', 'BR']);

export function sanitizeRichText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  const clean = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
    const tag = allowedRichTags.has(node.tagName) ? node.tagName.toLowerCase() : 'span';
    const el = document.createElement(tag);
    [...node.childNodes].forEach(child => el.appendChild(clean(child)));
    return el;
  };
  const out = document.createElement('div');
  [...root.childNodes].forEach(node => out.appendChild(clean(node)));
  return out.innerHTML.trim();
}

export function richText(value, fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return fallback ? `<p>${esc(fallback)}</p>` : '';
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return raw.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  return sanitizeRichText(raw);
}

export function richEditor(id, value = '', placeholder = '') {
  return `<div class="rich-editor"><div class="rich-toolbar" role="toolbar" aria-label="Форматування опису"><button type="button" class="format-button" onclick="formatRichText('${id}','bold')" aria-label="Жирний"><strong>B</strong></button><button type="button" class="format-button" onclick="formatRichText('${id}','insertUnorderedList')" aria-label="Маркований список">• Список</button><button type="button" class="format-button" onclick="formatRichText('${id}','insertOrderedList')" aria-label="Нумерований список">1. Список</button></div><div id="${id}" class="rich-input" contenteditable="true" data-placeholder="${esc(placeholder)}">${richText(value)}</div></div>`;
}

export function formatRichText(id, command) {
  const editor = document.getElementById(id);
  if (!editor) return;
  editor.focus();
  document.execCommand(command, false, null);
}

export function getRichText(id) {
  const editor = document.getElementById(id);
  return editor ? sanitizeRichText(editor.innerHTML) : '';
}

export function toast(x) {
  const t = document.getElementById('toast');
  t.textContent = x;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

export function purl(t) {
  return `${location.origin}${location.pathname}#/r/${t}`;
}

export function date(v) {
  return new Date(v).toLocaleString('uk-UA');
}

export function loading(x) {
  app.innerHTML = `<section class="card"><h2>${x}</h2><p class="caption">Зачекайте кілька секунд.</p></section>`;
}

export function fail(x) {
  app.innerHTML = `<section class="card"><h2>Щось пішло не так</h2><p class="status-text">${esc(x)}</p><button onclick="route('')">На головну</button></section>`;
}

export function ferr(el, x) {
  el.textContent = x;
  el.classList.remove('hidden');
}

export function copyInput(id) {
  const x = document.getElementById(id);
  x.select();
  navigator.clipboard.writeText(x.value).then(() => toast('Посилання скопійовано'));
}
