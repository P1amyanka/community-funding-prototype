import { app } from './utils.js';

export function feedback() {
  app.innerHTML = `
    <section class="hero info-hero">
      <h1>Зворотний зв'язок</h1>
      <p class="lead">Якщо у вас є пропозиції, питання або ви знайшли помилку, буду рада вашим повідомленням.</p>
    </section>
    <section class="card info-card contact-card">
      <h2>Яна Осипова</h2>
      <a class="contact-phone" href="mailto:osyyana@gmail.com">osyyana@gmail.com</a>
    </section>`;
}
