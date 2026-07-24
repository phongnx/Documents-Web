# docs-web

Ứng dụng web quản lý & chia sẻ tài liệu (documents / notes) xây bằng **Vite + React 19 + TypeScript**, dùng **Firebase** (Authentication + Realtime Database) làm backend.

**🔗 Demo:** https://docs-web-df5bb2.web.app/share/f/c24b8e94-e81e-4cf8-8794-be9bfd6ed533

## Tính năng chính
- Đăng nhập bằng Google (Firebase Auth).
- Tạo / sửa / xem tài liệu — **2 loại**: `note` (rich-text, lưu HTML) và `markdown` (lưu chữ thuần, có tab Edit/Preview).
- Tự lưu khi gõ (auto-save có debounce ~600ms).
- **Folder (thư mục)**: tạo / đổi tên / xóa folder; gom tài liệu vào folder bằng **kéo-thả** trên trang chủ.
- Chia sẻ tài liệu công khai qua link cho người xem ẩn danh (chỉ đọc).
- **Bảng dự án (`/board`)**: quản lý app + task/release của team — thống kê KPI & biểu đồ, lọc task theo app/trạng thái/loại, lịch mốc release theo tuần, danh sách app đã release, và **Import JSON** để nạp dữ liệu hàng loạt.

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
| `/board` | `BoardOverviewPage` | Tổng quan bảng dự án: KPI + **card "Tiến độ tuần này"** (% tổng + mốc release + dropdown cập nhật trạng thái từng nhánh, nút **Đồng bộ từ Báo cáo ngày**) + biểu đồ + app đã release; nút Import JSON. |
| `/board/tasks` | `BoardTasksPage` | Danh sách app (gom task theo app); tìm app; thêm task nhanh. |
| `/board/tasks/:appId` | `BoardAppTasksPage` | Task của một app (hoặc `_none` = chưa gán); task **đang trong plan tuần** được đánh dấu 📌 và đưa lên đầu, còn lại sắp theo ngày release desc; lọc/sửa/xóa/chọn-nhiều-xóa. Dialog Thêm/Sửa task có nút **⛶ Mở rộng** vùng mô tả (phóng to dialog, tạm ẩn field phụ, chỉ giữ Tiêu đề + Mô tả). |
| `/board/calendar` | `BoardCalendarPage` | Lịch release, filter **Theo tuần**/**Theo tháng**. Quy tắc chung: tuần **có Plan tuần** → lấy theo plan (timeline + chi tiết Release, tự cập nhật); tuần **không có plan** (các tuần trước) → giữ data preset cũ từ `task.planDate`. Mỗi tuần gắn nhãn nguồn **Plan**/**Preset**. |
| `/board/plan` | `BoardPlanListPage` | Danh sách plan tuần; nút **Tạo plan tuần (tự động)** sinh nội dung từ dữ liệu thật (`src/lib/planAutofill.ts`): (1) carry-over nhánh **chưa done** của plan tuần trước (giữ state, bỏ % cũ), (2) fill task **đang chạy** theo app (bỏ task chưa gán app/app archived, không trùng nhánh carry-over), (3) đề xuất nhánh **release** cho task có `planDate` trong tuần + tự fill timeline theo thứ; không có gì để fill → fallback template mẫu. |
| `/board/plan/:id` | `BoardPlanEditPage` | Sửa plan tuần (project → nhánh → việc + milestone + timeline) và **export ra 2 file HTML tĩnh**. Mỗi project **gắn app** (dropdown + gợi ý theo tên) để dialog Chọn task trỏ đúng app. Mỗi dự án có nút **⛶/🗕 mở/thu gọn** (mặc định thu gọn, hiện tóm tắt nhánh; nút "Mở/Thu gọn tất cả" trên tiêu đề) và nút **▲▼ di chuyển** — trạng thái mở đi theo dự án khi di chuyển/xóa, như editor Báo cáo ngày. |
| `/board/report` | `BoardReportListPage` | Danh sách **báo cáo ngày**; chỉ báo cáo của **hôm nay** mở sẵn (toàn báo cáo quá khứ → collapse hết); tạo báo cáo hôm nay hoặc **clone từ báo cáo gần nhất**; nút **📋 Copy** text từng báo cáo ngay tại card (clipboard bị chặn → fallback tải `.txt`). |
| `/board/report/:id` | `BoardReportEditPage` | Sửa báo cáo ngày: mỗi project 1 textarea theo marker `#`/`-`/`->`/`+` (gắn app tùy chọn), nút **⛶ expand/collapse từng project** (ô tự cao theo nội dung, trạng thái đi theo project khi di chuyển/xóa), live preview, **Copy/Export text** đúng format báo cáo. |
| `/board/apps` | `BoardAppsPage` | CRUD app, hiển thị **theo nhóm (`group`) trước rồi platform**; nút **⑂ Tách flavor** (VD Weather → WF1/WF3/WF3_Radar/Weather Channel thành các app **độc lập cùng platform**, phân loại theo flavor/tiêu đề, task "All flavor" nhân cho các flavor gốc); nút Import JSON. |
| `/board/kpi` | `BoardKpiListPage` | **KPI member log**: danh sách member (KPI tháng = 100 + Σ điểm, tổng giờ), tạo member (tự mở dialog gán project) + **copy link share**, 🧩 **gán list project** (STRICT: member CHỈ chọn được project được gán khi log; **chưa gán = không log được**, trang log hiện cảnh báo), 🔁 đổi link, 🔒 khóa, xóa; nút ⚖️ quản lý **quy chế chấm điểm** (5 giai đoạn + mức điểm, sửa được). |
| `/board/kpi/:memberId` | `BoardKpiMemberPage` | Xem log của 1 member + **chấm điểm từng dòng** (popover với nút chấm nhanh theo quy chế, delta/lý do tự do), **accept nhanh điểm tự chấm** (nút ✓ từng dòng không confirm; "✓ Ngày (N)" trên block ngày và "✓ Chấp nhận tất cả (N)" trên thanh tháng — confirm kèm tổng điểm, ghi 1 lần nguyên tử), xóa dòng kèm điểm; nút **🏖 Nghỉ phép** quản lý các đợt nghỉ (min 0.5 — max 3 ngày/đợt, phần lẻ chọn buổi sáng/chiều; lưu `shared/kpi/{token}/leaves`, chỉ owner ghi, rule validate 0.5–3). Leader không sửa hộ nội dung — muốn sửa thì mở link share. |
| `/share/kpi/:token` | `KpiSharePage` | **Công khai theo link riêng (capability URL)** — member tự log task hàng ngày (Start/End time → duration tự tính, **tự trừ giờ nghỉ trưa 11:45–13:15** khi task vắt qua, giai đoạn/project/feature/task/note, nhóm theo ngày + dòng Tổng), **validate field tối thiểu khi lưu dòng** (start/end hợp lệ + giai đoạn + project + task — thiếu thì viền đỏ ô + báo lỗi, không cho lưu), **rule nghỉ phép khi log time** (ngày nghỉ hiện badge 🏖 ở block ngày kể cả chưa có dòng log; nghỉ cả ngày → không log được, nghỉ sáng/chiều → giờ log không được đè lên buổi nghỉ, mốc chia buổi 12:00), nút **⧉ nhân bản** dòng thành dòng mới (copy nội dung, giờ seed nối ca, điểm về 0), khi lưu dòng có ô **điểm TỰ CHẤM mặc định 0** (`entry.selfDelta`, badge viền đứt, member sửa được tới khi leader chấm; tổng ngày/tháng dùng điểm leader nếu có, fallback tự chấm), **dòng đã leader chấm bị khóa sửa toàn bộ** (rule chặn cả server); nút **ℹ️ Quy chế** xem preview quy chế chấm điểm (chỉ đọc, snapshot trong `meta.rules`). |

