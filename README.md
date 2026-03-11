# Pupperfish

Monorepo chứa hai package publishable của Pupperfish:

- `@tungpastry/pupperfish-framework`: headless runtime/contracts
- `@tungpastry/pupperfish-react`: React UI kit + client abstractions

## Quickstart

```bash
npm install
npm run build
npm run test
npm run release:check
```

## Packages

### `@tungpastry/pupperfish-framework`

- `createPupperfishRuntime(...)`
- repository, AI, storage, queue, audit contracts
- shared Pupperfish domain types

### `@tungpastry/pupperfish-react`

- `PupperfishChatShell`
- `PupperfishWidgetShell`
- `PupperfishDock`
- `TradeImageGalleryManager`
- `createLocalStoragePupperfishUiSignalStore(...)`

## Publishing

Tag repo bằng `v*` để workflow publish lên npm public với scope `@tungpastry`.

Workflow yêu cầu secret `NPM_TOKEN`.
