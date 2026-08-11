// Model cho "Break task & Estimate" — bảng break task + estimate theo phase/release
// (cấu trúc theo file docs/estimate.xlsx: nhóm Task → sub task, assignee, est giờ, status, note).
// Dữ liệu đầy đủ tại shared/est/{estId} (capability URL — link chỉ hiện trong trang KPI
// của member tham gia); index riêng tư của leader tại users/{uid}/pm/estimates/{estId}.
//
// Vòng đời: draft (member tự break task + điền est) → leader duyệt = approved (est đóng
// băng, member chỉ đổi status/note) → locked (chỉ xem). actualHours KHÔNG nhập tay —
// tính từ các dòng log KPI link tới sub task (node logs/{taskId}/{entryId} = phút).

export type EstTaskStatus = 'todo' | 'doing' | 'done';

export type EstState = 'draft' | 'approved';

/** 1 sub task đã break — shared/est/{estId}/groups/{gid}/tasks/{tid}. */
export interface EstSubTask {
  id: string;
  title: string;
  /** memberId của member được assign (tên denormalize để không vỡ khi member bị xóa). */
  assigneeId?: string;
  assigneeName?: string;
  /** Giờ estimate (cho phép lẻ, VD 0.25). */
  estHours?: number;
  status: EstTaskStatus;
  note?: string;
  order: number;
}

/** 1 nhóm tính năng (cột Task + Mô tả trong xlsx) — shared/est/{estId}/groups/{gid}. */
export interface EstGroup {
  id: string;
  title: string;
  /** Mô tả yêu cầu của nhóm. */
  desc?: string;
  order: number;
  tasks?: Record<string, EstSubTask>;
}

export interface EstParticipant {
  memberId: string;
  name: string;
}

/** Meta bảng estimate — shared/est/{estId}/meta. Chỉ owner ghi (member không đổi state). */
export interface EstimateMeta {
  ownerId: string;
  title: string;
  appId?: string;
  appName?: string;
  version?: string;
  /** ISO 'yyyy-mm-dd'. */
  startDate?: string;
  endDate?: string;
  /** Số ngày nghỉ/lễ trong khoảng (trừ khỏi tổng ngày công). */
  holidays?: number;
  state: EstState;
  /** true = khóa hẳn (chỉ xem). */
  locked?: boolean;
  participants?: EstParticipant[];
  createdAt: string;
}

/** logs/{taskId}/{entryId} = số PHÚT 1 dòng log KPI đóng góp cho sub task đó. */
export type EstLogs = Record<string, Record<string, number>>;

/** Index riêng tư của leader — users/{uid}/pm/estimates/{estId}. */
export interface EstIndexItem {
  id: string;
  title: string;
  appId?: string;
  version?: string;
  /** memberId các member tham gia — nguồn tính mục "Estimate" trên sheet KPI. */
  participantIds?: string[];
  createdAt: string;
}

/** Tham chiếu từ 1 dòng log KPI về sub task estimate (lưu trên KpiEntry.estRef). */
export interface KpiEstRef {
  estId: string;
  groupId: string;
  taskId: string;
  /** Title sub task tại thời điểm pick (hiển thị nhanh, không phải nguồn chân lý). */
  title?: string;
}

export const EST_STATUS_META: Record<
  EstTaskStatus,
  { label: string; icon: string; badgeClass: string }
> = {
  todo: { label: 'Chưa làm', icon: '⚪', badgeClass: 'st-todo' },
  doing: { label: 'Đang làm', icon: '🔵', badgeClass: 'st-doing' },
  done: { label: 'Xong', icon: '✅', badgeClass: 'st-done' },
};

// ---------- Pure helpers ----------

/** Sort group/task theo order (RTDB lưu Record — không đảm bảo thứ tự). */
export function sortedGroups(groups?: Record<string, EstGroup>): EstGroup[] {
  return Object.values(groups ?? {}).sort((a, b) => a.order - b.order);
}
export function sortedTasks(group: EstGroup): EstSubTask[] {
  return Object.values(group.tasks ?? {}).sort((a, b) => a.order - b.order);
}

