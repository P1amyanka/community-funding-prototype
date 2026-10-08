import { db } from './supabase.js';
import { app, esc, ferr, getRichText, richEditor, toast } from './utils.js';
import { route } from './router.js';
import { getActiveManagerCommunity, hideManagerNavigation, syncManagerNavigation } from './navigation.js';

export async function home() {
  hideManagerNavigation();

  app.innerHTML = `
    <div class="landing">
      <section class="landing-hero">
        <div class="landing-hero-copy">
          <p class="landing-eyebrow">Comfundy</p>
          <h1>Спільні справи класу — в одному місці</h1>
          <p class="landing-lead">Comfundy допомагає батьківським і шкільним спільнотам організовувати збори, внески та оголошення без таблиць і нескінченних повідомлень у чатах.</p>
          <div class="landing-actions">
            <a class="button landing-primary" href="#/communities/new">Створити спільноту</a>
            <a class="landing-secondary" href="#/login">Увійти</a>
          </div>
        </div>
        <div class="landing-hero-visual">
          <img src="assets/landing/community_planning_at_school.png" alt="Батьківська спільнота планує спільні справи">
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
        <a class="button landing-primary" href="#/communities/new">Створити спільноту</a>
      </section>
    </div>`;
}

export async function newInitiative(communityId = null) {
  const { data } = await db.auth.getSession();
  const session = data?.session || null;
  if (session) await syncManagerNavigation('initiatives');
  else hideManagerNavigation();

  let community = null;
  if (session) {
    community = await getActiveManagerCommunity();
  } else if (communityId) {
    return route('/login');
  }

  const managerEmailBlock = session
    ? `<div class="email-delivery-block"><div class="privacy">Ви увійшли як <strong>${esc(session.user.email || '')}</strong>. Ініціатива автоматично зʼявиться в «Мої ініціативи».</div></div>`
    : `<div class="email-delivery-block">
        <label>Відправити посилання на email <span class="muted">необовʼязково</span></label>
        <input id="managerEmail" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com">
      </div>`;

  const communityContext = session
    ? community
      ? `<div class="privacy community-context">Спільнота: <strong>${esc(community.name)}</strong></div><input id="communityId" type="hidden" value="${esc(community.id)}">`
      : '<div class="privacy community-context">Буде автоматично створена спільнота <strong>«Моя спільнота»</strong>.</div>'
    : '';

  app.innerHTML = `<section class="card"><h2>Створити ініціативу</h2><p class="lead form-intro">Опишіть ініціативу та надішліть учасникам посилання. Кожен приватно зазначить максимальну суму внеску.</p>
      ${communityContext}
      <label>Назва ініціативи</label><input id="title" placeholder="Наприклад: новий принтер для класу">
      <label>Опис</label>${richEditor('description', '', 'Опишіть, що саме планується зробити')}
      <label>Бюджет, грн <span class="muted">необовʼязково</span></label><input id="target" type="number" min="1" placeholder="Наприклад: 12000">
      <label>Платіжні реквізити <span class="muted">необовʼязково</span></label><input id="paymentDetails" type="text" inputmode="text" placeholder="Посилання або номер картки">
      <label>Дедлайн <span class="muted">необʼязково</span></label><input id="deadline" type="datetime-local">
      <label>Кількість учасників <span class="muted">необовʼязково</span></label><input id="expected" type="number" min="1" placeholder="Напр. 24">
      <label class="check-row"><input id="commentsEnabled" type="checkbox" checked><span>Дозволити коментарі учасникам</span></label>
      ${managerEmailBlock}
      <div class="buttons"><button id="createBtn" onclick="createRound()">Створити ініціативу</button></div><div id="createError" class="error hidden"></div></section>`;
}

export async function createRound() {
  const b = document.getElementById('createBtn'), e = document.getElementById('createError'), title = document.getElementById('title').value.trim(),
    description = getRichText('description'), targetRaw = document.getElementById('target').value.trim(),
    target = targetRaw === '' ? null : Number(targetRaw), paymentDetails = document.getElementById('paymentDetails').value.trim(),
    d = document.getElementById('deadline').value, n = document.getElementById('expected').value,
    commentsEnabled = document.getElementById('commentsEnabled').checked,
    managerEmailInput = document.getElementById('managerEmail'),
    communityId = document.getElementById('communityId')?.value || null;

  const { data: sessionData } = await db.auth.getSession();
  const session = sessionData?.session || null;
  const managerEmail = session?.user?.email || managerEmailInput?.value.trim() || '';
  const shouldSendManagerLink = !session && Boolean(managerEmail);

  e.classList.add('hidden');
  if (!title) return ferr(e, 'Вкажіть назву ініціативи.');
  if (target !== null && (!Number.isFinite(target) || target <= 0)) return ferr(e, 'Бюджет має бути більшим за 0.');
  if (managerEmailInput && managerEmail && !managerEmailInput.checkValidity()) return ferr(e, 'Перевірте правильність email.');
  if (communityId && !session) return ferr(e, 'Потрібно увійти в акаунт.');

  b.disabled = true; b.textContent = 'Створюємо...';

  const rpc = session ? 'create_manager_initiative_v12_rpc' : 'create_initiative_v04_rpc';
  const payload = session ? {
    p_community_id: communityId,
    p_title: title,
    p_description: description || null,
    p_target_amount: target,
    p_deadline: d ? new Date(d).toISOString() : null,
    p_expected_participants: n ? Number(n) : null,
    p_payment_details: paymentDetails || null,
    p_comments_enabled: commentsEnabled,
  } : {
    p_title: title,
    p_description: description || null,
    p_target_amount: target,
    p_deadline: d ? new Date(d).toISOString() : null,
    p_expected_participants: n ? Number(n) : null,
    p_payment_details: paymentDetails || null,
    p_comments_enabled: commentsEnabled,
    p_manager_email: managerEmail || null,
  };

  const { data, error } = await db.rpc(rpc, payload);
  if (error) {
    b.disabled = false; b.textContent = 'Створити ініціативу';
    return ferr(e, error.message);
  }

  const r = data && data[0];
  if (!r) {
    b.disabled = false; b.textContent = 'Створити ініціативу';
    return ferr(e, 'Ініціативу не створено.');
  }

  if (session && r.community_id) localStorage.setItem('comfundy:managerCommunityId', r.community_id);

  let emailError = null;
  if (shouldSendManagerLink) {
    const result = await db.functions.invoke('send-manager-link', {
      body: { managerToken: r.manager_token },
    });
    emailError = result.error;
  }

  b.disabled = false; b.textContent = 'Створити ініціативу';
  if (shouldSendManagerLink) {
    toast(emailError ? 'Ініціативу створено, але лист не відправлено' : 'Посилання відправлено на email');
  }
  route(`/manage/${r.manager_token}`);
}
