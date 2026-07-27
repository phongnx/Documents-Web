# docs-web

Ứng dụng web quản lý & chia sẻ tài liệu (documents / notes) xây bằng **Vite + React 19 + TypeScript**, dùng **Firebase** (Authentication + Realtime Database) làm backend.

**🔗 Demo:** https://documents-d0410.web.app/share/f/8ff369c1-80ed-4c6c-b1e9-4330950bd13c

## Tính năng chính
- Đăng nhập bằng Google (Firebase Auth).
- Tạo / sửa / xem tài liệu — **2 loại**: `note` (rich-text, lưu HTML) và `markdown` (lưu chữ thuần, có tab Edit/Preview).
- Tự lưu khi gõ (auto-save có debounce ~600ms).
- **Folder (thư mục)**: tạo / đổi tên / xóa folder; gom tài liệu vào folder bằng **kéo-thả** trên trang chủ.
- Chia sẻ tài liệu công khai qua link cho người xem ẩn danh (chỉ đọc).
- **Bảng dự án (`/board`)**: quản lý app + task/release của team — tổng quan tiến độ tuần & biểu đồ, **Plan tuần** (tạo tự động từ dữ liệu thật), **Báo cáo ngày** (sync tiến độ), Lịch release, **KPI member log** (page log task chia sẻ theo link riêng, member tự log & tự chấm), và **Import JSON** để nạp dữ liệu hàng loạt.

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
| `/share/d/:id` · `/share/f/:id` | `SharePage` / `SharedFolderPage` | Xem công khai, chỉ đọc (nằm **ngoài** lớp đăng nhập). |
| `/board` | `BoardOverviewPage` | Tổng quan: thống kê + card **Tiến độ tuần này** + biểu đồ + app đã release; Import JSON. |
| `/board/tasks` | `BoardTasksPage` | Danh sách app (gom task theo app); tìm app; thêm task nhanh. |
| `/board/tasks/:appId` | `BoardAppTasksPage` | Task của một app: lọc/sửa/xóa/chọn nhiều; task đang trong plan tuần ưu tiên 📌 lên đầu. |
| `/board/calendar` | `BoardCalendarPage` | Lịch release theo tuần/tháng, suy từ Plan tuần (tuần không có plan → preset `task.planDate`). |
| `/board/plan` | `BoardPlanListPage` | Danh sách plan tuần: **tạo tự động** từ dữ liệu thật, preview, nút **📋 Release** copy app đã đạt mốc. |
| `/board/plan/:id` | `BoardPlanEditPage` | Editor plan tuần (project → nhánh → việc + milestone + timeline); export 2 file HTML tĩnh. |
| `/board/report` | `BoardReportListPage` | Danh sách báo cáo ngày: tạo/clone, 📋 Copy text từng card; báo cáo hôm nay mở sẵn. |
| `/board/report/:id` | `BoardReportEditPage` | Editor báo cáo ngày theo marker `#`/`-`/`->`/`+`, live preview, Copy/Export text. |
| `/board/apps` | `BoardAppsPage` | CRUD app theo nhóm → platform; ⑂ tách flavor; Import JSON. |
| `/board/kpi` | `BoardKpiListPage` | Quản lý KPI member: tạo page log + link share, gán project, khóa/đổi link, quy chế chấm điểm. |
| `/board/kpi/:memberId` | `BoardKpiMemberPage` | Xem log 1 member: chấm điểm từng dòng, accept nhanh điểm tự chấm, quản lý nghỉ phép. |
| `/share/kpi/:token` | `KpiSharePage` | Trang log task của member — công khai theo **link riêng (capability URL)**, member tự log & tự chấm. |

**Lưu trữ:** tài liệu tại `users/{uid}/documents`, `users/{uid}/folders` + bản chia sẻ `shared/d|f/{id}`; bảng dự án riêng tư tại `users/{uid}/pm/{apps,tasks,meta,plans,reports,members}`; KPI member log tại `shared/kpi/{token}`. Luật bảo mật trong `database.rules.json` — sửa rules phải `firebase deploy --only database`.

## Chi tiết tính năng Bảng dự án

