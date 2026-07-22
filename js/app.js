import { state } from './state.js';
import { createRound } from './home.js';
import { submitProposal } from './participant.js';
import { closeRound, copyInput, downloadCsv, manager } from './manager.js';
import { route, router } from './router.js';

Object.assign(window, { state, createRound, submitProposal, closeRound, copyInput, downloadCsv, manager, route });
window.addEventListener('hashchange', router);
router();
