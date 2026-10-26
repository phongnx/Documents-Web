// Bảng log KPI dùng chung 2 chế độ:
// - mode 'member': sửa inline từng dòng (dòng đã chấm điểm bị khóa), thêm/xóa dòng.
// - mode 'leader': đọc nội dung, click cột Điểm để chấm, xóa dòng (kèm điểm).
// Cấu trúc theo file Excel: nhóm theo ngày (mới nhất trước) + dòng Tổng giờ/điểm mỗi ngày,
// header hiện "KPI Tháng = 100 + Σ" + tổng giờ của tháng đang chọn.
import { Fragment, useState } from 'react';
import {
  durationMin,
  entriesOfMonth,
  fmtDelta,
  fmtHours,
  groupEntriesByDay,
  KPI_MONTH_BASE,
  kpiScoreClass,
  leaveLabel,
  leavePortionsOf,
  overlapsLeave,
  parseHm,
  totalOf,
  type KpiEntry,
  type KpiEntryRel,
  type KpiLeave,
  type KpiMilestoneOption,
  milestoneOptionsOf,
  NO_MILESTONE,
  type KpiScore,
  type KpiTaskSnap,
  type KpiWeekPlan,
  versionKey,
} from '../../kpiTypes';
import type { KpiEntryInput } from '../../hooks/useKpiSheet';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { addDays, isoLocal, mondayOf, nextWorkday, weekdayVN } from '../../lib/pmDates';
import { formatDateVi } from '../../lib/reportFormat';
import type { KpiEstRef } from '../../estTypes';
import KpiEstPickerDialog from './KpiEstPickerDialog';
import KpiWeekPlanDialog from './KpiWeekPlanDialog';

interface Props {
  mode: 'member' | 'leader';
  entries: KpiEntry[];
  scores: Record<string, KpiScore>;
  /** Tháng đang xem 'yyyy-mm'. */
  monthKey: string;
  onMonthChange: (m: string) => void;
  /** Danh mục giai đoạn cho dropdown. */
  categories: string[];
  /** Danh sách tên project (datalist gợi ý, hoặc select cứng khi strictProjects). */
  projectNames: string[];
  /** Id app cùng thứ tự projectNames (meta.projectIds — sheet chưa sync thì thiếu). */
  projectIds?: string[];
  /** true = member CHỈ chọn được project trong projectNames (đã được leader gán). */
  strictProjects?: boolean;
  /** Các đợt nghỉ phép — hiển thị ở block ngày + validate giờ log không trùng giờ nghỉ. */
  leaves?: KpiLeave[];
  /** Plan chung theo tuần (key = thứ 2 của tuần) — hiển thị block trên bảng. */
  weekPlans?: Record<string, KpiWeekPlan>;
  /** Member: lưu plan tuần (text rỗng = xóa). Không truyền = chỉ xem (leader). */
  onSaveWeekPlan?: (weekStart: string, text: string) => void;
  /** Các bảng estimate member tham gia (meta.estimates) — bật nút 📐 pick task. */
  estimates?: { id: string; title: string; taskId?: string }[];
  /** Snapshot task các app được gán (node tasks) — nguồn select 🚀 Mốc. */
  tasks?: KpiTaskSnap[];
  kpiMemberId?: string;
  kpiMemberName?: string;
  /** Tick "Hoàn thành task estimate" khi lưu dòng → page chạy flow chốt điểm. */
  onCompleteEst?: (
    estRef: KpiEstRef,
    entryId: string,
    entryMin: number | null,
  ) => void;
  /** Member mode: true = sheet bị khóa, ẩn mọi nút sửa. */
  locked?: boolean;
  onAdd?: (input: KpiEntryInput) => string | null;
  onUpdate?: (id: string, patch: Partial<KpiEntryInput>) => void;
  onDelete?: (id: string) => void;
  /** Leader: click ô Điểm của 1 dòng. */
  onScoreClick?: (entry: KpiEntry) => void;
  /** Leader: chấp nhận nhanh điểm tự chấm cho các dòng chưa chấm (1 dòng / cả ngày / cả tháng). */
  onAcceptEntries?: (entries: KpiEntry[]) => void;
  /** Leader: xóa dòng (kèm điểm nếu có). */
  onDeleteWithScore?: (id: string) => void;
}

/** Mốc đang lưu của dòng có khớp lựa chọn này không: cùng task, cùng app + version,
 *  hoặc (log cũ chỉ có nhãn) cùng nhãn. */
const relMatches = (rel: KpiEntryRel, o: KpiMilestoneOption): boolean =>
  (!!rel.taskId && rel.taskId === o.taskId) ||
  (!!rel.appId && rel.appId === o.appId && !!versionKey(rel.version) &&
    versionKey(rel.version) === versionKey(o.version)) ||
  rel.label === o.label;