### Tổng quan — card Tiến độ tuần
- Mỗi nhánh plan có `state` (`todo`/`doing`/`testing`/`done`/`blocked`) + `progress?` (%). **% tuần đo theo MỤC TIÊU tuần** (binary): mục tiêu = nhánh release hoặc nhánh có milestone; `% = số mục tiêu done / tổng mục tiêu`. Nhánh ngoài mục tiêu hiển thị/sửa được nhưng không vào %.
- Dropdown đổi trạng thái từng nhánh (ghi 1 lần qua `setWorkstreamProgress`).
- **Sync 2 chiều với page Task:** nhánh chuyển **Xong** → task nguồn (`sourceTaskIds`) tự thành "Đã hoàn thành" (ghi nguyên tử cùng plan, không revert khi hạ cấp nhánh); ngược lại **đổi status task** → nhánh chứa task đó ở plan tuần hiện tại/tương lai tự đổi state + % ngầm định (plan quá khứ giữ nguyên).
- Mục "Chi tiết theo project" **sort 3 hạng**: app có nhánh release → app có milestone khác → app không milestone.
- Nút **Đồng bộ từ Báo cáo ngày**: tổng hợp MỌI báo cáo trong tuần (duyệt ngày tăng dần, `suggestFromReports`), mỗi nhánh lấy trạng thái cao nhất đạt được (done giữa tuần không mất), % lấy max; nối report↔plan theo `appId` **strict** (không khớp "chứa nhau" — tránh WF3 dính WF3_Radar), khớp `# nhánh` ↔ `workstream.title`; luôn confirm trước khi ghi (kèm ngày nguồn).

### Plan tuần
- **Tạo tự động** (`src/lib/planAutofill.ts`), 3 bước: (1) **carry-over** nhánh chưa hoàn thành (`state !== done`, không theo %) của tuần trước, dedup nhánh trùng nội dung; (2) nhánh **release** cho task có `planDate` trong tuần — luôn fill (app tuần trước done mà có lịch tuần này vẫn vào), task đã nằm trong nhánh carry thì nâng cấp nhánh đó thành release, tự fill timeline theo thứ; (3) task **đang chạy** chỉ fill cho app chưa có nhánh nào, bỏ task trùng nhánh đã done tuần trước (sourceTaskId / milestone cùng version / items giống nhau). Không có gì để fill → fallback template mẫu.
- Nhánh sinh từ task **seed `state` theo status task** (`taskStatusToWsState`: done→done, fix→testing, đang làm→doing).
- Project trong plan sort cùng luật 3 hạng với card Tiến độ tuần.
- **Editor**: mỗi project gắn app (dropdown + gợi ý theo tên) để dialog Chọn task trỏ đúng app; nút ⛶/🗕 mở/thu gọn từng dự án (mặc định thu gọn) + ▲▼ di chuyển; thêm nhánh từ dialog Chọn task mà task release có `planDate` trong tuần → **tự thêm dòng Timeline** "Thứ x — App vX" (đúng thứ tự thứ, chống trùng).
- Nút **📋 Release** trên card plan: copy app đã đạt mốc release trong tuần, phân mục đánh số — tiêu đề ưu tiên text mục Timeline (match token, không phụ thuộc thứ tự từ) + **ngày done** suy từ báo cáo ngày (done tay → "không rõ ngày"), content là items của nhánh; sắp theo Timeline, không match → theo ngày done.

### Báo cáo ngày & luật sync
- Editor: mỗi project 1 textarea theo marker `#` (nhánh) / `-` (việc) / `->` (mốc) / `+` (ghi chú), gắn app tùy chọn, ⛶ expand/collapse từng project, live preview, Copy/Export text đúng format.
- Danh sách: chỉ báo cáo **hôm nay** mở sẵn; tạo mới hoặc clone từ báo cáo gần nhất; 📋 Copy ngay tại card.
- **Luật sync strict theo TỪNG DÒNG MỐC**: nhánh có milestone chỉ nhận ✅ Xong khi dòng `->` nói về chính mốc đó (chứa từ khóa build/release/submit/publish/store hoặc khớp `milestone.text`) có done-token (hoàn thành/DONE/đã release/100% — nhận cả `(100)`) và **không** có pending-token ngay trên dòng; `%` trên bullet lẻ không làm mốc thành Xong; done trên dòng mốc **thắng** cụm ép test ở dòng khác ("fix bugs phát sinh"…). Không có done trên dòng mốc: pending/"build test" → 🧪 Test; có dòng `->` build/release → 🧪 Test; còn lại → 🔵 Đang làm. Không bao giờ hạ cấp trạng thái đã set tay.

