# MapToCode — Web Frontend

The Next.js React and TypeScript frontend for MapToCode.

## Directory Structure

```text
web/
├── app/                       # Next.js App Router (layout, page, workspace, api/execute)
│   ├── workspace/page.tsx     # /workspace route
│   ├── layout.tsx             # Root layout
│   ├── page.tsx               # Homepage
│   └── globals.css            # Global CSS styles
│
├── components/                # Modular UI components
│   ├── canvas/                # Visual flowchart canvas & SVG diagrams
│   ├── common/                # Shared elements (BrandMark, SampleCodePreview)
│   ├── tracer/                # Logic tracer component
│   └── workspace/             # Workspace views, editor, stepper, preview, console
│
├── api/                       # Typed HTTP client communicating with FastAPI
│   ├── client.ts              # API client methods
│   └── errors.ts              # API error handling
│
├── types/                     # TypeScript type definitions
│   ├── contracts.ts           # AST, flowchart, specification & project models
│   ├── api.ts                 # API response types
│   ├── diagnostics.ts         # Diagnostic interfaces
│   └── reconciliation.ts      # Equivalence & conflict interfaces
│
├── core/                      # Client helpers (local storage drafts, examples, tracer)
├── tests/                     # Automated unit test suite
├── package.json
└── tsconfig.json
```

## Available Scripts

```bash
npm run dev          # Start local Next.js dev server on port 3000
npm run type-check   # Validate TypeScript types without emit
npm run lint         # Check code quality with ESLint
npm test             # Run Node unit tests
npm run build        # Build production bundle with Turbopack
```
