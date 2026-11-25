// Dashboard Manager: tổng hợp việc của tuần theo KHUNG APP CỐ ĐỊNH. Một nguồn dữ liệu duy nhất
// (buildDashboardData) cho cả tab Manager trên web lẫn file HTML tĩnh upload sang Docs (folder
// General) → 2 nơi luôn khớp nhau. Chỉ đọc dữ liệu, không ghi gì vào plan / task.
// Quy tắc (yêu cầu Manager, chốt 25/11/2026):
// - Giữ khung app theo thứ tự cố định (meta.dashboardRows, thiếu thì DEFAULT_ROWS).
// - "Việc tuần này" CHỈ lấy từ plan tuần: mọi nhánh đều ghi, nhánh đã xong hiện
//   "✅ Xong mục tiêu tuần". Task ngoài plan (kể cả đang chạy) không tính là việc tuần này.
// - Dự án có trong báo cáo ngày nhưng không có trong plan → ghi vào dòng của app đó (nhãn
//   "Chỉ có trong báo cáo ngày"); không thuộc dòng nào → mục "Other tasks".
// - N/A chỉ khi app không có nhánh plan nào và không được báo cáo ngày nhắc tới.
// - 🕒 Dự kiến: task chưa bắt đầu ngoài plan có ngày sau tuần này hoặc chưa có ngày, và nhánh
//   chưa xong của plan các tuần sau.
// - Việc không thuộc dòng nào (app ngoài khung, dự án nhập tay) → mục "Other tasks".
import {
  catMeta,
  isReleaseWs,
  statusMeta,
  WORKSTREAM_STATE_META,
  workstreamPct,
  type AppItem,
  type DailyReport,
  type DashboardRow,
  type PlanProject,
  type PlanWorkstream,
  type TaskItem,
  type WeeklyPlan,
  type WorkstreamState,
} from '../pmTypes';
import { escHtml as esc, renderItemsHtml } from './planItems';
import { msWithVersion } from './planExport';
import { reportsInWeek, suggestFromReports, wsMilestoneDate } from './planProgress';
import { normName } from './pmText';
import { parseBody } from './reportFormat';
import { addDays, mondayOf, weekdayVN } from './pmDates';

/** Folder đích trên Docs (folder "General" Manager chỉ định). */
export const DASHBOARD_FOLDER_ID = '572bd8e3-01ec-49de-a057-9717ce246d5b';
/** Tên cố định → mỗi lần export ghi đè cùng 1 tài liệu, link chia sẻ không đổi. */
export const DASHBOARD_DOC_TITLE = 'Dashboard Apps Mobile Team';
export const DASHBOARD_OTHER_LABEL = 'Other tasks';
/** Nhãn trạng thái nhánh đã xong trên dashboard. */
export const DASH_DONE_LABEL = 'Xong mục tiêu tuần';
/** Số dòng tối đa của cột "Cập nhật mới nhất" mỗi app. */
const LATEST_MAX_LINES = 4;

// Khung mặc định theo thứ tự Manager đưa: nhãn + các tên app có thể khớp (khớp tên app
// chính xác sau khi normName, lấy tên đầu tiên có app chưa archive).
const DEFAULT_ROWS: { label: string; names: string[] }[] = [
  { label: 'WF1', names: ['WF1'] },
  { label: 'WF3', names: ['WF3'] },
  { label: 'Radar', names: ['WF3_Radar', 'Radar'] },
  { label: 'Music 1', names: ['Music v1', 'Music1'] },
  { label: 'Music 2', names: ['Music v2', 'Music2'] },
  { label: 'Applock', names: ['AppLock2', 'AppLock'] },
  { label: 'Fingerprint', names: ['AppLock Fingerprint', 'Fingerprint'] },
  { label: 'VPN', names: ['Android VPN', 'VPN'] },
  { label: 'Email', names: ['Email Client', 'Email'] },
  { label: 'Outlook', names: ['Outlook, Hotmail', 'Outlook'] },
  { label: 'Calc 1', names: ['Calc1'] },
  { label: 'Calc 2', names: ['Calc2'] },
  { label: 'QRCode', names: ['QRCode'] },
  { label: 'Period', names: ['Period Tracker', 'Period'] },
  { label: 'ManyAI', names: ['Android ManyAI', 'ManyAI'] },
  { label: 'Note Diary', names: ['Note Diary'] },
  { label: 'Android Sincos Calculator', names: ['Android SinCos Calculator'] },
  { label: 'iOS Sincos Calculator', names: ['iOS SinCos Calculator'] },
  { label: 'iOS Weather365', names: ['iOS Weather365'] },
  { label: 'iOS ManyAI', names: ['iOS ManyAI'] },
  { label: 'iOS VPN', names: ['iOS VPN'] },
  { label: 'Web Sincos Calculator', names: ['FL CalcAI - Web', 'Web SinCos Calculator'] },
];

