// Tự sinh nội dung plan tuần mới từ dữ liệu thật (nguồn duy nhất cho map task → nhánh):
// 1) carry-over các nhánh CHƯA HOÀN THÀNH (state !== done) của plan tuần trước
//    (milestone của nhánh carry bị GỠ nếu mốc task nguồn không thuộc tuần mới);
// 2) task LOẠI Release có planDate trong tuần (luôn fill, nâng cấp nhánh carry nếu
//    trùng task) + timeline — timeline CHỈ chứa mốc milestone Release;
// 3) task có startDate trong tuần (mọi status trừ done) + task đang chạy (chỉ app chưa
//    có nhánh), bỏ task trùng nhánh đã done tuần trước.
// Luật milestone ("tự tick"): CHỈ gắn khi mốc của task nằm trong tuần —
// mốc = Ngày plan (planDate, mốc release); không có thì Ngày kết thúc (endDate).
import {
  DONE_STATUS,
  isReleaseWs,
  isRunningStatus,
  taskStatusToWsState,
  type AppItem,
  type PlanProject,
  type PlanTimelineItem,
  type PlanWorkstream,
  type TaskItem,
  type WeeklyPlan,
  type WorkstreamCategory,
} from '../pmTypes';
import { weekdayVN } from './pmDates';
import { normName } from './pmText';
import { dedupTimeline } from './planProgress';

/** Shape input tạo plan (WeeklyPlan bỏ các field do context điền). */
export type PlanDraft = Omit<WeeklyPlan, 'id' | 'order' | 'createdAt' | 'updatedAt'>;