/** Σ phút actual của 1 sub task từ node logs. */
export function actualMinOf(logs: EstLogs | undefined, taskId: string): number {
  return Object.values(logs?.[taskId] ?? {}).reduce((s, m) => s + (m || 0), 0);
}

/** Phút → '9h45' (bỏ phút lẻ 0). */
export function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Giờ estimate (số lẻ) → '17h' / '0h15'. */
export function fmtEstHours(h: number): string {
  return fmtMin(Math.round(h * 60));
}

/**
 * Gợi ý ± điểm KPI khi sub task done (map nhóm "Phát triển" của quy chế),
 * ratio = thực tế / est: nhanh ≥20% → +1 (vượt tiến độ); đến chậm ≤10% → 0 (đạt);
 * chậm >10% đến 20% → −0.5; chậm >20% → −1.
 * Không có est hoặc chưa có actual → null (không có căn cứ, không gợi ý).
 */
export function suggestDelta(
  estHours: number | undefined,
  actualMin: number,
): number | null {
  if (!estHours || estHours <= 0 || actualMin <= 0) return null;
  const ratio = actualMin / 60 / estHours;
  if (ratio <= 0.8) return 1;
  if (ratio <= 1.1) return 0;
  if (ratio <= 1.2) return -0.5;
  return -1;
}

/** 1 ngày công = 8h (quy đổi est giờ → ngày khi tự tính End). */
export const EST_HOURS_PER_DAY = 8;

/**
 * End DỰ KIẾN khi meta không điền End tay: từ Start đếm đủ số ngày làm việc (T2–T6)
 * = ceil(giờ cần / 8h) + holidays. Giờ cần = MAX tổng est theo assignee (mọi người
 * làm SONG SONG — tiến độ do người bận nhất quyết định; task chưa gán tính như 1 người).
 * Thiếu Start hoặc chưa có est nào → null (không đủ căn cứ).
 */
export function estAutoEndDate(
  start: string | undefined,
  holidays: number | undefined,
  groups?: Record<string, EstGroup>,
): string | null {
  if (!start) return null;
  const hours = Math.max(0, ...estHoursByAssignee(groups).values());
  if (hours <= 0) return null;
  const needed = Math.ceil(hours / EST_HOURS_PER_DAY) + Math.max(0, holidays ?? 0);
  const d = new Date(start + 'T00:00:00');
  let count = 0;
  // Chặn trên ~2 năm để không loop vô hạn với input bất thường.
  for (let i = 0; i < 800; i++) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    if (count >= needed) break;
    d.setDate(d.getDate() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Số ngày làm việc (T2–T6) trong [start, end] trừ holidays; thiếu ngày → null. */
export function totalWorkDays(
  start?: string,
  end?: string,
  holidays?: number,
): number | null {
  if (!start || !end || end < start) return null;
  let count = 0;
  const d = new Date(start + 'T00:00:00');
  const stop = new Date(end + 'T00:00:00');
  while (d <= stop) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(0, count - (holidays ?? 0));
}

/** Tổng est (giờ) theo từng assignee: Map(tên → giờ) — như dòng SUMIF cuối sheet xlsx. */
export function estHoursByAssignee(
  groups?: Record<string, EstGroup>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const g of sortedGroups(groups)) {
    for (const t of sortedTasks(g)) {
      if (!t.estHours) continue;
      const key = t.assigneeName || '(chưa gán)';
      map.set(key, Number(((map.get(key) ?? 0) + t.estHours).toFixed(2)));
    }
  }
  return map;
}

/** Tiến độ bảng: % = Σ est của sub task done / Σ est (est trống không tính). */
export function estProgress(groups?: Record<string, EstGroup>): {
  pct: number;
  doneCount: number;
  total: number;
} {
  let done = 0;
  let sum = 0;
  let doneCount = 0;
  let total = 0;
  for (const g of sortedGroups(groups)) {
    for (const t of sortedTasks(g)) {
      total++;
      if (t.status === 'done') doneCount++;
      if (!t.estHours) continue;
      sum += t.estHours;
      if (t.status === 'done') done += t.estHours;
    }
  }
  return { pct: sum > 0 ? Math.round((done / sum) * 100) : 0, doneCount, total };
}