/** Khung mặc định đã gán app theo tên (app archive không được gán). */
export function defaultDashboardRows(apps: AppItem[]): DashboardRow[] {
  const live = apps.filter((a) => !a.archived);
  return DEFAULT_ROWS.map(({ label, names }) => {
    const hit = names
      .map((n) => live.find((a) => normName(a.name) === normName(n)))
      .find((a): a is AppItem => !!a);
    return { label, appIds: hit ? [hit.id] : [] };
  });
}

/** Khung đang dùng: đã cấu hình trong meta thì lấy, chưa thì khung mặc định. */
export function resolveDashboardRows(
  saved: DashboardRow[] | undefined,
  apps: AppItem[],
): DashboardRow[] {
  return saved && saved.length ? saved : defaultDashboardRows(apps);
}

/** Plan rỗng của tuần chứa `today` (T2–T6) — để tab Manager vẫn dựng được khi tuần chưa có plan. */
export function emptyWeekPlan(today: string): WeeklyPlan {
  const weekStart = mondayOf(today);
  return {
    id: '',
    title: '',
    description: '',
    weekStart,
    weekEnd: addDays(weekStart, 4),
    projects: [],
    timeline: [],
    order: 0,
    createdAt: '',
    updatedAt: '',
  };
}

// ---------- Dữ liệu ----------

export interface DashItem {
  /** App của nhánh (task nguồn, thiếu thì app của dự án); '' = dự án nhập tay. */
  appId: string;
  project: string;
  title: string;
  /** Nhãn Loại nhánh. */
  category: string;
  release: boolean;
  /** Mục tiêu: text milestone kèm version; '' = nhánh chưa có milestone. */
  target: string;
  state: WorkstreamState;
  pct: number;
  /** Ngày mốc ISO ('' = không rõ). */
  date: string;
  /** Đầu việc của nhánh — HTML đã escape (renderItemsHtml). */
  itemsHtml: string;
  /** Task nguồn của nhánh (để tab Manager mở sửa). */
  taskIds: string[];
}
export interface DashFuture {
  /** Task nguồn (task chưa bắt đầu); '' = nhánh của plan tuần sau. */
  taskId: string;
  /** App của mục ('' = không rõ) — dialog Dự kiến gắn nhãn app khi dòng khung có nhiều app. */
  appId: string;
  /** Đầu việc của nhánh plan tuần sau (HTML đã escape); task thì '' (mô tả lấy từ task). */
  itemsHtml: string;
  title: string;
  /** ISO — ngày dự kiến; '' = chưa có ngày. */
  date: string;
  note: string;
}
export interface DashRowData {
  label: string;
  /** App đã gán (đã bỏ app archive / đã xoá); rỗng = dòng chưa gán app / dự án nhập tay. */
  appIds: string[];
  appNames: string[];
  items: DashItem[];
  future: DashFuture[];
  latest: { date: string; lines: string[] } | null;
  /** Không có nhánh plan nhưng báo cáo ngày trong tuần có nhắc tới. */
  reportOnly: boolean;
}
export interface DashboardData {
  plan: WeeklyPlan;
  generatedAt: Date;
  rows: DashRowData[];
  other: DashRowData[];
  reportCount: number;
  stats: {
    activeRows: number;
    totalRows: number;
    goalDone: number;
    goalTotal: number;
    releaseDone: number;
    releaseTotal: number;
    future: number;
  };
}

interface BuildInput {
  plan: WeeklyPlan;
  plans: WeeklyPlan[];
  reports: DailyReport[];
  tasks: TaskItem[];
  apps: AppItem[];
  rows: DashboardRow[];
  releaseKeys: Set<string>;
  generatedAt?: Date;
}

// Khoá nhận diện để nối báo cáo ngày vào 1 dòng: id app + tên đã norm (tên app, tên dự án plan).
interface RowKeys {
  ids: Set<string>;
  names: Set<string>;
}

const isDoneTask = (t: TaskItem) => statusMeta(t.status).kind === 'done';
const isTodoTask = (t: TaskItem) => statusMeta(t.status).kind === 'todo';
export const taskDate = (t: TaskItem) => t.planDate || t.startDate || '';

// Ngày tăng dần, '' (chưa có ngày) xuống cuối.
const byDateAsc = (a: string, b: string) => (a || '9999').localeCompare(b || '9999');

/** App của 1 nhánh: task nguồn đầu tiên có app, không có thì app của dự án. */
export function appOfWs(
  pr: PlanProject,
  w: PlanWorkstream,
  taskById: Map<string, TaskItem>,
): string | undefined {
  for (const id of w.sourceTaskIds ?? []) {
    const a = taskById.get(id)?.appId;
    if (a) return a;
  }
  return pr.appId || undefined;
}

