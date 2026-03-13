# Environment & Deployment Guide

This document maps the local development environment, GitHub repositories, and Azure deployments for the AX Calculator and related tools.

## Environment Mapping

| Environment | Local Folder | GitHub Repo | Azure Static Web App | Branch | Workflow File |
|---|---|---|---|---|---|
| **Development** | `c:\Users\piete\OneDrive\Code\dev` | [pteeling1/dev](https://github.com/pteeling1/dev) | `green-moss-0c759f91e` | `main` | `azure-static-web-apps-green-moss-0c759f91e.yml` |
| **Production** | `c:\Users\piete\OneDrive\Code\prod` | [pteeling1/prod](https://github.com/pteeling1/prod) | `thankful-coast-075a8e20f` | `main` | `azure-static-web-apps-thankful-coast-075a8e20f.yml` |
| **Web (Preview)** | `c:\Users\piete\OneDrive\Code\web` | [pteeling1/web](https://github.com/pteeling1/web) | `lively-water-06ffcb510` | `main` | `azure-static-web-apps-lively-water-06ffcb510.yml` |

### Public URLs
- **Production**: https://thankyoutech.azurestaticapps.net/
- **Development**: https://green-moss-0c759f91e.azurestaticapps.net/
- **Web/Preview**: https://lively-water-06ffcb510.azurestaticapps.net/

## CI/CD Deployment

All three environments (dev, prod, web) use **GitHub Actions** to automatically deploy to **Azure Static Web Apps** on push to `main`:

### Workflow Trigger
```yaml
on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened, closed]
    branches:
      - main
```

### Deployment Steps
1. **Checkout**: Pulls latest code from GitHub
2. **Build**: (no build step configured — static files deployed as-is)
3. **Deploy**: Uploads to Azure Static Web Apps using API token

### Required GitHub Secrets
**Dev:**
- `AZURE_STATIC_WEB_APPS_API_TOKEN_GREEN_MOSS_0C759F91E`

**Prod:**
- `AZURE_STATIC_WEB_APPS_API_TOKEN_THANKFUL_COAST_075A8E20F`
- `GITHUB_TOKEN` (auto-provided by GitHub Actions)

**Web:**
- `AZURE_STATIC_WEB_APPS_API_TOKEN_LIVELY_WATER_06FFCB510`
- `GITHUB_TOKEN` (auto-provided by GitHub Actions)

## Application Architecture

### Purpose
The AX Calculator is a **static, client-side web app** for:
- **Manual sizing**: Sliders and dropdowns for machine config
- **Automated sizing**: Modal-based requirements gathering
- **RVTools import**: CSV parsing for workload analysis
- **FREB analysis**: Log parsing for advanced diagnostics
- **Export**: PowerPoint and PDF generation

### Core Technologies
- **ES Modules** (type="module") — no bundler
- **Bootstrap 5** — UI framework
- **Chart.js** — visualization
- **pptxgenjs** — PowerPoint generation
- **jspdf** + **html2canvas** — PDF export
- **Azure Static Web Apps** — hosting

## Folder Structure

```
/
├── index.html                    # Main calculator
├── rvtools.html                  # RVTools import page
├── advanced.html                 # Advanced features
├── about.html                    # About page
├── blogs.html                    # Blog index
├── m365local.html                # M365 Local specifics
├── rackAwareCluster.html         # Rack-aware cluster tool
│
├── /js                           # JavaScript modules
│   ├── main.js                   # Entry point, event glue, state
│   ├── sizingEngine.js           # Core sizing algorithm (pure logic)
│   ├── uihandlers.js             # DOM update helpers
│   ├── hardwareConfig.js         # Chassis models, DIMM configs, memory limits
│   ├── cpuData.js                # CPU models and specs
│   ├── storageCalculator.js      # Usable storage calculations
│   ├── charts.js                 # Chart.js visualizations
│   ├── visuals-debug.js          # Topology visualizations (primary)
│   ├── visuals.js                # Alternative visuals variant
│   ├── rvtools-import.js         # RVTools CSV parsing
│   ├── fileprocessor.js          # File processing utilities
│   ├── exportToPowerPoint.js     # PPTX export orchestration
│   ├── pptxExporter.js           # PPTX generation details
│   └── [other utilities]
│
├── /css                          # Stylesheets
│   ├── styles.css                # Main styles
│   ├── blog-colors.css           # Blog color palette
│   └── [component styles]
│
├── /images                       # Hardware diagrams, logos
│   ├── 660.png, 670.png, etc     # Chassis images
│   └── 4510.avif                 # AX-4510c image
│
├── /blogs                        # Standalone blog HTML pages
│   ├── 100gbit.html              # 100 GbE networking article
│   ├── azure-local.html          # Azure Local support deadlines
│   └── reserved-ips.html         # Reserved IP ranges workaround
│
├── .github/workflows/            # GitHub Actions CI/CD
│   └── azure-static-web-apps-*.yml
│
├── README.md                     # General README
├── ENVIRONMENT.md                # This file
├── DEPLOYMENT.md                 # Deployment procedures
├── SETUP_INSTRUCTIONS.md         # Setup guide
└── [other docs]
```

## Key Files & Components

### Sizing Logic
- **`js/sizingEngine.js`** — Pure calculation functions (CPU/memory/disk selection, cluster sizing)
  - Export: `sizeCluster()` — main entry point
  - Uses: `js/hardwareConfig.js`, `js/cpuData.js`
  - Called by: Automated sizing modal & manual calculate button

- **`js/hardwareConfig.js`** — Hardware constraints
  - Chassis models: AX 660/670/760/770, AX-4510c/4520c
  - Memory limits: 4096 GB (32 × 128GB DIMMs) for AX platforms
  - DIMM configurations per chassis
  - CPU compatibility rules

- **`js/storageCalculator.js`** — Usable storage calculation
  - Resiliency: 2-way, 3-way mirror
  - Overhead: OS, reserved space
  - Returns: Usable TB

### UI & State
- **`js/main.js`** — Event listeners, state management
  - Exposes: `window.lastSizingResult`, `window.originalRequirements`
  - DOM references for all controls
  - Calculation trigger & results rendering

- **`js/uihandlers.js`** — DOM update helpers
  - `updateNodeImage()`
  - `updateDiskLimits()`
  - `updateResiliencyOptions()`
  - `updateStorage()`

### Import & Analysis
- **`js/rvtools-import.js`** / **`js/fileprocessor.js`**
  - CSV parsing for RVTools data
  - FREB log analysis
  - Creates workload rows dynamically

### Export
- **`js/exportToPowerPoint.js`** — PPTX orchestration
- **`js/pptxExporter.js`** — Slide generation details
- **`js/pdfexporter.js`** — PDF generation

### Visualization
- **`js/visuals-debug.js`** — Primary topology drawing (used by exporter)
- **`js/visuals.js`** — Alternative visuals variant
- **`js/charts.js`** — Chart.js integration for bar/pie charts

## Development Workflow

### Local Setup
```bash
# Start a local HTTP server (required for ES modules)
python -m http.server 8000
# or
npx http-server -p 8080
# or use VS Code Live Server extension
```

Open `http://localhost:8000/` (or configured port)

### Making Changes
1. Edit files in `prod/` folder
2. Refresh browser — changes are immediate (no build step)
3. Test all flows: manual config, automated sizing, imports, exports
4. Commit and push to `prod` branch

### Pushing to Development
Same process as prod, but changes go to `dev/` folder and `dev` GitHub branch.

## Important Conventions

### Global State
- `window.lastSizingResult` — Latest calculation result
- `window.originalRequirements` — Input state before calculations
- Keep in sync with DOM updates to avoid desync

### DOM-First Design
- `sizingEngine.js` reads directly from DOM (`getSizingPayloadFromHTML()`)
- When refactoring, maintain input/output surface or provide adapter
- Modules expose functions on `window` for cross-file interop

### Logging
- `console.group()`, `console.table()` for diagnostics
- Preserved in sizing engine output
- Check browser console for errors

### Module Naming
- Functions exported clearly from `index.html` type="module" scripts
- No bundler — maintain ES module syntax throughout
- Async operations return Promises, use `.then()` or `await`

## Testing & Validation

### Sizing Flows
1. **Manual**: Adjust sliders → click Calculate → verify results
2. **Automated**: Open Requirements modal → fill inputs → Calculate
3. **Import**: RVTools CSV → validates parsing → generates workload rows

### Export Quality
- PowerPoint: Check slide layout, charts, data accuracy
- PDF: Verify page breaks, table formatting, images

### Hardware Constraints
- Node type radio changes update disk limits & memory options
- CPU selection updates available memory range
- Memory dropdown shows values valid for selected chassis

## Troubleshooting

### Memory Dropdown Not Populating
- Check `js/hardwareConfig.js` `chassisMemoryLimits` for selected node type
- Verify `js/main.js` or `js/memoryOptions.js` is loaded
- Check browser console for module load errors

### Exports Failing
- Ensure third-party CDN libraries load (pptxgenjs, jspdf, html2canvas)
- Check `index.html` script includes are correct
- Verify `exportToPowerPoint.js` is imported as type="module"

### Sizing Results Incorrect
- Trace through `sizingEngine.js` logic
- Check `hardwareConfig.js` limits for selected hardware
- Verify DOM inputs are read correctly in `getSizingPayloadFromHTML()`

## References

- [Azure Static Web Apps Documentation](https://learn.microsoft.com/azure/static-web-apps/)
- [GitHub Actions for Azure Static Web Apps](https://github.com/Azure/static-web-apps-deploy)
- [Bootstrap 5 Documentation](https://getbootstrap.com/docs/5.3/)
- [Chart.js Documentation](https://www.chartjs.org/)

---

**Last Updated**: March 13, 2026
