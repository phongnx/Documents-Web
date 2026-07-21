// Model cho mục "Bảng dự án" (quản lý app + task/release của team).
// Dữ liệu riêng tư, lưu tại users/{uid}/pm/{apps,tasks,meta}.

export interface AppItem {
  id: string;
  name: string;
  /** 'Android' | 'Flutter' | 'iOS' | ... (cho tự thêm) */
  platform: string;
  /** Nhóm app (VD 'Weather' gồm WF1/WF3/Radar). Rỗng = không nhóm. */
  group?: string;
  order: number;
  createdAt: string;
  note?: string;
  archived?: boolean;
}

// Task hợp nhất cả "release" lẫn các loại việc khác. Core fields để lọc/thống kê,
// còn nội dung dài để ở `description` (markdown).
export interface TaskItem {
  id: string;
  /** rỗng = chưa gán app */
  appId?: string;
  title: string;
  /** loại task: Release/Feature/Bugfix/A-B test/… (preset + tự thêm) */
  type: string;
  /** trạng thái chuẩn hóa (xem DEFAULT_STATUSES) */
  status: string;
  version?: string;
  /** nội dung chi tiết (markdown) */
  description?: string;
  /** ISO date 'yyyy-mm-dd' */
  startDate?: string;
  endDate?: string;
  /** mốc release theo plan (dùng cho lịch tuần) */
  planDate?: string;
  milestone?: string;
  assignee?: string;
  flavor?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Loại milestone quản lý được (label + cờ có phải là release). */
export interface MilestoneType {
  key: string;
  label: string;
  isRelease: boolean;
}

export interface PmMeta {
  taskTypes: string[];
  statuses: string[];
  /** Danh mục loại milestone (preset + tự thêm). */
  milestoneTypes: MilestoneType[];
  /** Danh mục "loại nhánh" của plan tuần (preset DEFAULT_PLAN_CATEGORIES + tự thêm). */
  planCategories: string[];
}

/** Loại milestone mặc định (không cho xóa 2 loại gốc này). */
export const DEFAULT_MILESTONE_TYPES: MilestoneType[] = [
  { key: 'release', label: 'Release', isRelease: true },
  { key: 'test', label: 'Test/Fix', isRelease: false },
];

/** Tập key của các loại milestone được đánh dấu là release (để tính card/lịch). */
export function releaseKeysOf(types: MilestoneType[]): Set<string> {
  return new Set(types.filter((t) => t.isRelease).map((t) => t.key));
}

/** Meta 1 loại milestone theo key; không có → dùng chính key làm label, không phải release. */
export function msTypeMeta(types: MilestoneType[], key: string): MilestoneType {
  return types.find((t) => t.key === key) ?? { key, label: key, isRelease: false };
}

/** Sinh key (slug) từ label loại milestone; rỗng thì fallback theo số lượng hiện có. */
export function msKeyFromLabel(label: string, count = 0): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `m${count}`
  );
}

// Shape dữ liệu import (script Python sinh ra) và cũng là shape lưu ở pm/.
export interface PmImportPayload {
  apps?: Record<string, AppItem>;
  tasks?: Record<string, TaskItem>;
  meta?: PmMeta;
}

// ---------- Model "Plan tuần" (Weekly Plan) ----------
// Một plan tuần render được ra 2 file HTML tĩnh (bản chi tiết & bản release/test).

/** Loại workstream → quyết định badge + gom nhóm khi export. */
export type WorkstreamCategory = 'release' | 'test' | 'ads' | 'plan' | 'other';

export interface PlanMilestone {
  /** Key của loại milestone (xem PmMeta.milestoneTypes); preset: 'release' | 'test'. */
  type: string;
  text: string;
}

/** Trạng thái tiến độ của 1 nhánh trong plan tuần. */
export type WorkstreamState = 'todo' | 'doing' | 'testing' | 'done' | 'blocked';

export interface PlanWorkstream {
  /** VD: 'Android', 'iOS', 'Ads Integration', 'Baby & Mom'… */
  title: string;
  /** Loại nhánh: 5 preset (release/test/ads/plan/other) hoặc tự thêm (chuỗi tự do). */
  category: string;
  /** Danh sách đầu việc (mỗi phần tử 1 gạch đầu dòng). */
  items: string[];
  milestone?: PlanMilestone;
  /** Id các task nguồn (khi nhánh được tạo từ dialog chọn task) — để liên kết plan↔task. */
  sourceTaskIds?: string[];
  /** Trạng thái tiến độ (mặc định 'todo' nếu thiếu). */
  state?: WorkstreamState;
  /** % tiến độ nhập tay (0–100); thiếu thì suy từ `state`. */
  progress?: number;
}