export function buildDashboardData(input: BuildInput): DashboardData {
  const { plan, plans, reports, tasks, apps, releaseKeys } = input;
  const appById = new Map(apps.map((a) => [a.id, a]));
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // Khung: bỏ app đã archive / đã xoá; app trùng ở nhiều dòng → thuộc dòng đầu tiên.
  const rowOfApp = new Map<string, number>();
  const rows: DashRowData[] = [];
  const keys = new Map<DashRowData, RowKeys>();
  input.rows.forEach((r, i) => {
    const ids = (r.appIds ?? []).filter((id) => {
      const a = appById.get(id);
      return !!a && !a.archived;
    });
    for (const id of ids) if (!rowOfApp.has(id)) rowOfApp.set(id, i);
    const row: DashRowData = {
      label: r.label,
      appIds: ids,
      appNames: ids.map((id) => appById.get(id)!.name),
      items: [],
      future: [],
      latest: null,
      reportOnly: false,
    };
    rows.push(row);
    keys.set(row, { ids: new Set(ids), names: new Set(row.appNames.map(normName)) });
  });

  // Mục "Other tasks": mỗi app / dự án ngoài khung là 1 dòng con, khoá theo tên.
  const otherMap = new Map<string, DashRowData>();
  const bucket = (appId: string | undefined, fallbackName: string): DashRowData => {
    const ri = appId ? rowOfApp.get(appId) : undefined;
    const app = appId ? appById.get(appId) : undefined;
    const row = ri !== undefined ? rows[ri] : undefined;
    if (row) {
      keys.get(row)!.names.add(normName(fallbackName));
      return row;
    }
    const name = (app?.name ?? fallbackName).trim() || '(Không tên)';
    const k = normName(name) || name.toLowerCase();
    let o = otherMap.get(k);
    if (!o) {
      o = {
        label: name,
        appIds: app && !app.archived ? [app.id] : [],
        appNames: app ? [app.name] : [],
        items: [],
        future: [],
        latest: null,
        reportOnly: false,
      };
      otherMap.set(k, o);
      keys.set(o, { ids: new Set(appId ? [appId] : []), names: new Set([normName(name)]) });
    }
    keys.get(o)!.names.add(normName(fallbackName));
    return o;
  };

  // Trạng thái hiệu dụng = đã lưu, nâng theo báo cáo ngày trong tuần (luật không hạ cấp của
  // suggestFromReports). Chỉ dùng để hiển thị, không ghi lại plan.
  const weekReports = reportsInWeek(reports, plan);
  const sug = new Map(
    suggestFromReports(plan, weekReports).map((s) => [`${s.pi}:${s.wi}`, s]),
  );

  // Mọi nhánh của plan tuần (kể cả đã xong). Ghi nhận khoá dự án plan để nhận ra dự án
  // "chỉ có trong báo cáo".
  const inPlan = new Set<string>();
  const planAppIds = new Set<string>();
  const planNames = new Set<string>();
  (plan.projects ?? []).forEach((pr, pi) => {
    if (pr.appId) planAppIds.add(pr.appId);
    planNames.add(normName(pr.name));
    (pr.workstreams ?? []).forEach((w, wi) => {
      for (const id of w.sourceTaskIds ?? []) inPlan.add(id);
      const s = sug.get(`${pi}:${wi}`);
      const eff: PlanWorkstream = s
        ? {
            ...w,
            state: s.state,
            progress: s.progress ?? (s.state === (w.state ?? 'todo') ? w.progress : undefined),
          }
        : w;
      const state = eff.state ?? 'todo';
      const appId = appOfWs(pr, w, taskById);
      if (appId) planAppIds.add(appId);
      bucket(appId, pr.name).items.push({
        appId: appId ?? '',
        project: pr.name,
        title: w.title,
        category: catMeta(w.category).label,
        release: isReleaseWs(w, releaseKeys),
        target: w.milestone ? msWithVersion(w, tasks) : '',
        state,
        pct: state === 'done' ? 100 : workstreamPct(eff),
        date: wsMilestoneDate(plan, pr, w, tasks, apps, releaseKeys),
        itemsHtml: renderItemsHtml(w.items ?? [], '      '),
        taskIds: (w.sourceTaskIds ?? []).filter((id) => taskById.has(id)),
      });
    });
  });

  // Dự án chỉ có trong báo cáo ngày của tuần (không nối được với dự án plan nào):
  // gắn app trong khung → dòng của app đó; còn lại → Other tasks.
  const reportRows = new Set<DashRowData>();
  for (const r of weekReports) {
    for (const rp of r.projects ?? []) {
      const inPl =
        (rp.appId && planAppIds.has(rp.appId)) || planNames.has(normName(rp.name));
      if (inPl || !(rp.name ?? '').trim()) continue;
      const appId = rp.appId && appById.has(rp.appId) ? rp.appId : undefined;
      reportRows.add(bucket(appId, rp.name));
    }
  }

  // 🕒 Dự kiến: task chưa bắt đầu ngoài plan có ngày sau weekEnd hoặc chưa có ngày, rồi
  // nhánh chưa xong của plan các tuần sau (bỏ nhánh mà mọi task nguồn đã liệt kê).
  // Task đang chạy ngoài plan / quá hạn / có ngày trong tuần nhưng ngoài plan: không ghi ở
  // dashboard (xem nhóm "Đang chạy ngoài plan" / "Cần xem lại" ở trang chi tiết app).
  const listed = new Set<string>(inPlan);
  for (const t of tasks) {
    if (listed.has(t.id) || !isTodoTask(t)) continue;
    const d = taskDate(t);
    if (d && d <= plan.weekEnd) continue;
    listed.add(t.id);
    bucket(t.appId, appById.get(t.appId ?? '')?.name ?? 'Chưa gán app').future.push({
      taskId: t.id,
      appId: t.appId ?? '',
      itemsHtml: '',
      title: t.title,
      date: d,
      note: [t.type, t.version].filter(Boolean).join(' · '),
    });
  }
  for (const fp of plans) {
    if (fp.weekStart <= plan.weekEnd) continue;
    for (const pr of fp.projects ?? []) {
      for (const w of pr.workstreams ?? []) {
        if ((w.state ?? 'todo') === 'done') continue;
        const src = w.sourceTaskIds ?? [];
        // Mọi task nguồn đã liệt kê / đã xong / đã xoá → nhánh không thêm thông tin mới.
        if (
          src.length &&
          src.every((id) => {
            const t = taskById.get(id);
            return listed.has(id) || !t || isDoneTask(t);
          })
        )
          continue;
        for (const id of src) listed.add(id);
        const appId = appOfWs(pr, w, taskById);
        bucket(appId, pr.name).future.push({
          taskId: '',
          appId: appId ?? '',
          itemsHtml: renderItemsHtml(w.items ?? [], '      '),
          title: w.milestone ? `${w.title} — ${msWithVersion(w, tasks)}` : w.title,
          date: fp.weekStart,
          note: `Plan tuần ${dm(fp.weekStart)}`,
        });
      }
    }
  }

  // Cập nhật mới nhất: báo cáo gần nhất trong tuần có nhắc tới dòng (theo app id hoặc tên).
  const desc = [...weekReports].sort((a, b) => b.date.localeCompare(a.date));
  const other = [...otherMap.values()];
  for (const row of [...rows, ...other]) {
    row.items.sort((a, b) => byDateAsc(a.date, b.date));
    row.future.sort((a, b) => byDateAsc(a.date, b.date));
    row.reportOnly = row.items.length === 0 && reportRows.has(row);
    if (row.items.length === 0 && !row.reportOnly) continue;
    const k = keys.get(row)!;
    for (const r of desc) {
      const rp = (r.projects ?? []).find(
        (p) => (p.appId && k.ids.has(p.appId)) || k.names.has(normName(p.name)),
      );
      if (!rp) continue;
      const lines = parseBody(rp.body);
      const arrows = lines.filter((l) => l.kind === 'arrow');
      const pick = (arrows.length ? arrows : lines.filter((l) => l.kind === 'bullet'))
        .slice(0, LATEST_MAX_LINES)
        .map((l) => l.text);
      if (pick.length) {
        row.latest = { date: r.date, lines: pick };
        break;
      }
    }
  }

  const all = [...rows, ...other];
  const items = all.flatMap((r) => r.items);
  const rels = items.filter((i) => i.release);
  return {
    plan,
    generatedAt: input.generatedAt ?? new Date(),
    rows,
    other,
    reportCount: weekReports.length,
    stats: {
      // Chỉ đếm dòng trong khung (mẫu số là số dòng khung), không tính mục Other tasks.
      activeRows: rows.filter((r) => r.items.length > 0 || r.reportOnly).length,
      totalRows: rows.length,
      goalDone: items.filter((i) => i.state === 'done').length,
      goalTotal: items.length,
      releaseDone: rels.filter((i) => i.state === 'done').length,
      releaseTotal: rels.length,
      future: all.reduce((n, r) => n + r.future.length, 0),
    },
  };
}

