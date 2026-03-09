/**
 * fetch-members.js
 * Fetches all current members of Congress from the Congress.gov API.
 * Requires CONGRESS_API_KEY environment variable (set as GitHub Secret).
 * Writes: ../data/members.json
 */

import fetch from 'node-fetch';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const API_KEY = process.env.CONGRESS_API_KEY;
if (!API_KEY) {
  console.error('❌ CONGRESS_API_KEY environment variable is not set.');
  console.error('   Add it as a GitHub Secret: Settings → Secrets → Actions → New repository secret');
  process.exit(1);
}

const BASE = 'https://api.congress.gov/v3';
const HEADERS = { 'X-Api-Key': API_KEY };

async function fetchPaginated(url, resultsKey, limit = 250) {
  const results = [];
  let offset = 0;

  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}limit=${limit}&offset=${offset}`, { headers: HEADERS });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Congress.gov API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const items = data[resultsKey] || [];
    results.push(...items);

    console.log(`  Fetched ${results.length} records (offset ${offset})...`);

    // Stop if we got fewer results than the limit — we're done
    if (items.length < limit) break;
    offset += limit;

    // Polite rate limiting — Congress.gov allows ~1000 req/hour
    await sleep(200);
  }

  return results;
}

async function fetchMemberDetail(bioguideId) {
  try {
    const res = await fetch(`${BASE}/member/${bioguideId}`, { headers: HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return data.member || null;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('📋 Fetching Senate members...');
  const senators = await fetchPaginated(
    `${BASE}/member?chamber=Senate&currentMember=true`,
    'members'
  );

  console.log('📋 Fetching House members...');
  const representatives = await fetchPaginated(
    `${BASE}/member?chamber=House&currentMember=true`,
    'members'
  );

  const allRaw = [...senators, ...representatives];
  console.log(`\n✓ Fetched ${senators.length} senators + ${representatives.length} representatives = ${allRaw.length} total`);

  // Normalize into our app's format
  console.log('\n🔄 Normalizing member data...');
  const members = allRaw.map(m => ({
    bioguideId:   m.bioguideId,
    name:         m.name,
    firstName:    m.firstName  || m.name.split(',')[1]?.trim() || '',
    lastName:     m.lastName   || m.name.split(',')[0]?.trim() || '',
    state:        m.state,
    party:        m.partyName === 'Democratic' ? 'D'
                : m.partyName === 'Republican' ? 'R' : 'I',
    partyFull:    m.partyName || 'Independent',
    chamber:      senators.find(s => s.bioguideId === m.bioguideId) ? 'Senate' : 'House',
    district:     m.district || null,
    depiction:    m.depiction?.imageUrl || null,
    url:          m.officialWebsiteUrl || null,
    inOfficeSince: m.terms?.item?.[0]?.startYear || null,
    termCount:    m.terms?.item?.length || 1,
    nextElection: m.nextElection || null,
    // Filled by fetch-detail pass below
    committees:   [],
    phone:        null,
    office:       null,
  }));

  // Optionally enrich a subset with detailed committee/contact info
  // We do this for all members but with rate limiting — takes ~10 min for 535 members
  const FETCH_DETAILS = process.env.FETCH_DETAILS !== 'false';
  if (FETCH_DETAILS) {
    console.log('\n🔍 Fetching member details (committees, offices)...');
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const detail = await fetchMemberDetail(m.bioguideId);
      if (detail) {
        m.committees = (detail.committees?.item || []).map(c => c.name).slice(0, 6);
        const dc = detail.addressInformation?.officeAddress || '';
        m.office = dc || null;
        m.phone  = detail.addressInformation?.phoneNumber || null;
      }
      if (i % 50 === 0) console.log(`  ${i}/${members.length} details fetched...`);
      await sleep(150); // ~6 req/sec, well under rate limit
    }
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    source: 'Congress.gov API v3',
    totalMembers: members.length,
    senators: members.filter(m => m.chamber === 'Senate').length,
    representatives: members.filter(m => m.chamber === 'House').length,
    members,
  };

  const outPath = join(DATA_DIR, 'members.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved ${members.length} members to data/members.json`);
}

main().catch(err => {
  console.error('Fatal error in fetch-members.js:', err);
  process.exit(1);
});
