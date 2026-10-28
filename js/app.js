import { state } from './state.js?v=0.4.2-r48';
import { copyPaymentValue, refreshMyInitiative, submitProposal } from './participant.js?v=0.4.2-r48';
import { closeProposalComment, closeRound, createInitiative, setPollType, downloadCsv, downloadCurrentCsv, downloadHistoryCsv, initiative, showNextRoundForm, showProposalComment, startNextRound } from './manager.js?v=0.4.2-r48';
import { sendManagerMagicLink, signOutManager, updateAccountNav } from './auth.js?v=0.4.2-r48';
import { activateCommunity, addCommunityManager, addCommunityMember, createCommunity, filterMembers, removeCommunityManager, saveCommunity, saveMember, sendManagerInvite, sendMemberAccess } from './communities.js?v=0.4.2-r48';
import { closeContributionDrawer, createCollection, deleteCollection, deleteContribution, saveCollection, setCollectionStatus, toggleCollectionFields, filterContributionMembers, openContributionDrawer, saveContribution, selectContributionMember, updateContributionPeriodFields } from './collections.js?v=0.4.2-r48';
import { closeManagerMenu, openManagerMenu, switchManagerCommunity, switchParticipantCommunity } from './navigation.js?v=0.4.2-r48';
import { createAnnouncement, deleteAnnouncement, saveAnnouncement } from './announcements.js?v=0.4.2-r48';
import { closeCreateSheet, openCreateSheet } from './create-sheet.js?v=0.4.2-r48';
import { route, router } from './router.js?v=0.4.2-r48';
import { addPollOption, createChoicePoll, removePollOption, setChoicePollStatus, submitChoiceVote } from './polls.js?v=0.4.2-r48';

Object.assign(window, {
  setPollType, addPollOption, removePollOption, createChoicePoll, setChoicePollStatus, submitChoiceVote,
  state, createInitiative, submitProposal, refreshMyInitiative, copyPaymentValue, closeRound,
  downloadCsv, downloadCurrentCsv, downloadHistoryCsv, initiative, showNextRoundForm, startNextRound, showProposalComment,
  closeProposalComment, sendManagerMagicLink, signOutManager, addCommunityMember, createCommunity, saveCommunity, saveMember, activateCommunity, sendMemberAccess,
  addCommunityManager, sendManagerInvite, removeCommunityManager,
  filterMembers, createCollection, deleteContribution, saveCollection, toggleCollectionFields, openContributionDrawer, closeContributionDrawer, filterContributionMembers,
  selectContributionMember, updateContributionPeriodFields, saveContribution, createAnnouncement, saveAnnouncement, deleteAnnouncement,
  deleteCollection, setCollectionStatus, switchManagerCommunity,
  switchParticipantCommunity, openManagerMenu, closeManagerMenu, route, openCreateSheet, closeCreateSheet,
});
window.addEventListener('hashchange', router);
updateAccountNav();
router();
