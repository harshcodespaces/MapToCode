# MapToCode

MapToCode is a beginner-friendly full-stack developer tool that turns flowcharts and structured logic into readable Python and C99 code.

---

## Architecture & Tech Stack

```text
MapToCode/
├── backend/                       # Python FastAPI Backend
│   ├── app/
│   │   ├── api/v1/                # REST endpoints (health, projects, validate, reconcile, generate, execute)
│   │   ├── core/                  # Configuration & diagnostic definitions
│   │   ├── domain/                # Canonical AST, validation, C/Python generators, reconciliation
│   │   ├── schemas/               # Pydantic data contracts, requests & responses
│   │   ├── services/              # Project persistence & isolated sandboxed execution
│   │   └── main.py                # FastAPI entry point & CORS configuration
│   ├── tests/                     # Pytest automated test suite (28 tests)
│   ├── pyproject.toml             # Python packaging & tool configuration
│   └── requirements.txt           # Python backend dependencies
│
├── web/                           # Next.js React & TypeScript Frontend
│   ├── app/                       # Next.js App Router (pages: /, /workspace, /api/execute)
│   ├── components/                # Modular React UI components
│   │   ├── canvas/                # Visual flowchart canvas & SVG diagrams
│   │   ├── common/                # Shared UI elements (BrandMark, SampleCodePreview)
│   │   ├── tracer/                # Interactive step-by-step logic tracer
│   │   └── workspace/             # Workspace client, algorithm editor, stepper, modals
│   ├── api/                       # Typed HTTP client communicating with FastAPI
│   ├── types/                     # TypeScript types (AST, contracts, API responses)
│   ├── core/                      # Client-side helpers (local storage drafts, examples)
│   ├── tests/                     # Client automated tests (61 tests)
│   ├── package.json
│   └── tsconfig.json
│
└── docs/                          # Architecture specifications & deployment documentation
```

---

## Running the Application Locally

### 1. Backend (Python FastAPI)

In your first terminal:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- **Health check**: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)
- **Interactive API Docs (Swagger UI)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Run tests**:
  ```bash
  pytest tests
  ```

---

### 2. Frontend (Next.js & TypeScript)

In your second terminal:

```bash
cd web
npm install
npm run dev
```

- **Homepage**: [http://localhost:3000](http://localhost:3000)
- **Interactive Workspace**: [http://localhost:3000/workspace](http://localhost:3000/workspace)

#### Frontend Quality Checks

```bash
cd web
npm run type-check   # TypeScript check (0 errors)
npm run lint         # ESLint verification (0 errors)
npm test             # Automated unit tests (61 tests)
npm run build        # Production Next.js build
```

---

## Editing Code in VS Code or Any Editor

The project is structured for easy navigation and editing:

- **Edit UI & Frontend Logic**:
  - Main workspace layout and interactions: [`web/components/workspace/WorkspaceClient.tsx`](./web/components/workspace/WorkspaceClient.tsx)
  - Flowchart visual canvas: [`web/components/canvas/FlowCanvas.tsx`](./web/components/canvas/FlowCanvas.tsx)
  - Algorithm step-by-step editor: [`web/components/workspace/AlgorithmEditor.tsx`](./web/components/workspace/AlgorithmEditor.tsx)
  - Frontend API client: [`web/api/client.ts`](./web/api/client.ts)
  - TypeScript types: [`web/types/contracts.ts`](./web/types/contracts.ts)

- **Edit Backend Domain Logic & Generators**:
  - Python code generator: [`backend/app/domain/python_generator.py`](./backend/app/domain/python_generator.py)
  - C code generator: [`backend/app/domain/c_generator.py`](./backend/app/domain/c_generator.py)
  - Dual-authoring reconciliation: [`backend/app/domain/reconciliation.py`](./backend/app/domain/reconciliation.py)
  - API routes: [`backend/app/api/v1/routes/`](./backend/app/api/v1/routes/)
  - Sandboxed code execution: [`backend/app/services/execution_service.py`](./backend/app/services/execution_service.py)

---

## Core Architecture Principles

1. **Dual Independent Authoring**: Users can define logic via a structured specification (Option A) or visually via a flowchart (Option B).
2. **Deterministic Reconciliation**: Both representations are normalized to a versioned AST and compared for equivalence (`equivalent`, `conflict`, `unknown`, `invalid`).
3. **Strict Generation Gate**: Code generation is blocked until both representations are verified as equivalent and actively approved.
4. **Sandboxed Execution**: Code execution is isolated with strict timeouts, size limits, and rate limiting.
