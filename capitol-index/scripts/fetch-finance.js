/**
 * fetch-finance.js
 * Fetches campaign finance summary data from the FEC Open API.
 * No API key required (uses DEMO_KEY, rate limited to ~1000 req/day).
 * For production volume, set FEC_API_KEY as a GitHub Secret for higher limits.
 * Free key registration: https://api.data.gov/signup/
 * Writes: ../data/finance.json
 */

import fetch from 'node-fetch';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

// Use provided key if available, fall back to DEMO_KEY
const FEC_KEY = process.env.FEC_API_KEY || 'DEMO_KEY';
const FEC_BASE = 'https://api.open.fec.gov/v1';

// Load members fetched in previous step
function loadMembers() {
  const path = join(DATA_DIR, 'members.json');
  if (!existsSync(path)) {
    console.warn('⚠ data/members.json not found — run fetch-members.js first');
    return [];
  }
  return JSON.parse(readFileSync(path)).members;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchFECCandidate(member) {
  try {
    const params = new URLSearchParams({
      name:    member.lastName.toUpperCase(),
      state:   member.state,
      office:  member.chamber === 'Senate' ? 'S' : 'H',
      api_key: FEC_KEY,
      per_page: 3,
      sort:    '-receipts',
    });
    const res = await fetch(`${FEC_BASE}/candidates/?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0] || null;
  } catch {
    return null;
  }
}

async function fetchFECTotals(candidateId) {
  try {
    const params = new URLSearchParams({
      api_key:  FEC_KEY,
      per_page: 1,
      sort:     '-cycle',
    });
    const res = await fetch(`${FEC_BASE}/candidate/${candidateId}/totals/?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0] || null;
  } catch {
    return null;
  }
}

async function main() {
  const members = loadMembers();
  if (!members.length) {
    console.log('No members loaded — skipping finance fetch');
    return;
  }

  console.log(`💰 Fetching FEC finance data for ${members.length} members...`);
  console.log(`   Using API key: ${FEC_KEY === 'DEMO_KEY' ? 'DEMO_KEY (limited rate)' : 'Custom key ✓'}`);

  const financeMap = {};
  let found = 0, missing = 0;

  for (let i = 0; i < members.length; i++) {
    const m = members[i];

    // DEMO_KEY rate limit: ~1000 req/day. With 2 calls per member
    // we can cover ~500 members. Full 535 requires a free registered key.
    const candidate = await fetchFECCandidate(m);
    await sleep(300);

    if (!candidate) {
      missing++;
      continue;
    }

    const totals = await fetchFECTotals(candidate.candidate_id);
    await sleep(300);

    financeMap[m.bioguideId] = {
      candidateId:  candidate.candidate_id,
      fecName:      candidate.name,
      party:        candidate.party,
      cycle:        totals?.cycle || candidate.election_years?.slice(-1)[0] || '2024',
      receipts:     totals?.receipts || 0,
      disbursements: totals?.disbursements || 0,
      cashOnHand:   totals?.cash_on_hand_end_period || 0,
      debts:        totals?.debts_owed_by_committee || 0,
      indivContribs: totals?.individual_contributions || 0,
      pacContribs:  totals?.other_political_committee_contributions || 0,
      fecUrl:       `https://www.fec.gov/data/candidate/${candidate.candidate_id}/`,
    };
    found++;

    if (i % 20 === 0) {
      console.log(`  ${i + 1}/${members.length} processed (${found} matched, ${missing} not found)...`);
    }
  }

  const output = {
    fetchedAt:  new Date().toISOString(),
    source:     'FEC Open API v1',
    apiKeyType: FEC_KEY === 'DEMO_KEY' ? 'demo' : 'registered',
    matched:    found,
    notFound:   missing,
    financeByBioguideId: financeMap,
  };

  const outPath = join(DATA_DIR, 'finance.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved finance data for ${found}/${members.length} members to data/finance.json`);

  if (FEC_KEY === 'DEMO_KEY') {
    console.log('\n💡 Tip: Register a free FEC API key at https://api.data.gov/signup/');
    console.log('   Add it as GitHub Secret FEC_API_KEY for full coverage and higher rate limits.');
  }
}

main().catch(err => {
  console.error('Fatal error in fetch-finance.js:', err);
  // Non-fatal for CI — finance data missing just means demo mode for that tab
  console.error('Continuing without finance data...');
  process.exit(0);
});
