# @tungpastry/pupperfish-react

React UI kit and client abstractions for Pupperfish host applications.

## What it is
Use this package when you want ready-made UI for a grounded assistant.

It includes:
- `PupperfishChatShell`
- `PupperfishWidgetShell`
- `PupperfishDock`
- `TradeImageGalleryManager`
- `createLocalStoragePupperfishUiSignalStore(...)`

The package is UI-only. Your host app must provide a working `PupperfishClient`.

## Install
```bash
npm install @tungpastry/pupperfish-react @tungpastry/pupperfish-framework react react-dom
```

## Minimal usage
```tsx
import { PupperfishChatShell } from "@tungpastry/pupperfish-react";
import "@tungpastry/pupperfish-react/styles.css";

<PupperfishChatShell
  client={client}
  branding={{
    assistantName: "Pupperfish",
    assistantTitle: "Grounded retrieval assistant",
  }}
/>;
```

## Required client surface
Your `PupperfishClient` must implement:
- `retrieve`
- `getLog`
- `listLogImages`
- `uploadLogImage`
- `updateImage`
- `deleteImage`

## Styling
Do not forget to import the package stylesheet:
```ts
import "@tungpastry/pupperfish-react/styles.css";
```

## Read next
- [Root README](../../README.md)
- [Architecture guide](../../docs/architecture.md)
- [API reference](../../docs/api-reference.md)
- [Troubleshooting](../../docs/troubleshooting.md)
