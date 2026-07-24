import { state } from './state.js';
import { createRound } from './home.js';
import { copyPaymentValue, submitProposal } from './participant.js';
import { closeRound, copyInput, downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound } from './manager.js';
import { route, router } from './router.js';

Object.assign(window, {
  state, createRound, submitProposal, copyPaymentValue, closeRound, copyInput,
  downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound, route,
});
window.addEventListener('hashchange', router);
router();