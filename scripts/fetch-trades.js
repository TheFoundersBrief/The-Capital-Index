/**
 * fetch-trades.js
 * Fetches recent STOCK Act disclosures from:
 *   - HouseStockWatcher (housestockwatcher.com/api)
 *   - SenateStockWatcher (senatestockwatcher.com/api)
 * No API key required — both are free community-maintained services.
 * Writes: ../data/trades.json
 */

import fetch from 'node-fetch';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const SOURCES = {
  house:  'https://housestockwatcher.com/api',
  senate: 'https://senatestockwatcher.com/api',
};

function normalizeTrade(raw, chamber) {
  if (chamber === 'house') {
    return {
      memberName: raw.representative || raw.name || '—',
      chamber:    'House',
      ticker:     raw.ticker || extractTicker(raw.asset_description) || '—',
      asset:      raw.asset_description || raw.asset || '—',
      type:       normalizeType(raw.type || ''),
      amount:     raw.amount || '—',
      date:       raw.transaction_date || raw.disclosure_date || '—',
      disclosedAt: raw.disclosure_date || '—',
      isConflict: false,
    };
  } else {
    return {
      memberName: raw.senator || raw.first_name
                  ? `${raw.first_name || ''} ${raw.last_name || ''}`.trim()
                  : raw.name || '—',
      chamber:    'Senate',
      ticker:     raw.ticker || extractTicker(raw.asset_description) || '—',
      asset:      raw.asset_description || raw.comment || '—',
      type:       normalizeType(raw.type || raw.transaction_type || ''),
      amount:     raw.amount || '—',
      date:       raw.transaction_date || raw.date || '—',
      disclosedAt: raw.disclosure_date || raw.date_received || '—',
      isConflict: false,
    };
  }
}

function normalizeType(raw) {
  const lower = raw.toLowerCase();
  if (lower.includes('purchase') || lower.includes('buy')) return 'Purchase';
  if (lower.includes('sale') || lower.includes('sell'))    return 'Sale';
  if (lower.includes('exchange'))                          return 'Exchange';
  return raw || 'Unknown';
}

function extractTicker(description) {
  if (!description) return null;
  const match = description.match(/\b([A-Z]{1,5})\b/);
  return match ? match[1] : null;
}

async function fetchSource(name, url) {
  try {
    console.log(`  Fetching ${name}...`);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'capitol-index-bot/1.0 (civic transparency tool)' },
      timeout: 15000,
    });

    if (!res.ok) {
      console.warn(`  ⚠ ${name} returned ${res.status} — skipping`);
      return [];
    }

    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data.data || data.trades || []);
    const trades = raw.map(t => normalizeTrade(t, name));
    console.log(`  ✓ ${name}: ${trades.length} trades fetched`);
    return trades;
  } catch (err) {
    console.warn(`  ⚠ ${name} failed: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log('📈 Fetching STOCK Act disclosures...');

  const [houseTrades, senateTrades] = await Promise.all([
    fetchSource('house',  SOURCES.house),
    fetchSource('senate', SOURCES.senate),
  ]);

  const allTrades = [...houseTrades, ...senateTrades]
    .filter(t => t.ticker && t.ticker !== '—')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Basic conflict detection:
  // Flag any trade made within 60 days of a related vote
  // (The full cross-reference happens in the browser with voting data,
  //  but we can pre-flag obvious industry matches here)
  const INDUSTRY_MAP = {
    NVDA: 'Technology', AAPL: 'Technology', MSFT: 'Technology', AMZN: 'Technology', GOOG: 'Technology',
    JPM: 'Finance', GS: 'Finance', BAC: 'Finance', WFC: 'Finance', C: 'Finance',
    XOM: 'Energy', CVX: 'Energy', COP: 'Energy', BP: 'Energy',
    PFE: 'Healthcare', JNJ: 'Healthcare', UNH: 'Healthcare', MRK: 'Healthcare', ABBV: 'Healthcare',
    LMT: 'Defense', RTX: 'Defense', BA: 'Defense', NOC: 'Defense', GD: 'Defense',
    VZ: 'Telecom', T: 'Telecom', CMCSA: 'Telecom',
  };

  allTrades.forEach(t => {
    t.industry = INDUSTRY_MAP[t.ticker] || 'Other';
  });

  const output = {
    fetchedAt:   new Date().toISOString(),
    sources:     ['housestockwatcher.com', 'senatestockwatcher.com'],
    totalTrades: allTrades.length,
    houseTrades: houseTrades.length,
    senateTrades: senateTrades.length,
    trades: allTrades,
  };

  const outPath = join(DATA_DIR, 'trades.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved ${allTrades.length} trades to data/trades.json`);

  // Summary stats
  const byMember = {};
  allTrades.forEach(t => {
    byMember[t.memberName] = (byMember[t.memberName] || 0) + 1;
  });
  const topTraders = Object.entries(byMember)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  console.log('\nTop traders this period:');
  topTraders.forEach(([name, count]) => console.log(`  ${name}: ${count} trades`));
}

main().catch(err => {
  console.error('Fatal error in fetch-trades.js:', err);
  process.exit(1);
});
