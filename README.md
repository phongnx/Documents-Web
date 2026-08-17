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
| `/board/kpi/summary/:monthKey` | `BoardKpiSummaryPage` | **Tổng kết KPI tháng**: bảng tổng hợp task + KPI mọi member (tự tổng hợp từ log, sửa được). |
| `/share/kpisum/:id` | `KpiSummarySharePage` | Bảng tổng kết KPI tháng — share **chỉ xem** qua capability URL. |
| `/board/estimates` | `BoardEstimateListPage` | Danh sách bảng **Break task & Estimate**: tạo/xóa, tóm tắt tiến độ + Σ est/thực tế. |
| `/board/estimates/:id` | `BoardEstimateEditPage` | Editor bảng estimate của leader: duyệt & chốt / mở lại draft / khóa, sửa toàn quyền. |
| `/share/est/:id` | `EstimateSharePage` | Bảng estimate cho member — mở qua link `?t={kpiToken}` từ trang KPI riêng của participant. |

**Lưu trữ:** tài liệu tại `users/{uid}/documents`, `users/{uid}/folders` + bản chia sẻ `shared/d|f/{id}`; bảng dự án riêng tư tại `users/{uid}/pm/{apps,tasks,meta,plans,reports,members,estimates}`; KPI member log tại `shared/kpi/{token}`; bảng estimate tại `shared/est/{estId}`. Luật bảo mật trong `database.rules.json` — sửa rules phải `firebase deploy --only database`.

## Chi tiết tính năng Bảng dự án

### Tổng quan — card Tiến độ tuần
- **Plan tự sinh** (`buildAutoPlan`): carry-over nhánh chưa done tuần trước (milestone bị gỡ nếu mốc task nguồn không thuộc tuần mới) → release có planDate trong tuần (+ timeline) → task có **startDate trong tuần** (mọi status trừ done) + task đang chạy (chỉ app chưa có nhánh). **Luật "tự tick" milestone:** chỉ gắn khi mốc của task nằm trong tuần — mốc = Ngày plan (planDate), không có thì Ngày kết thúc (endDate); task loại Release nhưng mốc ngoài tuần → nhánh thường, không milestone. Dialog "Thêm nhánh từ task" trong editor dùng chung luật (truyền khoảng tuần). **Timeline release CHỈ chứa mốc của nhánh có milestone loại Release** (bước 2 chỉ nhận task loại Release; reconcile khi mở editor xóa MỌI dòng match nhánh không-Release, dòng gõ tay không match giữ nguyên); milestone khác chỉ hiện ở export bản chi tiết (mục Milestone cần theo dõi, kèm nhãn thứ khi mốc trong tuần).
- **Timeline release luôn dedup + sort theo dòng thời gian** (Thứ 2 → CN, thứ trống/lạ xếp cuối — `sortTimeline` trong `pmTypes` + `dedupTimeline` trong `planProgress`): áp ở mọi đường ghi plan (`normalizePlan` là chốt chặn cuối) + tầng hiển thị (preview, export, Lịch release) cho data cũ chưa lưu lại. Luật match/dedup dòng timeline dùng chung `matchTimelineRow`: token tên app khớp đủ + **task có version nhận cả dòng chưa có version** (dòng trần được NÂNG CẤP nhãn thay vì thêm dòng mới — hết duplicate mốc); "version" = token `vX.Y` **có dấu chấm** (tên app chứa `v2` trần như "Music v2" không bị tính là version); dòng trần chỉ gộp khi app có đúng 1 version trong timeline.
- Mỗi nhánh plan có `state` (`todo`/`doing`/`testing`/`done`/`blocked` — key `blocked` hiển thị là **⏳ Pending**, nghĩa "đang chờ") + `progress?` (%). **% tuần đo theo MỤC TIÊU tuần** (binary): mục tiêu = nhánh release hoặc nhánh có milestone; `% = số mục tiêu done / tổng mục tiêu`. Nhánh ngoài mục tiêu hiển thị/sửa được nhưng không vào %.
- Dropdown đổi trạng thái từng nhánh (ghi 1 lần qua `setWorkstreamProgress`).
- **Sync 2 chiều với page Task:** nhánh chuyển **Xong** → task nguồn (`sourceTaskIds`) tự thành "Đã hoàn thành" (ghi nguyên tử cùng plan, không revert khi hạ cấp nhánh); ngược lại **task là NGUỒN CHÂN LÝ** — đổi status/version/planDate/nội dung của task → nhánh chứa task đó ở plan tuần hiện tại/tương lai tự sync: state + % ngầm định, **text milestone** (thay version cũ → mới), **items nhánh dựng lại theo mô tả task** (`taskLines` — items sửa tay/chọn subset sẽ bị thay khi task đổi nội dung; sửa items trong plan editor không ghi ngược về task) và **dòng timeline release** tương ứng (match token app + version cũ; đổi planDate trong tuần → đổi thứ, dời ra ngoài tuần → thứ trống, không tự xóa dòng; version xóa trống → giữ nhãn cũ). Plan quá khứ giữ nguyên.
- Mục "Chi tiết theo project" **sort 3 hạng**: app có nhánh release → app có milestone khác → app không milestone.
- Nút **Đồng bộ từ Báo cáo ngày**: tổng hợp MỌI báo cáo trong tuần (duyệt ngày tăng dần, `suggestFromReports`), mỗi nhánh lấy trạng thái cao nhất đạt được (done giữa tuần không mất), % lấy max; nối report↔plan theo `appId` **strict** (không khớp "chứa nhau" — tránh WF3 dính WF3_Radar), khớp `# nhánh` ↔ `workstream.title`; luôn confirm trước khi ghi (kèm ngày nguồn).

