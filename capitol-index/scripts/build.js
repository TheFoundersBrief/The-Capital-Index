/**
 * build.js
 * Reads all fetched JSON data files and injects them into the HTML template.
 * The resulting dist/index.html is a fully self-contained site with all
 * member and trade data pre-baked — no API key needed by visitors.
 * Live tabs (FEC per-member, LDA per-member, Stock Watcher) still run
 * client-side for real-time data on demand.
 * Writes: ../dist/index.html
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT     = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const DIST_DIR = join(ROOT, 'dist');

mkdirSync(DIST_DIR, { recursive: true });

// ── Load data files ───────────────────────────────────────────────
function loadJSON(filename, fallback = null) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`  ⚠ ${filename} not found — using fallback`);
    return fallback;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch(e) {
    console.warn(`  ⚠ Failed to parse ${filename}: ${e.message}`);
    return fallback;
  }
}

function main() {
  console.log('🔨 Building dist/index.html...');

  // Load all data
  const membersData  = loadJSON('members.json',  { members: [] });
  const tradesData   = loadJSON('trades.json',   { trades: [] });
  const financeData  = loadJSON('finance.json',  { financeByBioguideId: {} });
  const lobbyingData = loadJSON('lobbying.json', { memberLobbyingMap: {} });

  const members  = membersData.members  || [];
  const trades   = tradesData.trades    || [];
  const finance  = financeData.financeByBioguideId || {};
  const lobbying = lobbyingData.memberLobbyingMap  || {};

  console.log(`  Members:  ${members.length}`);
  console.log(`  Trades:   ${trades.length}`);
  console.log(`  Finance:  ${Object.keys(finance).length} members with FEC data`);
  console.log(`  Lobbying: ${Object.keys(lobbying).length} members with LDA records`);

  // Read the HTML template
  const htmlPath = join(ROOT, 'index.html');
  if (!existsSync(htmlPath)) {
    console.error('❌ index.html not found in repo root. Make sure index.html is committed.');
    process.exit(1);
  }
  let html = readFileSync(htmlPath, 'utf8');

  // Build the injection payload
  const buildMeta = {
    builtAt:      new Date().toISOString(),
    memberCount:  members.length,
    tradeCount:   trades.length,
    financeCount: Object.keys(finance).length,
  };

  const injectionScript = `
<script id="baked-data">
// ── PRE-BAKED DATA (injected at build time by GitHub Actions) ──────
// Built: ${buildMeta.builtAt}
// Members: ${buildMeta.memberCount} | Trades: ${buildMeta.tradeCount}
window.BAKED = {
  meta: ${JSON.stringify(buildMeta)},
  members: ${JSON.stringify(members)},
  trades: ${JSON.stringify(trades)},
  finance: ${JSON.stringify(finance)},
  lobbying: ${JSON.stringify(lobbying)},
};
</script>`;

  // Inject before closing </head> tag
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${injectionScript}\n</head>`);
  } else {
    // Fallback — inject at top of <body>
    html = html.replace('<body>', `<body>\n${injectionScript}`);
  }

  // Patch the JS to prefer baked data over API calls
  const bakedDataPatch = `
<script>
// ── BAKED DATA INTEGRATION PATCH ─────────────────────────────────
// This replaces the loadMembers() function to prefer pre-baked data,
// while still allowing the Congress.gov API key to override with fresher data.

(function patchLoadMembers() {
  // Store original for potential override
  const _originalLoad = window.loadMembers;

  window.loadMembers = async function() {
    // If user has a Congress.gov API key, use live data (most current)
    if (window.apiKeys && window.apiKeys.congress) {
      return _originalLoad ? _originalLoad() : undefined;
    }

    // Use baked data — instant load, no API call needed
    if (window.BAKED && window.BAKED.members && window.BAKED.members.length > 0) {
      console.log('[Capitol Index] Using pre-baked member data:', window.BAKED.meta);
      showGridLoading();

      // Merge finance and lobbying data into members
      window.BAKED.members.forEach(m => {
        if (window.BAKED.finance && window.BAKED.finance[m.bioguideId]) {
          m._fecData = window.BAKED.finance[m.bioguideId];
        }
        if (window.BAKED.lobbying && window.BAKED.lobbying[m.bioguideId]) {
          m._ldaData = window.BAKED.lobbying[m.bioguideId];
        }
      });

      window.allMembers = window.BAKED.members.map(window.enrichMember);
      filterMembers();
      populateStateFilter();

      // Baked trades replace live fetch
      if (window.BAKED.trades && window.BAKED.trades.length > 0) {
        window.liveTrades = window.BAKED.trades;
        window.liveTradesLoaded = true;
        mergeTradesIntoMembers(window.BAKED.trades);
        renderGlobalTrades();
        renderGlobalConflicts();
      }

      // Still try live sources for freshest possible data
      loadLiveStockTrades();
      loadLiveFECData();
      loadLiveLobbyingData();

      // Hide the API key notice since we have real data
      const notice = document.getElementById('apiNotice');
      if (notice) {
        notice.innerHTML = '✅ <strong>Live data:</strong> Pre-fetched daily via GitHub Actions from Congress.gov, FEC, HouseStockWatcher, and Senate LDA. Last updated: <strong>${buildMeta.builtAt.replace('T', ' ').substring(0, 16)} UTC</strong>';
        notice.className = 'notice-box notice-success';
      }

      return;
    }

    // Absolute fallback — demo data
    if (_originalLoad) return _originalLoad();
  };
})();
</script>`;

  // Inject patch before </body>
  html = html.replace('</body>', `${bakedDataPatch}\n</body>`);

  // Write final output
  const outPath = join(DIST_DIR, 'index.html');
  writeFileSync(outPath, html, 'utf8');

  const sizeKB = Math.round(readFileSync(outPath).length / 1024);
  console.log(`\n✅ Built dist/index.html (${sizeKB} KB)`);
  console.log(`   Members baked: ${members.length}`);
  console.log(`   Trades baked:  ${trades.length}`);
  console.log(`   FEC records:   ${Object.keys(finance).length}`);
  console.log(`   LDA records:   ${Object.keys(lobbying).length}`);

  // Copy any static assets if they exist
  ['favicon.ico', 'robots.txt', 'sitemap.xml'].forEach(asset => {
    const src = join(ROOT, asset);
    if (existsSync(src)) {
      copyFileSync(src, join(DIST_DIR, asset));
      console.log(`   Copied: ${asset}`);
    }
  });

  // Write a build-info.json for debugging
  writeFileSync(
    join(DIST_DIR, 'build-info.json'),
    JSON.stringify({ ...buildMeta, tradesCount: trades.length }, null, 2)
  );

  console.log('\n🚀 Ready to deploy → dist/');
}

main();
