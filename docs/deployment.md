# Deployment and release guide

For `pupperfish`, “deployment” means **building, validating, packing, and publishing the library packages**. This repo does not deploy a standalone server.

## Local release workflow
Run from the repo root:

```bash
npm install
npm run lint
npm run build
npm run test
npm run release:check
```

## What `release:check` validates
`npm run release:check` performs the full pre-publish path:
- workspace lint
- workspace build
- framework smoke test
- react smoke test
- `npm pack` for both publishable packages

This is the closest thing to a release gate in the current repo.

## Package outputs
### `@tungpastry/pupperfish-framework`
Expected publishable files:
- `dist/`
- `README.md`
- `LICENSE`
- `package.json`

### `@tungpastry/pupperfish-react`
Expected publishable files:
- `dist/`
- `README.md`
- `LICENSE`
- `package.json`
- `dist/styles.css`

## Publish expectations
The root README states that the intended public publishing flow is:
- tag the repo with `v*`
- publish both workspaces to npm under the `@tungpastry` scope
- provide `NPM_TOKEN` to the publishing workflow or release environment

## Host-app integration checklist
Before calling the integration complete, verify:
- your host app implements all required framework contracts
- your React app passes a working `PupperfishClient`
- `@tungpastry/pupperfish-react/styles.css` is imported where the UI is mounted
- your storage provider can build public download URLs for images
- your job queue can react to `onLogsChanged`, `onImageChanged`, and `onSummaryChanged`
- your audit logger stores both success and error retrieval events

## Recommended release checklist
- bump package versions intentionally
- ensure package READMEs match the current public API
- keep examples aligned with actual exports
- run `npm run release:check`
- inspect the generated tarballs from `npm pack`
- verify that no docs link points to missing files

## What this repo does not deploy
Do not document or expect these from this repo itself:
- a web server
- database migrations
- local auth/session infrastructure
- bundled LLM services
- bundled object storage or disk layout

Those belong to the host app that consumes the packages.