### Plan tuần
- **Tạo tự động** (`src/lib/planAutofill.ts`), 3 bước: (1) **carry-over** nhánh chưa hoàn thành (`state !== done`, không theo %) của tuần trước, dedup nhánh trùng nội dung; (2) nhánh **release** cho task có `planDate` trong tuần — luôn fill (app tuần trước done mà có lịch tuần này vẫn vào), task đã nằm trong nhánh carry thì nâng cấp nhánh đó thành release, tự fill timeline theo thứ; (3) task **đang chạy** chỉ fill cho app chưa có nhánh nào, bỏ task trùng nhánh đã done tuần trước (sourceTaskId / milestone cùng version / items giống nhau). Không có gì để fill → fallback template mẫu.
- Nhánh sinh từ task **seed `state` theo status task** (`taskStatusToWsState`: done→done, fix→testing, đang làm→doing).
- Project trong plan sort cùng luật 3 hạng với card Tiến độ tuần.
- **Editor**: mỗi project gắn app (dropdown + gợi ý theo tên) để dialog Chọn task trỏ đúng app; nút ⛶/🗕 mở/thu gọn từng dự án (mặc định thu gọn) + ▲▼ di chuyển; Mở editor (plan tuần hiện tại/tương lai) tự **reconcile Timeline theo task nguồn** — dòng sai thứ so với `planDate` được sửa, nhánh release thiếu dòng được thêm (chỉ đổi form + đánh dấu chưa lưu, bấm Lưu mới ghi). **Timeline tự cập nhật** khi nhánh trở thành release: thêm nhánh release từ dialog Chọn task (task có `planDate` trong tuần → điền đúng thứ; ngoài tuần/chưa có lịch → thứ để trống), bật milestone, hoặc đổi loại milestone sang release (dòng `{app} {version-parse-từ-text}`, thứ trống) — chống trùng bằng `matchTimelineRow` (app nhiều release khác version vẫn ra dòng riêng; dòng chưa có version tính là "đã có", reconcile sẽ nâng cấp). **Chiều ngược lại**: tắt milestone / đổi loại release → loại khác sẽ **gỡ dòng timeline** đã auto-add (giữ dòng nếu app còn nhánh release khác cùng mốc). Sửa ô "Thứ" bằng tay → rời ô là danh sách tự sort lại theo dòng thời gian.
- **Export**: 2 nút **upload thẳng vào quản lý tài liệu** (type `html`, xem bằng iframe; không tải file — cần file `.html` thì download bên trang documents) — bản chi tiết vào folder `THSOFT - Weekly Plan` (tên `mobile_team_weekly_plan_MM-DD_to_MM-DD-YYYY`), bản release/test vào sub-folder `Tester` (`plan_team_mobile_release_test_…`); folder tự tạo nếu chưa có, re-export cùng tuần hỏi thay thế (ghi đè giữ id → share link cũ vẫn sống).
- Nút **📋 Release** trên card plan: copy app đã đạt mốc release trong tuần, phân mục đánh số — tiêu đề ưu tiên text mục Timeline (match token, không phụ thuộc thứ tự từ) + **ngày done** suy từ báo cáo ngày (done tay → "không rõ ngày"), content là items của nhánh; sắp theo Timeline, không match → theo ngày done.

