import { db } from './supabase.js';
import { app } from './utils.js';
import { hideManagerNavigation } from './navigation.js';

export async function home() {
  hideManagerNavigation();
  document.body.classList.add('on-landing');
  const login = document.getElementById('topbarLogin');
  if (login) {
    login.classList.remove('hidden');
    db.auth.getSession().then(({ data }) => { login.textContent = data?.session ? 'Кабінет' : 'Увійти'; });
  }

  app.innerHTML = `
    <div class="landing">
      <section class="landing-hero">
        <h1 class="landing-hero-title">Спільні справи класу — в одному місці</h1>
        <div class="landing-hero-copy">
          <p class="landing-lead">Comfundy допомагає батьківським і шкільним спільнотам організовувати збори, внески та оголошення без таблиць і нескінченних повідомлень у чатах.</p>
        </div>
        <div class="landing-hero-visual">
          <img src="assets/landing/community_planning_at_school.png" alt="Батьківська спільнота планує спільні справи">
          <div class="landing-actions landing-actions-under-image">
            <a class="landing-create" href="#/communities/new">Створити спільноту</a>
          </div>
        </div>
      </section>

      <section class="landing-section">
        <div class="landing-section-head">
          <p class="landing-eyebrow">Все необхідне для спільноти</p>
          <h2>Менше ручної координації — більше зрозумілого порядку</h2>
        </div>
        <div class="landing-features">
          <article class="landing-feature">
            <img src="assets/landing/community_school_fundraising_jar.png" alt="">
            <div class="landing-feature-copy">
              <h3>Збори</h3>
              <p>Створюйте разові або регулярні збори та фіксуйте внески учасників.</p>
            </div>
          </article>
          <article class="landing-feature">
            <img src="assets/landing/community_noticeboard_in_the_courtyard.png" alt="">
            <div class="landing-feature-copy">
              <h3>Оголошення</h3>
              <p>Публікуйте важливу інформацію для своєї спільноти в одному місці.</p>
            </div>
          </article>
          <article class="landing-feature">
            <img src="assets/landing/collaborative_school_community_dashboard.png" alt="">
            <div class="landing-feature-copy">
              <h3>Учасники та статистика</h3>
              <p>Ведіть список учасників і бачте, скільки вже зібрано та хто робив внески.</p>
            </div>
          </article>
        </div>
      </section>

      <section class="landing-section landing-how">
        <div class="landing-section-head">
          <p class="landing-eyebrow">Як це працює</p>
          <h2>Три прості кроки</h2>
        </div>
        <div class="landing-steps">
          <article><span>1</span><h3>Створіть спільноту</h3><p>Наприклад, свій клас або батьківську групу.</p></article>
          <article><span>2</span><h3>Додайте учасників</h3><p>За потреби вкажіть email і надайте доступ до кабінету.</p></article>
          <article><span>3</span><h3>Організовуйте роботу</h3><p>Створюйте збори, фіксуйте внески та публікуйте оголошення.</p></article>
        </div>
      </section>

      <section class="landing-section landing-participant">
        <div>
          <p class="landing-eyebrow">Для учасників</p>
          <h2>У кожного — свій простий кабінет</h2>
          <p>Учасник бачить актуальні оголошення, свої збори, власну історію внесків і статистику — без зайвої інформації про інших.</p>
        </div>
        <ul>
          <li>Оголошення своєї спільноти</li>
          <li>Свої збори</li>
          <li>Власна історія внесків</li>
          <li>Особиста статистика</li>
        </ul>
      </section>

      <section class="landing-cta">
        <p class="landing-eyebrow">Почати просто</p>
        <h2>Створіть простір для своєї спільноти</h2>
        <p>Збори, внески, оголошення та учасники — в одному місці.</p>
        <a class="landing-create" href="#/communities/new">Створити спільноту</a>
      </section>
    </div>`;
}