export interface PlanProject {
  name: string;
  /** Liên kết tới app có sẵn (để chọn task khi thêm nhánh); rỗng = nhập tay. */
  appId?: string;
  workstreams: PlanWorkstream[];
}

export interface PlanTimelineItem {
  /** VD: 'Thứ 3'. */
  day: string;
  /** VD: 'iOS CalcAI v1.0'. */
  release: string;
}

export interface WeeklyPlan {
  id: string;
  title: string;
  description: string;
  /** ISO date 'yyyy-mm-dd'. */
  weekStart: string;
  weekEnd: string;
  projects: PlanProject[];
  timeline: PlanTimelineItem[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Nhãn + class badge cho từng category (khớp template HTML export). */
export const CATEGORY_META: Record<
  WorkstreamCategory,
  { label: string; badgeClass: string }
> = {
  release: { label: 'Release', badgeClass: 'release-badge' },
  test: { label: 'Test/Fix', badgeClass: 'test-badge' },
  ads: { label: 'Ads', badgeClass: '' },
  plan: { label: 'Plan', badgeClass: 'research-badge' },
  other: { label: 'Khác', badgeClass: 'research-badge' },
};

/** Danh sách loại nhánh mặc định (preset). */
export const DEFAULT_PLAN_CATEGORIES = ['release', 'test', 'ads', 'plan', 'other'];

/** Nhãn + class badge cho 1 category (preset dùng CATEGORY_META, tự thêm dùng chính nó). */
export function catMeta(c: string): { label: string; badgeClass: string } {
  return (
    CATEGORY_META[c as WorkstreamCategory] ?? { label: c, badgeClass: 'research-badge' }
  );
}

/** Nhãn/icon/% ngầm định/class badge cho từng trạng thái nhánh. */
export const WORKSTREAM_STATE_META: Record<
  WorkstreamState,
  { label: string; icon: string; pct: number; badgeClass: string }
> = {
  todo: { label: 'Chưa làm', icon: '⚪', pct: 0, badgeClass: 'st-todo' },
  doing: { label: 'Đang làm', icon: '🔵', pct: 50, badgeClass: 'st-doing' },
  testing: { label: 'Test', icon: '🧪', pct: 80, badgeClass: 'st-fix' },
  done: { label: 'Xong', icon: '✅', pct: 100, badgeClass: 'st-done' },
  blocked: { label: 'Blocked', icon: '⛔', pct: 0, badgeClass: 'st-block' },
};

/** Thứ tự trạng thái cho dropdown. */
export const WORKSTREAM_STATES: WorkstreamState[] = [
  'todo',
  'doing',
  'testing',
  'done',
  'blocked',
];

/** % hiệu dụng của 1 nhánh: ưu tiên `progress` nhập tay, thiếu thì suy từ `state`. */
export function workstreamPct(w: PlanWorkstream): number {
  if (typeof w.progress === 'number') return Math.max(0, Math.min(100, w.progress));
  return WORKSTREAM_STATE_META[w.state ?? 'todo'].pct;
}

export const DEFAULT_TASK_TYPES = [
  'Release',
  'Feature',
  'Bugfix',
  'A/B test',
  'Khác',
];
export const DEFAULT_STATUSES = [
  'Chưa bắt đầu',
  'Đang thực hiện',
  'Đang fix bugs',
  'Đã hoàn thành',
];

/** Trạng thái coi là "đã xong" (dùng cho thống kê app đã release). */
export const DONE_STATUS = 'Đã hoàn thành';

/**
 * Khung "mẫu tuần này" cho plan mới — bám nội dung 2 file HTML mẫu để sửa nhanh.
 * (id/order/createdAt/updatedAt do context điền khi tạo.)
 */
export function newPlanTemplate(
  weekStart: string,
  weekEnd: string,
): Omit<WeeklyPlan, 'id' | 'order' | 'createdAt' | 'updatedAt'> {
  return {
    title: 'Kế hoạch tuần Mobile Team',
    description:
      'Tổng hợp các đầu việc trọng tâm của team Mobile trong tuần: build/release, build test & fix bugs, hoàn thiện source code mới, tích hợp Ads, nâng targetSdkVersion 36 và triển khai các plan tính năng tiếp theo.',
    weekStart,
    weekEnd,
    projects: [
      {
        name: 'VPN',
        workstreams: [
          {
            title: 'Android',
            category: 'test',
            items: ['Hoàn thiện tính năng phase 3.'],
            milestone: { type: 'test', text: 'Build test & fix bugs' },
          },
        ],
      },
      {
        name: 'Email',
        workstreams: [
          {
            title: 'Build source code mới',
            category: 'test',
            items: [
              'Hoàn thiện Unit Test và bộ test case bàn giao cho tester.',
              'Hoàn thiện một số tính năng phụ trợ và các logic ẩn.',
            ],
            milestone: { type: 'test', text: 'Build test & fix bugs' },
          },
        ],
      },
      {
        name: 'FL CalcAI',
        workstreams: [
          {
            title: 'iOS',
            category: 'release',
            items: ['Cập nhật UI cho iOS.'],
            milestone: { type: 'release', text: 'Build release v1.0' },
          },
          {
            title: 'Android',
            category: 'ads',
            items: ['Tích hợp đầy đủ Ads tương tự Calc2.'],
          },
        ],
      },
      {
        name: 'Many AI',
        workstreams: [
          {
            title: 'Android',
            category: 'test',
            items: [
              'Giới hạn lượt sử dụng cho user Guest chưa đăng nhập và user đã login nhưng chưa mua gói.',
              'Tích hợp Small Banner Ad và Reward Ad để tăng thêm lượt dùng AI.',
            ],
            milestone: { type: 'test', text: 'Build test & fix bugs' },
          },
        ],
      },
      {
        name: 'Music2',
        workstreams: [
          {
            title: 'Mobile',
            category: 'release',
            items: ['Upgrade targetSdkVersion 36.'],
            milestone: { type: 'release', text: 'Build release v1.60' },
          },
        ],
      },
      {
        name: 'AppLock2',
        workstreams: [
          {
            title: 'Ads Integration',
            category: 'release',
            items: [
              'Tích hợp AppLovin cho Ads, ưu tiên trước cho unit Inter_Action.',
              'Bổ sung các kịch bản hiển thị Inter_Action trong app.',
            ],
            milestone: { type: 'release', text: 'Build release v1.113' },
          },
        ],
      },
      {
        name: 'Weather',
        workstreams: [
          {
            title: 'iOS Weather365',
            category: 'plan',
            items: ['Hoàn thiện break task và estimate.', 'Triển khai dự án theo plan.'],
          },
          {
            title: 'Android: WF1, WF3, Radar',
            category: 'release',
            items: ['Upgrade targetSdkVersion 36.'],
            milestone: { type: 'release', text: 'Build release WF3 v1.72' },
          },
        ],
      },
      {
        name: 'Period',
        workstreams: [
          {
            title: 'Baby & Mom',
            category: 'test',
            items: ['Hoàn thiện giai đoạn dev cho task Tracking Baby.'],
            milestone: { type: 'test', text: 'Build test & fix bugs' },
          },
          {
            title: 'BE',
            category: 'plan',
            items: ['Thống kê price AI và đấu nối hệ thống monitoring.'],
          },
        ],
      },
      {
        name: 'Note Diary',
        workstreams: [
          {
            title: 'Phase 1',
            category: 'plan',
            items: ['Tiếp tục triển khai theo plan khi có thời gian trống.'],
          },
        ],
      },
    ],
    timeline: [
      { day: 'Thứ 3', release: 'iOS CalcAI v1.0' },
      { day: 'Thứ 3', release: 'Music2 v1.60' },
      { day: 'Thứ 4', release: 'WF3 v1.72' },
      { day: 'Thứ 5', release: 'AppLock2 v1.113' },
    ],
  };
}

// ---------- Model "Báo cáo ngày" (Daily Report) ----------
// Báo cáo tiến độ hàng ngày của team, gõ nhanh theo marker (#/-/->/+) từng dự án.

export interface ReportProject {
  name: string;
  /** Liên kết tới app có sẵn (tùy chọn). */
  appId?: string;
  /** Nội dung thô theo marker: '#'=nhánh, '-'=bullet, '->'=kết quả, '+'=mục con. */
  body: string;
}

export interface DailyReport {
  id: string;
  /** ISO date 'yyyy-mm-dd'. */
  date: string;
  title: string;
  projects: ReportProject[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Khung báo cáo mới cho 1 ngày (id/order/createdAt/updatedAt do context điền). */
export function newReportTemplate(
  date: string,
): Omit<DailyReport, 'id' | 'order' | 'createdAt' | 'updatedAt'> {
  return {
    title: 'Report Mobile Team',
    date,
    projects: [{ name: 'Dự án mới', body: '# Android:\n- ' }],
  };
}
