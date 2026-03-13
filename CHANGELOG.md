# Changelog

## 0.1.3

- Thêm `note` vào `PupperfishImageEvidence` và truyền `note` vào chart viewer metadata của `PupperfishChatShell`.
- Sửa metadata panel của Pupperfish chart viewer để hiển thị `Note` khi chart evidence có dữ liệu này.

## 0.1.2

- Thêm quick-win chart viewer/lightbox dùng chung cho `PupperfishChatShell` và `TradeImageGalleryManager`.
- Hỗ trợ xem chart lớn với `prev/next`, `zoom in/out/reset`, `fullscreen`, metadata đọc-only, và keyboard close/navigation.

## 0.1.1

- `PupperfishChatShell` hỗ trợ `Enter` để submit và `Shift+Enter` để xuống dòng.
- Thêm `composerSubmitMode` để consumer chọn giữa `enter-to-submit` và `meta-enter-to-submit`.
- Thêm DOM-based composer test cho Enter submit, Shift+Enter, busy state và IME composition.

## 0.1.0

- Initial extraction from ZenLog monolith.
- Publishable `@tungpastry/pupperfish-framework` runtime package.
- Publishable `@tungpastry/pupperfish-react` UI package.