/** Nhóm task chưa xong của 1 app cho trang chi tiết tab Manager (task trong plan tuần bỏ ra
 *  vì đã hiện theo nhánh). Ngày so với tuần của plan đang xem. */
export interface AppTaskGroups {
  /** Đang thực hiện / đang fix nhưng không có trong plan tuần. */
  running: TaskItem[];
  /** Chưa bắt đầu, ngày sau tuần này. */
  upcoming: TaskItem[];
  /** Chưa bắt đầu, chưa có ngày. */
  undated: TaskItem[];
  /** Chưa bắt đầu, ngày ≤ hết tuần này (quá hạn / trong tuần nhưng ngoài plan). */
  review: TaskItem[];
}
export function appTaskGroups(
  appId: string,
  tasks: TaskItem[],
  plan: WeeklyPlan,
): AppTaskGroups {
  const inPlan = new Set(
    (plan.projects ?? []).flatMap((p) => (p.workstreams ?? []).flatMap((w) => w.sourceTaskIds ?? [])),
  );
  const g: AppTaskGroups = { running: [], upcoming: [], undated: [], review: [] };
  for (const t of tasks) {
    if (t.appId !== appId || inPlan.has(t.id) || isDoneTask(t)) continue;
    const d = taskDate(t);
    if (!isTodoTask(t)) g.running.push(t);
    else if (!d) g.undated.push(t);
    else if (d > plan.weekEnd) g.upcoming.push(t);
    else g.review.push(t);
  }
  const sort = (l: TaskItem[]) => l.sort((a, b) => byDateAsc(taskDate(a), taskDate(b)));
  sort(g.running);
  sort(g.upcoming);
  sort(g.review);
  g.undated.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return g;
}