// Tách mô tả task thành các dòng "item" đã làm sạch (bỏ #, gạch đầu dòng, dòng rỗng).
export function taskLines(t: TaskItem): string[] {
  const raw = (t.description ?? '').split('\n');
  const lines = raw
    .map((l) => l.replace(/^\s*[#>-]+\s*/, '').trim())
    .filter((l) => l.length > 0);
  return lines.length ? lines : [t.title];
}

// Loại task → category của nhánh plan.
export function mapTaskCategory(type: string): WorkstreamCategory {
  const low = type.toLowerCase();
  if (low.includes('release')) return 'release';
  if (low.includes('bug') || low.includes('test')) return 'test';
  return 'other';
}

/** Mốc thời gian của 1 task: Ngày plan (planDate — mốc release); không có thì Ngày kết thúc. */
export function taskMilestoneDate(t: TaskItem): string {
  return t.planDate || t.endDate || '';
}

/** Map 1 task thành nhánh plan; `items` truyền vào để giới hạn dòng (mặc định toàn bộ mô tả).
 *  `week`: khoảng tuần của plan — milestone CHỈ được "tự tick" khi mốc của task
 *  (planDate, fallback endDate) nằm trong tuần; task loại release nhưng mốc ngoài tuần
 *  → nhánh thường (category other, không milestone). Không truyền week = hành vi cũ. */
export function taskToWorkstream(
  t: TaskItem,
  app?: AppItem,
  items?: string[],
  week?: { start: string; end: string },
): PlanWorkstream {
  const rawCat = mapTaskCategory(t.type);
  const msDate = taskMilestoneDate(t);
  const msInWeek = !week || (!!msDate && week.start <= msDate && msDate <= week.end);
  // Release mà mốc ngoài tuần → không được đếm là nhánh release của tuần này.
  const category: WorkstreamCategory =
    rawCat === 'release' && !msInWeek ? 'other' : rawCat;
  const milestone =
    category === 'release' && msInWeek
      ? { type: 'release' as const, text: `Build release ${t.version ?? ''}`.trim() }
      : category === 'test' && msInWeek
        ? { type: 'test' as const, text: 'Build test & fix bugs' }
        : undefined;
  return {
    title: app?.platform || t.type || 'Nhánh',
    category,
    items: items ?? taskLines(t),
    sourceTaskIds: [t.id],
    // Seed state theo status hiện tại của task (đồng bộ hiển thị plan ↔ page Task).
    state: taskStatusToWsState(t.status),
    ...(milestone ? { milestone } : {}),
  };
}

/**
 * Sinh plan tuần mới từ dữ liệu thật; trả null nếu không có gì để fill
 * (caller fallback về template mẫu).
 * `plans` phải đã sort mới nhất trước (đúng thứ tự PmContext cung cấp).
 */
export function buildAutoPlan(opts: {
  weekStart: string;
  weekEnd: string;
  plans: WeeklyPlan[];
  apps: AppItem[];
  tasks: TaskItem[];
  /** Tập key milestone được coi là release (mặc định {'release'}). */
  releaseKeys?: Set<string>;
}): PlanDraft | null {
  const { weekStart, weekEnd, plans, apps, tasks } = opts;
  const releaseKeys = opts.releaseKeys ?? new Set(['release']);
  const appById = new Map(apps.map((a) => [a.id, a]));
  const usableApp = (id?: string): AppItem | undefined => {
    const a = id ? appById.get(id) : undefined;
    return a && !a.archived ? a : undefined;
  };

  // Key nội dung items (đã normalize) để so trùng nhánh.
  const itemsKey = (w: PlanWorkstream): string => normName((w.items ?? []).join('|'));
  const inRange = (d?: string): boolean => !!d && weekStart <= d && d <= weekEnd;
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // Gỡ milestone của nhánh carry-over khi mốc task nguồn KHÔNG thuộc tuần mới
  // (VD release đã dời lịch sang tuần sau) — milestone release thì hạ category về other.
  // Nhánh gõ tay (không tìm được task nguồn) giữ nguyên; mốc đúng tuần thì bước 2 refresh.
  const stripStaleMilestone = (w: PlanWorkstream): PlanWorkstream => {
    if (!w.milestone) return w;
    const srcTasks = (w.sourceTaskIds ?? [])
      .map((id) => taskById.get(id))
      .filter((t): t is TaskItem => !!t);
    if (srcTasks.length === 0) return w;
    if (srcTasks.some((t) => inRange(taskMilestoneDate(t)))) return w;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { milestone, ...rest } = w;
    const isRelMs =
      w.category === 'release' || releaseKeys.has(w.milestone.type);
    return { ...rest, ...(isRelMs ? { category: 'other' as const } : {}) };
  };

  // ---- Bước 1: carry-over nhánh CHƯA HOÀN THÀNH (state !== done) của plan tuần trước ----
  // (Không lọc theo % nữa: nhánh done nhưng % cũ < 100 không bị kéo sang;
  //  nhánh testing nhưng % = 100 vẫn được kéo sang vì thực tế chưa xong.)
  const prev = plans.find((p) => p.weekStart < weekStart);
  const projects: PlanProject[] = [];
  const carriedTaskIds = new Set<string>();
  for (const pr of prev?.projects ?? []) {
    const pending = (pr.workstreams ?? []).filter((w) => (w.state ?? 'todo') !== 'done');
    if (pending.length === 0) continue;
    // Dedup nội bộ: plan cũ có thể đã chứa nhánh trùng nội dung → chỉ giữ nhánh đầu.
    const seen = new Set<string>();
    const kept = pending.filter((w) => {
      const key = itemsKey(w) || normName(w.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    projects.push({
      name: pr.name,
      ...(pr.appId ? { appId: pr.appId } : {}),
      // Giữ state (đang dở thì sang tuần vẫn dở), bỏ progress % của tuần cũ;
      // gỡ milestone nếu mốc task nguồn không thuộc tuần mới.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      workstreams: kept.map(({ progress, ...rest }) => stripStaleMilestone({ ...rest })),
    });
    for (const w of kept) for (const id of w.sourceTaskIds ?? []) carriedTaskIds.add(id);
  }

  // Dấu vết nhánh ĐÃ DONE tuần trước (theo app): chặn task chưa mark done trên
  // Bảng dự án bị fill lại thành nhánh trùng (VD tuần trước đã release xong).
  const prevDoneTaskIds = new Set<string>();
  const prevDoneKeys = new Set<string>();
  for (const pr of prev?.projects ?? []) {
    const appKey = pr.appId ?? normName(pr.name);
    for (const w of pr.workstreams ?? []) {
      if ((w.state ?? 'todo') !== 'done') continue;
      for (const id of w.sourceTaskIds ?? []) prevDoneTaskIds.add(id);
      // Milestone release có version (VD "Build release v1.113") là dấu vết mạnh;
      // milestone test generic ("Build test & fix bugs") không dùng để so trùng.
      const ms = normName(w.milestone?.text ?? '');
      if (ms && (w.category === 'release' || w.milestone?.type === 'release'))
        prevDoneKeys.add(`${appKey}:ms:${ms}`);
      const it = itemsKey(w);
      if (it) prevDoneKeys.add(`${appKey}:it:${it}`);
    }
  }

  // Tìm project đã có cho 1 app (khớp appId trước, rồi khớp tên) để append nhánh.
  const projectOfApp = (app: AppItem): PlanProject | undefined =>
    projects.find((pr) => pr.appId === app.id) ??
    projects.find((pr) => !pr.appId && normName(pr.name) === normName(app.name));
  const pushWorkstream = (app: AppItem, ws: PlanWorkstream) => {
    const existing = projectOfApp(app);
    if (existing) {
      existing.workstreams.push(ws);
      if (!existing.appId) existing.appId = app.id;
    } else {
      projects.push({ name: app.name, appId: app.id, workstreams: [ws] });
    }
  };

  // ---- Bước 2: task LOẠI Release có planDate trong tuần (xử lý TRƯỚC task đang chạy) ----
  // Luôn fill (app tuần trước done mà có lịch release tuần này thì tự vào plan);
  // task đã nằm trong nhánh carry-over → NÂNG CẤP nhánh đó thành release, không thêm mới.
  // CHỈ task loại Release mới vào nhóm này + timeline — task loại khác có planDate
  // trong tuần rơi xuống bước 3 (nhánh theo loại, không bị force milestone release).
  const addedTaskIds = new Set(carriedTaskIds);
  const inWeek = (t: TaskItem): boolean =>
    !!t.planDate && weekStart <= t.planDate && t.planDate <= weekEnd;
  const releaseTasks = tasks.filter(
    (t) =>
      inWeek(t) &&
      t.status !== DONE_STATUS &&
      usableApp(t.appId) &&
      mapTaskCategory(t.type) === 'release',
  );
  for (const t of releaseTasks) {
    const app = usableApp(t.appId)!;
    const milestone = {
      type: 'release' as const,
      text: `Build release ${t.version ?? ''}`.trim(),
    };
    if (addedTaskIds.has(t.id)) {
      const w = projectOfApp(app)?.workstreams.find((x) => x.sourceTaskIds?.includes(t.id));
      if (w) {
        w.category = 'release';
        w.milestone = milestone;
      }
      continue;
    }
    pushWorkstream(app, { ...taskToWorkstream(t, app), category: 'release', milestone });
    addedTaskIds.add(t.id);
  }
  // Dedup ngay khi build: 2 task release cùng app + version → 1 dòng (giữ mốc sớm nhất).
  const timeline: PlanTimelineItem[] = dedupTimeline(
    releaseTasks
      .filter((t) => weekdayVN(t.planDate!))
      .sort((a, b) => a.planDate!.localeCompare(b.planDate!))
      .map((t) => ({
        day: weekdayVN(t.planDate!),
        release: `${usableApp(t.appId)!.name} ${t.version ?? ''}`.trim(),
      })),
  );

  // ---- Bước 3: task có startDate trong tuần + task đang chạy ----
  // - startDate trong tuần (mọi status trừ done, kể cả "Chưa bắt đầu"): thêm nhánh
  //   cả khi app đã có nhánh khác (dedup nội dung với nhánh sẵn có);
  // - đang chạy nhưng không có ngày gì trong tuần: chỉ thêm cho app CHƯA có nhánh
  //   (luật cũ — tránh nhánh phụ trùng nội dung carry-over).
  for (const t of tasks) {
    if (t.status === DONE_STATUS || addedTaskIds.has(t.id)) continue;
    const app = usableApp(t.appId);
    if (!app) continue;
    const startInWeek = inRange(t.startDate);
    if (!startInWeek && !isRunningStatus(t.status)) continue;
    const existing = projectOfApp(app);
    if (!startInWeek && existing) continue;
    // Trùng nhánh đã DONE tuần trước → task chưa được mark done, bỏ qua.
    if (prevDoneTaskIds.has(t.id)) continue;
    const ws = taskToWorkstream(t, app, undefined, { start: weekStart, end: weekEnd });
    const ms = normName(ws.milestone?.text ?? '');
    const it = itemsKey(ws);
    const isDup = [app.id, normName(app.name)].some(
      (k) =>
        (ms && ws.category === 'release' && prevDoneKeys.has(`${k}:ms:${ms}`)) ||
        (it && prevDoneKeys.has(`${k}:it:${it}`)),
    );
    if (isDup) continue;
    // Trùng nội dung với nhánh sẵn có của app trong plan mới → bỏ.
    if (existing && it && existing.workstreams.some((w) => itemsKey(w) === it)) continue;
    pushWorkstream(app, ws);
    addedTaskIds.add(t.id);
  }

  if (projects.length === 0) return null;
  // Sort 3 hạng như card Tổng quan: app có nhánh release → app có milestone khác
  // → app không milestone (stable trong nhóm — carry-over trước, mới thêm sau).
  const projRank = (pr: PlanProject): number => {
    const wss = pr.workstreams ?? [];
    if (wss.some((w) => isReleaseWs(w, releaseKeys))) return 0;
    if (wss.some((w) => !!w.milestone)) return 1;
    return 2;
  };
  projects.sort((a, b) => projRank(a) - projRank(b));
  return {
    title: 'Kế hoạch tuần Mobile Team',
    description:
      'Tổng hợp các đầu việc trọng tâm của team Mobile trong tuần (tự sinh từ plan tuần trước, task đang chạy và lịch release).',
    weekStart,
    weekEnd,
    projects,
    timeline,
  };
}
