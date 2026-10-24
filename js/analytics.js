// Анонімна статистика відвідувань (GoatCounter): без cookie і без збору персональних даних.
// Рахуємо лише шлях сторінки: без ?query (у ньому може бути код входу з листа)
// і без #/… кабінету. Події кабінету надсилаються через comfundyTrack().
window.goatcounter = {
  path: function () { return location.pathname; },
};

window.comfundyTrack = function (name) {
  try {
    if (window.goatcounter && typeof window.goatcounter.count === 'function') {
      window.goatcounter.count({ path: name, event: true });
    }
  } catch (e) { /* статистика не повинна ламати сайт */ }
};