// ---------- HTML ----------

function dm(iso: string): string {
  const [, m, d] = (iso || '').split('-');
  return m && d ? `${d}/${m}` : iso || '';
}
function dmy(iso: string): string {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso || '';
}
const pad2 = (n: number) => String(n).padStart(2, '0');
function stamp(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(
    d.getMonth() + 1,
  )}/${d.getFullYear()}`;
}
/** 'T4 26/11' / 'CN 30/11'. */
export const shortDay = (iso: string) => {
  const wd = weekdayVN(iso).replace('Thứ ', 'T').replace('Chủ nhật', 'CN');
  return `${wd} ${dm(iso)}`;
};
/** Nhãn + icon trạng thái nhánh trên dashboard (done → "Xong mục tiêu tuần"). */
export function dashStateLabel(s: WorkstreamState): { icon: string; label: string } {
  const m = WORKSTREAM_STATE_META[s];
  return { icon: m.icon, label: s === 'done' ? DASH_DONE_LABEL : m.label };
}
/** 'dd/mm' hoặc 'chưa có ngày' cho 1 mục Dự kiến. */
export const futureDay = (iso: string) => (iso ? dm(iso) : 'chưa có ngày');

const ST_CLASS: Record<WorkstreamState, string> = {
  todo: 'st-todo',
  doing: 'st-doing',
  testing: 'st-test',
  done: 'st-done',
  blocked: 'st-block',
};

function itemHtml(it: DashItem, showProject: boolean): string {
  const st = dashStateLabel(it.state);
  const head = [
    `<span class="cat${it.release ? ' is-rel' : ''}">${esc(it.category)}</span>`,
    `<b class="it-title">${esc(showProject && it.project ? `${it.project} · ${it.title}` : it.title)}</b>`,
    `<span class="st ${ST_CLASS[it.state]}">${st.icon} ${esc(st.label)}</span>`,
  ].join('');
  const meta = [
    it.target ? `🎯 ${esc(it.target)}` : '',
    it.date ? `Mốc ${esc(shortDay(it.date))}` : '',
  ].filter(Boolean);
  return `<div class="it${it.state === 'done' ? ' is-done' : ''}">
      <div class="it-h">${head}</div>
      ${meta.length ? `<div class="it-t">${meta.join(' · ')}</div>` : ''}
      <div class="bar" role="img" aria-label="Tiến độ ${it.pct}%"><i style="width:${it.pct}%"></i></div>
      <div class="pct">${it.pct}%</div>
      ${it.itemsHtml ? `<details><summary>Đầu việc</summary>\n${it.itemsHtml}\n      </details>` : ''}
    </div>`;
}

/** Dữ liệu thêm để file export xem được chi tiết task dự kiến (dialog giống tab Manager). */
export interface DashDetail {
  tasks: Map<string, TaskItem>;
  /** Mô tả task đã chuyển Markdown → HTML (mdStatic), khoá = task id. */
  descHtml: Map<string, string>;
  appName: (id: string) => string;
}

// Cột Dự kiến: có `detail` thì mỗi mục là nút mở dialog (data-fd = khoá dòng, data-fi = chỉ số
// mục); không có thì danh sách chữ như cũ. Script chặn → nút vẫn hiện đủ tên task.
function futureHtml(list: DashFuture[], key: string, detail?: DashDetail): string {
  if (list.length === 0) return '<span class="muted">—</span>';
  return `<ul class="fut">${list
    .map((f, i) => {
      const inner = `<span class="fut-d${f.date ? '' : ' is-nodate'}">🕒 ${esc(futureDay(f.date))}</span> ${esc(f.title)}${
        f.note ? ` <span class="muted">(${esc(f.note)})</span>` : ''
      }`;
      return detail
        ? `<li><button type="button" class="fut-btn" data-fd="${key}" data-fi="${i}">${inner}</button></li>`
        : `<li>${inner}</li>`;
    })
    .join('')}</ul>`;
}

const DETAIL_GROUPS: { title: string; hint: string; pick: (f: DashFuture) => boolean }[] = [
  { title: '🕒 Dự kiến', hint: 'Chưa bắt đầu, ngày sau tuần này.', pick: (f) => !!f.taskId && !!f.date },
  { title: 'Plan các tuần sau', hint: 'Nhánh chưa xong trong plan của các tuần sau.', pick: (f) => !f.taskId },
  {
    title: 'Chưa có ngày',
    hint: 'Chưa bắt đầu, chưa điền Ngày plan / Ngày bắt đầu.',
    pick: (f) => !!f.taskId && !f.date,
  },
];

// Khối chi tiết (ẩn trong <template>) của 1 dòng: nhóm như dialog trên web, mỗi mục 1 thẻ.
function detailTemplate(row: DashRowData, key: string, detail: DashDetail): string {
  const multiApp = row.appIds.length > 1;
  const card = (f: DashFuture, i: number): string => {
    const t = f.taskId ? detail.tasks.get(f.taskId) : undefined;
    const tags: string[] = [];
    if (multiApp && f.appId) tags.push(`<span class="tg">${esc(detail.appName(f.appId))}</span>`);
    if (t) {
      tags.push(`<span class="tg">${esc(t.type)}</span>`);
      tags.push(`<span class="tg st-${statusMeta(t.status).kind}">${esc(t.status)}</span>`);
      if (t.version) tags.push(`<span class="tg ver">${esc(t.version)}</span>`);
      tags.push(`<span class="muted">📅 ${f.date ? esc(dmy(f.date)) : 'chưa có ngày'}</span>`);
    } else {
      tags.push(`<span class="muted">🕒 ${esc(f.note)}</span>`);
    }
    const body = t ? (detail.descHtml.get(t.id) ?? '') : f.itemsHtml;
    return `<article class="fc" data-fi="${i}"><b class="fc-t">${esc(t ? t.title : f.title)}</b><div class="fc-tags">${tags.join('')}</div>${
      body ? `<div class="fc-b">${body}</div>` : ''
    }</article>`;
  };
  const sections = DETAIL_GROUPS.map((g) => {
    const cards = row.future
      .map((f, i) => (g.pick(f) ? card(f, i) : ''))
      .filter(Boolean);
    return cards.length
      ? `<section class="fs"><h3>${esc(g.title)} <span class="muted">(${cards.length})</span></h3><p class="muted fs-hint">${esc(g.hint)}</p>${cards.join('')}</section>`
      : '';
  }).join('');
  return `<template id="fd-${key}" data-title="${esc(`Task dự kiến · ${row.label}`)}" data-sub="${row.future.length} mục">${sections}</template>`;
}

// Dialog dùng chung + script mở/đóng (Esc, ✕, bấm nền). Không gọi ra ngoài, chỉ hiện khối
// <template> tương ứng — HtmlFrame cho phép script (sandbox không same-origin).
const DETAIL_MODAL = `<div class="fdm" id="fdm" hidden><div class="fdm-box" role="dialog" aria-modal="true" aria-labelledby="fdm-t"><div class="fdm-h"><div><b id="fdm-t"></b><div id="fdm-s" class="muted"></div></div><button type="button" class="fdm-x" aria-label="Đóng">✕</button></div><div class="fdm-b" id="fdm-b"></div></div></div>
<script>
(function(){
  var m=document.getElementById('fdm'),b=document.getElementById('fdm-b'),last=null;
  function close(){m.hidden=true;b.innerHTML='';document.body.style.overflow='';if(last)last.focus();}
  document.addEventListener('click',function(e){
    var el=e.target instanceof Element?e.target:null;if(!el)return;
    var btn=el.closest('[data-fd]');
    if(btn){
      var tp=document.getElementById('fd-'+btn.getAttribute('data-fd'));if(!tp)return;
      last=btn;
      document.getElementById('fdm-t').textContent=tp.getAttribute('data-title');
      document.getElementById('fdm-s').textContent=tp.getAttribute('data-sub');
      b.innerHTML='';b.appendChild(tp.content.cloneNode(true));
      m.hidden=false;document.body.style.overflow='hidden';
      var c=b.querySelector('[data-fi="'+btn.getAttribute('data-fi')+'"]');
      if(c){c.classList.add('is-focus');c.scrollIntoView({block:'center'});}
      m.querySelector('.fdm-x').focus();
      return;
    }
    if(el===m||el.closest('.fdm-x'))close();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!m.hidden)close();});
})();
</script>`;

function rowHtml(row: DashRowData, index: number, isOther: boolean, detail?: DashDetail): string {
  const key = `${isOther ? 'o' : 'r'}-${index}`;
  const na = row.items.length === 0 && !row.reportOnly;
  const appCell = `<div class="app">${esc(row.label)}</div>${
    row.appNames.length && row.appNames.join(', ') !== row.label
      ? `<div class="muted app-sub">${esc(row.appNames.join(', '))}</div>`
      : ''
  }`;
  const work = na
    ? '<span class="na">N/A</span>'
    : row.reportOnly
      ? '<span class="ro">Chỉ có trong báo cáo ngày</span>'
      : row.items.map((it) => itemHtml(it, isOther && it.project !== row.label)).join('\n    ');
  const latest = row.latest
    ? `<div class="lt-d">${esc(shortDay(row.latest.date))}</div><ul class="lt">${row.latest.lines
        .map((l) => `<li>${esc(l)}</li>`)
        .join('')}</ul>`
    : '<span class="muted">—</span>';
  return `<tr class="${na ? 'is-na' : ''}">
    <td class="c-no" data-label="#">${index + 1}</td>
    <td class="c-app" data-label="App">${appCell}</td>
    <td class="c-work" data-label="Việc tuần này">
    ${work}
    </td>
    <td class="c-latest" data-label="Cập nhật mới nhất">${na ? '<span class="muted">—</span>' : latest}</td>
    <td class="c-fut" data-label="🕒 Dự kiến">${futureHtml(row.future, key, detail)}</td>
  </tr>`;
}

const THEAD = `<thead><tr><th class="c-no">#</th><th class="c-app">App</th><th class="c-work">Việc tuần này · mục tiêu · tiến độ</th><th class="c-latest">Cập nhật mới nhất</th><th class="c-fut">🕒 Dự kiến</th></tr></thead>`;

