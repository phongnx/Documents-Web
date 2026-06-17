# docs-web

Ứng dụng web quản lý & chia sẻ tài liệu (documents / notes) xây bằng **Vite + React 19 + TypeScript**, dùng **Firebase** (Authentication + Realtime Database) làm backend.

**🔗 Demo:** https://docs-web-df5bb2.web.app/share/f/c24b8e94-e81e-4cf8-8794-be9bfd6ed533

## Tính năng chính
- Đăng nhập bằng Google (Firebase Auth).
- Tạo / sửa / xem tài liệu — **2 loại**: `note` (rich-text, lưu HTML) và `markdown` (lưu chữ thuần, có tab Edit/Preview).
- Tự lưu khi gõ (auto-save có debounce ~600ms).
- **Folder (thư mục)**: tạo / đổi tên / xóa folder; gom tài liệu vào folder bằng **kéo-thả** trên trang chủ.
- Chia sẻ tài liệu công khai qua link cho người xem ẩn danh (chỉ đọc).

## Công nghệ
- Vite 6, React 19, React Router 7, TypeScript 5
- Firebase 12 (Auth + Realtime Database — **không dùng Storage**)
- react-markdown + remark-gfm (hiển thị Markdown), uuid (sinh id)

## Chạy ở máy local

```bash
# 1. Cài dependencies
npm install

# 2. Tạo file .env từ template rồi điền config Firebase của bạn
cp .env.example .env
#   (mở .env và điền các giá trị VITE_FIREBASE_*)

# 3. Chạy dev server
npm run dev
```

Các biến môi trường cần thiết (xem `.env.example`):

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_URL
```

> Lưu ý: các giá trị `VITE_FIREBASE_*` là config phía client của Firebase (vốn lộ công khai trong web app đã build). Bảo mật dữ liệu được đảm bảo bằng Realtime Database rules trong `database.rules.json`, không phải bằng việc giấu các giá trị này.

## Setup bằng Claude Code

Claude Code là trợ lý lập trình chạy ngay trong terminal. Repo này đã có sẵn file [`CLAUDE.md`](./CLAUDE.md) — Claude Code **tự đọc** file đó khi mở project, nên nó hiểu sẵn kiến trúc, quy ước và các lệnh thường dùng mà bạn không phải giải thích lại.

### 1. Cài Claude Code

```bash
npm install -g @anthropic-ai/claude-code   # cài 1 lần cho cả máy
```

### 2. Mở project bằng Claude Code

```bash
cd "untitled folder"   # vào đúng thư mục chứa mã nguồn
claude                 # khởi động Claude Code (lần đầu sẽ hỏi đăng nhập)
```

Khi đã vào, Claude Code đọc `CLAUDE.md` để nắm: backend là Firebase Auth + Realtime Database, mọi thao tác ghi dữ liệu nằm trong `src/context/DocumentsContext.tsx`, cách build/deploy, v.v.

### 3. Nhờ Claude Code dựng môi trường

Thay vì gõ tay từng bước ở mục "Chạy ở máy local" bên trên, bạn có thể **ra lệnh bằng tiếng Việt**. Vài ví dụ gõ thẳng vào ô chat của Claude Code:

```text
Cài dependencies rồi tạo file .env từ .env.example giúp tôi
```
```text
Điền config Firebase này vào .env: <dán đoạn config từ Firebase Console>
```
```text
Chạy dev server lên giúp tôi
```
```text
Build project rồi deploy hosting lên Firebase
```

Claude Code sẽ chạy đúng các lệnh (`npm install`, `npm run dev`, `npm run build`, `firebase deploy ...`) và **hỏi xác nhận** trước khi làm những việc có thể ảnh hưởng (ví dụ deploy). Bạn vẫn nắm quyền duyệt từng bước.

> Mẹo: nếu cần tự đăng nhập (ví dụ `firebase login`, `gcloud auth login`), gõ thẳng vào ô chat với tiền tố `!`, ví dụ `!firebase login` — lệnh chạy trong phiên làm việc và kết quả hiện ngay cho Claude Code thấy.

### 4. Việc hằng ngày có thể nhờ Claude Code

- Hỏi về luồng dữ liệu, route, hay quy ước editor (đã ghi sẵn trong `CLAUDE.md`).
- Thêm tính năng / sửa lỗi — Claude Code biết giữ đúng pattern "shared mirror" (đồng bộ bản riêng tư và bản công khai) khi sửa code chạm tới chia sẻ.
- Kiểm tra build (`npm run build` = cổng type-check duy nhất của repo, vì project **không có** test runner và ESLint).

## Trang & đường dẫn (route)

| Đường dẫn | Trang | Vai trò |
|---|---|---|
| `/docs` | `DocsAllPage` | Trang chủ: lưới folder + tài liệu đứng riêng; kéo-thả để gom vào folder. |
| `/docs/folder/:folderId` | `FolderPage` | Tài liệu trong một folder; đổi tên / xóa folder. |
| `/docs/view/document/:id` | `DocViewerPage` | Xem / sửa một tài liệu. |
| `/share/d/:id` | `SharePage` | Xem công khai, chỉ đọc (nằm **ngoài** lớp đăng nhập). |

Dữ liệu lưu trong Realtime Database tại `users/{uid}/documents`, `users/{uid}/folders`, và bản chia sẻ tại `shared/d/{id}` (luật bảo mật trong `database.rules.json`).

## Build & Deploy

```bash
npm run build                    # build ra thư mục dist/
firebase deploy --only hosting   # deploy web lên Firebase Hosting
firebase deploy --only database  # deploy luật Realtime Database (database.rules.json)
```

Tài liệu chi tiết: [`documents-feature-spec.md`](./documents-feature-spec.md), [`firebase-hosting-setup.md`](./firebase-hosting-setup.md).
