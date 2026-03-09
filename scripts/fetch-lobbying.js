/**
 * fetch-lobbying.js
 * Fetches lobbying registrations from the Senate LDA (Lobbying Disclosure Act) API.
 * No API key required — official government open data API.
 * Docs: https://lda.senate.gov/api/
 * Writes: ../data/lobbying.json
 */

import fetch from 'node-fetch';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const LDA_BASE = 'https://lda.senate.gov/api/v1';
const HEADERS = {
  'Accept':     'application/json',
  'User-Agent': 'capitol-index-bot/1.0 (civic transparency project)',
};

function loadMembers() {
  const path = join(DATA_DIR, 'members.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path)).members;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchLDAByName(firstName, lastName) {
  try {
    // Search for this person as a covered official or lobbyist contact
    const params = new URLSearchParams({
      lobbyist_name: `${lastName}`,
      format: 'json',
      limit: 5,
    });
    const res = await fetch(`${LDA_BASE}/registrations/?${params}`, { headers: HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function fetchRecentLDAFilings(page = 1) {
  try {
    const params = new URLSearchParams({
      format:   'json',
      ordering: '-dt_posted',
      limit:    100,
      offset:   (page - 1) * 100,
    });
    const res = await fetch(`${LDA_BASE}/filings/?${params}`, { headers: HEADERS });
    if (!res.ok) return { results: [], next: null };
    return await res.json();
  } catch {
    return { results: [], next: null };
  }
}

async function fetchRevolvingDoorContacts() {
  // The LDA "covered officials" endpoint lists former government officials
  // who registered as lobbyists — the core revolving door data
  try {
    const params = new URLSearchParams({ format: 'json', limit: 250 });
    const res = await fetch(`${LDA_BASE}/contributions/?${params}`, { headers: HEADERS });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function main() {
  const members = loadMembers();
  console.log('🔄 Fetching Senate LDA lobbying data...');

  // Fetch recent LDA filings (last 2 pages = ~200 most recent)
  console.log('  Fetching recent lobbying filings...');
  const [page1, page2] = await Promise.all([
    fetchRecentLDAFilings(1),
    fetchRecentLDAFilings(2),
  ]);
  const recentFilings = [...(page1.results || []), ...(page2.results || [])];
  console.log(`  ✓ ${recentFilings.length} recent filings fetched`);

  await sleep(500);

  // Fetch revolving door contacts
  console.log('  Fetching revolving door covered officials...');
  const revolvingContacts = await fetchRevolvingDoorContacts();
  console.log(`  ✓ ${revolvingContacts.length} revolving door contacts fetched`);

  const memberLobbyingMap = {};
  const membersWithConnections = 0;
  console.log('  Per-member LDA lookup deferred to client-side.');

  const output = {
    fetchedAt:         new Date().toISOString(),
    source:            'Senate LDA API v1 (lda.senate.gov)',
    totalFilings:      recentFilings.length,
    revolvingContacts: revolvingContacts.length,
    membersWithLobbyingHistory: membersWithConnections,

    // Recent filings — normalized
    recentFilings: recentFilings.slice(0, 100).map(f => ({
      id:             f.filing_uuid || f.id,
      registrantName: f.registrant?.name || '—',
      clientName:     f.client?.name || '—',
      type:           f.filing_type_display || '—',
      year:           f.filing_year || '—',
      period:         f.period_display || '—',
      postedAt:       f.dt_posted || '—',
    })),

    // Per-member lobbying connections
    memberLobbyingMap,
  };

  const outPath = join(DATA_DIR, 'lobbying.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved lobbying data to data/lobbying.json`);
}

main().catch(err => {
  console.error('Fatal error in fetch-lobbying.js:', err);
  // Non-fatal — continue deploy without lobbying data
  console.error('Continuing without lobbying data...');
  process.exit(0);
});
