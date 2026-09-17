import { state } from './state.js?v=0.4.2-r7';
import { createRound } from './home.js?v=0.4.2-r7';
import { copyPaymentValue, refreshParticipant, submitProposal } from './participant.js?v=0.4.2-r7';
import { closeProposalComment, closeRound, copyInput, downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, showProposalComment, startNextRound } from './manager.js?v=0.4.2-r7';
import { sendManagerMagicLink, signOutManager } from './auth.js?v=0.4.2-r7';
import { route, router } from './router.js?v=0.4.2-r7';

Object.assign(window, {
  state, createRound, submitProposal, refreshParticipant, copyPaymentValue, closeRound, copyInput,
  downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound, showProposalComment,
  closeProposalComment, sendManagerMagicLink, signOutManager, route,
});
window.addEventListener('hashchange', router);
router();
