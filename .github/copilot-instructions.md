# Copilot / AI Agent Instructions for AX Calculator

**⚠️ LOAD THIS FIRST** — This file defines local dev environment context and must be read before any task.

---

## Environment & Deployment Context

### Environment Mapping
| Environment | Local Folder | GitHub Repo | Azure Static Web App | Public URL |
|---|---|---|---|---|
| **Development** | `c:\Users\piete\OneDrive\Code\dev` | [pteeling1/dev](https://github.com/pteeling1/dev) | `green-moss-0c759f91e` | https://green-moss-0c759f91e.azurestaticapps.net/ |
| **Production** | `c:\Users\piete\OneDrive\Code\prod` | [pteeling1/prod](https://github.com/pteeling1/prod) | `thankful-coast-075a8e20f` | https://thankyoutech.azurestaticapps.net/ |
| **Web (Preview)** | `c:\Users\piete\OneDrive\Code\web` | [pteeling1/web](https://github.com/pteeling1/web) | `lively-water-06ffcb510` | https://lively-water-06ffcb510.azurestaticapps.net/ |

### 🚨 CRITICAL WORKFLOW RULE
**All changes must be made locally in the `dev/` folder by default.**
- **No automatic GitHub pushes** — changes committed locally; push only when explicitly instructed
- **No automatic copying to prod** — prod remains untouched unless specifically told to sync
- **No automatic creation in prod** — files/changes created only in dev unless instructed otherwise
- **Explicit instructions required** — to push, copy to prod, or deploy

This ensures dev is the single source of truth during development, and prod/web remain stable until deliberate sync.

### CI/CD & Deployment
All three environments use **GitHub Actions** → **Azure Static Web Apps** on push to `main`:
- **Dev Secret**: `AZURE_STATIC_WEB_APPS_API_TOKEN_GREEN_MOSS_0C759F91E`
- **Prod Secret**: `AZURE_STATIC_WEB_APPS_API_TOKEN_THANKFUL_COAST_075A8E20F`
- **Web Secret**: `AZURE_STATIC_WEB_APPS_API_TOKEN_LIVELY_WATER_06FFCB510`

For complete deployment details, see [ENVIRONMENT.md](../ENVIRONMENT.md).

---

## Application Architecture

This repository is a **static, client-side web app** (no bundler). Key folders: `js/`, `css/`, `images/`, with `index.html` as the main entry.

**Big picture:** user-facing sizing tool that converts workload/VM requirements into cluster recommendations. The algorithmic core is in `js/sizingEngine.js`; UI glue is in `js/main.js` and `js/uihandlers.js`; visuals live in `js/visuals-debug.js` (primary) and `js/visuals.js` variants. Export features use `pptxgenjs`, `jspdf`, and `html2canvas` (see `index.html` CDN includes).

### How the app is composed
- `index.html` loads third-party libraries via CDN and `type="module"` scripts (`js/main.js`, `js/exportToPowerPoint.js`).
- Modules export named functions; some expose functions on `window` for cross-file interoperability (e.g. `main.js` sets `window.initializeVisuals`, `window.updateNodeStack`, `window.drawConnections`).
- Many files assume DOM elements exist and run on `DOMContentLoaded`.

### Important files to inspect first
- [js/main.js](../js/main.js) — app entry, event bindings, UI sync, developer-visible globals
- [js/sizingEngine.js](../js/sizingEngine.js) — pure logic: CPU, memory, disk selection, `sizeCluster()` export
- [js/hardwareConfig.js](../js/hardwareConfig.js) — hardware constraints: chassis models, memory limits, CPU compatibility
- [js/uihandlers.js](../js/uihandlers.js) — DOM update helpers referenced by `main.js`
- [js/visuals-debug.js](../js/visuals-debug.js) — topology drawing used by exporter/visual toggles
- [js/exportToPowerPoint.js](../js/exportToPowerPoint.js) and [js/pptxExporter.js](../js/pptxExporter.js) — PPTX export orchestration
- [js/rvtools-import.js](../js/rvtools-import.js) / [js/fileprocessor.js](../js/fileprocessor.js) — CSV import & parsing logic

---

## Conventions & Patterns (Project-Specific)

### No Build System
- Edits are immediately visible after hosting via HTTP server
- Keep ES module syntax and `type="module"` script tags in sync

### Global State (Keep in Sync with DOM)
- `window.lastSizingResult` — Latest calculation result
- `window.originalRequirements` — Input state before calculations
- Prefer updating these in tandem with DOM updates to avoid UI desync

### DOM-First Design
- Many functions read DOM directly (e.g. `getSizingPayloadFromHTML()` in `sizingEngine.js`)
- When refactoring, maintain the same input/output surface or provide a thin adapter
- Keep `sizingEngine.js` pure where possible; any DOM reads should remain in `getSizingPayloadFromHTML()`

### Module Interoperability
- Modules expose functions on `window` for cross-file calls
- All third-party libs via CDN in `index.html`
- Maintain ES module syntax throughout

### Logging & Diagnostics
- `console.group`, `console.table`, and `logger.js` used for diagnostics
- Preserve console output when making sizing changes
- Use browser console to view the sizing logs (sizing engine prints tables/groups)

### Exporter Dependencies
- Exporters rely on certain functions being globally reachable (e.g. visual initializers)
- Avoid renaming exports without updating `js/main.js` and exporter modules

---

## Dev / Run Instructions

### Local Development
Use a local HTTP server (ES modules require HTTP, not `file://`):
- `python -m http.server 8000` or
- `npx http-server -p 8080` or
- VS Code Live Server extension

Open `http://localhost:8000/index.html` (or configured port). Do not rely on `file://` for module-based scripts.

### Making Changes
1. Edit files in `dev/` folder
2. Refresh browser — changes are immediate (no build step)
3. Test all flows: manual config, automated sizing, imports, exports
4. Commit locally (push to GitHub only when explicitly instructed)

### Testing Flows
1. **Manual**: Adjust sliders → Calculate → verify results table
2. **Automated**: Requirements modal → Calculate → check `window.lastSizingResult`
3. **Import**: RVTools CSV → validate parsing → generate workload rows
4. **Export**: PowerPoint/PDF → check slide layout, charts, formatting

---

## Common Change-Impact Checklist

- **Sizing logic changes**: Run UI flow — open Requirements modal → choose mode → Calculate; verify `window.lastSizingResult` and the cluster summary table
- **Function renames**: Update all imports and any `window.` exposures in `js/main.js` and exporters
- **Third-party libs**: Prefer CDN entries in `index.html` and verify `defer`/`type="module"` ordering
- **Memory/CPU options**: Check `js/hardwareConfig.js` and `js/cpuData.js` constraints

---

## Debug Tips / Quick Searches

- Search for `window.lastSizingResult` to find stateful usage
- Inspect CPU/memory lists in [js/cpuData.js](../js/cpuData.js) and hardware constraints in [js/hardwareConfig.js](../js/hardwareConfig.js)
- Use browser console to view the sizing logs (sizing engine prints tables/groups)

---

**Full context available in**: [ENVIRONMENT.md](../ENVIRONMENT.md) — contains complete architecture, folder structure, troubleshooting guide, and references.