Dữ liệu lưu trong Realtime Database tại `users/{uid}/documents`, `users/{uid}/folders`, và bản chia sẻ tại `shared/d/{id}` (luật bảo mật trong `database.rules.json`). Dữ liệu bảng dự án lưu riêng tư tại `users/{uid}/pm/{apps,tasks,meta,plans,reports,members}` (không có bản chia sẻ công khai).

**KPI member log** lưu tại `shared/kpi/{token}` (token = uuid bí mật trong link share, là **nguồn dữ liệu duy nhất** — leader và member cùng đọc/ghi node này, không mirror): `meta` (ownerId, tên member, snapshot danh mục, cờ `locked`) chỉ owner ghi; `entries/{id}` ai có link đều ghi được **trừ khi** dòng đã có điểm hoặc sheet bị khóa (rule chặn phía server); `scores/{entryId}` chỉ owner ghi. Rules cũng đặt `.read` ở mức `$id`/`$token` (không phải gốc `shared`) để **không ai liệt kê được token/id** của người khác. Sau khi sửa rules phải `firebase deploy --only database`.

**Nguồn duy nhất (single-source) cho các "loại":** để dễ mở rộng & đồng bộ, mọi nhận diện/hiển thị đều đọc từ 1 nơi: category → `CATEGORY_META`/`catMeta` (gồm `label` + `badgeClass` cho HTML export + `webBadge` cho web); status → `statusMeta`/`isRunningStatus`/`isWaitingStatus`; release → `isReleaseWs(w, releaseKeys)` với `releaseKeys` lấy qua hook `useReleaseKeys()`; state nhánh → `WORKSTREAM_STATE_META`. Tránh so sánh chuỗi `'release'`/`'test'`/status tiếng Việt rải rác — thêm loại mới chỉ sửa registry tương ứng.

