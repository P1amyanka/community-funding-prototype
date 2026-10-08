import { state } from './state.js?v=0.4.2-r18';
import { createRound } from './home.js?v=0.4.2-r18';
import { copyPaymentValue, refreshParticipant, submitProposal } from './participant.js?v=0.4.2-r18';
import { closeProposalComment, closeRound, copyInput, downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, showProposalComment, startNextRound } from './manager.js?v=0.4.2-r18';
import { sendManagerMagicLink, signOutManager, updateAccountNav } from './auth.js?v=0.4.2-r18';
import { activateCommunity, addCommunityMember, createCommunity, filterMembers, saveCommunity, saveMember, sendMemberAccess } from './communities.js?v=0.4.2-r18';
import { closeContributionDrawer, createCollection, filterContributionMembers, openContributionDrawer, saveContribution, selectContributionMember, updateContributionPeriodFields } from './collections.js?v=0.4.2-r18';
import { closeManagerMenu, openManagerMenu, switchManagerCommunity, switchParticipantCommunity } from './navigation.js?v=0.4.2-r18';
import { createAnnouncement } from './announcements.js?v=0.4.2-r18';
import { route, router } from './router.js?v=0.4.2-r18';

Object.assign(window, {
  state, createRound, submitProposal, refreshParticipant, copyPaymentValue, closeRound, copyInput,
  downloadCsv, downloadHistoryCsv, manager, showNextRoundForm, startNextRound, showProposalComment,
  closeProposalComment, sendManagerMagicLink, signOutManager, addCommunityMember, createCommunity, saveCommunity, saveMember, activateCommunity, sendMemberAccess,
  filterMembers, createCollection, openContributionDrawer, closeContributionDrawer, filterContributionMembers,
  selectContributionMember, updateContributionPeriodFields, saveContribution, createAnnouncement, switchManagerCommunity,
  switchParticipantCommunity, openManagerMenu, closeManagerMenu, route,
});
window.addEventListener('hashchange', router);
updateAccountNav();
router();
