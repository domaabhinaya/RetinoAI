# RetinoAI — Clinical Screening & Doctor Review Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff.svg?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-5.0-000000.svg?style=flat-square&logo=express)](https://expressjs.com/)
[![Clinical Tests](https://img.shields.io/badge/Integration%20Tests-12%2F12%20PASS-success.svg?style=flat-square)]()
[![License](https://img.shields.io/badge/License-Proprietary-red.svg?style=flat-square)]()

**RetinoAI** is an end-to-end, medical-grade teleophthalmology platform engineered to detect **Diabetic Retinopathy (DR)** and **Diabetic Macular Edema (DME)** at the point of care. Built with strict role-based clinical separation, RetinoAI connects frontline community screening operators with hospital-based retina specialists.

> **Clinical Core Tenet:** *"AI assists. Doctors decide."*  
> Frontline workers screen with real-time quality and diagnostic assistance; ophthalmologists retain ultimate clinical decision authority.

---

## 🌟 Key Capabilities

### 1. Clinical Screening Portal (Frontline Operators)
- **7-Stage Clinical Workflow:**
  1. Patient Identification & Registry Lookup (rural/camp code tracking)
  2. Diabetes History (HbA1c %, duration, medication, glucose levels)
  3. Visual Acuity & Ocular Symptoms (IOP, floaters, blurriness)
  4. Clinical & Photography Consent (biometric & data processing agreement)
  5. Retinal Photography (OD & OS fundus capture with automated focus & centering checks)
  6. AI Vision Analysis (instant ICDR staging, DME risk, and lesion delineation)
  7. Specialist Escalation (structured referral notes & high-priority dispatch)
- **Interactive Fundus Viewer:**
  - Dynamic canvas/SVG rendering with toggleable lesion layers: **Microaneurysms**, **Blot Hemorrhages**, **Hard Exudates**, **Cotton Wool Spots**, and **Neovascular Fronds**.
  - Deep neural attention heatmaps with real-time opacity controls and pixel-level crosshairs.
  - Optical focus, illumination, and 45° standard field-of-view quality indicators.

### 2. Doctor Review Portal (Ophthalmologists)
- **Prioritized Case Worklist Queue:** Triage tiering (`High Priority`, `Review Recommended`, `Routine`) dynamically scored from clinical biomarkers and lesion density.
- **Longitudinal Visit Comparison:** Side-by-side historical screening comparison (previous visit vs current visit) to track disease progression or treatment response.
- **Diagnostic Decision Desk:** Single-click specialist decision sign-off (`Refer for Tertiary Care` or `Schedule Routine Monitor`) with structured clinical impressions and automated follow-up calendar integration.

### 3. Medical Vision Engine & Diagnostic Accuracy
- **ICDR 5-Stage Disease Scale:**
  - **Grade 0 (No DR):** Normal retinal vasculature and intact foveal reflex.
  - **Grade 1 (Mild NPDR):** Microaneurysms only.
  - **Grade 2 (Moderate NPDR):** Microaneurysms, scattered blot hemorrhages, and early hard exudates.
  - **Grade 3 (Severe NPDR):** 4-2-1 rule verification (>20 intraretinal hemorrhages in 4 quadrants, venous beading in 2 quadrants, or IRMA in 1 quadrant).
  - **Grade 4 (PDR):** Active neovascularization fronds (NVD/NVE) with preretinal/vitreous hemorrhage risk.
- **ETDRS Macular Edema Scoring:** Distance calculation determining **Clinically Significant Macular Edema (CSME)** when circinate lipid plaques encroach within 500 µm of the central fovea.
- **540–570 nm Green-Channel Contrast Ratio:** Emulated hemoglobin absorption peak (1.48:1 contrast ratio) maximizing microvascular lesion visibility.

### 4. Hybrid Multi-Model AI Gateway
- **Zero-Key Local Mode:** Includes an offline calibrated medical engine providing full ICDR grading and spatial lesion mapping with zero external API calls or latency.
- **Live Cloud Multimodal AI:** Plug-and-play support for **Google Gemini 2.0 Flash Vision** and **Blackbox AI Agent Gateway** for live pixel analysis.
- **IDE AI Bridge:** Built-in OpenAI-compatible endpoint at `/api/chat/completions` and `/v1/chat/completions` connecting directly with VS Code extensions (Cline, Continue, Blackbox Agent).

---

## 🏛 Architecture & Monorepo Structure

```
RetinoAI/
├── artifacts/
│   ├── retinoai/               # Frontend Application (React 19 + Vite + Tailwind/CSS)
│   │   ├── src/
│   │   │   ├── components/     # FundusViewer, sample datasets, modals
│   │   │   ├── lib/            # REST API client & state utilities
│   │   │   └── App.tsx         # Screening & Doctor Review portals
│   │   └── vite.config.ts      # Multi-port config with /api reverse proxy
│   ├── api-server/             # Backend API Server (Node.js + Express 5 + TypeScript)
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── ai-service.ts     # Vision engine, ICDR classifier & Cloud AI
│   │   │   │   ├── dataset-loader.ts # Benchmark dataset scanner & ingestion
│   │   │   │   ├── storage.ts        # Secure image file stream & storage
│   │   │   │   └── store.ts          # Atomic file-backed clinical persistence
│   │   │   ├── routes/
│   │   │   │   ├── patients.ts       # Patient demographics & registration
│   │   │   │   ├── screening-cases.ts# Screening intake, uploads, AI & reviews
│   │   │   │   ├── referred-cases.ts # Doctor specialist worklist queue
│   │   │   │   ├── follow-ups.ts     # Longitudinal follow-up registry
│   │   │   │   ├── datasets.ts       # Dataset benchmark browser & importer
│   │   │   │   ├── chat-completions.ts# IDE / Blackbox AI reverse-proxy bridge
│   │   │   │   └── uploads.ts        # Fundus photograph media delivery
│   │   │   └── app.ts          # Express application setup & middleware
│   │   └── test-api.mjs        # 12-stage automated integration test suite
│   └── mockup-sandbox/         # UI component sandbox
├── datasets/                   # External benchmark fundus datasets (.csv, .jpg)
├── scripts/
│   └── blackbox_bridge.py      # Standalone Python Flask bridge
├── .env.example                # Environment variable configuration template
└── package.json                # Monorepo pnpm workspace orchestrator
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20.x or higher
- **pnpm**: v9.x or higher (`npm install -g pnpm`)

### 1. Installation
Clone the repository and install all workspace dependencies:
```bash
git clone https://github.com/domaabhinaya/RetinoAI.git
cd RetinoAI
pnpm install
```

### 2. Environment Configuration
Copy the template configuration:
```bash
cp .env.example .env
```
*(Optional)* Add your cloud AI API keys to enable live neural network vision analysis:
```ini
PORT=5000

# Free Google Gemini 2.0 Flash Key (https://aistudio.google.com)
GEMINI_API_KEY=your_gemini_api_key_here

# Blackbox AI Key (https://blackbox.ai)
BLACKBOX_API_KEY=your_blackbox_api_key_here
BLACKBOX_API_URL=https://api.blackbox.ai/v1/chat/completions
```
*Note: If no API key is provided, RetinoAI runs seamlessly using its internal calibrated clinical engine.*

### 3. Launch Development Environment
Start both the API server and web portal in parallel:
```bash
# Terminal 1: Start the Backend API Server
pnpm --filter @workspace/api-server dev

# Terminal 2: Start the Frontend Portal
pnpm --filter @workspace/retinoai dev
```

- **Frontend Web Portal:** `http://localhost:3000`
- **Backend REST API:** `http://localhost:5000`

---

## 🧪 Automated Testing & Verification

RetinoAI features a full integration test suite validating all 12 core clinical pathways:
```bash
pnpm --filter @workspace/api-server test
```

**Verification Results:**
```text
==================================================
  RetinoAI Production Suite - Automated API Tests 
==================================================
  Testing: GET /api/healthz (Healthcheck)... PASS
  Testing: POST /api/patients (Register Patient)... PASS
  Testing: GET /api/patients/:id (Retrieve Patient)... PASS
  Testing: POST /api/screening-cases (Create Case with Clinical Data)... PASS
  Testing: POST /api/screening-cases/:id/images (Upload Fundus Images)... PASS
  Testing: POST /api/screening-cases/:id/ai-analysis (Vision Engine & ICDR Scale)... PASS
  Testing: POST /api/screening-cases/:id/escalate (Escalate to Doctor Review)... PASS
  Testing: GET /api/referred-cases (Doctor Worklist Queue)... PASS
  Testing: POST /api/screening-cases/:id/review (Doctor Specialist Signoff)... PASS
  Testing: GET /api/follow-ups (Follow-up Registry Verification)... PASS
  Testing: GET /api/datasets (Benchmark Datasets Registry)... PASS
  Testing: POST /api/datasets/import-case (Ingest Pre-calibrated Dataset Case)... PASS
==================================================
  Tests completed: 12 passed, 0 failed (100% Pass Rate)
==================================================
```

To run full TypeScript compilation checks across the monorepo:
```bash
pnpm run typecheck
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/healthz` | System health and uptime status |
| `GET` | `/api/patients` | List registered patients with risk strata |
| `POST` | `/api/patients` | Register a new screening subject |
| `GET` | `/api/screening-cases/:id` | Full clinical case dossier with images & AI |
| `POST` | `/api/screening-cases` | Initialize screening with diabetes intake |
| `POST` | `/api/screening-cases/:id/images` | Upload OD/OS fundus photographs |
| `POST` | `/api/screening-cases/:id/ai-analysis` | Execute AI Vision screening & lesion mapping |
| `POST` | `/api/screening-cases/:id/escalate` | Escalate case to doctor specialist review |
| `GET` | `/api/referred-cases` | Doctor review queue filtered by priority |
| `POST` | `/api/screening-cases/:id/review` | Record specialist decision (`refer` / `monitor`) |
| `GET` | `/api/follow-ups` | Schedule & list longitudinal patient re-checks |
| `GET` | `/api/datasets` | Scan & list available benchmark fundus datasets |
| `POST` | `/api/datasets/import-case` | Import benchmark case for model validation |
| `POST` | `/api/chat/completions` | OpenAI-compatible AI gateway for IDE & assistants |

---

## ⚖️ Clinical Safety & Regulatory Notice

RetinoAI is engineered as an **assistive screening decision-support tool**. It is not a standalone diagnostic instrument. All AI-generated lesion boundaries, ICDR severity classifications, and priority triage designations require review and validation by a licensed ophthalmologist or qualified medical professional before clinical intervention.

---

## 📄 License

Proprietary. Developed for clinical diabetic retinopathy screening research and specialist teleophthalmology.
