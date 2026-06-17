# Dựng một web app trên Firebase — từ con số 0 đến deploy

> **Tài liệu này dùng để làm gì?**
> Đọc xong file này, bạn (hoặc Claude Code) có thể tự dựng một web app **React + Vite + TypeScript** chạy trên **Firebase Hosting**, có sẵn **đăng nhập bằng Google** (Authentication) và **lưu dữ liệu thời gian thực** (Realtime Database). Đây là nền tảng để chạy các tính năng như "Documents" (xem file `documents-feature-spec.md` đi kèm).
>
> Mọi đoạn code/cấu hình trong tài liệu được trích nguyên văn từ dự án `docs-web` đang chạy, nên copy là dùng được ngay.

---

## Mục lục

1. [Tổng quan & kiến trúc](#1-tổng-quan--kiến-trúc)
2. [Yêu cầu máy](#2-yêu-cầu-máy)
3. [Tạo project trên Firebase Console](#3-tạo-project-trên-firebase-console)
4. [Cấu hình biến môi trường (.env)](#4-cấu-hình-biến-môi-trường-env)
5. [Khởi tạo Firebase SDK trong code](#5-khởi-tạo-firebase-sdk-trong-code)
6. [File cấu hình firebase.json và .firebaserc](#6-file-cấu-hình-firebasejson-và-firebaserc)
7. [Luật bảo mật (Security Rules)](#7-luật-bảo-mật-security-rules)
8. [Build & Deploy](#8-build--deploy)
9. [Bảng lệnh hay dùng](#9-bảng-lệnh-hay-dùng)
10. [Sự cố thường gặp & cách xử lý](#10-sự-cố-thường-gặp--cách-xử-lý)
11. [Checklist hoàn thành](#11-checklist-hoàn-thành)

---

## 1. Tổng quan & kiến trúc

Hình dung đơn giản như sau:

- Bạn viết code web bằng **React** (giao diện) + **Vite** (công cụ build, đóng gói code).
- Khi chạy lệnh `npm run build`, Vite gom toàn bộ code thành một thư mục tĩnh tên là **`dist/`** — chỉ gồm các file `.html`, `.js`, `.css`. Đây là "web đã đóng gói".
- **Firebase Hosting** chỉ làm một việc: đưa thư mục `dist/` đó lên internet, cho người dùng truy cập qua một địa chỉ kiểu `https://tên-site.web.app`.

Ngoài Hosting (chỉ chứa file tĩnh), web còn cần 2 dịch vụ khác của Firebase để "có hồn":

| Dịch vụ | Vai trò (giải thích dễ hiểu) |
|---|---|
| **Authentication** | Cho người dùng đăng nhập (ở đây dùng tài khoản Google). Mỗi người có một mã định danh riêng gọi là `uid`. |
| **Realtime Database** | Một kho dữ liệu dạng cây (giống một file JSON khổng lồ) lưu trên mây, tự đồng bộ tức thời giữa các máy. Dùng để lưu toàn bộ nội dung người dùng tạo ra (tài liệu, folder, bản chia sẻ). |

> **Dự án này không dùng Firebase Storage.** Mọi nội dung tài liệu đều là chuỗi văn bản (HTML hoặc Markdown) lưu thẳng trong Realtime Database, nên không cần kho file riêng.

> **Điểm quan trọng về "rewrites":**
> Web này là kiểu **SPA** (Single Page Application — toàn bộ web là một trang `index.html` duy nhất, việc chuyển trang do JavaScript xử lý chứ không tải lại từ server). Vì thế khi người dùng gõ thẳng một địa chỉ con như `https://tên-site.web.app/docs/abc`, server phải trả về `index.html` để JavaScript tự đọc đường dẫn và hiển thị đúng trang. Cấu hình `rewrites` (mục 6) làm chính việc này. **Thiếu nó thì gõ link con sẽ ra lỗi 404.**

---

## 2. Yêu cầu máy

Cần cài sẵn:

- **Node.js phiên bản ≥ 20** và **npm** (npm đi kèm Node). Kiểm tra: `node -v`.
- **Git** (để quản lý mã nguồn).
- **Firebase CLI** — công cụ dòng lệnh của Firebase. Cài một lần cho toàn máy:

```bash
npm install -g firebase-tools
```

Kiểm tra đã cài được chưa:

```bash
firebase --version
```

---

## 3. Tạo project trên Firebase Console

Làm trên trình duyệt, tại https://console.firebase.google.com:

1. **Tạo project**: bấm **Add project** → đặt tên (ví dụ `my-web-app`) → bấm tiếp đến khi xong. Firebase sẽ tự sinh ra một **Project ID** (ví dụ `my-web-app-12345`) — nhớ ID này.

2. **Đăng ký Web app để lấy config**: trong project, bấm biểu tượng **Web** (`</>`) → đặt tên app → **Register app**. Màn hình sẽ hiện một đoạn `firebaseConfig` gồm các giá trị `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`. **Copy lại các giá trị này** (lát nữa dán vào file `.env`).

3. **Bật Authentication**: vào menu **Authentication** → **Get started** → tab **Sign-in method** → bật **Google** → Save.

4. **Tạo Realtime Database**: vào menu **Realtime Database** → **Create Database** → chọn vùng (US / Châu Âu / Singapore tùy bạn) → chọn **Start in locked mode** (an toàn, lát nữa ta sẽ deploy luật riêng). Sau khi tạo, copy **Database URL** (dạng `https://my-web-app-12345-default-rtdb.firebaseio.com`).

---

## 4. Cấu hình biến môi trường (.env)

"Biến môi trường" là cách lưu các thông tin cấu hình (như khóa API) **bên ngoài code**, để không phải viết cứng vào mã nguồn và không đẩy lên Git.

Trong dự án có sẵn một file mẫu tên `.env.example`. Nội dung của nó:

```bash
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=your_database_url
```

**Cách làm:** copy file mẫu thành file thật tên `.env`, rồi điền giá trị lấy ở bước 3.

```bash
cp .env.example .env
```

Bảng đối chiếu — mỗi biến lấy giá trị từ đâu:

| Biến trong `.env` | Lấy từ đâu trên Console |
|---|---|
| `VITE_FIREBASE_API_KEY` | `firebaseConfig.apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `firebaseConfig.authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `firebaseConfig.projectId` (chính là Project ID) |
| `VITE_FIREBASE_STORAGE_BUCKET` | `firebaseConfig.storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `firebaseConfig.messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `firebaseConfig.appId` |
| `VITE_FIREBASE_DATABASE_URL` | Database URL ở bước 4 (Realtime Database) |

> `VITE_FIREBASE_STORAGE_BUCKET` là một trường chuẩn trong `firebaseConfig` nên vẫn được khai báo, dù dự án này không dùng Storage. Cứ điền đúng giá trị Console đưa ra để config đầy đủ.

> **Vì sao tên biến phải bắt đầu bằng `VITE_`?**
> Vite (công cụ build) chỉ "nhìn thấy" và nhúng vào web những biến môi trường có tiền tố `VITE_`. Đặt tên khác sẽ không đọc được. Trong code, đọc biến bằng cú pháp `import.meta.env.VITE_...` (xem mục 5).

> **Lưu ý bảo mật:** File `.env` **không được commit lên Git** (thường đã có sẵn trong `.gitignore`). Mỗi người/môi trường giữ file `.env` riêng. Riêng `apiKey` của Firebase không phải bí mật tuyệt đối (nó sẽ nằm trong code chạy ở trình duyệt), nhưng nên vào Console bật giới hạn (API restrictions) cho an toàn.

---

## 5. Khởi tạo Firebase SDK trong code

Tạo một file `src/lib/firebase.ts` để khởi tạo Firebase một lần và dùng chung cho cả app. Nội dung nguyên văn:

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

// Chỉ khởi tạo Firebase khi có đủ config (tránh app crash trắng màn hình
// khi thiếu file .env). Nếu chưa cấu hình, mọi export là null và nơi dùng
// phải kiểm tra null trước (vd: if (!db) return;).
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = isConfigured ? getAuth(app!) : null;
export const db = isConfigured ? getDatabase(app!) : null;
export const googleProvider = isConfigured ? new GoogleAuthProvider() : null;
export const firebaseReady = isConfigured;
```

**Giải thích cách hoạt động:**

- `initializeApp` khởi động kết nối tới Firebase bằng config ở trên.
- `getAuth`, `getDatabase` lấy ra 2 dịch vụ tương ứng (đăng nhập, database).
- `googleProvider` là "nút đăng nhập Google" để dùng với `signInWithPopup` (mở cửa sổ đăng nhập Google).
- `firebaseReady` (= `isConfigured`) để giao diện biết đã cấu hình Firebase chưa, từ đó hiện cảnh báo "chưa cấu hình `.env`" và khóa nút đăng nhập khi cần.

> **Mẹo quan trọng — pattern xuất ra `null`:**
> Biến `isConfigured` kiểm tra xem đã có `apiKey` và `projectId` chưa. Nếu **chưa** (ví dụ quên tạo file `.env`), tất cả `app`/`auth`/`db`/`googleProvider` sẽ là `null` thay vì làm cả app **crash trắng màn hình**. Đổi lại, **mọi nơi dùng các biến này đều phải kiểm tra null trước** (ví dụ `if (!db) return;`). Đây là một thói quen tốt nên giữ.

Cài thư viện Firebase cho dự án (chỉ cần một gói duy nhất, nó gói sẵn auth/database bên trong):

```bash
npm install firebase
```

> Dự án dùng `firebase` phiên bản `^12`. Bạn không cần cài riêng từng gói con như `@firebase/auth` — chúng đã nằm trong gói `firebase`.

---

## 6. File cấu hình firebase.json và .firebaserc

### 6.1. `firebase.json` — đặt ở thư mục gốc dự án

File này nói cho Firebase CLI biết: hosting lấy file ở đâu, luật database nằm ở file nào. Nội dung nguyên văn:

```json
{
  "database": {
    "rules": "database.rules.json"
  },
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

Giải thích từng phần:

- **`hosting.public`** = `"dist"` — thư mục chứa web đã build (Vite mặc định build ra `dist/`). Firebase sẽ đẩy toàn bộ nội dung thư mục này lên.
- **`hosting.ignore`** — danh sách file **không** đẩy lên: chính file `firebase.json`, mọi file ẩn (`.env`, `.gitignore`...), và `node_modules`.
- **`hosting.rewrites`** — quy tắc SPA đã nói ở mục 1: **mọi** đường dẫn (`"source": "**"`) đều trả về `/index.html`.
- **`database.rules`** — trỏ tới file luật bảo mật của Realtime Database (mục 7).

> Ở đây không khai báo `hosting.site`, nên Firebase dùng **site mặc định** của project (địa chỉ trùng tên project, ví dụ `https://my-web-app-12345.web.app`). Nếu muốn dùng một site khác, tạo bằng `firebase hosting:sites:create ten-site` rồi thêm `"site": "ten-site"` vào khối `hosting`.

### 6.2. `.firebaserc` — đặt ở thư mục gốc dự án

File này ghi nhớ Project ID mặc định để khỏi phải gõ lại mỗi lần. Nội dung (của dự án `docs-web`):

```json
{
  "projects": {
    "default": "docs-web-df5bb2"
  }
}
```

Thay `docs-web-df5bb2` bằng Project ID thật của bạn. Có thể tạo file này tự động bằng:

```bash
firebase login          # đăng nhập tài khoản Google quản lý Firebase
firebase use --add      # chọn project và đặt alias "default"
```

---

## 7. Luật bảo mật (Security Rules)

Luật bảo mật quyết định **ai được đọc/ghi dữ liệu nào**. Không có luật đúng thì dữ liệu hoặc bị khóa hết, hoặc mở toang cho bất kỳ ai sửa.

Dự án chỉ dùng Realtime Database nên chỉ có **một file luật**: `database.rules.json`.

Một vài khái niệm để đọc luật dễ hơn:

- `auth` — thông tin người đăng nhập. `auth != null` nghĩa là "đã đăng nhập".
- `auth.uid` — mã định danh của người đang đăng nhập.
- `$uid`, `$type`, `$id` — "biến đại diện" cho một mảnh đường dẫn bất kỳ (ví dụ `users/$uid` khớp với mọi user).
- `data` = dữ liệu **hiện có**; `newData` = dữ liệu **muốn ghi vào**.

Đây là toàn bộ file luật của dự án — đúng nhu cầu "mỗi người một kho riêng" + một nhánh chia sẻ công khai:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "shared": {
      ".read": true,
      "$type": {
        "$id": {
          ".write": "auth != null && (!data.exists() ? newData.child('ownerId').val() === auth.uid : data.child('ownerId').val() === auth.uid)"
        }
      }
    }
  }
}
```

Ý nghĩa các nhánh:

| Nhánh dữ liệu | Ý nghĩa |
|---|---|
| `users/{uid}` | Dữ liệu riêng của từng người (tài liệu + folder). Chỉ chính chủ (`auth.uid === $uid`) mới đọc/ghi. |
| `shared/{type}/{id}` | Nhánh **chia sẻ công khai**: `".read": true` nghĩa là **ai cũng đọc được, không cần đăng nhập** — dùng cho link chia sẻ. Nhưng chỉ chủ sở hữu (`ownerId`) mới ghi/sửa/xóa được. Trong app, `type` luôn là `d` (document), tức `shared/d/{docId}`. |

> Logic ghi của nhánh `shared`: nếu bản ghi **chưa tồn tại** (`!data.exists()`) thì người tạo phải đặt `ownerId` đúng bằng `auth.uid` của mình; nếu **đã tồn tại** thì chỉ đúng chủ cũ (`data.child('ownerId').val()`) mới được sửa/xóa. Nhờ vậy không ai chiếm được bản chia sẻ của người khác.

---

## 8. Build & Deploy

Toàn bộ quy trình từ code tới web online:

```bash
# 1. Đăng nhập Firebase (chỉ làm lần đầu trên máy)
firebase login

# 2. Chọn project (nếu chưa có .firebaserc)
firebase use --add        # chọn project, đặt alias "default"

# 3. Chạy thử ở máy (dev server, tự cập nhật khi sửa code)
npm run dev               # mở http://localhost:5173

# 4. Đóng gói web cho production
npm run build             # tạo thư mục dist/

# 5. Đưa web lên Firebase Hosting
firebase deploy --only hosting

# 6. Đưa luật bảo mật lên (làm khi tạo mới hoặc sau khi sửa luật)
firebase deploy --only database     # đẩy database.rules.json
```

Sau khi `deploy --only hosting` xong, terminal sẽ in ra địa chỉ web dạng `https://ten-site.web.app`. Mở thử là thấy.

> **Một bước dễ quên:** vào **Authentication → Settings → Authorized domains** và thêm địa chỉ `ten-site.web.app` vào danh sách. Nếu không, nút đăng nhập Google ở bản online sẽ báo lỗi domain không được phép.

Về các script trong `package.json`:

| Lệnh | Việc nó làm |
|---|---|
| `npm run dev` | Chạy server phát triển tại `http://localhost:5173`, tự cập nhật khi bạn sửa code (HMR). |
| `npm run build` | Kiểm tra kiểu TypeScript (`tsc -b`) rồi đóng gói (`vite build`) ra `dist/`. |
| `npm run preview` | Xem thử bản đã build ngay trên máy (giống production). |

> **Về `vite.config.ts`:** dự án dùng cấu hình tối thiểu — chỉ một plugin `@vitejs/plugin-react` để Vite hiểu cú pháp JSX của React:
> ```typescript
> import { defineConfig } from 'vite';
> import react from '@vitejs/plugin-react';
>
> export default defineConfig({
>   plugins: [react()],
> });
> ```

---

## 9. Bảng lệnh hay dùng

```bash
# Phát triển & build
npm run dev                              # chạy dev server
npm run build                            # build production ra dist/
npm run preview                          # xem thử bản build

# Firebase CLI
firebase login                           # đăng nhập
firebase projects:list                   # liệt kê các project bạn có quyền
firebase use <project-id>                # chuyển sang project khác
firebase hosting:sites:create <name>     # tạo một hosting site mới
firebase deploy --only hosting           # deploy web
firebase deploy --only database          # deploy luật Realtime Database
firebase deploy                          # deploy tất cả cùng lúc
```

---

## 10. Sự cố thường gặp & cách xử lý

| Triệu chứng | Nguyên nhân & cách xử lý |
|---|---|
| Web trắng màn hình, console báo lỗi liên quan Firebase `null` | Thiếu file `.env` hoặc điền sai biến → `isConfigured` thành `false` nên SDK xuất ra `null`. Kiểm tra lại `.env` đủ 7 biến và đúng giá trị. Nhớ **khởi động lại `npm run dev`** sau khi sửa `.env`. |
| Trang đăng nhập hiện cảnh báo "Chưa cấu hình Firebase" | `firebaseReady` đang là `false` (thiếu `apiKey`/`projectId` trong `.env`). Điền đủ rồi chạy lại dev server. |
| Gõ thẳng link con (vd `/docs/abc`) ra **404** ở bản online | Thiếu hoặc sai `rewrites` trong `firebase.json`. Đảm bảo có `{"source": "**", "destination": "/index.html"}` rồi deploy lại hosting. |
| Đăng nhập Google ở bản online báo lỗi domain | Chưa thêm `ten-site.web.app` vào **Authorized domains** trong Authentication. |
| `firebase deploy --only database` báo **PERMISSION_DENIED** khi app đọc/ghi | Luật chưa được deploy hoặc viết sai. Chạy lại `firebase deploy --only database` và kiểm tra `database.rules.json`. |

---

## 11. Checklist hoàn thành

Đọc xong tài liệu này, bạn đã có thể:

- [ ] Tạo project Firebase + bật Authentication (Google) và Realtime Database.
- [ ] Tạo file `.env` với đủ 7 biến `VITE_FIREBASE_*`.
- [ ] Tạo `src/lib/firebase.ts` khởi tạo SDK (có pattern xuất `null` an toàn).
- [ ] Tạo `firebase.json` (đặc biệt có `rewrites` cho SPA) và `.firebaserc`.
- [ ] Viết và deploy `database.rules.json`.
- [ ] `npm run build` → `firebase deploy --only hosting` → web online tại `https://ten-site.web.app`.
- [ ] Thêm domain vào Authorized domains để đăng nhập chạy được ở bản online.

➡️ **Bước tiếp theo:** để dựng một tính năng thực tế (quản lý tài liệu, có folder và chia sẻ công khai), xem file đi kèm **`documents-feature-spec.md`**.
