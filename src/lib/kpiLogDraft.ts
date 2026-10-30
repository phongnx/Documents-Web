// Logic THUẦN của dòng log KPI đang sửa (trang member): giá trị form, luật kiểm tra khi
// lưu, nối ca, nhân bản, khớp mốc. Chép từ KpiLogTable (bản cũ) — giữ nguyên luật, chỉ
// tách lỗi theo từng ô để UI hiện thông báo ngay dưới ô.
import type { KpiEntryInput } from '../hooks/useKpiSheet';
import type { KpiEstRef } from '../estTypes';
import {
  durationMin,
  leaveLabel,
  NO_MILESTONE,
  overlapsLeave,
  parseHm,
  versionKey,
  type KpiEntry,
  type KpiEntryRel,
  type KpiMilestoneOption,
  type LeavePortion,
} from '../kpiTypes';

/** Giá trị form của dòng đang sửa (id rỗng = dòng mới). */
export interface RowDraft {
  id: string;
  date: string;
  start: string;
  end: string;
  category: string;
  project: string;
  /** Id app của project (dòng cũ có thể thiếu — tra lại theo tên). */
  appId?: string;
  feature: string;
  task: string;
  note: string;
  /** Điểm tự chấm (chuỗi từ input number; rỗng = 0). */
  selfDelta: string;
  /** Link về sub task estimate (pick từ dialog estimate). */
  estRef?: KpiEstRef;
  /** Tick "Hoàn thành task estimate" — khi lưu sẽ chốt done + điểm gợi ý. */
  estDone: boolean;
  /** Mốc release/milestone task thuộc về. */
  rel?: KpiEntryRel;
}

export const emptyDraft = (date: string, start = ''): RowDraft => ({
  id: '',
  date,
  start,
  end: '',
  category: '',
  project: '',
  feature: '',
  task: '',
  note: '',
  selfDelta: '0',
  estDone: false,
});

export const draftOf = (e: KpiEntry): RowDraft => ({
  id: e.id,
  date: e.date,
  start: e.start ?? '',
  end: e.end ?? '',
  category: e.category ?? '',
  project: e.project ?? '',
  appId: e.appId,
  feature: e.feature ?? '',
  task: e.task ?? '',
  note: e.note ?? '',
  selfDelta: typeof e.selfDelta === 'number' ? String(e.selfDelta) : '0',
  estRef: e.estRef,
  estDone: false,
  rel: e.rel,
});

/** Member đã đổi gì so với lúc mở form chưa (dòng mới chưa gõ gì = chưa đổi). */
export const isDraftDirty = (d: RowDraft, orig: RowDraft): boolean =>
  JSON.stringify(d) !== JSON.stringify(orig);

/** Mốc đang lưu của dòng có khớp lựa chọn này không: cùng task, cùng app + version,
 *  hoặc (log cũ chỉ có nhãn) cùng nhãn. */
export const relMatches = (rel: KpiEntryRel, o: KpiMilestoneOption): boolean =>
  (!!rel.taskId && rel.taskId === o.taskId) ||
  (!!rel.appId && rel.appId === o.appId && !!versionKey(rel.version) &&
    versionKey(rel.version) === versionKey(o.version)) ||
  rel.label === o.label;

export const relOf = (o: KpiMilestoneOption): KpiEntryRel => ({
  label: o.label,
  ...(o.date ? { date: o.date } : {}),
  taskId: o.taskId,
  appId: o.appId,
  ...(o.version ? { version: o.version } : {}),
});

