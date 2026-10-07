import { state } from './state.js?v=0.4.2-r13';
import { createRound } from './home.js?v=0.4.2-r13';
import { copyPaymentValue, refreshParticipant, submitProposal } from './participant.js?v=0.4.2-r13';
import { closeProposalComment, closeRound, copyInput, downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, showProposalComment, startNextRound } from './manager.js?v=0.4.2-r13';
import { sendManagerMagicLink, signOutManager, updateAccountNav } from './auth.js?v=0.4.2-r13';
import { addCommunityMember, createCommunity, filterMembers } from './communities.js?v=0.4.2-r13';
import { closeManagerMenu, openManagerMenu } from './navigation.js?v=0.4.2-r13';
import { route, router } from './router.js?v=0.4.2-r13';

Object.assign(window, {
  state, createRound, submitProposal, refreshParticipant, copyPaymentValue, closeRound, copyInput,
  downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound, showProposalComment,
  closeProposalComment, sendManagerMagicLink, signOutManager, addCommunityMember, createCommunity,
  filterMembers, openManagerMenu, closeManagerMenu, route,
});
window.addEventListener('hashchange', router);
updateAccountNav();
router();
