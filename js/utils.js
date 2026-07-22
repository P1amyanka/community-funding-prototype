export const app = document.getElementById('app');

export const money = n => Math.round(Number(n || 0)).toLocaleString('uk-UA') + ' грн';
export const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

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
