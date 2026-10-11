# MapToCode development and deployment

This repository's Next.js application is in `web/`. Run app commands from that directory. The root `MapToCode.html` is a separate standalone demo and is not included in the Next.js deployment.

The finalized M1 architecture specifies two independent editors, reconciliation, validation, approvals, a service-level generation gate, provenance, and restricted C generation. The current website is still an earlier flowchart prototype; the deployment workflow below does not implement those M1 features or change their restrictions. Deploying the current app is technically supported, but it should not be described as M1-complete.

## Local development on Deepin Linux

Use Node.js 22 for local work, GitHub checks, and Vercel builds. Next.js 16.4 requires Node.js 20.9 or newer; the repository pins the CI/deployment major in `web/.nvmrc` so local development can match it. If you use `nvm`, switch to the repository version from the app directory:

```bash
cd web
nvm install
nvm use
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Before pushing a change, run the same checks as GitHub Actions:

```bash
npm test
npm run lint
npm run build
```

`npm ci` installs exactly what `package-lock.json` records. Do not commit `node_modules`, `.next`, `.vercel`, `.env*`, API keys, or credentials. No environment variables are currently needed by the app.

## GitHub and branch workflow

The workspace currently has no initialized Git repository, commits, branches, or remote. The `.git` directory is empty, so Git commands currently report that this is not a repository. Preserve your control of commits and pushes by initializing and reviewing the files yourself:

```bash
cd /home/Harsh/MapToCode
chmod u+w .git
git init -b main
git config user.name "Your Name"
git config user.email "YOUR-GITHUB-EMAIL"
git status --short
```

The permission command makes the existing empty `.git` directory writable so Git can initialize metadata there. It does not stage or commit project files. The name and email are stored only in this repository; use your GitHub noreply email if you want to keep your personal email private. Review `git status`, then choose when to stage and commit. The root `.gitignore` and `web/.gitignore` already exclude dependencies, build output, Vercel metadata, environment files, and key files.

After you create an empty GitHub repository, add its URL and push only when you choose:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git branch -M main
git push -u origin main
```

Recommended routine:

1. Keep `main` as the production branch and create `develop` for integration previews.
2. Work on a short-lived feature branch, then push it to GitHub when you choose.
3. Open a pull request into `develop`, review the GitHub Actions check and Vercel Preview URL, then merge when ready.
4. Open a pull request from `develop` to `main`. Review its passing check and preview, then merge it yourself to approve production.

Protect `main` in GitHub so changes must arrive through a pull request and the `Tests, lint, and build` check must pass. This is a GitHub repository setting; a workflow file cannot enforce branch protection by itself. Direct pushes to Vercel's production branch trigger production deployments, so branch protection is what prevents an accidental direct push from publishing.

## Connect Vercel

These steps require your GitHub and Vercel accounts:

1. In Vercel, choose **Add New → Project**, import the GitHub repository, and grant access to that repository.
2. Set **Root Directory** to `web`. Vercel should detect Next.js and npm from `web/package.json` and `web/package-lock.json`.
3. Set **Production Branch** to `main` and **Node.js Version** to `22.x` in Project Settings. Keep automatic Git deployments enabled. Set the install command to `npm ci` and the build command to `npm run build` so Vercel uses the same lockfile-based install and build script as the local/GitHub workflow.
4. Connect Vercel when the current `main` version is acceptable as the initial production release. A deployment from `main` is a production deployment, including the first one after connecting the project; its generated Vercel URL is available even before you connect a custom domain.
5. Push a commit to `develop` to confirm it creates a Preview deployment. A push to `main`, including a merge, creates a Production deployment. Other non-production branches also get previews by default.

No `vercel.json`, Vercel token, GitHub secret, or custom build script is needed for this app. Keep all deployment credentials in account settings if you later add integrations; never put them in repository files.

## Check deployments and fix failures

- **GitHub checks:** open the repository's **Actions** tab or the pull request's **Checks** section. `Tests, lint, and build` shows which command failed and its output. Reproduce locally from `web/` with the corresponding command above.
- **Preview and production URLs:** open the Vercel project and select **Deployments**. A successful deployment is marked **Ready** and has a **Visit** link. Preview deployments also provide a unique URL; Vercel may post it on the pull request.
- **Build errors:** open the failed deployment in Vercel and inspect **Build Logs**. Check the reported command, file, and line. First verify the project Root Directory is `web`, Node is `22.x`, and the committed lockfile matches `package.json`; then reproduce with `npm ci` and `npm run build` locally.
- **GitHub does not start a deployment:** confirm the repository is connected under Vercel Project Settings → Git, the GitHub app can access this repository, and the push went to the intended branch.
- **A preview appears as production:** verify Vercel's Production Branch setting is `main`; any commit pushed directly to that branch is production.

Vercel's **Deployments** view includes each deployment's branch, commit, status, URL, and logs. Failed builds do not replace the current successful production deployment.

## Current local check evidence

The repository was checked from `web/` on Node.js 20.15.1 and npm 9.2.0 (Node 20.15.1 meets Next.js 16.4's documented minimum of 20.9):

| Command | Result |
| --- | --- |
| `npm test` | Passed: 18 tests |
| `npm run lint` | Passed |
| `npm run build` | Passed; `/` and `/workspace` were statically generated |

The GitHub workflow uses Node.js 22 as declared in `web/.nvmrc`; the checks above were run on the currently installed Node.js 20 runtime, not Node 22. No GitHub workflow run or Vercel deployment has happened yet because there is no GitHub remote or connected Vercel project.

## References

- [Vercel Git deployments](https://vercel.com/docs/git)
- [Vercel project settings](https://vercel.com/docs/project-configuration/project-settings)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel deployment troubleshooting](https://vercel.com/docs/deployments/troubleshoot-a-build)
- [Next.js installation requirements](https://nextjs.org/docs/pages/getting-started/installation)