**Tiến độ tuần (card ở Tổng quan):** mỗi nhánh plan có `state` (`todo`/`doing`/`testing`/`done`/`blocked`) + `progress?` (%). **% tuần đo theo MỤC TIÊU tuần**: mục tiêu = nhánh **release** (category release hoặc milestone release) **hoặc** nhánh **có milestone** (release/test); `% tuần = số mục tiêu ĐẠT (state `done`) / tổng mục tiêu × 100` (binary — chỉ tính khi Xong). Nhánh ngoài mục tiêu (ads/plan/other không milestone) hiển thị và sửa được nhưng không vào % tuần. Cập nhật inline qua mutator `setWorkstreamProgress` (ghi 1 lần). Nút "Đồng bộ từ báo cáo" **tổng hợp MỌI báo cáo ngày trong tuần** (duyệt ngày tăng dần — `suggestFromReports` trong `src/lib/planProgress.ts`): mỗi nhánh lấy trạng thái **cao nhất** đạt được trong tuần (mốc done báo giữa tuần không mất khi project vắng mặt các ngày sau), `%` lấy max; nối report↔plan theo `appId` **strict** (project đã gắn app chỉ khớp cùng appId hoặc trùng tên chính xác — không khớp "chứa nhau" để tránh dính app tên gần giống như WF3/WF3_Radar) và khớp `# nhánh` ↔ `workstream.title`; luôn hỏi confirm trước khi ghi (kèm ngày báo cáo nguồn của từng gợi ý).

**Quản lý danh mục (nút ⚙️ Danh mục trên thanh nav Bảng dự án):** loại task (`meta.taskTypes`) thêm/sửa (đổi tên cascade mọi task)/xóa (chặn nếu còn task dùng); **loại nhánh plan** (`meta.planCategories`) thêm/sửa/xóa (không sửa/xóa preset release/test/ads/plan/other; đổi tên cascade category trong mọi plan) — plan editor đọc dropdown "loại nhánh" từ danh mục này; loại milestone (`meta.milestoneTypes` — mỗi loại `{key,label,isRelease}`) thêm/sửa label+cờ isRelease/xóa (không xóa 2 loại gốc `release`/`test`). Cờ `isRelease` quyết định nhánh có milestone đó có được tính là "release" ở card tiến độ và Lịch release (`releaseKeysOf`). Sync từ báo cáo dùng luật **strict theo TỪNG DÒNG MỐC**: **nhánh có milestone** chỉ nhận ✅ Xong trên dòng `->` nói về **chính mốc đó** (chứa `build/release/submit/publish/store/phát hành` hoặc khớp `milestone.text`) có done-token (hoàn thành / DONE / đã release / 100% — nhận cả dạng `(100)` thiếu `%`) và **không** có pending-token ("tester/đang check/đang fix/chưa…") **ngay trên dòng đó** — `%` trên bullet task lẻ (VD `- Build test cases (100%)`) **không** làm mốc thành Xong. Done trên dòng mốc **thắng** cụm ép test ở dòng khác (VD `- Fix bugs phát sinh` đi kèm `-> Build release v1.0 (DONE)` → ✅ Xong). Khi **không** có done trên dòng mốc: nội dung chứa **"fix bug(s) phát sinh"** / **"build test"** hoặc pending-token → 🧪 Test; có dòng `->` build/release → 🧪 Test; còn lại → 🔵 Đang làm. Không bao giờ hạ cấp trạng thái đã set tay.

**Ràng buộc liên kết Plan tuần ↔ Lịch release ↔ Task:** trang Lịch release **không có dữ liệu riêng** — nó suy trực tiếp từ `plans`. Khi tạo nhánh từ task (dialog chọn task), nhánh lưu `sourceTaskIds` để biết task nào thuộc plan; từ đó trang Task đánh dấu/ưu tiên task & app đang nằm trong **plan của tuần hiện tại** (helper `src/lib/planLinks.ts`).

## Build & Deploy

```bash
npm run build                    # build ra thư mục dist/
firebase deploy --only hosting   # deploy web lên Firebase Hosting
firebase deploy --only database  # deploy luật Realtime Database (database.rules.json)
```

Tài liệu chi tiết: [`documents-feature-spec.md`](./documents-feature-spec.md), [`firebase-hosting-setup.md`](./firebase-hosting-setup.md).
