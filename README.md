# MapToCode

MapToCode helps beginners turn flowcharts into readable code. The project includes a Next.js website with a browser-based flowchart workspace, plus a standalone HTML version that runs directly in a browser.

## Choose a version

- **Website and workspace:** follow the setup below to run the Next.js app.
- **Standalone demo:** open [`MapToCode.html`](./MapToCode.html) in a modern browser. It needs no install or server.

## Run the website locally

You need Node.js and npm installed. In a terminal, run:

```bash
cd web
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The homepage introduces the project; choose **Open Workspace** to build a diagram.

To check the website before sharing changes:

```bash
npm test
npm run lint
npm run build
```

For GitHub Actions, Vercel previews, production branch protection, and deployment troubleshooting, see [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

## What it supports

- Build and edit a flowchart in the browser workspace.
- Preview and download generated Python or C source for the documented supported subset.
- Save diagrams in browser local storage and export or import them as JSON.
- Use the single-file `MapToCode.html` demo without Node.js.

Generated source is displayed or downloaded; the app does not execute it. Recognition of hand-drawn flowcharts is not implemented.

See [`web/README.md`](./web/README.md) for supported language details and limitations. Product notes are in [`docs/`](./docs/).

## Project layout

```text
MapToCode.html       Standalone browser version
docs/                Product brief and project notes
web/                 Next.js website and workspace
  app/               Pages and UI
  lib/               Flowchart validation and code generation
  tests/             Generator tests
```

## Publish on GitHub

Create an empty repository on GitHub, then from this project folder run the commands GitHub shows for an existing local repository. If Git is not initialized yet, use:

```bash
git init
git add README.md .gitignore AGENTS.md MapToCode.html docs web
git commit -m "Prepare MapToCode for GitHub"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the example remote with your repository address. Do not add `node_modules`, `.next`, or local environment files; the root `.gitignore` excludes them.
