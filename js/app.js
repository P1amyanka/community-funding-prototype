import { state } from './state.js?v=0.4.2-r15';
import { createRound } from './home.js?v=0.4.2-r15';
import { copyPaymentValue, refreshParticipant, submitProposal } from './participant.js?v=0.4.2-r15';
import { closeProposalComment, closeRound, copyInput, downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, showProposalComment, startNextRound } from './manager.js?v=0.4.2-r15';
import { sendManagerMagicLink, signOutManager, updateAccountNav } from './auth.js?v=0.4.2-r15';
import { addCommunityMember, createCommunity, filterMembers, sendMemberAccess } from './communities.js?v=0.4.2-r15';
import { closeContributionDrawer, createCollection, filterContributionMembers, openContributionDrawer, saveContribution, selectContributionMember, updateContributionPeriodFields } from './collections.js?v=0.4.2-r15';
import { closeManagerMenu, openManagerMenu } from './navigation.js?v=0.4.2-r15';
import { route, router } from './router.js?v=0.4.2-r15';

Object.assign(window, {
  state, createRound, submitProposal, refreshParticipant, copyPaymentValue, closeRound, copyInput,
  downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound, showProposalComment,
  closeProposalComment, sendManagerMagicLink, signOutManager, addCommunityMember, createCommunity, sendMemberAccess,
  filterMembers, createCollection, openContributionDrawer, closeContributionDrawer, filterContributionMembers,
  selectContributionMember, updateContributionPeriodFields, saveContribution, openManagerMenu, closeManagerMenu, route,
});
window.addEventListener('hashchange', router);
updateAccountNav();
router();
