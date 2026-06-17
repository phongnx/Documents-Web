# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Ghi chú: code và comment trong repo này viết bằng tiếng Việt — giữ nguyên phong cách đó khi sửa/thêm code.

## Lệnh thường dùng

```bash
npm run dev        # Chạy dev server (Vite)
npm run build      # tsc -b (type-check toàn bộ project references) RỒI vite build → dist/
npm run preview    # Xem thử bản đã build

firebase deploy --only hosting    # Deploy web (cần build trước, public = dist/)
firebase deploy --only database   # Deploy luật Realtime Database (database.rules.json)
```

- **Không có test runner và không có ESLint config** trong repo. `build` chính là cổng kiểm tra duy nhất (TypeScript strict qua `tsc -b`). Một số comment có `// eslint-disable-next-line` là phòng xa, không có lint thực sự chạy.
- Cần file `.env` với các biến `VITE_FIREBASE_*` (xem `.env.example`). Thiếu `.env` thì app **không crash** — xem mục null-safety bên dưới.
- Project ID Firebase mặc định: `docs-web-df5bb2` (`.firebaserc`).

## Kiến trúc tổng thể

Web app quản lý & chia sẻ tài liệu: **Vite 6 + React 19 + React Router 7 + TypeScript 5**, backend là **Firebase Auth (Google) + Realtime Database**. **Không dùng Firestore, không dùng Storage** — `storageBucket` trong config chỉ là phần thừa của template Firebase.

### Hai lớp routing (src/App.tsx)
Đây là ranh giới quan trọng nhất của app:
- Route `/share/d/:id` và `/share/f/:id[/:docId]` nằm **NGOÀI** lớp đăng nhập — người xem ẩn danh đọc được, không cần login.
- Mọi route còn lại đi qua `<AppShell>`, vốn chặn lại nếu chưa đăng nhập và chỉ bọc `<DocumentsProvider>` cho phần này. Nghĩa là các trang `/share/*` **không** có quyền truy cập `useDocuments()` — chúng tự `get()` dữ liệu công khai trực tiếp từ Realtime Database.

### Single source of truth cho mọi mutation: src/context/DocumentsContext.tsx
Toàn bộ thao tác ghi dữ liệu (tạo/sửa/xóa/di chuyển/chia sẻ document và folder) **chỉ** sống trong context này. Các component không được tự gọi Firebase write. Hai pattern bắt buộc phải hiểu:

1. **`stateRef` thay cho closure.** Các mutator đọc state qua `stateRef.current` chứ không qua biến closure. Lý do (có comment trong file): tạo nhiều item liên tiếp trong cùng một tick mà đọc closure cũ sẽ chỉ lưu được item cuối. Khi viết mutator mới, đọc state từ `stateRef.current`, đừng đọc `documents`/`folders` trực tiếp.

2. **"Shared mirror" — đồng bộ bản riêng tư và bản công khai.** Dữ liệu tồn tại 2 nơi:
   - Bản riêng: `users/{uid}/documents/{id}` và `users/{uid}/folders/{id}`
   - Bản công khai (chỉ khi đang bật chia sẻ): `shared/d/{id}` (document lẻ) và `shared/f/{id}` (cả folder + các document bên trong)

   **Mọi mutator phải giữ hai bản này khớp nhau.** Mẫu chuẩn: gom mọi đường dẫn cần ghi vào một object `writes`, rồi gọi `update(ref(db), writes)` **một lần** từ gốc cây (multi-path update, nguyên tử). Trước khi ghi, kiểm tra: document đó có `isShared` không? Nó có nằm trong folder đang `isShared` không (dùng helper `findSharedFolder`)? Nếu có, thêm đường dẫn `shared/*` tương ứng vào `writes`. Quên bước này → bản công khai bị lệch dữ liệu. Xem `updateDocument`, `moveDocument`, `deleteFolder` làm ví dụ đầy đủ nhất.

### Mô hình dữ liệu (src/types.ts)
- `DocItem.type`: `'note'` (nội dung là **chuỗi HTML**) hoặc `'markdown'` (chuỗi Markdown thuần). Cùng một trường `content` chứa hai định dạng khác nhau tùy `type`.
- `folderId` undefined/rỗng = tài liệu đứng riêng ("General", không folder). `order` được tính **trong phạm vi cùng folder**, không phải toàn cục.
- `isShared` trên cả `DocItem` và `Folder` quyết định có tồn tại bản mirror công khai hay không.

### Bảo mật (database.rules.json)
- `users/{uid}`: chỉ chủ sở hữu đọc/ghi (`auth.uid === $uid`).
- `shared`: **ai cũng đọc được** (`.read: true`); chỉ owner mới ghi được (kiểm qua `ownerId`). Vì vậy mọi payload `shared/*` đều phải kèm `ownerId: uid` — nếu không, lần ghi sau sẽ bị luật chặn.
- Config `VITE_FIREBASE_*` lộ công khai là bình thường (client config); bảo mật dựa vào rules, không phải vào việc giấu key.

### Firebase null-safety (src/lib/firebase.ts)
Nếu thiếu `.env`, mọi export (`db`, `auth`, `googleProvider`) là `null` thay vì ném lỗi. Do đó **mọi nơi dùng phải check null trước**: mutator mở đầu bằng `if (!db || !uid) return;`, component đọc dữ liệu công khai check `if (!db || !id)`. Giữ đúng quy ước này khi thêm code chạm Firebase.

## Quy ước về editor (dễ vướng nếu không biết)

- **Remount theo key.** `DocViewerPage` render `<DocumentEditor key={doc.id} ... />`. Đổi `doc.id` ⇒ React unmount/mount lại editor, reset toàn bộ state cục bộ. Đừng phá pattern này — `NoteEditor` dựa vào nó để nạp `innerHTML` ban đầu **chỉ một lần** lúc mount.
- **Tránh nhảy con trỏ.** `DocumentEditor` cố tình **không** đồng bộ `content` từ props mỗi lần Firebase dội data về (effect chỉ phụ thuộc `doc.id`), nếu không con trỏ sẽ nhảy khi đang gõ. Tương tự, `NoteEditor` chỉ set `innerHTML` lúc mount.
- **Auto-save có debounce ~600ms** trong `DocumentEditor`, và `flush()` phần còn treo khi unmount.
- **`NoteEditor`** là rich-text dựa trên `contentEditable` + `document.execCommand` (API cũ nhưng còn chạy), nội dung dán bị strip về plain text + bỏ BBCode.
- **`HtmlContent`** render nội dung `note` bằng `dangerouslySetInnerHTML` **không sanitize** — HTML do người dùng tự tạo trong editor của họ, nhưng lưu ý đây là điểm cần cân nhắc nếu mở rộng tính năng chia sẻ/nhập từ ngoài. Lưu ý kỹ thuật trong file: không đặt `dangerouslySetInnerHTML` chung thẻ với children JSX (bản production sẽ crash React #60) → đã tách 2 nhánh return.

## Tài liệu tham khảo trong repo
- `README.md` — tổng quan tính năng, bảng route, cách chạy local.
- `documents-feature-spec.md` — spec chi tiết tính năng tài liệu/folder/chia sẻ.
- `firebase-hosting-setup.md` — hướng dẫn cấu hình & deploy Firebase Hosting.
