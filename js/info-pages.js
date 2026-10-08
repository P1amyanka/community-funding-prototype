import { app } from './utils.js';

export function about() {
  app.innerHTML = `
    <section class="card info-card">
      <h2>Про Comfundy</h2>
      <p><strong>Comfundy допомагає шкільним спільнотам організовувати спільні справи та гроші в одному місці.</strong></p>
      <p>Тут можна створювати збори, вести внески учасників, публікувати оголошення та бачити статистику по спільноті.</p>
      <p>Кожна спільнота має свій простір. Менеджер організовує роботу групи, а учасники бачать актуальні оголошення, свої збори та власну історію внесків.</p>
    </section>`;
}

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