### Báo cáo ngày & luật sync
- Editor: mỗi project 1 textarea theo marker `#` (nhánh) / `-` (việc) / `->` (mốc) / `+` (ghi chú), gắn app tùy chọn, ⛶ expand/collapse từng project, live preview, Copy/Export text đúng format.
- Danh sách: chỉ báo cáo **hôm nay** mở sẵn; tạo mới, clone từ báo cáo gần nhất, hoặc **📅 Tạo từ plan tuần** (nút hiện khi có plan tuần chứa hôm nay — mỗi project 1 mục, body từ nhánh **chưa done**: `# nhánh` + `- item` + `-> milestone`, đúng marker bộ sync; plan toàn done → alert không tạo); 📋 Copy ngay tại card.
- **Luật sync strict theo TỪNG DÒNG MỐC**: nhánh có milestone chỉ nhận ✅ Xong khi dòng `->` nói về chính mốc đó (chứa từ khóa build/release/submit/publish/store hoặc khớp `milestone.text`; **dòng và milestone đều có version thì phải TRÙNG version** — "v14.2 (100%)" không làm mốc v14.3 thành done) có done-token (hoàn thành/DONE/đã release/100% — nhận cả `(100)`) và **không** có pending-token ngay trên dòng; `%` trên bullet lẻ không làm mốc thành Xong; done trên dòng mốc **thắng** cụm ép test ở dòng khác ("fix bugs phát sinh"…). Không có done trên dòng mốc: pending/"build test" → 🧪 Test; có dòng `->` build/release → 🧪 Test; còn lại → 🔵 Đang làm. Không bao giờ hạ cấp trạng thái đã set tay.

### Lịch release & liên kết Plan ↔ Task
- Lịch release **không có dữ liệu riêng** — tuần có plan suy từ `plans` (timeline + nhánh release, tự cập nhật, nhãn **Plan**); tuần không có plan giữ preset từ `task.planDate` (nhãn **Preset**). Chi tiết release của tuần Plan **sort theo thứ tự Timeline** (match token app + version) kèm nhãn ngày `Thứ x · dd/mm`; nhánh không match timeline xếp cuối.
- Nhánh tạo từ task lưu `sourceTaskIds` → trang Task đánh dấu 📌/ưu tiên task & app đang nằm trong plan tuần hiện tại (`src/lib/planLinks.ts`).
- Dialog Thêm/Sửa task có nút **⛶ Mở rộng** vùng mô tả (phóng to, tạm ẩn field phụ). Trang App có **⑂ Tách flavor** (Weather → WF1/WF3/… độc lập cùng platform, task "All flavor" nhân cho các flavor gốc).

