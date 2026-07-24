// Model cho tính năng "KPI member log": leader tạo trang log riêng cho từng member
// (share link, member edit ẩn danh), chấm điểm KPI theo từng dòng task.
// Dữ liệu sheet tại shared/kpi/{token}; danh sách member tại users/{uid}/pm/members.
import { addDays } from './lib/pmDates';

/** 1 dòng log của member — shared/kpi/{token}/entries/{entryId}.
 *  Duration KHÔNG lưu — luôn tính từ start/end (một nguồn sự thật). */
export interface KpiEntry {
  id: string;
  /** ISO 'yyyy-mm-dd' (bắt buộc — rule validate). */
  date: string;
  /** 'HH:MM' 24h. */
  start?: string;
  end?: string;
  /** Giai đoạn (nhãn từ meta.categories — snapshot của kpiRules). */
  category?: string;
  project?: string;
  feature?: string;
  /** Mô tả task. */
  task?: string;
  note?: string;
  /** Điểm TỰ CHẤM của member (mặc định 0 khi log) — hết sửa được khi leader đã chấm (scores tồn tại). */
  selfDelta?: number;
  createdAt: string;
  updatedAt: string;
}

/** Điểm leader chấm cho 1 dòng — shared/kpi/{token}/scores/{entryId}. Chỉ owner ghi. */
export interface KpiScore {
  delta: number;
  reason?: string;
  /** key nhóm quy chế đã dùng để chấm nhanh (tùy chọn, để thống kê sau này). */
  ruleKey?: string;
  scoredAt: string;
}

/** Meta của sheet — shared/kpi/{token}/meta. Chỉ owner ghi; ownerId bất biến (rule validate). */
export interface KpiSheetMeta {
  ownerId: string;
  memberName: string;
  /** Snapshot nhãn giai đoạn từ kpiRules (member ẩn danh không đọc được users/…/meta). */
  categories?: string[];
  /** Danh sách tên project cho ô Project: đã gán → chỉ các project gán; chưa gán → gợi ý tất cả app. */
  projectNames?: string[];
  /** true = member CHỈ được chọn project trong projectNames (đã gán); false/thiếu = nhập tự do. */
  strictProjects?: boolean;
  /** Snapshot quy chế chấm điểm (member xem preview — thiếu thì fallback DEFAULT_KPI_RULES). */
  rules?: KpiRuleGroup[];
  /** true = khóa ghi (member nghỉ/lộ link) — rule chặn member ghi entries. */
  locked?: boolean;
  createdAt: string;
}

/** 1 đợt nghỉ phép — shared/kpi/{token}/leaves/{leaveId}. CHỈ leader ghi (quyền owner),
 *  member đọc để hiển thị + validate giờ log. Min nửa ngày, max 3 ngày (rule validate). */
export interface KpiLeave {
  id: string;
  /** Ngày bắt đầu nghỉ 'yyyy-mm-dd'. */
  startDate: string;
  /** Số ngày nghỉ: 0.5 → 3, bước 0.5. */
  days: number;
  /** Phần lẻ nửa ngày (khi days lẻ .5) rơi vào buổi nào của ngày cuối; mặc định 'am'. */
  half?: 'am' | 'pm';
  note?: string;
  createdAt: string;
}

/** Phần nghỉ của 1 ngày: cả ngày / buổi sáng / buổi chiều. */
export type LeavePortion = 'full' | 'am' | 'pm';

/** Mốc chia buổi sáng/chiều (phút từ 0h) — 12:00. */
export const LEAVE_NOON_MIN = 12 * 60;

export const LEAVE_DAY_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3];

export function leaveLabel(p: LeavePortion): string {
  return p === 'full' ? 'cả ngày' : p === 'am' ? 'buổi sáng' : 'buổi chiều';
}

/** Expand các đợt nghỉ thành map ngày → phần nghỉ (theo ngày lịch, kể cả T7/CN).
 *  Cùng ngày dính cả sáng lẫn chiều (2 đợt khác nhau) → gộp thành 'full'. */