/** 'yyyy-mm' ± n tháng. */
export function monthShift(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Ô có thể báo lỗi khi lưu. */
export type DraftField = 'start' | 'end' | 'category' | 'project' | 'rel' | 'task';

export interface DraftCheck {
  /** Lỗi theo từng ô (hiện ngay dưới ô). */
  fields: Partial<Record<DraftField, string>>;
  /** Lỗi không gắn ô nào (ngày nghỉ phép cả ngày) — hiện thành dòng cảnh báo đầu form. */
  top: string;
  /** Câu tổng hợp, đúng chữ bản cũ: "Thiếu: …. Giờ kết thúc phải sau…" (snackbar). */
  msg: string;
  ok: boolean;
}

export interface DraftCtx {
  today: string;
  projectNames: string[];
  strictProjects: boolean;
  leaveMap: Map<string, LeavePortion>;
  relOptionsOf: (d: RowDraft) => KpiMilestoneOption[];
}

/**
 * Luật kiểm tra khi lưu (giữ nguyên bản cũ):
 * - Bắt buộc giờ bắt đầu/kết thúc (dòng PLAN — ngày tương lai — chưa cần giờ), giai
 *   đoạn, project, task, mốc release (việc ngoài release chọn "Không thuộc mốc").
 * - Dòng MỚI chỉ nhận project/mốc đang có trong danh sách; dòng cũ giữ được giá trị cũ.
 * - Giờ kết thúc phải sau giờ bắt đầu.
 * - Nghỉ phép cả ngày → không log được; nửa ngày → giờ không được đè buổi nghỉ.
 */
export function validateDraft(d: RowDraft, ctx: DraftCtx): DraftCheck {
  const fields: DraftCheck['fields'] = {};
  const missing: string[] = [];
  const extra: string[] = [];
  const isFuture = d.date > ctx.today;
  const need = (k: DraftField, name: string, hint: string) => {
    fields[k] = hint;
    missing.push(name);
  };
  if (!d.start && !isFuture) need('start', 'Giờ bắt đầu', 'Nhập giờ bắt đầu');
  if (!d.end && !isFuture) need('end', 'Giờ kết thúc', 'Nhập giờ kết thúc');
  if (!d.category) need('category', 'Giai đoạn', 'Chọn giai đoạn');
  if (!d.project.trim()) need('project', 'Project', 'Chọn project');
  if (!d.task.trim()) need('task', 'Task', 'Nhập mô tả task');
  if (!d.rel?.label?.trim())
    need('rel', 'Mốc release', 'Chọn mốc release, hoặc "Không thuộc mốc"');

  if (
    !d.id &&
    ctx.strictProjects &&
    d.project.trim() &&
    !ctx.projectNames.includes(d.project)
  ) {
    fields.project = `Project "${d.project}" không còn trong danh sách được gán — chọn lại.`;
    extra.push(fields.project);
  }
  if (
    !d.id &&
    d.rel?.label &&
    d.rel.label !== NO_MILESTONE &&
    !ctx.relOptionsOf(d).some((o) => relMatches(d.rel!, o))
  ) {
    fields.rel = `Mốc "${d.rel.label}" không còn trong danh sách của project — chọn lại.`;
    extra.push(fields.rel);
  }
  if (d.start && d.end && durationMin({ start: d.start, end: d.end }) === null) {
    fields.end = 'Giờ kết thúc phải sau giờ bắt đầu.';
    extra.push(fields.end);
  }

  let top = '';
  const portion = ctx.leaveMap.get(d.date);
  if (portion === 'full') {
    top = 'Ngày này nghỉ phép cả ngày — không log được task.';
    extra.push(top);
  } else if (portion) {
    const s = parseHm(d.start);
    const e = parseHm(d.end);
    if (s !== null && e !== null && e > s && overlapsLeave(portion, s, e)) {
      const m = `Trùng thời gian nghỉ phép (${leaveLabel(portion)}) — ${
        portion === 'am' ? 'chỉ log từ 12:00 trở đi' : 'chỉ log trước 12:00'
      }.`;
      fields[portion === 'am' ? 'start' : 'end'] = m;
      extra.push(m);
    }
  }

  const summary = missing.length > 0 ? `Thiếu: ${missing.join(', ')}.` : '';
  const msg = [summary, ...extra].filter(Boolean).join(' ');
  return { fields, top, msg, ok: Object.keys(fields).length === 0 && !top };
}

/** Giá trị ghi DB của 1 draft ĐÃ pass validate. */
export function toEntryInput(
  d: RowDraft,
  appIdOf: (project: string) => string | undefined,
): KpiEntryInput {
  return {
    date: d.date,
    start: d.start || undefined,
    end: d.end || undefined,
    category: d.category || undefined,
    project: d.project || undefined,
    appId: d.appId || appIdOf(d.project) || undefined,
    feature: d.feature || undefined,
    task: d.task || undefined,
    note: d.note || undefined,
    // Điểm tự chấm: rỗng/không hợp lệ → 0 (mặc định khi log done).
    selfDelta: Number(d.selfDelta) || 0,
    estRef: d.estRef,
    rel: d.rel,
  };
}

/**
 * Giờ "nối ca" cho dòng mới của 1 ngày = giờ kết thúc của dòng cuối ngày. Ưu tiên draft
 * vừa tự lưu (entry chưa kịp dội về qua onValue) nếu nó là dòng mới / dòng cuối cùng ngày.
 * `dayList` đã sắp theo giờ bắt đầu.
 */
export function nextStartOf(dayList: KpiEntry[], date: string, saved: RowDraft | null): string {
  const last = dayList[dayList.length - 1];
  if (saved && saved.date === date && (!saved.id || saved.id === last?.id) && saved.end)
    return saved.end;
  return last?.end ?? '';
}

/**
 * Nhân bản 1 dòng thành dòng MỚI cùng ngày: copy nội dung, giờ bắt đầu nối ca, giờ kết
 * thúc trống, điểm tự chấm về 0. Project/mốc của dòng gốc không còn trong danh sách
 * → xóa trắng để member chọn lại (dòng mới chỉ nhận giá trị đang có).
 */
export function duplicateDraft(
  src: KpiEntry,
  start: string,
  ctx: Pick<DraftCtx, 'projectNames' | 'strictProjects' | 'relOptionsOf'>,
): RowDraft {
  const copy: RowDraft = { ...draftOf(src), id: '', start, end: '', selfDelta: '0' };
  if (ctx.strictProjects && !ctx.projectNames.includes(copy.project)) {
    copy.project = '';
    copy.appId = undefined;
    copy.rel = undefined;
  } else if (copy.rel && copy.rel.label !== NO_MILESTONE) {
    // Còn trong danh sách → ghi lại bản đầy đủ (log cũ chỉ có nhãn được bổ sung id).
    const o = ctx.relOptionsOf(copy).find((x) => relMatches(copy.rel!, x));
    copy.rel = o ? relOf(o) : undefined;
  }
  return copy;
}

/** Nhãn mốc ngắn trên dòng: bỏ tên app ở đầu khi trùng project ("AppLock2 v1.120" → "v1.120"). */
export function shortRelLabel(label: string, project?: string): string {
  const p = project?.trim();
  return p && label.startsWith(`${p} `) ? label.slice(p.length + 1) : label;
}