### KPI member log
- **Mô hình dữ liệu:** `shared/kpi/{token}` (token = uuid bí mật trong link share) là **nguồn dữ liệu duy nhất** — leader và member cùng đọc/ghi, không mirror. `meta` (ownerId, tên member, snapshot danh mục/project/quy chế, cờ `locked`) chỉ owner ghi; `entries/{id}` ai có link đều ghi được **trừ khi** dòng đã có điểm leader hoặc sheet khóa (rule chặn phía server); `scores`/`leaves` chỉ owner ghi. `.read` đặt ở mức `$id`/`$token` (không phải gốc `shared`) → không ai liệt kê được token/id của người khác.
- **Trang leader** (`/board/kpi`): tạo member (tự mở dialog gán project), click card member = mở trang xem & chấm, copy link, 🧩 gán project (**STRICT**: member chỉ chọn được project được gán; chưa gán = không log được), 🔁 đổi link, 🔒 khóa, ⚖️ quy chế chấm điểm (5 giai đoạn + mức điểm, sửa được).
- **Trang chấm** (`/board/kpi/:memberId`): chấm điểm từng dòng (popover nút chấm nhanh theo quy chế), **accept nhanh điểm tự chấm** (✓ từng dòng / "✓ Ngày (N)" / "✓ Chấp nhận tất cả (N)" — ghi nguyên tử), 🏖 nghỉ phép (0.5–3 ngày/đợt, phần lẻ chọn buổi; rule validate). Leader không sửa hộ nội dung log. **🐞 Rà soát reopen**: quét tháng đang chọn tìm ticket fix-bugs bị log ≥2 lần trên ≥2 ngày (gom theo estRef hoặc project + task text) mà dòng mới nhất chưa chấm → dialog từng item: ✓ Reopen = fill **−0.2** vào dòng mới nhất (reason "Bug reopen (đã rà soát)"); ✗ Bỏ qua = lưu cờ `reopenChecks/{entryId}` không hỏi lại (ticket log thêm lần mới sẽ hiện lại).
- **Trang member** (`/share/kpi/:token`): log theo Start/End time (duration tự tính, **trừ giờ nghỉ trưa 11:45–13:15**), nhóm theo ngày + dòng Tổng; **validate field tối thiểu** khi lưu (start/end hợp lệ + giai đoạn + project + task); **rule nghỉ phép** (nghỉ cả ngày không log được, nửa ngày không đè giờ nghỉ, mốc 12:00); ⧉ nhân bản dòng; **auto-lưu dòng đang sửa dở** khi bấm ＋/⧉/click dòng khác (thiếu field → báo lỗi và chặn action); **điểm tự chấm** mặc định 0 (sửa được tới khi leader chấm; tổng dùng điểm leader nếu có); dòng đã chấm bị khóa; ℹ️ xem quy chế (chỉ đọc). KPI tháng = 100 + Σ điểm. **Gắn mốc release/milestone:** dưới ô Project của dòng đang sửa có select **🚀 Mốc** (không bắt buộc — nguồn: snapshot releases + bảng estimate tham gia + mốc đã dùng trong tháng + "Khác…" nhập tay; pick task từ estimate tự gắn mốc theo bảng); lưu denormalized trên entry (`rel: {label, date?}`), dòng có mốc hiện 🚀 cạnh project, bảng Tổng kết tháng gom nhãn mốc của đoạn hiện dưới ô App. **Plan trước:** nút "＋ Plan hôm sau" thêm dòng cho ngày làm việc kế tiếp (T6/7/CN → T2; ngày tương lai không bắt giờ, block ngày có badge 📋 Plan — đến ngày thì sửa dòng điền giờ thực tế); cuối tuần (từ T6) có nút "📋 Plan tuần sau" lưu plan chung cả tuần (`weekPlans/{thứ-2}`, text tự do) hiện thành block trên bảng cho cả member lẫn leader. Header hiện **🚀 Release sắp tới** của các app được gán (snapshot `meta.releases` từ task của leader, tự refresh ở MỌI mutation chạm task: thêm/sửa/xóa/gán app/done từ plan tuần + khi gán project/leader mở trang chấm — helper `kpiReleaseWrites`): tối đa 2 mốc gần nhất, mốc trong tuần highlight, nhiều hơn thì thu gọn + nút expand; click chip → dialog chi tiết các task cùng version của release đó (badge trạng thái + mô tả).

### Break task & Estimate
- **Mô hình dữ liệu:** index riêng tư `users/{uid}/pm/estimates/{id}` (để list nhanh) + bản đầy đủ công khai `shared/est/{estId}` gồm `meta` (title/app/version/start/end/holidays/participants/state/locked, chỉ owner ghi), `groups/{gid}/tasks/{tid}` (nhóm tính năng → sub task: title/assignee/estHours/status/note) và `logs/{taskId}/{entryId} = phút` — **giờ thực tế KHÔNG nhập tay**, là Σ phút các dòng log KPI link tới sub task.
- **Vòng đời:** `draft` (member tự break task + điền est) → leader **✅ Duyệt & chốt** (`approved` — member chỉ còn sửa status/note sub task của mình, rule chặn cấu trúc phía server) → 🔒 khóa hẳn (chỉ xem). Có thể ↩ mở lại draft.
- **End tự tính:** meta chỉ cần điền Start — End trống thì hiển thị **End dự kiến** (động, không lưu): số ngày công = `ceil(max tổng est theo assignee / 8h)` + ngày nghỉ/lễ, đếm ngày làm việc T2–T6 từ Start (mọi người làm song song — người bận nhất quyết định). Điền End tay thì giá trị tay thắng.
- **UI bảng:** row sub task hiển thị dạng item chỉ đọc (title/assignee/est/thực tế/badge status/note); thêm & sửa qua **dialog lớn** (nút ✏️ cuối row — sau approve dialog chỉ enable Status + Note); trên row giữ 1 thao tác nhanh: **tick ✅ Xong** (bỏ tick → quay về Đang làm). Nhóm task cũng sửa tên/mô tả qua dialog. Task mới luôn tạo ở Todo.
- **Quyền truy cập:** member mở bảng qua chip 📐 trên trang KPI riêng (`/share/est/{id}?t={kpiToken}`) — chỉ participant thấy link; danh tính viewer suy từ token KPI (không nhúng token vào node estimate).
- **Liên kết với KPI log:** dòng log có nút **📐 Pick task từ estimate** — fill Task/Feature/Project + gắn `estRef`; giờ của dòng ghi vào `logs` (1 sub task log được nhiều dòng — làm dở, task xen kẽ vẫn cộng dồn đúng). Sửa/xóa/đổi giờ dòng log → node log sync nguyên tử.
- **Chốt done & điểm gợi ý:** khi sub task done, so **thực tế vs est** (ratio = thực tế/est): nhanh ≥20% → **+1**, đạt (đến chậm ≤10%) → **0**, chậm >10–20% → **−0.5**, chậm >20% → **−1** (khớp 2 mức trừ của quy chế nhóm Phát triển). Hai đường done hội tụ về `completeEstTask`: (a) member tick checkbox **"Hoàn thành"** trên dòng log (dòng đó là dòng chốt, nhận điểm gợi ý vào ô tự chấm), hoặc (b) tick done ngay trên bảng estimate → tự tìm dòng log mới nhất có link để điền điểm gợi ý. Dòng đã được leader chấm thì giữ nguyên (chỉ set done). Done mà chưa log giờ → cảnh báo ⚠, không tự chấm.
- **Đối chiếu khi chấm:** trang chấm của leader có panel **📐 Task estimate của member** — mỗi sub task assigned hiện est vs thực tế (xanh/đỏ) + điểm gợi ý khi done.