export function leavePortionsOf(leaves: KpiLeave[]): Map<string, LeavePortion> {
  const map = new Map<string, LeavePortion>();
  const put = (date: string, p: LeavePortion) => {
    const cur = map.get(date);
    map.set(date, !cur || cur === p ? p : 'full');
  };
  for (const l of leaves) {
    const fullDays = Math.floor(l.days);
    const hasHalf = l.days % 1 !== 0;
    let d = l.startDate;
    for (let i = 0; i < fullDays; i++) {
      put(d, 'full');
      d = addDays(d, 1);
    }
    if (hasHalf) put(d, l.half === 'pm' ? 'pm' : 'am');
  }
  return map;
}

/** Khoảng giờ [startMin, endMin) có đè lên thời gian nghỉ không.
 *  Nghỉ sáng chặn phần trước 12:00, nghỉ chiều chặn từ 12:00 trở đi. */
export function overlapsLeave(
  portion: LeavePortion,
  startMin: number,
  endMin: number,
): boolean {
  if (portion === 'full') return true;
  if (portion === 'am') return startMin < LEAVE_NOON_MIN;
  return endMin > LEAVE_NOON_MIN;
}

/** Bản ghi member của leader — users/{uid}/pm/members/{memberId}. */
export interface KpiMember {
  id: string;
  name: string;
  /** Token capability của link share (uuid — đổi được khi lộ). */
  token: string;
  active: boolean;
  /** App id các project được gán; rỗng/thiếu = chưa gán (member nhập project tự do). */
  projectIds?: string[];
  order: number;
  createdAt: string;
}

/** 1 mức điểm trong quy chế. */
export interface KpiRuleLevel {
  label: string;
  delta: number;
}
/** 1 giai đoạn trong quy chế — users/{uid}/pm/meta/kpiRules: KpiRuleGroup[]. */
export interface KpiRuleGroup {
  key: string;
  label: string;
  levels: KpiRuleLevel[];
}

/** Điểm gốc mỗi tháng theo quy chế (tháng = 100 + Σ delta). */
export const KPI_MONTH_BASE = 100;

/** Quy chế mặc định — theo file "TTPM Android KPI.xlsx". */
export const DEFAULT_KPI_RULES: KpiRuleGroup[] = [
  {
    key: 'research',
    label: 'Nghiên cứu',
    levels: [
      { label: 'Đầy đủ nguồn/ưu nhược/demo', delta: 1 },
      { label: 'Demo nổi bật hiệu quả', delta: 0.5 },
      { label: 'Đạt yêu cầu (1 nguồn + demo)', delta: 0 },
      { label: 'Bỏ qua báo lỗi/lãng phí thời gian', delta: -0.5 },
      { label: 'Không hiệu quả', delta: -1 },
    ],
  },
  {
    key: 'dev',
    label: 'Phát triển',
    levels: [
      { label: 'Đề xuất tối ưu lớn/refactor thành công', delta: 2 },
      { label: 'Vượt tiến độ theo estimate', delta: 1 },
      { label: 'Đạt tiến độ', delta: 0 },
      { label: 'Chậm/không hoạt động đúng', delta: -1 },
    ],
  },
  {
    key: 'fixbug',
    label: 'Fix bugs',
    levels: [
      { label: 'Vượt tốc độ, hạn chế reopen', delta: 1 },
      { label: 'Đúng tốc độ, commit đầy đủ', delta: 0 },
      { label: 'Bug bị reopen', delta: -0.2 },
      { label: 'Không đúng tiến độ', delta: -1 },
    ],
  },
  {
    key: 'release',
    label: 'Release',
    levels: [
      { label: 'Vượt tiến độ ≥ 4 ngày', delta: 15 },
      { label: 'Vượt tiến độ ≥ 2 ngày', delta: 10 },
      { label: 'Đúng tiến độ', delta: 3 },
      { label: 'Chậm 1 ngày', delta: 0 },
      { label: 'Chậm ≥ 2 ngày', delta: -5 },
      { label: 'Chậm ≥ 4 ngày', delta: -10 },
    ],
  },
  {
    key: 'other',
    label: 'Khác',
    levels: [
      { label: 'Đóng góp tốt (report/log đầy đủ)', delta: 1 },
      { label: 'Bình thường', delta: 0 },
      { label: 'Không report', delta: -1 },
    ],
  },
];

