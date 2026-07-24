import { db } from './supabase.js';
import { state } from './state.js';
import { allocationV02, downloadCsv, proposalsWithoutTarget } from './equilibrium.js';
import { app, copyInput, date, esc, fail, ferr, loading, money, purl, toast } from './utils.js';

const historyCsv = item => {
  const rows = Array.isArray(item.proposals) ? item.proposals : [];
  const lines