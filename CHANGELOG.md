# Changelog

## 0.2.0

- Breaking change: gỡ `listRecentChartNotes()` khỏi `PupperfishClient` để React package không mang contract host-specific của ZenLog.
- `TradeImageGalleryManager` quay lại phạm vi generic CRUD + viewer cho chart image metadata cơ bản.
- `PupperfishChatShell` thêm `renderTradeImageManager(...)` để host app có thể inject upload/gallery UX riêng cho domain-specific workflows.

## 0.1.7

- Thêm auto complete chart form cho `TradeImageGalleryManager` với combobox `Symbol/Timeframe/Role`, chart label auto-fill có thể reset về chuẩn, và note suggestions từ recent notes + template library.
- Thêm method client `listRecentChartNotes()` và ZenLog endpoint additive để chart form lấy recent note suggestions toàn cục.

## 0.1.6

- Thêm `Log Time` vào metadata panel của `PupperfishChartViewer`, dùng `dateText/timeText` của log thay vì thời điểm upload ảnh.
- Mở rộng image contracts và ZenLog mapping để chart viewer nhận được `dateText/timeText` ở cả tab `Charts` và gallery ảnh.

## 0.1.5

- Thêm prompt history recall cho `PupperfishChatShell` với `ArrowUp/ArrowDown`, restore draft đang gõ dở, và persistence qua `localStorage`.
- Bổ sung additive props `promptHistoryEnabled`, `promptHistoryStorageKey`, `promptHistoryLimit` để consumer có thể bật/tắt hoặc đổi key lưu history.

## 0.1.4

- Thêm loading UX theo phase cho `PupperfishChatShell` với bubble assistant tạm, timer, phase copy và slow-query copy.
- Đồng bộ pending query state sang `PupperfishWidgetShell` qua signal store để widget phản ánh truy vấn đang chạy.

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
