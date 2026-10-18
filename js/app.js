import { state } from './state.js?v=0.4.2-r30';
import { copyPaymentValue, refreshMyInitiative, submitProposal } from './participant.js?v=0.4.2-r30';
import { closeProposalComment, closeRound, createInitiative, downloadCsv, downloadCurrentCsv, downloadHistoryCsv, initiative, showNextRoundForm, showProposalComment, startNextRound } from './manager.js?v=0.4.2-r30';
import { sendManagerMagicLink, signOutManager, updateAccountNav } from './auth.js?v=0.4.2-r30';
import { activateCommunity, addCommunityManager, addCommunityMember, createCommunity, filterMembers, removeCommunityManager, saveCommunity, saveMember, sendManagerInvite, sendMemberAccess } from './communities.js?v=0.4.2-r30';
import { closeContributionDrawer, createCollection, deleteContribution, saveCollection, toggleCollectionFields, filterContributionMembers, openContributionDrawer, saveContribution, selectContributionMember, updateContributionPeriodFields } from './collections.js?v=0.4.2-r30';
import { closeManagerMenu, openManagerMenu, switchManagerCommunity, switchParticipantCommunity } from './navigation.js?v=0.4.2-r30';
import { createAnnouncement } from './announcements.js?v=0.4.2-r30';
import { route, router } from './router.js?v=0.4.2-r30';

Object.assign(window, {
  state, createInitiative, submitProposal, refreshMyInitiative, copyPaymentValue, closeRound,
  downloadCsv, downloadCurrentCsv, downloadHistoryCsv, initiative, showNextRoundForm, startNextRound, showProposalComment,
  closeProposalComment, sendManagerMagicLink, signOutManager, addCommunityMember, createCommunity, saveCommunity, saveMember, activateCommunity, sendMemberAccess,
  addCommunityManager, sendManagerInvite, removeCommunityManager,
  filterMembers, createCollection, deleteContribution, saveCollection, toggleCollectionFields, openContributionDrawer, closeContributionDrawer, filterContributionMembers,
  selectContributionMember, updateContributionPeriodFields, saveContribution, createAnnouncement, switchManagerCommunity,
  switchParticipantCommunity, openManagerMenu, closeManagerMenu, route,
});
window.addEventListener('hashchange', router);
updateAccountNav();
router();
