// Tự sinh nội dung plan tuần mới từ dữ liệu thật (nguồn duy nhất cho map task → nhánh):
// 1) carry-over các nhánh chưa xong của plan tuần trước;
// 2) fill task đang chạy (theo app);
// 3) đề xuất release có planDate trong tuần + tự fill timeline.
import {
  DONE_STATUS,
  isRunningStatus,
  type AppItem,
  type PlanProject,
  type PlanTimelineItem,
  type PlanWorkstream,
  type TaskItem,
  type WeeklyPlan,
  type WorkstreamCategory,
  workstreamPct,
} from '../pmTypes';
import { weekdayVN } from './pmDates';
import { normName } from './pmText';

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

/** Map 1 task thành nhánh plan; `items` truyền vào để giới hạn dòng (mặc định toàn bộ mô tả). */
export function taskToWorkstream(
  t: TaskItem,
  app?: AppItem,
  items?: string[],
): PlanWorkstream {
  const category = mapTaskCategory(t.type);
  const milestone =
    category === 'release'
      ? { type: 'release' as const, text: `Build release ${t.version ?? ''}`.trim() }
      : category === 'test'
        ? { type: 'test' as const, text: 'Build test & fix bugs' }
        : undefined;
  return {
    title: app?.platform || t.type || 'Nhánh',
    category,
    items: items ?? taskLines(t),
    sourceTaskIds: [t.id],
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
}): PlanDraft | null {
  const { weekStart, weekEnd, plans, apps, tasks } = opts;
  const appById = new Map(apps.map((a) => [a.id, a]));
  const usableApp = (id?: string): AppItem | undefined => {
    const a = id ? appById.get(id) : undefined;
    return a && !a.archived ? a : undefined;
  };

  // ---- Bước 1: carry-over nhánh chưa xong của plan tuần trước ----
  const prev = plans.find((p) => p.weekStart < weekStart);
  const projects: PlanProject[] = [];
  const carriedTaskIds = new Set<string>();
  for (const pr of prev?.projects ?? []) {
    const pending = (pr.workstreams ?? []).filter((w) => workstreamPct(w) < 100);
    if (pending.length === 0) continue;
    projects.push({
      name: pr.name,
      ...(pr.appId ? { appId: pr.appId } : {}),
      // Giữ state (đang dở thì sang tuần vẫn dở), bỏ progress % của tuần cũ.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      workstreams: pending.map(({ progress, ...rest }) => ({ ...rest })),
    });
    for (const w of pending) for (const id of w.sourceTaskIds ?? []) carriedTaskIds.add(id);
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

  // ---- Bước 2: task đang chạy (chưa nằm trong nhánh carry-over) ----
  const addedTaskIds = new Set(carriedTaskIds);
  const inWeek = (t: TaskItem): boolean =>
    !!t.planDate && weekStart <= t.planDate && t.planDate <= weekEnd;
  for (const t of tasks) {
    if (!isRunningStatus(t.status) || addedTaskIds.has(t.id)) continue;
    const app = usableApp(t.appId);
    if (!app) continue;
    pushWorkstream(app, taskToWorkstream(t, app));
    addedTaskIds.add(t.id);
  }

  // ---- Bước 3: đề xuất release có planDate trong tuần + timeline ----
  const releaseTasks = tasks.filter(
    (t) => inWeek(t) && t.status !== DONE_STATUS && usableApp(t.appId),
  );
  for (const t of releaseTasks) {
    if (addedTaskIds.has(t.id)) continue;
    const app = usableApp(t.appId)!;
    // Có lịch release trong tuần → ép nhánh release, bất kể loại task.
    pushWorkstream(app, {
      ...taskToWorkstream(t, app),
      category: 'release',
      milestone: { type: 'release', text: `Build release ${t.version ?? ''}`.trim() },
    });
    addedTaskIds.add(t.id);
  }
  const timeline: PlanTimelineItem[] = releaseTasks
    .filter((t) => weekdayVN(t.planDate!))
    .sort((a, b) => a.planDate!.localeCompare(b.planDate!))
    .map((t) => ({
      day: weekdayVN(t.planDate!),
      release: `${usableApp(t.appId)!.name} ${t.version ?? ''}`.trim(),
    }));

  if (projects.length === 0) return null;
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
