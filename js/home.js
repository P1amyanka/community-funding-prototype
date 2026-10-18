import { db } from './supabase.js';
import { app } from './utils.js';
import { hideManagerNavigation } from './navigation.js';

// The landing is static HTML in index.html (so search engines and AI crawlers
// can read it). Keep a copy to show it again after visiting other pages.
const LANDING_HTML = app.innerHTML;

export async function home() {
  hideManagerNavigation();
  document.body.classList.add('on-landing');
  const login = document.getElementById('topbarLogin');
  if (login) {
    login.classList.remove('hidden');
    db.auth.getSession().then(({ data }) => { login.textContent = data?.session ? 'Кабінет' : 'Увійти'; });
  }

  document.documentElement.classList.remove('has-route');
  app.innerHTML = LANDING_HTML;
}
