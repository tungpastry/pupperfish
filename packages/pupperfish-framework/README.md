# @tungpastry/pupperfish-framework

Headless Pupperfish runtime and contracts for host applications.

## What it is
Use this package when you want the assistant orchestration layer without adopting a specific backend stack. The framework owns:
- planner mode resolution
- retrieval fan-out and evidence ranking
- grounded answer composition
- chart-image workflow hooks
- worker-cycle entry points

Your host app still provides the real repositories, AI provider, storage provider, job queue, and audit logger.

## Install
```bash
npm install @tungpastry/pupperfish-framework
```

## Minimal usage
```ts
import { createPupperfishRuntime } from "@tungpastry/pupperfish-framework";

const runtime = createPupperfishRuntime({
  repositories,
  aiProvider,
  storageProvider,
  jobQueue,
  auditLogger,
  config: {
    branding: {
      assistantName: "Pupperfish",
      productName: "My Host App",
    },
  },
});

const result = await runtime.retrieve({ query: "What changed today?" }, "admin");
```

## Key exports
- `createPupperfishRuntime`
- `PupperfishRepositories`
- `PupperfishAiProvider`
- `PupperfishStorageProvider`
- `PupperfishJobQueue`
- `PupperfishAuditLogger`
- shared types from `./types`
- utility modules from `./planner`, `./normalize`, `./embeddings`, and `./answer`

## Read next
- [Root README](../../README.md)
- [Architecture guide](../../docs/architecture.md)
- [API reference](../../docs/api-reference.md)
- [Getting started tutorial](../../docs/tutorials/getting-started.md)
