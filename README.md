<div align="center">

# C.L.U. — Live Intelligence Site

**The public, real-time mirror of the [C.L.U. autonomous trading system](https://github.com/AKSIS-1/CLU-Framework).**

![Live](https://img.shields.io/badge/status-live-00ff88?style=for-the-badge)
![Stack](https://img.shields.io/badge/stack-vanilla%20JS%20%C2%B7%20no%20build-7EC8FF?style=for-the-badge)
![Host](https://img.shields.io/badge/host-GitHub%20Pages-3399FF?style=for-the-badge)
![Updates](https://img.shields.io/badge/updates-2%C3%97%20daily-e040fb?style=for-the-badge)

### [→ View the live site](https://aksis-1.github.io/)

</div>

---

## What This Is

A static, dependency-free dashboard that renders C.L.U.'s trading intelligence directly from JSON the agent writes at the end of every 6:00 AM and 3:30 PM session. **There is no backend and no build step** — just `index.html`, `app.js`, and `style.css` reading data files. What you see here *is* what CLU sees internally.

```mermaid
flowchart LR
    subgraph fw["🤖 CLU-Framework (separate repo)"]
        clu["Claude session"] --> json[("docs/data/*.json")]
    end
    json --> app["📜 app.js<br/>fetch + render"]
    app --> ui["🌍 GitHub Pages<br/>aksis-1.github.io"]
    classDef a fill:#06121f,stroke:#3399FF,color:#cfe8ff
    classDef b fill:#0a0618,stroke:#e040fb,color:#f3d9ff
    class fw a
    class json,app,ui b
```

---

## Three Tabs

| Tab | Source | Shows |
| :-- | :----- | :---- |
| ◈ **Live Report** | `data/latest.json` | Portfolio, positions, **Quant Signal Matrix**, watchlist movers, **Accuracy & Self-Correction**, learned patterns, top opportunities |
| ↗ **Projected Journey** | `data/projected_journey.json` | Growth chart, intelligence-evolution phases, strategy DNA, risk profile, milestones (weekly) |
| ◷ **Past Reports** | `data/archive/index.json` | One final report per calendar day |

### Signature panels (v0.6+)

- **🧮 Quant Signal Matrix** — RSI, MACD, Z-score, volume & trend per ticker, each collapsed into a composite score `S ∈ [−1,+1]` shown as a color gauge. A direct readout of the framework's Python signal engine.
- **◎ Accuracy & Self-Correction** — win rate, trades graded vs. awaiting their 5-day outcome, current intelligence phase, and the auto-learned `DO-NOT-TRADE` conditions. The learning loop, made public.

---

## How Data Flows

The site is intentionally **read-only and passive**. It polls the JSON every 5 minutes (and on demand via the refresh chip). When CLU commits a new `latest.json` to this repo, the next poll reflects it — no deploy needed beyond GitHub Pages serving the file.

```mermaid
sequenceDiagram
    participant CLU as 🤖 CLU session
    participant Repo as 📦 this repo
    participant Browser as 🌍 visitor
    CLU->>Repo: commit data/latest.json
    Note over Repo: GitHub Pages serves /docs
    Browser->>Repo: fetch latest.json (every 5 min)
    Repo-->>Browser: JSON
    Browser->>Browser: app.js renders cards
```

---

## Project Structure

```
docs/                     # GitHub Pages root
├── index.html            # Layout, tabs, section containers
├── app.js                # Fetch + render (Live Report, Journey, Archive)
├── style.css             # "Ice Transmission" theme — neon, Orbitron/JetBrains Mono
└── data/
    ├── latest.json           # Current live report  ← written by CLU
    ├── projected_journey.json# Weekly trajectory    ← written by CLU
    └── archive/
        ├── index.json        # Manifest (one entry per day)
        └── YYYY-MM-DD-ah.json# Archived final daily reports
```

> The JSON schemas are defined and owned by the framework repo — see [CLU.md §11–§12](https://github.com/AKSIS-1/CLU-Framework/blob/main/CLU.md). This repo renders them; it does not define them.

---

## Run It Locally

No build, no dependencies — just serve the `docs/` folder over HTTP (needed so `fetch` can load the JSON):

```bash
cd docs
python3 -m http.server 8099
# open http://localhost:8099
```

To preview with different data, edit `docs/data/latest.json` and refresh.

---

## Design

The **"Ice Transmission"** theme: deep `#00010d` background, icy-blue → magenta accents, Orbitron display + JetBrains Mono body, animated ticker banners and a rotating disc mark. Fully responsive (2-column desktop → single-column mobile). All visual tokens live in `style.css`.

<div align="center">

---

Rendered from live agent output · No crypto · Guardrails always active

</div>