### Tổng kết KPI tháng
- **Mô hình:** mỗi tháng 1 bảng — index riêng tư `users/{uid}/pm/kpiSummaries/{monthKey}` → bản đầy đủ tại `shared/kpisum/{id}` (owner ghi, ai có link đọc — rule mới, sửa rules phải deploy `--only database`).
- **Tự tổng hợp** (`buildMemberRows`/`aggregateKpiSummaryMembers` trong `src/lib/kpiSummary.ts`): mỗi member có log/nghỉ phép trong tháng → các đầu mục **phân vùng theo dòng thời gian, không chồng lấn** (mỗi ngày thuộc đúng 1 đoạn): loại việc **chủ đạo** của ngày = project + category có tổng phút log lớn nhất (hòa → nhiều dòng hơn → nối mạch ngày trước); ngày liên tiếp cùng chủ đạo gộp 1 đoạn (ngày trống không cắt); item lẻ loại khác trong đoạn note rõ `- (Loại) task` cuối ô Tasks (tối đa 5), KPI + lý do ± của đoạn tính trên mọi dòng log. Cột Tasks là bản **tổng hợp ngắn gọn** (không liệt kê chi tiết): nhóm **fix bugs** mỗi feature 1 dòng `- {feature} — N ticket + M việc` (đếm cả dạng gộp "Ticket 931, 932, 933" = 3); nhóm khác `# feature (N việc):` + tối đa 3 bullet đầu (cắt ≤90 ký tự) + `- … và N việc khác`; feature trùng khác hoa/thường được gộp chung. Start/End = min/max ngày log, Ngày = số ngày làm việc T2–T6, KPI nhóm = Σ điểm ± các dòng log (leader chấm ?? tự chấm) kèm **lý do cộng/trừ** (`kpiNote` — mỗi dòng log điểm ≠ 0 một dòng: ưu tiên reason leader ghi khi chấm, không có thì lấy text task; hiện dưới badge ± ở cả trang share, sửa tay được), **KPI tháng = 100 + Σ**; cột **Ngày nghỉ** = nghỉ phép từ `leaves` (đợt vắt tháng chỉ tính phần trong tháng) + ô **Nghỉ lễ chung** điền tay ở header (áp mọi member).
- **Trang leader** (nút 📊 Tổng kết tháng ở `/board/kpi`): bảng là **bản chốt** — log đổi không tự cập nhật; sửa inline mọi ô + thêm/xóa dòng/member, 💾 Lưu (ghi cả node, có unsaved-guard), **🔄 Tổng hợp lại** (confirm, đè nội dung sửa tay — giữ Nghỉ lễ chung), **📋 Share** copy link chỉ xem.
- **Khối thống kê nhanh** trên đầu bảng (cả trang edit lẫn share): chip điểm KPI tháng từng member (xanh ≥100/đỏ <100, click cuộn tới phần member); cập nhật live khi sửa ô KPI tháng.
- **Trang share** `/share/kpisum/:id` (ngoài lớp login): render bảng read-only, không nút sửa — rule server chặn ghi.

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