const relOf = (o: KpiMilestoneOption): KpiEntryRel => ({
  label: o.label,
  ...(o.date ? { date: o.date } : {}),
  taskId: o.taskId,
  appId: o.appId,
  ...(o.version ? { version: o.version } : {}),
});

/** Giá trị form của dòng đang sửa (id rỗng = dòng mới). */
interface RowDraft {
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
  /** Link về sub task estimate (pick từ dialog 📐). */
  estRef?: KpiEstRef;
  /** Tick "Hoàn thành task estimate" — khi lưu sẽ chốt done + điểm gợi ý. */
  estDone: boolean;
  /** Mốc release/milestone task thuộc về. */
  rel?: KpiEntryRel;
}

const emptyDraft = (date: string, start = ''): RowDraft => ({
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

const draftOf = (e: KpiEntry): RowDraft => ({
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

// 'yyyy-mm' ± n tháng.
function monthShift(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Badge điểm: dương xanh / âm đỏ / 0 xám.
function ScoreBadge({ score }: { score: KpiScore }) {
  const cls = score.delta > 0 ? 'pos' : score.delta < 0 ? 'neg' : 'zero';
  return (
    <span className={`kpi-score ${cls}`} title={score.reason || undefined}>
      {fmtDelta(score.delta)}
    </span>
  );
}

// Badge điểm TỰ CHẤM (viền đứt, nhạt) — chưa được leader xác nhận.
function SelfScoreBadge({ delta }: { delta: number }) {
  const cls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero';
  return (
    <span
      className={`kpi-score self ${cls}`}
      title="Điểm tự chấm — chờ leader xác nhận"
    >
      {fmtDelta(delta)}
    </span>
  );
}

export default function KpiLogTable({
  mode,
  entries,
  scores,
  monthKey,
  onMonthChange,
  categories,
  projectNames,
  projectIds,
  strictProjects,
  leaves,
  weekPlans,
  onSaveWeekPlan,
  estimates,
  tasks,
  kpiMemberId,
  kpiMemberName,
  onCompleteEst,
  locked,
  onAdd,
  onUpdate,
  onDelete,
  onScoreClick,
  onAcceptEntries,
  onDeleteWithScore,
}: Props) {
  const [draft, setDraft] = useState<RowDraft | null>(null);
  // Field đang lỗi validate + thông báo (chỉ set khi bấm Lưu, gõ vào ô nào thì bỏ lỗi ô đó).
  const [errFields, setErrFields] = useState<Set<string>>(new Set());
  const [errMsg, setErrMsg] = useState('');
  // Tuần đang sửa plan chung trong dialog (null = đóng) — hooks luôn ở TOP (Rules of Hooks).
  const [weekPlanEdit, setWeekPlanEdit] = useState<string | null>(null);
  // Dialog pick task từ bảng estimate cho dòng đang sửa.
  const [estPickOpen, setEstPickOpen] = useState(false);
  useUnsavedGuard(!!draft);
  const patchDraft = (u: Partial<RowDraft>) => {
    setDraft((d) => (d ? { ...d, ...u } : d));
    if (errFields.size > 0)
      setErrFields((prev) => {
        const next = new Set(prev);
        for (const k of Object.keys(u)) next.delete(k);
        return next;
      });
  };
  // Đổi project → cập nhật appId; mốc của app cũ không còn hợp lệ nên xóa (giữ
  // "Không thuộc mốc" vì lựa chọn đó không phụ thuộc app).
  const onProjectChange = (project: string) =>
    patchDraft({
      project,
      appId: appIdOf(project),
      ...(draft?.rel && draft.rel.label !== NO_MILESTONE ? { rel: undefined } : {}),
    });
  const openDraft = (d: RowDraft | null) => {
    setDraft(d);
    setErrFields(new Set());
    setErrMsg('');
  };

  // Map ngày → phần nghỉ phép (cả ngày / sáng / chiều) để hiển thị + validate.
  const leaveMap = leavePortionsOf(leaves ?? []);

  // Id app theo tên project: ưu tiên meta.projectIds (cùng thứ tự projectNames); sheet
  // chưa được leader sync lại thì tra theo tên app trong snapshot task.
  const appIdOf = (name: string): string | undefined => {
    const i = projectNames.indexOf(name);
    if (i >= 0 && projectIds?.[i]) return projectIds[i];
    return (tasks ?? []).find((t) => t.appName === name)?.appId;
  };
  // Danh sách mốc của app đang chọn ở dòng: task chưa xong + task mới xong ≤ 2 ngày.
  const todayIso = isoLocal(new Date());
  const relOptionsOf = (d: RowDraft): KpiMilestoneOption[] => {
    const appId = d.appId || appIdOf(d.project);
    return appId ? milestoneOptionsOf(tasks ?? [], appId, todayIso) : [];
  };

  // Bộ field tối thiểu khi lưu 1 dòng: start/end hợp lệ + giai đoạn + project + task.
  // Dòng PLAN (ngày tương lai) chưa cần giờ — đến ngày đó sửa dòng thì bắt giờ trở lại.
  const validateDraft = (d: RowDraft): { fields: Set<string>; msg: string } => {
    const fields = new Set<string>();
    const missing: string[] = [];
    const isFuture = d.date > isoLocal(new Date());
    if (!d.start && !isFuture) {
      fields.add('start');
      missing.push('Giờ bắt đầu');
    }
    if (!d.end && !isFuture) {
      fields.add('end');
      missing.push('Giờ kết thúc');
    }
    if (!d.category) {
      fields.add('category');
      missing.push('Giai đoạn');
    }
    if (!d.project.trim()) {
      fields.add('project');
      missing.push('Project');
    }
    if (!d.task.trim()) {
      fields.add('task');
      missing.push('Task');
    }
    // Mốc release BẮT BUỘC — việc không thuộc release nào thì chọn "Không thuộc mốc"
    // (chọn có ý thức, tránh bảng tổng kết thiếu mốc rồi phải dò lại từng dòng).
    if (!d.rel?.label?.trim()) {
      fields.add('rel');
      missing.push('Mốc release');
    }
    let msg = missing.length > 0 ? `Thiếu: ${missing.join(', ')}.` : '';
    // Dòng MỚI (gồm dòng nhân bản) chỉ nhận project/mốc đang có trong danh sách; dòng cũ
    // dùng tên app/mốc cũ vẫn sửa được (không bắt chọn lại).
    if (!d.id && strictProjects && d.project.trim() && !projectNames.includes(d.project)) {
      fields.add('project');
      msg += `${msg ? ' ' : ''}Project "${d.project}" không còn trong danh sách được gán — chọn lại.`;
    }
    if (
      !d.id &&
      d.rel?.label &&
      d.rel.label !== NO_MILESTONE &&
      !relOptionsOf(d).some((o) => relMatches(d.rel!, o))
    ) {
      fields.add('rel');
      msg += `${msg ? ' ' : ''}Mốc "${d.rel.label}" không còn trong danh sách của project — chọn lại.`;
    }
    if (d.start && d.end && durationMin({ start: d.start, end: d.end }) === null) {
      fields.add('start');
      fields.add('end');
      msg += `${msg ? ' ' : ''}Giờ kết thúc phải sau giờ bắt đầu.`;
    }
    // Rule nghỉ phép: cả ngày → không log được; nửa ngày → giờ không được đè lên buổi nghỉ.
    const portion = leaveMap.get(d.date);
    if (portion === 'full') {
      fields.add('start');
      fields.add('end');
      msg += `${msg ? ' ' : ''}Ngày này nghỉ phép cả ngày — không log được task.`;
    } else if (portion) {
      const s = parseHm(d.start);
      const e = parseHm(d.end);
      if (s !== null && e !== null && e > s && overlapsLeave(portion, s, e)) {
        fields.add('start');
        fields.add('end');
        msg += `${msg ? ' ' : ''}Trùng thời gian nghỉ phép (${leaveLabel(portion)}) — ${
          portion === 'am' ? 'chỉ log từ 12:00 trở đi' : 'chỉ log trước 12:00'
        }.`;
      }
    }
    return { fields, msg };
  };

  // Member chưa được gán project nào → không log được (project là field bắt buộc).
  const noProjects = strictProjects === true && projectNames.length === 0;
  const canEdit = mode === 'member' && !locked && !noProjects;

  // Plan tuần: tuần hiện tại + tuần sau (nếu có) hiện block trên bảng;
  // cuối tuần (Thứ 6/7/CN) member được lập/sửa plan chung cho tuần sau.
  const curWeekStart = mondayOf(todayIso);
  const nextWeekStart = addDays(curWeekStart, 7);
  const dowToday = new Date(todayIso + 'T00:00:00').getDay();
  const isWeekendNow = dowToday === 5 || dowToday === 6 || dowToday === 0;
  const shownWeekPlans = [curWeekStart, nextWeekStart].filter((w) => weekPlans?.[w]);
  const monthEntries = entriesOfMonth(entries, monthKey);
  const byDay = groupEntriesByDay(monthEntries);
  // Dòng mới của ngày chưa có entry nào → thêm ngày đó vào danh sách nhóm.
  if (draft && !draft.id && draft.date.startsWith(monthKey) && !byDay.has(draft.date)) {
    byDay.set(draft.date, []);
  }
  // Ngày nghỉ phép trong tháng chưa có dòng log → vẫn hiện block ngày (kèm info nghỉ).
  for (const d of leaveMap.keys()) {
    if (d.startsWith(monthKey) && !byDay.has(d)) byDay.set(d, []);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const monthTotal = totalOf(monthEntries, scores);
  const monthScore = Number((KPI_MONTH_BASE + monthTotal.delta).toFixed(2));
  // Các dòng "chờ xác nhận" (chưa có điểm leader) — cho nút accept nhanh của leader.
  const pendingOf = (list: KpiEntry[]) => list.filter((e) => !scores[e.id]);
  const canAccept = mode === 'leader' && !!onAcceptEntries;
  const pendingMonth = canAccept ? pendingOf(monthEntries) : [];

  // Ghi 1 draft ĐÃ pass validate xuống DB (dùng chung cho nút ✓ và auto-lưu).
  const persistDraft = (d: RowDraft) => {
    const input: KpiEntryInput = {
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
    let entryId = d.id;
    if (d.id) onUpdate?.(d.id, input);
    else entryId = onAdd?.(input) ?? '';
    // Tick "Hoàn thành task estimate" → dòng này là DÒNG CHỐT: page chạy flow
    // completeEstTask (status done + điểm gợi ý điền vào chính dòng này).
    if (d.estDone && d.estRef && entryId)
      onCompleteEst?.(d.estRef, entryId, durationMin({ start: d.start, end: d.end }));
  };

  const saveDraft = () => {
    if (!draft || !draft.date) return;
    // Không cho hoàn thành khi thiếu field tối thiểu — highlight ô lỗi + thông báo.
    const v = validateDraft(draft);
    if (v.fields.size > 0) {
      setErrFields(v.fields);
      setErrMsg(v.msg);
      return;
    }
    persistDraft(draft);
    openDraft(null);
  };

  // Tự lưu dòng đang sửa dở trước khi mở draft khác (bấm ＋ / ⧉ / click dòng khác):
  // đủ điều kiện → lưu luôn và cho action tiếp tục; thiếu field → báo lỗi như khi
  // bấm ✓ và CHẶN action (giữ nguyên dòng đang sửa, không mất dữ liệu).
  const commitDraftIfAny = (): { ok: boolean; saved: RowDraft | null } => {
    if (!draft) return { ok: true, saved: null };
    const v = validateDraft(draft);
    if (v.fields.size > 0) {
      setErrFields(v.fields);
      setErrMsg(`${v.msg} — dòng đang sửa chưa được lưu, hoàn thiện trước khi thêm dòng khác.`);
      return { ok: false, saved: null };
    }
    persistDraft(draft);
    return { ok: true, saved: draft };
  };

  // Giờ "nối ca" cho dòng mới của 1 ngày: end của dòng cuối ngày; ưu tiên draft
  // vừa auto-lưu (entry chưa kịp dội về qua onValue) nếu nó là dòng mới/dòng cuối cùng ngày.
  const nextStartOf = (date: string, saved: RowDraft | null): string => {
    const list = byDay.get(date) ?? [];
    const last = list[list.length - 1];
    if (saved && saved.date === date && (!saved.id || saved.id === last?.id) && saved.end)
      return saved.end;
    return last?.end ?? '';
  };

  // Thêm dòng cho 1 ngày: seed start = end của dòng cuối ngày (nối ca làm việc).
  const startAdd = (date: string) => {
    const { ok, saved } = commitDraftIfAny();
    if (!ok) return;
    openDraft(emptyDraft(date, nextStartOf(date, saved)));
  };

  // Nhân bản 1 dòng thành dòng MỚI cùng ngày: copy nội dung, giờ seed nối ca,
  // điểm tự chấm về 0 (điểm là theo kết quả từng lần làm, không copy).
  const startDuplicate = (src: KpiEntry) => {
    const { ok, saved } = commitDraftIfAny();
    if (!ok) return;
    const copy: RowDraft = {
      ...draftOf(src),
      id: '',
      start: nextStartOf(src.date, saved),
      end: '',
      selfDelta: '0',
    };
    // Dòng nguồn dùng tên app cũ / mốc đã đóng → xóa trắng để member chọn lại (dòng mới
    // chỉ nhận giá trị đang có trong danh sách — giữ liên kết với page Task).
    if (strictProjects && !projectNames.includes(copy.project)) {
      copy.project = '';
      copy.appId = undefined;
      copy.rel = undefined;
    } else if (copy.rel && copy.rel.label !== NO_MILESTONE) {
      // Còn trong danh sách → ghi lại bản đầy đủ (log cũ chỉ có nhãn được bổ sung id).
      const o = relOptionsOf(copy).find((x) => relMatches(copy.rel!, x));
      copy.rel = o ? relOf(o) : undefined;
    }
    openDraft(copy);
  };

  // Click 1 dòng để sửa: nếu đang sửa dở dòng khác → auto-lưu (hoặc chặn nếu thiếu field).
  const startEdit = (e: KpiEntry) => {
    if (!commitDraftIfAny().ok) return;
    openDraft(draftOf(e));
  };

  const onRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveDraft();
    if (e.key === 'Escape') openDraft(null);
  };

  // Class đánh dấu ô đang lỗi validate.
  const errCls = (k: string) => (errFields.has(k) ? 'kpi-input-err' : undefined);

  // Ô nhập của dòng đang sửa (dùng chung cho dòng mới & dòng sửa) + dòng báo lỗi validate.
  const renderEditRow = (d: RowDraft, key: string) => (
    <Fragment key={key}>
    <tr className="kpi-row kpi-row-edit" onKeyDown={onRowKeyDown}>
      <td>
        <input
          type="time"
          className={errCls('start')}
          value={d.start}
          onChange={(e) => patchDraft({ start: e.target.value })}
          autoFocus={!d.start}
        />
      </td>
      <td>
        <input
          type="time"
          className={errCls('end')}
          value={d.end}
          onChange={(e) => patchDraft({ end: e.target.value })}
        />
      </td>
      <td className="kpi-dur muted">
        {(() => {
          const m = durationMin({ start: d.start, end: d.end });
          return m === null ? (d.start || d.end ? '⚠' : '–') : fmtHours(m);
        })()}
      </td>
      <td>
        <select
          className={errCls('category')}
          value={d.category}
          onChange={(e) => patchDraft({ category: e.target.value })}
        >
          <option value="">(chọn)</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {d.category && !categories.includes(d.category) && (
            <option value={d.category}>{d.category}</option>
          )}
        </select>
      </td>
      <td>
        {strictProjects ? (
          // Đã gán project → chỉ chọn trong danh sách. Option giá trị cũ ngoài danh sách
          // chỉ hiện khi sửa dòng CŨ (dòng mới bị validate chặn).
          <select
            className={errCls('project')}
            value={d.project}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            <option value="">(chọn)</option>
            {projectNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {d.project && !projectNames.includes(d.project) && (
              <option value={d.project}>{d.project} (tên cũ)</option>
            )}
          </select>
        ) : (
          <input
            list="kpi-projects"
            className={errCls('project')}
            value={d.project}
            onChange={(e) => onProjectChange(e.target.value)}
            placeholder="Project"
          />
        )}
        {/* Mốc release/milestone task thuộc về — BẮT BUỘC chọn (có mục "Không thuộc mốc").
            Danh sách theo app đang chọn: task chưa xong + task mới xong ≤ 2 ngày. */}
        {(() => {
          const opts = relOptionsOf(d);
          const cur = d.rel && d.rel.label !== NO_MILESTONE ? opts.find((o) => relMatches(d.rel!, o)) : undefined;
          // Mốc đang lưu không còn trong danh sách (dòng cũ) → giữ 1 option riêng để không mất dữ liệu.
          const legacy = !!d.rel && d.rel.label !== NO_MILESTONE && !cur;
          const value = !d.rel ? '' : d.rel.label === NO_MILESTONE ? NO_MILESTONE : cur ? cur.key : '__cur';
          return (
            <select
              className={`kpi-rel-select ${errCls('rel') ?? ''}`.trim()}
              value={value}
              title="Mốc release/milestone task thuộc về (bắt buộc — bảng tổng kết tháng gom theo mốc này)"
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return patchDraft({ rel: undefined });
                if (v === NO_MILESTONE) return patchDraft({ rel: { label: NO_MILESTONE } });
                if (v === '__cur') return;
                const o = opts.find((x) => x.key === v);
                if (o) patchDraft({ rel: relOf(o) });
              }}
            >
              <option value="">{d.project ? '🚀 Chọn mốc…' : '🚀 Chọn project trước'}</option>
              {opts.map((o) => (
                <option key={o.key} value={o.key}>
                  🚀 {o.label}
                  {o.date ? ` · ${o.date.slice(8, 10)}/${o.date.slice(5, 7)}` : ''}
                </option>
              ))}
              {legacy && <option value="__cur">🚀 {d.rel!.label} (đã đóng)</option>}
              <option value={NO_MILESTONE}>— {NO_MILESTONE} —</option>
            </select>
          );
        })()}
      </td>
      <td>
        <input
          value={d.feature}
          onChange={(e) => patchDraft({ feature: e.target.value })}
          placeholder="Feature"
        />
      </td>
      <td className="kpi-task-cell">
        <div className="kpi-task-edit">
          <input
            className={errCls('task')}
            value={d.task}
            onChange={(e) => patchDraft({ task: e.target.value })}
            placeholder="Mô tả task…"
          />
          {(estimates?.length ?? 0) > 0 && (
            <button
              type="button"
              className="doc-action"
              title="Pick task từ bảng estimate"
              onClick={() => setEstPickOpen(true)}
            >
              📐
            </button>
          )}
        </div>
        {d.estRef && (
          <div className="kpi-est-link">
            <span
              className="muted kpi-est-title"
              title={`${d.estRef.title ?? 'task estimate'} — giờ của dòng này sẽ cộng vào task estimate`}
            >
              📐 {d.estRef.title ?? 'task estimate'}
            </span>
            <button
              type="button"
              className="doc-action"
              title="Bỏ link estimate"
              onClick={() => patchDraft({ estRef: undefined, estDone: false })}
            >
              ✕
            </button>
            <label className="kpi-est-done" title="Chốt task estimate done — dòng này nhận điểm gợi ý theo est vs thực tế">
              <input
                type="checkbox"
                checked={d.estDone}
                onChange={(e) => patchDraft({ estDone: e.target.checked })}
              />
              Hoàn thành
            </label>
          </div>
        )}
      </td>
      <td>
        <input
          value={d.note}
          onChange={(e) => patchDraft({ note: e.target.value })}
          placeholder="Note"
        />
      </td>
      <td className="kpi-score-cell">
        <input
          type="number"
          step="0.1"
          className="kpi-self-input"
          title="Điểm tự chấm (mặc định 0) — leader sẽ xác nhận/chỉnh khi chấm"
          value={d.selfDelta}
          onChange={(e) => patchDraft({ selfDelta: e.target.value })}
        />
      </td>
      <td className="kpi-actions">
        <button type="button" className="doc-action" title="Lưu (Enter)" onClick={saveDraft}>
          ✓
        </button>
        <button
          type="button"
          className="doc-action"
          title="Hủy (Esc)"
          onClick={() => openDraft(null)}
        >
          ✕
        </button>
      </td>
    </tr>
    {errMsg && (
      <tr className="kpi-error-row">
        <td colSpan={10}>⚠ {errMsg}</td>
      </tr>
    )}
    </Fragment>
  );

  const renderRow = (e: KpiEntry) => {
    if (draft && draft.id === e.id) return renderEditRow(draft, e.id);
    const score = scores[e.id];
    const dur = durationMin(e);
    const editable = canEdit && !score;
    return (
      <tr
        key={e.id}
        className={`kpi-row${editable ? ' kpi-row-editable' : ''}`}
        onClick={editable ? () => startEdit(e) : undefined}
        title={
          mode === 'member' && score
            ? 'Dòng đã chấm điểm — liên hệ leader nếu cần sửa'
            : editable
              ? 'Click để sửa'
              : undefined
        }
      >
        <td>{e.start ?? ''}</td>
        <td>{e.end ?? ''}</td>
        <td className="kpi-dur muted">
          {dur === null ? (
            e.start || e.end ? (
              <span className="kpi-warn" title="Giờ không hợp lệ (end < start hoặc thiếu)">
                ⚠
              </span>
            ) : (
              '–'
            )
          ) : (
            fmtHours(dur)
          )}
        </td>
        <td>{e.category ?? ''}</td>
        <td>
          {e.project ?? ''}
          {e.rel && (
            <span className="kpi-relmark" title={`Mốc: ${e.rel.label}`}>
              {' '}
              🚀
            </span>
          )}
        </td>
        <td>{e.feature ?? ''}</td>
        <td className="kpi-task-cell">
          {e.estRef && (
            <span
              className="kpi-est-badge"
              title={`Link task estimate: ${e.estRef.title ?? ''}`}
            >
              📐{' '}
            </span>
          )}
          {e.task ?? ''}
        </td>
        <td className="muted">{e.note ?? ''}</td>
        <td
          className={`kpi-score-cell${mode === 'leader' ? ' kpi-score-click' : ''}`}
          onClick={
            mode === 'leader'
              ? (ev) => {
                  ev.stopPropagation();
                  onScoreClick?.(e);
                }
              : undefined
          }
          title={mode === 'leader' ? 'Chấm điểm dòng này' : undefined}
        >
          {score ? (
            <ScoreBadge score={score} />
          ) : typeof e.selfDelta === 'number' ? (
            <>
              <SelfScoreBadge delta={e.selfDelta} />
              {mode === 'leader' && ' ✎'}
            </>
          ) : mode === 'leader' ? (
            '✎'
          ) : (
            ''
          )}
          {!score && canAccept && (
            <button
              type="button"
              className="doc-action kpi-accept-btn"
              title="Chấp nhận điểm tự chấm cho dòng này"
              onClick={(ev) => {
                ev.stopPropagation();
                onAcceptEntries!([e]);
              }}
            >
              ✓
            </button>
          )}
          {mode === 'member' && score && ' 🔒'}
        </td>
        <td className="kpi-actions" onClick={(ev) => ev.stopPropagation()}>
          {canEdit && (
            <button
              type="button"
              className="doc-action"
              title="Nhân bản thành dòng mới (copy nội dung, đỡ nhập lại)"
              onClick={() => startDuplicate(e)}
            >
              ⧉
            </button>
          )}
          {editable && (
            <button
              type="button"
              className="doc-action danger"
              title="Xóa dòng"
              onClick={() => {
                if (window.confirm('Xóa dòng này?')) onDelete?.(e.id);
              }}
            >
              🗑️
            </button>
          )}
          {mode === 'leader' && (
            <button
              type="button"
              className="doc-action danger"
              title="Xóa dòng (kèm điểm)"
              onClick={() => {
                if (window.confirm('Xóa dòng này (kèm điểm đã chấm)?'))
                  onDeleteWithScore?.(e.id);
              }}
            >
              🗑️
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="kpi-log">
      {mode === 'member' && !locked && noProjects && (
        <p className="warn kpi-locked-banner">
          ⚠ Bạn chưa được gán project nào — liên hệ leader để được gán trước khi log
          task.
        </p>
      )}
      {/* Header tháng: điều hướng + KPI tháng + tổng giờ */}
      <div className="kpi-month-bar">
        <div className="kpi-month-nav">
          <button type="button" className="doc-action" onClick={() => onMonthChange(monthShift(monthKey, -1))}>
            ◀
          </button>
          <strong>
            Tháng {monthKey.slice(5)}/{monthKey.slice(0, 4)}
          </strong>
          <button type="button" className="doc-action" onClick={() => onMonthChange(monthShift(monthKey, 1))}>
            ▶
          </button>
        </div>
        <div className="kpi-month-sum">
          <span className={`kpi-month-score ${kpiScoreClass(monthScore)}`}>
            KPI tháng: {KPI_MONTH_BASE} {monthTotal.delta >= 0 ? '+' : '−'}{' '}
            {Math.abs(monthTotal.delta)} = <strong>{monthScore}</strong>
          </span>
          <span className="muted">
            Tổng giờ: <strong>{fmtHours(monthTotal.minutes)}</strong> ·{' '}
            {monthTotal.scoredCount}/{monthEntries.length} dòng đã chấm
          </span>
        </div>
        {canEdit && (
          <button
            type="button"
            className="primary kpi-add-today"
            onClick={() => {
              const today = isoLocal(new Date());
              if (!today.startsWith(monthKey)) onMonthChange(today.slice(0, 7));
              startAdd(today);
            }}
          >
            ＋ Thêm dòng hôm nay
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className="doc-action"
            title="Thêm dòng plan cho ngày làm việc kế tiếp (chưa cần điền giờ)"
            onClick={() => {
              const d = nextWorkday(isoLocal(new Date()));
              if (!d.startsWith(monthKey)) onMonthChange(d.slice(0, 7));
              startAdd(d);
            }}
          >
            ＋ Plan hôm sau
          </button>
        )}
        {canEdit && onSaveWeekPlan && isWeekendNow && (
          <button
            type="button"
            className="doc-action"
            title="Lập plan chung cho cả tuần sau"
            onClick={() => setWeekPlanEdit(nextWeekStart)}
          >
            {weekPlans?.[nextWeekStart] ? '✎ Plan tuần sau' : '📋 Plan tuần sau'}
          </button>
        )}
        {canAccept && pendingMonth.length > 0 && (
          <button
            type="button"
            className="primary kpi-add-today"
            title="Chấp nhận điểm tự chấm cho mọi dòng chưa chấm trong tháng"
            onClick={() => onAcceptEntries!(pendingMonth)}
          >
            ✓ Chấp nhận tất cả ({pendingMonth.length})
          </button>
        )}
      </div>

      {/* Plan chung theo tuần: tuần hiện tại + tuần sau (member sửa được, leader chỉ xem) */}
      {shownWeekPlans.length > 0 && (
        <div className="kpi-week-plans">
          {shownWeekPlans.map((w) => (
            <div key={w} className="kpi-week-plan">
              <div className="kpi-week-plan-head">
                <strong>
                  📋 Plan tuần {formatDateVi(w)} – {formatDateVi(addDays(w, 4))}
                  {w === nextWeekStart && ' (tuần sau)'}
                </strong>
                {canEdit && onSaveWeekPlan && (
                  <button
                    type="button"
                    className="doc-action"
                    title="Sửa plan tuần này"
                    onClick={() => setWeekPlanEdit(w)}
                  >
                    ✎
                  </button>
                )}
              </div>
              <div className="kpi-week-plan-text">{weekPlans![w].text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Datalist gợi ý project dùng chung cho mọi dòng đang sửa */}
      <datalist id="kpi-projects">
        {projectNames.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {days.length === 0 ? (
        <p className="muted empty">
          Chưa có dòng log nào trong tháng này.
          {canEdit && ' Bấm "＋ Thêm dòng hôm nay" để bắt đầu.'}
        </p>
      ) : (
        <div className="kpi-table-wrap">
          <table className="kpi-table">
            <thead>
              <tr>
                <th>Bắt đầu</th>
                <th>Kết thúc</th>
                <th>⏱</th>
                <th>Giai đoạn</th>
                <th>Project</th>
                <th>Feature</th>
                <th>Task</th>
                <th>Note</th>
                <th>Điểm</th>
                <th />
              </tr>
            </thead>
            {days.map((date) => {
              const list = byDay.get(date) ?? [];
              const dayTotal = totalOf(list, scores);
              const leave = leaveMap.get(date);
              return (
                <tbody key={date}>
                  <tr className="kpi-day-row">
                    <td colSpan={8}>
                      {weekdayVN(date)} · {formatDateVi(date)}
                      {date > todayIso && (
                        <span className="kpi-plan-badge" title="Dòng plan — điền giờ thực tế khi làm">
                          📋 Plan
                        </span>
                      )}
                      {leave && (
                        <span className="kpi-leave-badge">
                          🏖 Nghỉ phép: {leaveLabel(leave)}
                        </span>
                      )}
                    </td>
                    <td colSpan={2} className="kpi-day-add">
                      {canEdit && leave !== 'full' && (
                        <button
                          type="button"
                          className="doc-action"
                          title="Thêm dòng cho ngày này"
                          onClick={() => startAdd(date)}
                        >
                          ＋
                        </button>
                      )}
                      {canAccept && pendingOf(list).length > 0 && (
                        <button
                          type="button"
                          className="doc-action"
                          title="Chấp nhận điểm tự chấm cho các dòng chưa chấm của ngày này"
                          onClick={() => onAcceptEntries!(pendingOf(list))}
                        >
                          ✓ Ngày ({pendingOf(list).length})
                        </button>
                      )}
                    </td>
                  </tr>
                  {list.map(renderRow)}
                  {draft && !draft.id && draft.date === date && renderEditRow(draft, 'new')}
                  {(list.length > 0 || (draft && !draft.id && draft.date === date)) && (
                    <tr className="kpi-sum-row">
                      <td colSpan={2}>Tổng</td>
                      <td className="kpi-dur">{fmtHours(dayTotal.minutes)}</td>
                      <td colSpan={5} />
                      <td className="kpi-score-cell">
                        {(dayTotal.scoredCount > 0 ||
                          list.some((e) => typeof e.selfDelta === 'number')) && (
                          <span
                            className={`kpi-score ${dayTotal.delta > 0 ? 'pos' : dayTotal.delta < 0 ? 'neg' : 'zero'}`}
                          >
                            {fmtDelta(dayTotal.delta)}
                          </span>
                        )}
                      </td>
                      <td />
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {weekPlanEdit && onSaveWeekPlan && (
        <KpiWeekPlanDialog
          weekStart={weekPlanEdit}
          initialText={weekPlans?.[weekPlanEdit]?.text ?? ''}
          onSave={(text) => onSaveWeekPlan(weekPlanEdit, text)}
          onClose={() => setWeekPlanEdit(null)}
        />
      )}

      {estPickOpen && draft && (
        <KpiEstPickerDialog
          estimates={estimates ?? []}
          memberId={kpiMemberId}
          memberName={kpiMemberName}
          onPick={(r) => {
            // Fill nội dung từ sub task estimate (member chỉnh lại được sau khi fill);
            // chưa chọn mốc → tự gắn mốc của task mà bảng estimate gắn với (nếu mốc đó
            // còn trong danh sách của project).
            const project = r.projectText || draft.project;
            const next: RowDraft = { ...draft, project, appId: appIdOf(project) ?? draft.appId };
            const estTaskId = estimates?.find((x) => x.id === r.estRef.estId)?.taskId;
            const estTask = estTaskId ? (tasks ?? []).find((t) => t.id === estTaskId) : undefined;
            const o = estTask
              ? relOptionsOf(next).find(
                  (x) =>
                    x.taskId === estTask.id ||
                    (x.appId === estTask.appId &&
                      !!versionKey(estTask.version) &&
                      versionKey(x.version) === versionKey(estTask.version)),
                )
              : undefined;
            patchDraft({
              estRef: r.estRef,
              task: r.taskText || draft.task,
              feature: r.featureText ?? draft.feature,
              project,
              appId: next.appId,
              ...(!draft.rel && o ? { rel: relOf(o) } : {}),
            });
            setEstPickOpen(false);
          }}
          onClose={() => setEstPickOpen(false)}
        />
      )}
    </div>
  );
}
