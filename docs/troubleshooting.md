# Troubleshooting

## Build fails because `dist` is missing in smoke tests
The smoke scripts import from `packages/*/dist/index.js`.

Fix:
```bash
npm run build
npm run test
```

## React package renders without styling
You probably forgot to import the package CSS.

Fix:
```ts
import "@tungpastry/pupperfish-react/styles.css";
```

## `PupperfishChatShell` compiles but nothing works
The React package is UI-only. It does not know how to fetch your backend by itself.

Check that your `PupperfishClient` actually implements:
- `retrieve`
- `getLog`
- `listLogImages`
- `uploadLogImage`
- `updateImage`
- `deleteImage`

## Runtime throws contract errors or cannot retrieve anything
Most failures come from incomplete host-app adapters.

Check:
- repository methods return the shapes expected by framework types
- your AI provider always implements `generateAnswer`
- your storage provider returns stable image identifiers and URLs
- your job queue hooks do not throw on image/log/summary changes

## Image upload works partly, then leaves inconsistent state
The framework already attempts cleanup when repository create fails after file persistence. If you still see mismatches:
- verify your `storageProvider.deletePersistedImage(...)` really deletes temporary files
- verify `repositories.createImageForLog(...)` and `repositories.deleteImage(...)` are symmetrical
- verify your host app handles unique `imageSlot` conflicts correctly

## Widget state looks stale
`PupperfishWidgetShell` depends on a signal store, typically the local-storage implementation.

Check:
- both the widget and the full-page chat share the same signal store key/implementation
- your browser allows localStorage for the current origin
- the widget is subscribing and refreshing correctly in the host app mount lifecycle

## Release pack is missing files
Check the package `files` array and build outputs.

Common causes:
- `dist/` not built before `npm pack`
- styles not copied into `dist/` for the React package
- README paths or docs references pointing outside the packed package

## Broken documentation links after publish
Package tarballs only include package-local files. Root `docs/` are useful on GitHub, but not shipped inside npm packages.

Practical rule:
- package READMEs may link back to GitHub or to root docs in the repository
- do not assume those docs are bundled inside the published tarball
