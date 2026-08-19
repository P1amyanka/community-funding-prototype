import { state } from './state.js?v=0.4.2-r4';
import { createRound } from './home.js?v=0.4.2-r4';
import { copyPaymentValue, refreshParticipant, submitProposal } from './participant.js?v=0.4.2-r4';
import { closeRound, copyInput, downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound } from './manager.js?v=0.4.2-r4';
import { route, router } from './router.js?v=0.4.2-r4';

Object.assign(window, {
  state, createRound, submitProposal, refreshParticipant, copyPaymentValue, closeRound, copyInput,
  downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound, route,
});
window.addEventListener('hashchange', router);
router();
