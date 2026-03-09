# 🏛 The Capitol Index

**A non-partisan U.S. Congressional accountability and transparency directory.**

Live member profiles, legislation tracking, STOCK Act disclosures, campaign finance, voting records, and revolving door tracking — all sourced from free public government APIs, rebuilt daily via GitHub Actions, and deployed to GitHub Pages.

---

## 🚀 Live Site

**`https://TheFoundersBrief.github.io/capitol-index`**


---

## 📊 Data Sources

| Source | What it powers | Key required? |
|--------|---------------|---------------|
| [Congress.gov API](https://api.congress.gov) | Member roster, legislation, committees | ✅ Free key |
| [FEC Open API](https://api.open.fec.gov) | Campaign finance, PACs, donors | ⚡ Optional (higher rate limits) |
| [HouseStockWatcher](https://housestockwatcher.com) | House STOCK Act disclosures | ❌ None |
| [SenateStockWatcher](https://senatestockwatcher.com) | Senate STOCK Act disclosures | ❌ None |
| [Senate LDA API](https://lda.senate.gov/api) | Lobbying registrations, revolving door | ❌ None |

---

## ⚙️ Setup Instructions

### Step 1 — Fork or clone this repository

```bash
git clone https://github.com/YOUR-USERNAME/capitol-index.git
cd capitol-index
```

Or click **Fork** in the top right on GitHub.

---

### Step 2 — Get a free Congress.gov API key

1. Go to **[api.congress.gov/sign-up](https://api.congress.gov/sign-up/)**
2. Fill out the form (name + email)
3. You'll receive a key by email within a few minutes

---

### Step 3 — Add your API key as a GitHub Secret

1. In your repository, go to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `CONGRESS_API_KEY`
4. Value: *(paste your key)*
5. Click **Add secret**

Optional — for higher FEC rate limits:
- Register at [api.data.gov/signup](https://api.data.gov/signup/)
- Add as secret: `FEC_API_KEY`

---

### Step 4 — Enable GitHub Pages

1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **`gh-pages`** / folder: `/ (root)`
4. Click **Save**

---

### Step 5 — Trigger the first build

1. Go to **Actions** tab in your repository
2. Click **"Fetch Data & Deploy to GitHub Pages"**
3. Click **"Run workflow"** → **"Run workflow"**
4. Watch it run — takes 5–15 minutes on first run

After it completes, your site will be live at:
**`https://YOUR-USERNAME.github.io/capitol-index`**

---

### Step 6 — Automatic daily updates

The workflow runs automatically every day at **6:00 AM UTC** (2 AM ET).
No action required — member data, stock trades, and finance data stay current.

---

## 🗂 Repository Structure

```
capitol-index/
├── index.html                    # The main site (single HTML file)
├── robots.txt                    # SEO
├── .gitignore
│
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions workflow
│
├── scripts/                      # Build-time data fetching
│   ├── package.json
│   ├── fetch-members.js          # Congress.gov → data/members.json
│   ├── fetch-trades.js           # StockWatcher → data/trades.json
│   ├── fetch-finance.js          # FEC → data/finance.json
│   ├── fetch-lobbying.js         # Senate LDA → data/lobbying.json
│   └── build.js                  # Injects data into HTML → dist/
│
└── data/                         # Auto-generated (committed for transparency)
    ├── members.json
    ├── trades.json
    ├── finance.json
    └── lobbying.json
```

---

## 🔧 Local Development

```bash
# Install script dependencies
cd scripts
npm install

# Set your Congress.gov key
export CONGRESS_API_KEY=your_key_here

# Fetch all data and build
npm run dev

# Open the built site
open ../dist/index.html
```

To skip the slow member detail fetch during development:
```bash
FETCH_DETAILS=false node fetch-members.js
```

---

## 🔒 Security Notes

- **API keys are never stored in the HTML or committed to the repo.**
  They are only used server-side during the GitHub Actions build.
- Visitors load pre-baked data — no key exposure to the public.
- The `data/` directory is committed so you can track changes over time
  and see a historical record of member data (useful for accountability).
- The `dist/` directory is excluded from the main branch — it's only
  on the `gh-pages` branch managed by the deploy action.

---

## 🤝 Contributing

Pull requests welcome. This is a civic transparency project — contributions
that improve data accuracy, add new sources, or improve accessibility are
especially appreciated.

Please keep the project non-partisan. The goal is factual transparency,
not advocacy.

---

## 📜 License

MIT — free to use, fork, and deploy. Attribution appreciated but not required.

---

## 🙏 Data Credits

- U.S. Congress / Congress.gov
- Federal Election Commission (FEC)
- HouseStockWatcher.com (community maintained)
- SenateStockWatcher.com (community maintained)
- U.S. Senate — Lobbying Disclosure Act database
- Center for Effective Lawmaking (effectiveness scores methodology)
