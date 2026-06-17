# Chức năng "Documents" — spec để dựng lại trong web tool khác

> **Tài liệu này dùng để làm gì?**
> Đây là bản **đặc tả (spec)** đầy đủ của tính năng **Documents** — quản lý & chia sẻ tài liệu — rút ra **nguyên văn từ source code của dự án `docs-web`** (Vite + React 19 + TypeScript + Firebase). Đưa file này cho **Claude Code** (hoặc một lập trình viên), họ có thể dựng lại y hệt tính năng trong một web tool khác.
>
> Mọi đoạn code/đường dẫn được trích nguyên văn từ thư mục `src/` để dùng lại được ngay.

---

## Mục lục

1. [Documents là gì](#1-documents-là-gì)
2. [Yêu cầu nền tảng](#2-yêu-cầu-nền-tảng)
3. [Mô hình dữ liệu](#3-mô-hình-dữ-liệu)
4. [Lưu trữ & các hàm sửa đổi (mutator)](#4-lưu-trữ--các-hàm-sửa-đổi-mutator)
5. [Hai loại tài liệu](#5-hai-loại-tài-liệu)
6. [Folder & kéo-thả](#6-folder--kéo-thả)
7. [Giao diện & đường dẫn (route)](#7-giao-diện--đường-dẫn-route)
8. [Chia sẻ công khai](#8-chia-sẻ-công-khai)
9. [Những cái bẫy hay gặp](#9-những-cái-bẫy-hay-gặp)
10. [Checklist tái dựng](#10-checklist-tái-dựng)

---

## 1. Documents là gì

Documents là kho tài liệu cá nhân của ứng dụng. Mỗi tài liệu:

- **Hoặc nằm trong một folder (thư mục)**, **hoặc đứng riêng** (không thuộc folder nào).
- Thuộc một trong **2 loại** — mỗi loại lưu và hiển thị nội dung khác nhau:

| Loại (`type`) | Mô tả ngắn |
|---|---|
| `note` | Văn bản định dạng phong phú (in đậm, tiêu đề, danh sách...). Lưu dưới dạng HTML. |
| `markdown` | Văn bản viết bằng cú pháp Markdown. Lưu dưới dạng chữ thuần. |

Người dùng có thể tạo, sửa, xóa, gom vào folder (bằng kéo-thả), và **chia sẻ công khai** từng tài liệu qua một đường link ai cũng xem được.

---

## 2. Yêu cầu nền tảng

Tính năng này **cần một nền Firebase đã dựng sẵn**:

- **Authentication** — để biết `uid` của người dùng (dự án dùng đăng nhập Google).
- **Realtime Database** — để lưu toàn bộ tài liệu, folder và bản chia sẻ công khai.

➡️ **Nếu chưa có nền tảng, đọc file đi kèm `firebase-hosting-setup.md` trước.** Tài liệu đó dựng đầy đủ Hosting + Auth + Realtime Database.

> Lưu ý: dự án **không** dùng Firebase Storage. Mọi nội dung đều là chuỗi văn bản (HTML hoặc Markdown) lưu thẳng trong Realtime Database.

Ngoài ra dùng thêm:
- `react-markdown` + `remark-gfm` — để hiển thị Markdown.
- `uuid` — sinh mã định danh cho mỗi tài liệu và folder.
- `react-router-dom` — điều hướng giữa các trang.

---

## 3. Mô hình dữ liệu

Định nghĩa kiểu dữ liệu (nguyên văn từ `src/types.ts`):

```typescript
export type DocumentType = 'note' | 'markdown';

export interface Folder {
  id: string;
  name: string;
  order: number;
  createdAt: string;
}

export interface DocItem {
  id: string;
  type: DocumentType;
  title: string;
  /** note: chuỗi HTML; markdown: chuỗi Markdown thuần */
  content: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  /** true = đã bật chia sẻ công khai, có bản sao tại shared/d/{id} */
  isShared?: boolean;
  /** undefined/rỗng = tài liệu đứng riêng (không folder); có giá trị = thuộc folder đó */
  folderId?: string;
}
```

Điểm cốt lõi: **một trường `content` kiểu chuỗi (string) chứa được cả hai loại tài liệu** — chỉ là cách diễn giải khác nhau theo `type`:

| `type` | `content` chứa gì |
|---|---|
| `note` | Chuỗi **HTML** (từ trình soạn thảo rich-text). |
| `markdown` | Chuỗi **Markdown** thuần. |

- `folderId` **không bắt buộc**: bỏ trống = tài liệu đứng riêng; có giá trị = thuộc folder đó.
- `order` (số) để sắp xếp thứ tự trong danh sách (tính riêng trong từng folder).
- `isShared` (true/false): bật chia sẻ công khai (mục 8).
- **Folder** là một thực thể riêng (chỉ có tên + thứ tự), **không lồng nhau** — tài liệu thuộc folder nào nhờ trường `folderId` trỏ tới `id` của folder.

---

## 4. Lưu trữ & các hàm sửa đổi (mutator)

Tất cả thao tác đi qua một lớp lưu trữ trung tâm: `src/context/DocumentsContext.tsx`, ghi thẳng xuống Realtime Database. Dữ liệu lưu **theo từng người dùng**:

| Đường dẫn | Chứa gì |
|---|---|
| `users/{uid}/documents/{docId}` | Một tài liệu (`DocItem`). |
| `users/{uid}/folders/{folderId}` | Một folder (`Folder`). |
| `shared/d/{docId}` | Bản sao công khai của tài liệu đang chia sẻ (mục 8). |

### Lắng nghe dữ liệu thời gian thực

Context dùng `onValue` để **tự đồng bộ** mỗi khi dữ liệu đổi, rồi sắp xếp theo `order` (rồi `createdAt` để phá hòa):

```typescript
const docsRef = ref(db, `users/${uid}/documents`);
const unsubDocs = onValue(docsRef, (snap) => {
  const val = snap.val() as Record<string, DocItem> | null;
  const list = val ? Object.values(val) : [];
  list.sort(
    (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
  );
  setDocuments(list);
  setLoading(false);
});
// ... tương tự cho `users/${uid}/folders` → setFolders(...)
```

### `stateRef` — luôn đọc bản state mới nhất

Mọi mutator đọc dữ liệu hiện tại qua một `useRef`, **không đọc từ biến closure của React**:

```typescript
const stateRef = useRef<{ documents: DocItem[]; folders: Folder[] }>({
  documents: [],
  folders: [],
});
stateRef.current.documents = documents;
stateRef.current.folders = folders;
```

> **Vì sao?** Closure của React bị "đóng băng" theo lần render. Nếu lặp tạo nhiều tài liệu liền nhau trong một nhịp mà đọc từ closure thì **chỉ item cuối được lưu đúng** (vì `order` tính sai). `stateRef.current` luôn là bản mới nhất.

### Các mutator tài liệu

**`addDocument`** — tạo tài liệu mới (có thể thuộc folder):

```typescript
const addDocument = useCallback(
  (type: DocumentType, title?: string, folderId?: string): DocItem | null => {
    if (!db || !uid) return null;
    const cur = stateRef.current.documents;
    // order tính trong phạm vi cùng folder (đứng riêng = không folder).
    const scope = cur.filter((d) => (d.folderId ?? '') === (folderId ?? ''));
    const now = new Date().toISOString();
    const created: DocItem = {
      id: uuidv4(),
      type,
      title: title ?? (type === 'note' ? 'New note' : 'New document'),
      content: '',
      createdAt: now,
      updatedAt: now,
      order: scope.length,
      ...(folderId ? { folderId } : {}),
    };
    set(ref(db, `users/${uid}/documents/${created.id}`), created);
    return created;
  },
  [uid],
);
```

**`updateDocument`** — sửa tiêu đề / nội dung / loại, dùng **multi-path update** (ghi nhiều đường dẫn cùng lúc từ gốc cây dữ liệu):

```typescript
const updateDocument = useCallback(
  (id: string, updates: DocUpdates) => {
    if (!db || !uid) return;
    const cur = stateRef.current.documents.find((d) => d.id === id);
    const now = new Date().toISOString();
    const writes: Record<string, unknown> = {
      [`users/${uid}/documents/${id}/updatedAt`]: now,
    };
    for (const [k, v] of Object.entries(updates)) {
      writes[`users/${uid}/documents/${id}/${k}`] = v;
    }
    // Nếu tài liệu đang chia sẻ công khai, cập nhật luôn bản sao shared/d/{id}.
    if (cur?.isShared) {
      const merged: DocItem = { ...cur, ...updates, updatedAt: now };
      writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
    }
    update(ref(db), writes);
  },
  [uid],
);
```

(`DocUpdates` = `Partial<Pick<DocItem, 'title' | 'content' | 'type'>>`.)

**`deleteDocument`** — xóa tài liệu (và bản công khai nếu đang chia sẻ):

```typescript
const deleteDocument = useCallback(
  (id: string) => {
    if (!db || !uid) return;
    const cur = stateRef.current.documents.find((d) => d.id === id);
    const writes: Record<string, unknown> = {
      [`users/${uid}/documents/${id}`]: null,
    };
    if (cur?.isShared) writes[`shared/d/${id}`] = null;
    update(ref(db), writes);
  },
  [uid],
);
```

**`toggleShareDocument`** — bật/tắt chia sẻ công khai (chi tiết ở mục 8).

### Hai quy ước phải nhớ khi viết mutator

1. **Đọc dữ liệu hiện tại từ `stateRef.current`, KHÔNG đọc từ biến closure.** (Lý do ở trên.)
2. **Dùng multi-path update** — gom mọi thay đổi vào một object `writes` rồi gọi `update(ref(db), writes)` **một lần** từ gốc cây. Đặt giá trị `null` để xóa một nhánh. Cách này đảm bảo các thay đổi liên quan (ví dụ xóa tài liệu + xóa bản công khai của nó) xảy ra cùng lúc.

> **Không có undo/redo.** Mỗi mutator ghi thẳng xuống Firebase; không có hàng đợi hoàn tác. Đây là chủ đích để giữ lớp lưu trữ đơn giản.

### Tự lưu khi gõ (auto-save có debounce)

Trình soạn thảo `DocumentEditor` gọi `updateDocument` qua một hàm **debounce ~600ms** — chờ người dùng ngừng gõ một chút mới ghi, tránh ghi liên tục từng phím:

```typescript
const debounceSave = (updates: DocUpdates) => {
  pending.current = { ...(pending.current ?? {}), ...updates };
  window.clearTimeout(timer.current);
  timer.current = window.setTimeout(flush, 600);
};
```

Khi rời tài liệu, một `useEffect` cleanup sẽ **flush** nốt thay đổi còn treo (gọi `updateDocument` ngay) để không mất dữ liệu.

> ⚠️ **Quan trọng:** chỉ đồng bộ state cục bộ từ props khi **đổi `doc.id`** (mở tài liệu khác), **không** đồng bộ lại khi `doc.content` dội về từ Firebase — nếu không con trỏ sẽ nhảy về đầu khi đang gõ. Trong `DocumentEditor`, mảng phụ thuộc của `useEffect` đồng bộ chỉ là `[doc.id]`.

---

## 5. Hai loại tài liệu

Trình sửa hợp nhất là `src/components/DocumentEditor.tsx`: gồm ô tiêu đề, ô chọn loại (`note` / `markdown`), nút chia sẻ, nút xóa, và **vùng soạn thảo thay đổi theo `type`**.

### 5.1. `note` — văn bản định dạng phong phú (rich-text)

Dùng một trình soạn thảo `contentEditable` (một thẻ `div` cho phép gõ và định dạng trực tiếp), lưu kết quả ra **HTML** vào `content`. File: `src/components/NoteEditor.tsx`.

Đặc điểm:
- **Thanh công cụ**: in đậm/nghiêng/gạch chân/gạch ngang, tiêu đề H1–H3, đoạn thường, danh sách chấm/số, trích dẫn, khối code, chèn link, xóa định dạng. Mỗi nút gọi `document.execCommand(...)`.
- **Giữ con trỏ khi bấm nút toolbar**: thanh công cụ chặn `onMouseDown` (`e.preventDefault()`) để vùng soạn thảo không mất selection.
- **"Làm sạch" khi dán (paste hardening)**: khi dán, **lột bỏ mọi định dạng** — lấy `text/plain`, nếu trống thì parse `text/html` lấy `textContent`, và lột mã BBCode (`[b]...[/b]`, `[user=42]`...). Sau đó chèn lại bằng `document.execCommand('insertText')` để giữ vị trí con trỏ và tích hợp undo của trình duyệt.

```typescript
// Lột mã BBCode kiểu [b]...[/b], [user=42]... khi dán.
function stripBbcode(text: string): string {
  return text.replace(/\[\/?[^\]]*\]/g, '');
}

// Bỏ các thẻ inline rỗng mà trình duyệt hay để lại (vd <b></b>).
function cleanHtml(html: string): string {
  return html.replace(/<(b|i|u|strong|em|span)>\s*<\/\1>/gi, '');
}
```

- Khi lưu, gọi `cleanHtml` để **bỏ các thẻ rỗng** kiểu `<b></b>` (trình duyệt hay để lại khi bật/tắt in đậm trên vùng trống).
- **Chỉ nạp nội dung ban đầu một lần khi mount.** Vì `DocViewerPage` remount editor bằng `key={doc.id}`, nội dung được nạp lúc mount; không ghi đè `innerHTML` khi đang gõ → con trỏ không nhảy về đầu.

**Hiển thị nội dung note** (chế độ chỉ đọc, dùng ở trang chia sẻ) — file `src/components/HtmlContent.tsx`: phải **kiểm tra chuỗi có phải HTML không** rồi mới chọn cách render:

```typescript
const looksLikeHtml = /<[a-z][\s\S]*>/i.test(value);
```

> ⚠️ **Bẫy chí mạng:** **không bao giờ** đặt `dangerouslySetInnerHTML` và phần tử con (children) JSX trên **cùng một thẻ** — bản production rút gọn sẽ crash với lỗi React #60. `HtmlContent` tách hẳn hai nhánh `return`: nếu giống HTML → `dangerouslySetInnerHTML`; nếu là chữ thuần → render trực tiếp với `whiteSpace: 'pre-wrap'`.

### 5.2. `markdown` — văn bản Markdown

- **Sửa**: một ô `<textarea>` đơn giản, lưu chữ thuần vào `content`.
- **Xem**: render bằng `src/components/MarkdownPreview.tsx` dùng `react-markdown` + `remark-gfm`.
- Có hai tab **Edit / Preview** để chuyển qua lại. Khi mở một tài liệu **đã có nội dung**, mặc định mở tab **Preview**; tài liệu vừa tạo (rỗng) mở thẳng tab **Edit**.

```tsx
export default function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="muted">Chưa có nội dung. Gõ Markdown ở tab Edit.</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
```

---

## 6. Folder & kéo-thả

Folder giúp gom tài liệu thành nhóm. Toàn bộ logic folder nằm trong `DocumentsContext.tsx`; giao diện ở `DocsAllPage.tsx` (trang chủ) và `FolderPage.tsx` (trang chi tiết một folder).

### 6.1. Các mutator folder

**`addFolder`** — tạo folder mới:

```typescript
const addFolder = useCallback(
  (name?: string): Folder | null => {
    if (!db || !uid) return null;
    const cur = stateRef.current.folders;
    const now = new Date().toISOString();
    const created: Folder = {
      id: uuidv4(),
      name: name ?? 'Folder mới',
      order: cur.length,
      createdAt: now,
    };
    set(ref(db, `users/${uid}/folders/${created.id}`), created);
    return created;
  },
  [uid],
);
```

**`renameFolder`** — đổi tên folder: `set(ref(db, \`users/${uid}/folders/${id}/name\`), name)`.

**`deleteFolder`** — xóa folder **và toàn bộ tài liệu bên trong** (một multi-path update gom tất cả), kèm xóa bản công khai của những tài liệu đang chia sẻ:

```typescript
const deleteFolder = useCallback(
  (id: string) => {
    if (!db || !uid) return;
    const docs = stateRef.current.documents;
    const writes: Record<string, unknown> = {
      [`users/${uid}/folders/${id}`]: null,
    };
    for (const d of docs) {
      if (d.folderId === id) {
        writes[`users/${uid}/documents/${d.id}`] = null;
        if (d.isShared) writes[`shared/d/${d.id}`] = null;
      }
    }
    update(ref(db), writes);
  },
  [uid],
);
```

**`moveDocument`** — chuyển tài liệu vào folder, hoặc đưa ra ngoài (truyền `folderId = undefined`):

```typescript
const moveDocument = useCallback(
  (id: string, folderId: string | undefined) => {
    if (!db || !uid) return;
    const cur = stateRef.current.documents.find((d) => d.id === id);
    if (!cur) return;
    if ((cur.folderId ?? '') === (folderId ?? '')) return; // đã ở đúng chỗ
    const now = new Date().toISOString();
    // order = về cuối phạm vi folder đích.
    const scope = stateRef.current.documents.filter(
      (d) => d.id !== id && (d.folderId ?? '') === (folderId ?? ''),
    );
    const writes: Record<string, unknown> = {
      // folderId = null để gỡ trường khi đưa ra ngoài (không folder).
      [`users/${uid}/documents/${id}/folderId`]: folderId ?? null,
      [`users/${uid}/documents/${id}/order`]: scope.length,
      [`users/${uid}/documents/${id}/updatedAt`]: now,
    };
    if (cur.isShared) {
      const merged: DocItem = { ...cur, updatedAt: now };
      if (folderId) merged.folderId = folderId;
      else delete merged.folderId;
      writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
    }
    update(ref(db), writes);
  },
  [uid],
);
```

> Quy ước **đưa ra ngoài**: ghi `folderId = null` để **gỡ hẳn trường** khỏi tài liệu (Realtime Database hiểu `null` là xóa khóa đó).

### 6.2. Kéo-thả trên trang chủ (`DocsAllPage`)

Trang chủ hiển thị một lưới gồm các **ô folder** và các **tài liệu đứng riêng** (`looseDocs = documents.filter(d => !d.folderId)`). Dùng kéo-thả HTML5 native: kéo một tài liệu thả vào ô folder → gọi `moveDocument`:

```typescript
const onDragStart = (e: DragEvent, id: string) => {
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
};
const onDropToFolder = (e: DragEvent, folderId: string) => {
  e.preventDefault();
  const id = e.dataTransfer.getData('text/plain');
  setDragOver(null);
  if (id) moveDocument(id, folderId);
};
```

Ô folder đang được kéo qua sẽ nổi viền (state `dragOver` giữ `id` của folder đó). Bấm vào ô folder → điều hướng tới `/docs/folder/{id}`.

### 6.3. Trang chi tiết folder (`FolderPage`)

Tại `/docs/folder/:folderId`, người dùng:
- Xem các tài liệu trong folder (`documents.filter(d => d.folderId === folderId)`).
- **Đổi tên** folder (bấm nút ✏️ hoặc **bấm đúp** vào tên; Enter để lưu, Escape để hủy).
- **Xóa** folder — có hộp xác nhận cảnh báo số tài liệu sẽ bị xóa kèm theo.
- Tạo tài liệu mới **ngay trong folder** (`addDocument(type, undefined, folder.id)`).
- Đưa từng tài liệu **ra khỏi folder** bằng nút ⤴ (`moveDocument(d.id, undefined)`).

---

## 7. Giao diện & đường dẫn (route)

Khai báo route trong `src/App.tsx`. Trang chia sẻ công khai **nằm ngoài** lớp đăng nhập; mọi route còn lại đi qua `AppShell` (yêu cầu đăng nhập):

| Trang | Đường dẫn | Vai trò |
|---|---|---|
| `LoginPage` | (hiện khi chưa đăng nhập) | Nút đăng nhập Google. |
| `DocsAllPage` | `/docs` | Trang chủ: lưới folder + tài liệu đứng riêng, kéo-thả để gom vào folder. |
| `FolderPage` | `/docs/folder/:folderId` | Danh sách tài liệu trong một folder; đổi tên/xóa folder. |
| `DocViewerPage` | `/docs/view/document/:id` | Trình **xem/sửa** một tài liệu (bọc `DocumentEditor`). |
| `SharePage` | `/share/d/:id` | Trang xem **công khai, chỉ đọc** (ngoài lớp đăng nhập). |

```tsx
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Trang xem công khai — NẰM NGOÀI lớp đăng nhập */}
        <Route path="/share/d/:id" element={<SharePage />} />
        {/* Mọi route còn lại đi qua lớp đăng nhập */}
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </AuthProvider>
  );
}
```

`AppShell` kiểm tra trạng thái đăng nhập: đang tải → hiện "Đang tải…"; chưa đăng nhập → `LoginPage`; đã đăng nhập → bọc `DocumentsProvider` quanh các route con. Mọi đường dẫn lạ được điều hướng (`Navigate`) về `/docs`.

**Luồng tạo tài liệu điển hình:**
1. Người dùng bấm "+ New note" / "+ New markdown" → gọi `addDocument(type)` (hoặc `addDocument(type, undefined, folderId)` nếu đang trong folder).
2. Điều hướng tới `/docs/view/document/{docId}`.
3. Vì `content` còn rỗng → `DocumentEditor` mở thẳng tab Edit.
4. Người dùng gõ → `updateDocument` (debounce 600ms) tự lưu.

---

## 8. Chia sẻ công khai

Khi bật `isShared = true` cho một tài liệu, lớp lưu trữ **sao một bản** sang nhánh công khai `shared/d/{docId}` với cấu trúc `{ document, ownerId }`. Theo luật bảo mật, nhánh `shared` cho phép **bất kỳ ai đọc** (kể cả chưa đăng nhập) nhưng chỉ chủ sở hữu mới ghi:

```json
"shared": {
  ".read": true,
  "$type": {
    "$id": {
      ".write": "auth != null && (!data.exists() ? newData.child('ownerId').val() === auth.uid : data.child('ownerId').val() === auth.uid)"
    }
  }
}
```

Hàm bật/tắt chia sẻ (`toggleShareDocument`): bật thì ghi payload `{ document, ownerId }` vào `shared/d/{id}`; tắt thì ghi `null` để xóa bản công khai:

```typescript
const toggleShareDocument = useCallback(
  (id: string) => {
    if (!db || !uid) return;
    const cur = stateRef.current.documents.find((d) => d.id === id);
    if (!cur) return;
    const enabling = !cur.isShared;
    const writes: Record<string, unknown> = {
      [`users/${uid}/documents/${id}/isShared`]: enabling,
    };
    if (enabling) {
      const merged: DocItem = { ...cur, isShared: true };
      writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
    } else {
      writes[`shared/d/${id}`] = null; // tắt chia sẻ → xóa bản công khai
    }
    update(ref(db), writes);
  },
  [uid],
);
```

> **Phải đồng bộ bản công khai ở MỌI mutator chạm tới tài liệu đang chia sẻ:** `updateDocument`, `moveDocument`, `deleteDocument`, `deleteFolder` đều kiểm tra `isShared` và cập nhật/xóa `shared/d/{id}` tương ứng. Quên một chỗ là bản công khai sẽ lệch với bản gốc.

**Trang xem công khai** (`SharePage`) mount tại `/share/d/:id` (ngoài lớp đăng nhập để người chưa đăng nhập vẫn xem được). Nó đọc thẳng `shared/d/{id}` bằng `get(...)` (đọc một lần, không lắng nghe), rồi hiển thị chỉ-đọc: `note` qua `HtmlContent`, `markdown` qua `MarkdownPreview`. Có ba trạng thái: `loading`, `notfound` (tài liệu không tồn tại hoặc chủ đã ngừng chia sẻ), `error` (lỗi cấu hình/mạng).

Lấy link chia sẻ trong `DocumentEditor`: `${window.location.origin}/share/d/${doc.id}` — kèm nút Copy và nút Mở.

---

## 9. Những cái bẫy hay gặp

| Bẫy | Cách tránh |
|---|---|
| **Crash production khi render HTML** | Không đặt `dangerouslySetInnerHTML` cùng children JSX trên cùng một thẻ (lỗi React #60). Tách hai nhánh `return` như `HtmlContent`. |
| **Hiện ra thẻ `<b>` thô khi xem note** | Trước khi render, kiểm tra `/<[a-z][\s\S]*>/i.test(value)`: đúng → `dangerouslySetInnerHTML`; nếu chữ thuần → `whiteSpace: pre-wrap`. |
| **Nhập hàng loạt chỉ lưu được item cuối** | Khi lặp tạo nhiều tài liệu/folder, đọc state từ `stateRef.current`, không đọc biến closure (vì `order` sẽ tính sai). |
| **Con trỏ nhảy về đầu khi đang gõ** | Chỉ đồng bộ state cục bộ từ props khi đổi `doc.id`; `NoteEditor` chỉ nạp `innerHTML` một lần lúc mount (parent remount bằng `key={doc.id}`). |
| **Bản chia sẻ lệch với bản gốc** | Mọi mutator chạm tài liệu đang `isShared` (sửa/di chuyển/xóa/xóa folder) phải cập nhật hoặc xóa `shared/d/{id}` trong cùng multi-path update. |
| **Xóa folder mà còn sót tài liệu/bản chia sẻ con** | `deleteFolder` phải duyệt mọi tài liệu có `folderId` trùng để xóa luôn (`users/{uid}/documents/{id} = null`, kèm `shared/d/{id} = null` nếu đang chia sẻ). |
| **Đưa tài liệu ra khỏi folder không sạch** | Ghi `folderId = null` (không phải `undefined`/chuỗi rỗng) để Realtime Database **gỡ hẳn** khóa `folderId`. |

---

## 10. Checklist tái dựng

Thứ tự dựng lại tính năng từ đầu:

- [ ] **Nền tảng**: có sẵn Firebase Auth + Realtime Database (xem `firebase-hosting-setup.md`).
- [ ] **Kiểu dữ liệu**: khai báo `DocumentType`, interface `Folder` và `DocItem` (`src/types.ts`).
- [ ] **Context lưu trữ** (`DocumentsContext.tsx`): lắng nghe `users/{uid}/documents` và `users/{uid}/folders` bằng `onValue`; giữ `stateRef`; viết mutator `addDocument` / `updateDocument` / `deleteDocument` / `toggleShareDocument` / `addFolder` / `renameFolder` / `deleteFolder` / `moveDocument` (dùng multi-path update).
- [ ] **Trình soạn thảo**: `NoteEditor` (rich-text HTML + paste hardening + cleanHtml) và `MarkdownPreview` (react-markdown + remark-gfm); `HtmlContent` (render HTML chỉ-đọc, tách 2 nhánh tránh React #60).
- [ ] **Trình sửa hợp nhất** `DocumentEditor`: tiêu đề, chọn loại, nút chia sẻ + thanh link, nút xóa, auto-save debounce 600ms.
- [ ] **Trang & route**: `/docs` (lưới + kéo-thả), `/docs/folder/:folderId` (chi tiết folder), `/docs/view/document/:id` (sửa), `/share/d/:id` (công khai, ngoài lớp đăng nhập).
- [ ] **Chia sẻ công khai**: sao bản sang `shared/d/{id}` khi `isShared`; đồng bộ ở mọi mutator; `SharePage` đọc-công-khai bằng `get(...)`.
- [ ] **Luật bảo mật**: nhánh `users/{uid}` (chỉ chính chủ) và `shared` (`.read: true`, chỉ chủ ghi). Xem `database.rules.json`.

---

*Tài liệu này mô tả phần Documents tách riêng. Để hiểu nền tảng Firebase mà nó chạy trên đó, xem file đi kèm **`firebase-hosting-setup.md`**.*