const CSS = `
:root{--bg:#f6f7fb;--card:#fff;--fg:#1b1f2a;--muted:#5f6b7a;--line:#e3e7ef;--accent:#2563eb;
--na:#9aa3b2;--bar:#e8ecf3;--todo:#64748b;--doing:#2563eb;--test:#c2410c;--block:#a16207;--done:#15803d;
--rel:#15803d;--rel-bg:#e7f6ec;--cat-bg:#eef2ff;--cat:#3730a3;--ro:#7c3aed}
@media (prefers-color-scheme:dark){:root{--bg:#11141b;--card:#1a1f29;--fg:#e6e9ef;--muted:#9aa3b2;
--line:#2a3140;--accent:#7aa2ff;--na:#6b7486;--bar:#2a3140;--todo:#94a3b8;--doing:#7aa2ff;--test:#fb923c;
--block:#facc15;--done:#4ade80;--rel:#4ade80;--rel-bg:#163323;--cat-bg:#252b48;--cat:#c7d2fe;--ro:#c4b5fd}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1381px;margin:0 auto;padding:24px 16px 48px}
.mast h1{margin:0 0 4px;font-size:24px}
.sub,.by{margin:2px 0;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:20px 0 12px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
.tile b{display:block;font-size:24px}
.tile span{color:var(--muted)}
.legend{color:var(--muted);margin:8px 0 16px}
h2{font-size:18px;margin:28px 0 10px}
table.dash{width:100%;border-collapse:separate;border-spacing:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.dash th{text-align:left;font-weight:600;color:var(--muted);background:var(--bg);padding:10px 12px;border-bottom:1px solid var(--line)}
.dash td{vertical-align:top;padding:12px;border-bottom:1px solid var(--line)}
.dash tr:last-child td{border-bottom:0}
.c-no{width:40px;color:var(--muted)}
.c-app{width:170px}
.c-latest{width:24%}
.c-fut{width:22%}
.app{font-weight:600}
.app-sub{font-size:12px}
.muted{color:var(--muted)}
.na{display:inline-block;font-weight:600;color:var(--na);border:1px dashed var(--na);border-radius:6px;padding:0 8px}
.ro{display:inline-block;font-size:12px;font-weight:600;color:var(--ro);border:1px solid var(--ro);border-radius:6px;padding:0 8px}
tr.is-na .app{color:var(--muted)}
.it{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:8px 0}
.it+.it{border-top:1px dashed var(--line)}
.it-h,.it-t,details{grid-column:1/-1}
.it-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.it-t{color:var(--muted);font-size:13px}
.cat{font-size:12px;border-radius:6px;padding:0 6px;background:var(--cat-bg);color:var(--cat)}
.cat.is-rel{background:var(--rel-bg);color:var(--rel)}
.st{font-size:12px;font-weight:600}
.st-todo{color:var(--todo)}.st-doing{color:var(--doing)}.st-test{color:var(--test)}.st-block{color:var(--block)}.st-done{color:var(--done)}
.bar{height:6px;border-radius:3px;background:var(--bar);align-self:center;overflow:hidden}
.bar i{display:block;height:100%;background:var(--accent)}
.it.is-done .bar i{background:var(--done)}
.pct{font-size:12px;color:var(--muted);min-width:34px;text-align:right}
details{font-size:13px}
summary{cursor:pointer;color:var(--accent)}
details ul{margin:4px 0;padding-left:18px}
.lt-d{font-size:12px;color:var(--muted)}
.lt,.fut{margin:2px 0 0;padding-left:16px}
.lt li,.fut li{margin:2px 0}
.fut{list-style:none;padding-left:0}
.fut-d{font-weight:600;white-space:nowrap}
.fut-d.is-nodate{font-weight:500;color:var(--muted)}
.fut-btn{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;font:inherit;padding:4px 6px;margin:0 -6px;border-radius:6px;cursor:pointer;min-height:32px}
.fut-btn:hover,.fut-btn:focus-visible{background:var(--bg)}
.fdm{position:fixed;inset:0;z-index:10;background:rgba(15,17,21,.55);display:flex;align-items:center;justify-content:center;padding:16px}
.fdm[hidden]{display:none}
.fdm-box{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:14px;width:100%;max-width:760px;max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.3)}
.fdm-h{display:flex;align-items:flex-start;gap:12px;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line)}
.fdm-h b{font-size:16px}
.fdm-x{border:0;background:none;color:var(--muted);font-size:18px;cursor:pointer;min-width:40px;min-height:40px;border-radius:8px}
.fdm-x:hover{background:var(--bg)}
.fdm-b{overflow:auto;padding:16px 20px}
.fs+.fs{margin-top:16px}
.fs h3{font-size:15px;margin:0 0 2px}
.fs-hint{margin:0 0 8px;font-size:13px}
.fc{border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-bottom:8px;scroll-margin:12px}
.fc.is-focus{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.fc-t{font-size:15px}
.fc-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px;font-size:12px}
.tg{border-radius:6px;padding:0 6px;background:var(--cat-bg);color:var(--cat)}
.tg.ver{background:var(--bar);color:var(--fg)}
.tg.st-todo{background:var(--bar);color:var(--todo)}.tg.st-active{color:var(--doing)}.tg.st-fixing{color:var(--test)}.tg.st-done{color:var(--done)}
.fc-b{margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-size:14px}
.fc-b>:first-child{margin-top:0}.fc-b>:last-child{margin-bottom:0}
.fc-b ul,.fc-b ol{padding-left:20px;margin:4px 0}
.fc-b h1,.fc-b h2,.fc-b h3{font-size:15px;margin:8px 0 4px}.fc-b h4,.fc-b h5,.fc-b h6{font-size:14px;margin:8px 0 4px}
.fc-b p{margin:4px 0}.fc-b a{color:var(--accent);word-break:break-all}
.fc-b pre,.fc-b code{background:var(--bg);border-radius:4px}
.fc-b pre{padding:8px;overflow:auto}
.fc-b table{border-collapse:collapse}.fc-b td,.fc-b th{border:1px solid var(--line);padding:4px 8px}
@media (max-width:760px){.fdm{padding:0}.fdm-box{max-width:none;max-height:none;height:100%;border-radius:0}}
footer{margin-top:24px;color:var(--muted);font-size:13px}
@media (max-width:760px){
  .dash thead{display:none}
  .dash,.dash tbody,.dash tr,.dash td{display:block;width:100%}
  .dash tr{border-bottom:1px solid var(--line);padding:4px 0}
  .dash td{border:0;padding:6px 12px}
  .dash td.c-no{display:none}
  .dash td.c-latest::before,.dash td.c-fut::before{content:attr(data-label);display:block;font-size:12px;color:var(--muted);font-weight:600}
}
`;

