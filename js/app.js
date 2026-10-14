import { state } from './state.js?v=0.4.2-r26';
import { copyPaymentValue, refreshMyInitiative, submitProposal } from './participant.js?v=0.4.2-r26';
import { closeProposalComment, closeRound, createInitiative, downloadCsv, downloadHistoryCsv, initiative, showNextRoundForm, showProposalComment, startNextRound } from './manager.js?v=0.4.2-r26';
import { sendManagerMagicLink, signOutManager, updateAccountNav } from './auth.js?v=0.4.2-r26';
import { activateCommunity, addCommunityManager, addCommunityMember, createCommunity, filterMembers, removeCommunityManager, saveCommunity, saveMember, sendManagerInvite, sendMemberAccess } from './communities.js?v=0.4.2-r26';
import { closeContributionDrawer, createCollection, saveCollection, toggleCollectionFields, filterContributionMembers, openContributionDrawer, saveContribution, selectContributionMember, updateContributionPeriodFields } from './collections.js?v=0.4.2-r26';
import { closeManagerMenu, openManagerMenu, switchManagerCommunity, switchParticipantCommunity } from './navigation.js?v=0.4.2-r26';
import { createAnnouncement } from './announcements.js?v=0.4.2-r26';
import { route, router } from './router.js?v=0.4.2-r26';

Object.assign(window, {
  state, createInitiative, submitProposal, refreshMyInitiative, copyPaymentValue, closeRound,
  downloadCsv, downloadHistoryCsv, initiative, showNextRoundForm, startNextRound, showProposalComment,
  closeProposalComment, sendManagerMagicLink, signOutManager, addCommunityMember, createCommunity, saveCommunity, saveMember, activateCommunity, sendMemberAccess,
  addCommunityManager, sendManagerInvite, removeCommunityManager,
  filterMembers, createCollection, saveCollection, toggleCollectionFields, openContributionDrawer, closeContributionDrawer, filterContributionMembers,
  selectContributionMember, updateContributionPeriodFields, saveContribution, createAnnouncement, switchManagerCommunity,
  switchParticipantCommunity, openManagerMenu, closeManagerMenu, route,
});
window.addEventListener('hashchange', router);
updateAccountNav();
router();