// ---------- Pure helpers (không side-effect) ----------

/** 'HH:MM' → số phút từ 0h; null nếu không parse được. */
export function parseHm(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Giờ nghỉ trưa (phút từ 0h): 11:45 → 13:15 — task vắt qua sẽ bị trừ phần giao. */
export const LUNCH_START_MIN = 11 * 60 + 45;
export const LUNCH_END_MIN = 13 * 60 + 15;

/** Số phút của 1 dòng; null nếu thiếu giờ hoặc end < start (không hỗ trợ ca qua đêm).
 *  Tự trừ phần giao với giờ nghỉ trưa 11:45–13:15 (VD 08:00–15:00 = 7h − 1h30 = 5h30). */
export function durationMin(e: Pick<KpiEntry, 'start' | 'end'>): number | null {
  const a = parseHm(e.start);
  const b = parseHm(e.end);
  if (a === null || b === null || b < a) return null;
  const lunch = Math.max(
    0,
    Math.min(b, LUNCH_END_MIN) - Math.max(a, LUNCH_START_MIN),
  );
  return b - a - lunch;
}

/** Phút → ' 7h30' gọn (0 phút lẻ thì bỏ, VD '8h'). */
export function fmtHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** 'yyyy-mm-dd' → 'yyyy-mm' (key tháng). */
export function monthKeyOf(dateIso: string): string {
  return dateIso.slice(0, 7);
}

/** Format delta hiển thị: +1 / −0.2 / 0 (bỏ số 0 thừa). */
export function fmtDelta(d: number): string {
  const s = Number(d.toFixed(2)).toString();
  return d > 0 ? `+${s}` : s;
}

/** Nhóm entries theo ngày: Map(date → entries), ngày mới nhất trước, trong ngày theo start tăng dần. */
export function groupEntriesByDay(entries: KpiEntry[]): Map<string, KpiEntry[]> {
  const byDay = new Map<string, KpiEntry[]>();
  const sorted = [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (parseHm(a.start) ?? 24 * 60) - (parseHm(b.start) ?? 24 * 60) ||
      a.createdAt.localeCompare(b.createdAt),
  );
  for (const e of sorted) {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }
  return byDay;
}

export interface KpiTotal {
  minutes: number;
  delta: number;
  scoredCount: number;
}

/** Tổng giờ + tổng điểm của 1 danh sách dòng (bỏ qua dòng giờ lỗi khi cộng phút).
 *  Điểm hiệu dụng mỗi dòng: điểm leader chấm nếu có, fallback điểm TỰ CHẤM của member;
 *  `scoredCount` chỉ đếm dòng đã được leader chấm. */
export function totalOf(
  entries: KpiEntry[],
  scores: Record<string, KpiScore>,
): KpiTotal {
  let minutes = 0;
  let delta = 0;
  let scoredCount = 0;
  for (const e of entries) {
    const d = durationMin(e);
    if (d !== null) minutes += d;
    const s = scores[e.id];
    if (s) {
      delta += s.delta;
      scoredCount += 1;
    } else if (typeof e.selfDelta === 'number') {
      delta += e.selfDelta;
    }
  }
  // Tránh sai số float khi cộng nhiều 0.1/0.2.
  return { minutes, delta: Number(delta.toFixed(2)), scoredCount };
}

/** Lọc entries theo tháng 'yyyy-mm'. */
export function entriesOfMonth(entries: KpiEntry[], monthKey: string): KpiEntry[] {
  return entries.filter((e) => monthKeyOf(e.date) === monthKey);
}