### Lịch release & liên kết Plan ↔ Task
- Lịch release **không có dữ liệu riêng** — tuần có plan suy từ `plans` (timeline + nhánh release, tự cập nhật, nhãn **Plan**); tuần không có plan giữ preset từ `task.planDate` (nhãn **Preset**).
- Nhánh tạo từ task lưu `sourceTaskIds` → trang Task đánh dấu 📌/ưu tiên task & app đang nằm trong plan tuần hiện tại (`src/lib/planLinks.ts`).
- Dialog Thêm/Sửa task có nút **⛶ Mở rộng** vùng mô tả (phóng to, tạm ẩn field phụ). Trang App có **⑂ Tách flavor** (Weather → WF1/WF3/… độc lập cùng platform, task "All flavor" nhân cho các flavor gốc).

### KPI member log
- **Mô hình dữ liệu:** `shared/kpi/{token}` (token = uuid bí mật trong link share) là **nguồn dữ liệu duy nhất** — leader và member cùng đọc/ghi, không mirror. `meta` (ownerId, tên member, snapshot danh mục/project/quy chế, cờ `locked`) chỉ owner ghi; `entries/{id}` ai có link đều ghi được **trừ khi** dòng đã có điểm leader hoặc sheet khóa (rule chặn phía server); `scores`/`leaves` chỉ owner ghi. `.read` đặt ở mức `$id`/`$token` (không phải gốc `shared`) → không ai liệt kê được token/id của người khác.
- **Trang leader** (`/board/kpi`): tạo member (tự mở dialog gán project), copy link, 🧩 gán project (**STRICT**: member chỉ chọn được project được gán; chưa gán = không log được), 🔁 đổi link, 🔒 khóa, ⚖️ quy chế chấm điểm (5 giai đoạn + mức điểm, sửa được).
- **Trang chấm** (`/board/kpi/:memberId`): chấm điểm từng dòng (popover nút chấm nhanh theo quy chế), **accept nhanh điểm tự chấm** (✓ từng dòng / "✓ Ngày (N)" / "✓ Chấp nhận tất cả (N)" — ghi nguyên tử), 🏖 nghỉ phép (0.5–3 ngày/đợt, phần lẻ chọn buổi; rule validate). Leader không sửa hộ nội dung log.
- **Trang member** (`/share/kpi/:token`): log theo Start/End time (duration tự tính, **trừ giờ nghỉ trưa 11:45–13:15**), nhóm theo ngày + dòng Tổng; **validate field tối thiểu** khi lưu (start/end hợp lệ + giai đoạn + project + task); **rule nghỉ phép** (nghỉ cả ngày không log được, nửa ngày không đè giờ nghỉ, mốc 12:00); ⧉ nhân bản dòng; **auto-lưu dòng đang sửa dở** khi bấm ＋/⧉/click dòng khác (thiếu field → báo lỗi và chặn action); **điểm tự chấm** mặc định 0 (sửa được tới khi leader chấm; tổng dùng điểm leader nếu có); dòng đã chấm bị khóa; ℹ️ xem quy chế (chỉ đọc). KPI tháng = 100 + Σ điểm.

### Danh mục & nguồn duy nhất cho các "loại"
- **⚙️ Danh mục** (thanh nav): loại task (`meta.taskTypes` — đổi tên cascade, chặn xóa khi còn dùng); loại nhánh plan (`meta.planCategories` — preset không sửa/xóa, đổi tên cascade); loại milestone (`meta.milestoneTypes` `{key,label,isRelease}` — cờ `isRelease` quyết định nhánh được tính là release ở card tiến độ & Lịch release).
- **Single-source:** category → `catMeta`; status → `statusMeta`/`isRunningStatus`; release → `isReleaseWs(w, releaseKeys)` (hook `useReleaseKeys()`); state nhánh → `WORKSTREAM_STATE_META`; status task → state nhánh → `taskStatusToWsState`. Tránh so sánh chuỗi rải rác — thêm loại mới chỉ sửa registry tương ứng.

## Build & Deploy

```bash
npm run build                    # build ra thư mục dist/
firebase deploy --only hosting   # deploy web lên Firebase Hosting
firebase deploy --only database  # deploy luật Realtime Database (database.rules.json)
```

Tài liệu chi tiết: [`documents-feature-spec.md`](./documents-feature-spec.md), [`firebase-hosting-setup.md`](./firebase-hosting-setup.md).
