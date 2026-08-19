import { state } from './state.js?v=0.4.2';
import { createRound } from './home.js?v=0.4.2';
import { copyPaymentValue, refreshParticipant, submitProposal } from './participant.js?v=0.4.2';
import { closeRound, copyInput, downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound } from './manager.js?v=0.4.2';
import { route, router } from './router.js?v=0.4.2';
import { formatRichText } from './utils.js?v=0.4.2';

Object.assign(window, {
  state, createRound, submitProposal, refreshParticipant, copyPaymentValue, closeRound, copyInput,
  downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound, route, formatRichText,
});
window.addEventListener('hashchange', router);
router();