export function buildDashboardHtml(
  data: DashboardData,
  detail?: DashDetail,
  author = 'phongnx',
): string {
  const { plan, stats } = data;
  const today = data.generatedAt;
  const todayIso = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const range = `${dm(plan.weekStart)} – ${dmy(plan.weekEnd)}`;
  const tiles = [
    [`${stats.activeRows}/${stats.totalRows}`, 'App trong khung có việc tuần này'],
    [`${stats.goalDone}/${stats.goalTotal}`, 'Mục tiêu tuần đã xong'],
    [`${stats.releaseDone}/${stats.releaseTotal}`, 'Release tuần này đã xong'],
    [String(stats.future), '🕒 Task dự kiến'],
  ]
    .map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`)
    .join('');
  const body = data.rows.map((r, i) => rowHtml(r, i, false, detail)).join('\n  ');
  const other = data.other.length
    ? `<table class="dash">${THEAD}<tbody>
  ${data.other.map((r, i) => rowHtml(r, i, true, detail)).join('\n  ')}
</tbody></table>`
    : '<p><span class="na">N/A</span></p>';
  // Khối chi tiết task dự kiến của từng dòng (chỉ dòng có mục dự kiến) + dialog dùng chung.
  const details = detail
    ? [
        ...data.rows.map((r, i) => (r.future.length ? detailTemplate(r, `r-${i}`, detail) : '')),
        ...data.other.map((r, i) => (r.future.length ? detailTemplate(r, `o-${i}`, detail) : '')),
      ]
        .filter(Boolean)
        .join('\n') + `\n${DETAIL_MODAL}`
    : '';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="author" content="${esc(author)}" />
  <title>${esc(DASHBOARD_DOC_TITLE)} · ${esc(range)}</title>
  <style>${CSS}</style>
</head>
<body>
<main class="wrap">
<header class="mast">
  <h1>Dashboard Apps — Mobile Team</h1>
  <p class="sub">Tuần ${esc(range)} · Cập nhật ${esc(stamp(today))}</p>
  <p class="by">✍️ ${esc(author)} · ${esc(dmy(todayIso))}</p>
</header>
<section class="tiles">${tiles}</section>
<p class="legend">⚪ Chưa làm · 🔵 Đang làm · 🧪 Testing · ⏳ Pending · ✅ ${esc(DASH_DONE_LABEL)} · 🕒 Task dự kiến (sau tuần này / chưa có ngày) · <span class="na">N/A</span> Không có việc trong plan tuần.</p>
<table class="dash">${THEAD}<tbody>
  ${body}
</tbody></table>
<h2>${esc(DASHBOARD_OTHER_LABEL)}</h2>
${other}
<footer>Nguồn: Plan tuần “${esc(plan.title)}” (${esc(range)}), ${data.reportCount} báo cáo ngày trong tuần, danh sách task của Bảng dự án. Trạng thái nhánh lấy mức cao hơn giữa plan và báo cáo ngày.${
    detail ? ' Bấm 1 task ở cột Dự kiến để xem chi tiết.' : ''
  }</footer>
</main>
${details}
</body>
</html>`;
}
