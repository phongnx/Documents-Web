// Log KPI của member (trang /share/kpi/:token) — bản redesign Material 3.
// - ≥ 840px: lưới 6 cột (Giờ · Giai đoạn · Project và mốc · Task · Điểm · thao tác), sửa
//   dòng bằng khung mở rộng ngay trong danh sách.
// - < 840px: danh sách thẻ theo ngày, sửa dòng bằng dialog toàn màn hình, dòng đã chấm mở
//   bottom sheet chi tiết.
// Luật lưu/kiểm tra/nối ca/nhân bản nằm ở lib/kpiLogDraft (giữ nguyên bản cũ của
// KpiLogTable). Trang leader vẫn dùng KpiLogTable — lượt redesign trang leader sẽ dọn.
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  milestoneOptionsOf,
  NO_MILESTONE,
  totalOf,
  versionKey,
  type KpiEntry,
  type KpiLeave,
  type KpiMilestoneOption,
  type KpiScore,
  type KpiTaskSnap,
  type KpiWeekPlan,
} from '../../kpiTypes';
import type { KpiEntryInput } from '../../hooks/useKpiSheet';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import {
  draftOf,
  duplicateDraft,
  emptyDraft,
  isDraftDirty,
  monthShift,
  nextStartOf,
  relOf,
  shortRelLabel,
  toEntryInput,
  validateDraft,
  type DraftCheck,
  type DraftCtx,
  type RowDraft,
} from '../../lib/kpiLogDraft';
import { addDays, isoLocal, mondayOf, nextWorkday, weekdayVN } from '../../lib/pmDates';
import { formatDateVi } from '../../lib/reportFormat';
import type { KpiEstRef } from '../../estTypes';
import KpiDialog from './KpiDialog';
import KpiEstPickerDialog from './KpiEstPickerDialog';
import KpiLogEditor from './KpiLogEditor';
import KpiWeekPlanDialog from './KpiWeekPlanDialog';
import KsumConfirmDialog from './KsumConfirmDialog';
import { usePagebarHeight } from './KpiSummaryTable';
import {
  IcAlert,
  IcCalendar,
  IcCalendarNext,
  IcChevronDown,
  IcChevronLeft,
  IcChevronRight,
  IcCopy,
  IcEdit,
  IcInfo,
  IcList,
  IcLock,
  IcMinus,
  IcNote,
  IcPending,
  IcPlus,
  IcRocket,
  IcRuler,
  IcTrash,
  IcUmbrella,
  IcWarn,
} from './ksumIcons';

/** Thông báo dạng snackbar (trang hiển thị). */
export interface KpiNotice {
  text: string;
  kind?: 'error' | 'info';
  /** true = giữ tới khi người dùng đóng. */
  persistent?: boolean;
}

interface Props {
  entries: KpiEntry[];
  /** Đang chờ entries của tháng vừa chọn. */
  entriesLoading: boolean;
  scores: Record<string, KpiScore>;
  /** Tháng đang xem 'yyyy-mm'. */
  monthKey: string;
  onMonthChange: (m: string) => void;
  categories: string[];
  projectNames: string[];
  /** Id app cùng thứ tự projectNames (meta.projectIds — sheet chưa sync thì thiếu). */
  projectIds?: string[];
  /** true = member CHỈ chọn được project trong projectNames (đã được leader gán). */
  strictProjects: boolean;
  leaves?: KpiLeave[];
  weekPlans?: Record<string, KpiWeekPlan>;
  onSaveWeekPlan: (weekStart: string, text: string) => void;
  /** Các bảng estimate member tham gia (meta.estimates) — bật nút chọn task estimate. */
  estimates?: { id: string; title: string; taskId?: string }[];
  /** Snapshot task các app được gán — nguồn danh sách Mốc release. */
  tasks?: KpiTaskSnap[];
  kpiMemberId?: string;
  kpiMemberName?: string;
  onCompleteEst: (estRef: KpiEstRef, entryId: string, entryMin: number | null) => void;
  /** Sheet bị khóa → chỉ xem. */
  locked: boolean;
  onAdd: (input: KpiEntryInput) => string | null;
  onUpdate: (id: string, patch: Partial<KpiEntryInput>) => void;
  onDelete: (id: string) => void;
  /** Hiện snackbar; null = ẩn (lưu được rồi thì bỏ thông báo "chưa được lưu" cũ). */
  notify: (n: KpiNotice | null) => void;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dayLabel = (iso: string) => `${weekdayVN(iso)}, ${dm(iso)}`;

// ---------- Badge điểm & chú giải (dùng chung với dialog Quy chế) ----------

/** Ô điểm của 1 dòng: leader đã chấm (khóa) / tự chấm khác 0 (chờ leader) / trống. */
function ScoreCell({ entry, score }: { entry: KpiEntry; score?: KpiScore }) {
  if (score) {
    const cls = score.delta > 0 ? 'pos' : score.delta < 0 ? 'neg' : 'zero';
    const t = `Leader đã chấm ${fmtDelta(score.delta)}${score.reason ? ` — ${score.reason}` : ''}. Dòng đã khóa sửa.`;
    return (
      <span className={`kml-score lead ${cls}`} title={t} aria-label={t}>
        <IcLock size={13} />
        {fmtDelta(score.delta)}
      </span>
    );
  }
  // Tự chấm 0 (mặc định) → không hiện gì cho đỡ rối.
  if (typeof entry.selfDelta !== 'number' || entry.selfDelta === 0) return null;
  const t = `Tự chấm ${fmtDelta(entry.selfDelta)} — chờ leader xác nhận`;
  return (
    <span className="kml-score self" title={t} aria-label={t}>
      <IcPending size={13} />
      {fmtDelta(entry.selfDelta)}
    </span>
  );
}

export function KpiScoreLegend() {
  return (
    <div className="kml-legend">
      <div>
        <span className="kml-score lead pos">
          <IcLock size={13} />
          +3
        </span>
        <span>
          Leader đã chấm — dòng bị khóa sửa. Nền xanh = cộng, đỏ = trừ.
        </span>
      </div>
      <div>
        <span className="kml-score lead zero">
          <IcLock size={13} />0
        </span>
        <span>Leader đã chấm 0 — bị khóa sửa.</span>
      </div>
      <div>
        <span className="kml-score self">
          <IcPending size={13} />
          +0.5
        </span>
        <span>Điểm tự chấm, chờ leader xác nhận. Tự chấm 0 thì không hiện.</span>
      </div>
    </div>
  );
}

/** Chip mốc trên dòng đọc. */
function RelChip({ entry }: { entry: KpiEntry }) {
  if (!entry.rel?.label)
    return (
      <span className="kml-tag is-warn" title="Dòng cũ chưa chọn mốc release">
        <IcWarn size={13} />
        Chưa có mốc
      </span>
    );
  if (entry.rel.label === NO_MILESTONE)
    return (
      <span className="kml-tag is-none">
        <IcMinus size={13} />
        {NO_MILESTONE}
      </span>
    );
  const full = `Mốc ${entry.rel.label}${entry.rel.date ? `, release ${formatDateVi(entry.rel.date)}` : ''}`;
  return (
    <span className="kml-tag is-ms" title={full}>
      <IcRocket size={13} />
      <span className="kml-ellipsis">
        {shortRelLabel(entry.rel.label, entry.project)}
        {entry.rel.date ? ` · ${dm(entry.rel.date)}` : ''}
      </span>
    </span>
  );
}

/** Popover/menu đóng khi bấm ra ngoài hoặc Esc. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export default function KpiMemberLog({
  entries,
  entriesLoading,
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
  notify,
}: Props) {
  const narrow = useMediaQuery('(max-width: 839px)');
  const { rootRef, barRef } = usePagebarHeight<HTMLDivElement>();
  const planMenu = usePopover();
  const legend = usePopover();

  const [draft, setDraft] = useState<RowDraft | null>(null);
  // Bản lúc mở form — so sánh để biết member đã sửa gì chưa.
  const [orig, setOrig] = useState<RowDraft | null>(null);
  const [errors, setErrors] = useState<DraftCheck | null>(null);
  const [weekPlanEdit, setWeekPlanEdit] = useState<string | null>(null);
  const [estPickOpen, setEstPickOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KpiEntry | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  // Màn hẹp: dòng không sửa được (đã chấm / trang khóa) → bottom sheet chi tiết.
  const [detailId, setDetailId] = useState<string | null>(null);

  const today = isoLocal(new Date());
  const leaveMap = leavePortionsOf(leaves ?? []);
  const noProjects = strictProjects && projectNames.length === 0;
  const canEdit = !locked && !noProjects;

  // Id app theo tên project: ưu tiên meta.projectIds (cùng thứ tự projectNames); sheet
  // chưa được leader sync lại thì tra theo tên app trong snapshot task.
  const appIdOf = (name: string): string | undefined => {
    const i = projectNames.indexOf(name);
    if (i >= 0 && projectIds?.[i]) return projectIds[i];
    return (tasks ?? []).find((t) => t.appName === name)?.appId;
  };
  // Danh sách mốc của app đang chọn: task chưa xong + task mới xong ≤ 2 ngày.
  const relOptionsOf = (d: RowDraft): KpiMilestoneOption[] => {
    const appId = d.appId || appIdOf(d.project);
    return appId ? milestoneOptionsOf(tasks ?? [], appId, today) : [];
  };
  const ctx: DraftCtx = { today, projectNames, strictProjects, leaveMap, relOptionsOf };

  const monthEntries = entriesOfMonth(entries, monthKey);
  const byDay = groupEntriesByDay(monthEntries);
  // Dòng mới của ngày chưa có entry nào → thêm ngày đó vào danh sách nhóm.
  if (draft && !draft.id && draft.date.startsWith(monthKey) && !byDay.has(draft.date))
    byDay.set(draft.date, []);
  // Ngày nghỉ phép trong tháng chưa có dòng log → vẫn hiện block ngày (kèm info nghỉ).
  for (const d of leaveMap.keys()) if (d.startsWith(monthKey) && !byDay.has(d)) byDay.set(d, []);
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const monthTotal = totalOf(monthEntries, scores);
  const monthScore = Number((KPI_MONTH_BASE + monthTotal.delta).toFixed(2));

  const dirty = !!draft && !!orig && isDraftDirty(draft, orig);
  const draftScored = !!draft?.id && !!scores[draft.id];
  useUnsavedGuard(dirty);

  const openDraft = (d: RowDraft) => {
    setDraft(d);
    setOrig(d);
    setErrors(null);
  };
  const closeDraft = () => {
    setDraft(null);
    setOrig(null);
    setErrors(null);
    setAskDiscard(false);
  };

  // Trang bị khóa giữa chừng → đóng form.
  useEffect(() => {
    if (locked && draft) closeDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  // Dòng đang sửa bị xóa ở nơi khác (leader xóa) → đóng form + báo.
  useEffect(() => {
    if (!draft?.id || entriesLoading || !draft.date.startsWith(monthKey)) return;
    if (!entries.some((e) => e.id === draft.id)) {
      closeDraft();
      notify({ text: 'Dòng đang sửa vừa bị xóa (leader xóa) — đã đóng khung sửa.', kind: 'error' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, entriesLoading]);

  // Màn hẹp đang mở dialog toàn màn hình → khóa cuộn trang phía sau.
  useEffect(() => {
    if (!narrow || !draft) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [narrow, draft]);

  const patchDraft = (u: Partial<RowDraft>) => {
    setDraft((d) => (d ? { ...d, ...u } : d));
    if (errors) {
      const fields = { ...errors.fields };
      for (const k of Object.keys(u)) delete fields[k as keyof typeof fields];
      setErrors({ ...errors, fields });
    }
  };
  // Đổi project → cập nhật appId; mốc của app cũ không còn hợp lệ nên xóa (giữ
  // "Không thuộc mốc" vì lựa chọn đó không phụ thuộc app).
  const onProjectChange = (project: string) =>
    patchDraft({
      project,
      appId: appIdOf(project),
      ...(draft?.rel && draft.rel.label !== NO_MILESTONE ? { rel: undefined } : {}),
    });

  // Ghi 1 draft ĐÃ pass validate.
  const persistDraft = (d: RowDraft) => {
    notify(null);
    const input = toEntryInput(d, appIdOf);
    let entryId = d.id;
    if (d.id) onUpdate(d.id, input);
    else entryId = onAdd(input) ?? '';
    // Tick "Hoàn thành task estimate" → dòng này là DÒNG CHỐT (page chạy flow chốt điểm).
    if (d.estDone && d.estRef && entryId)
      onCompleteEst(d.estRef, entryId, durationMin({ start: d.start, end: d.end }));
  };

  const saveDraft = () => {
    if (!draft || draftScored) return;
    const v = validateDraft(draft, ctx);
    if (!v.ok) {
      setErrors(v);
      return;
    }
    persistDraft(draft);
    closeDraft();
  };

  // Trước khi mở dòng khác / đổi tháng: dòng đang sửa chưa đổi gì hoặc đã bị chấm → đóng;
  // đã sửa + hợp lệ → tự lưu; thiếu/sai → CHẶN, báo lỗi tại ô, giữ nguyên dòng đang sửa.
  const commitDraftIfAny = (): { ok: boolean; saved: RowDraft | null } => {
    if (!draft) return { ok: true, saved: null };
    if (draftScored || !dirty) {
      closeDraft();
      return { ok: true, saved: null };
    }
    const v = validateDraft(draft, ctx);
    if (!v.ok) {
      setErrors(v);
      notify({
        text: `${v.msg} — dòng đang sửa chưa được lưu, hoàn thiện trước khi thêm dòng khác.`,
        kind: 'error',
      });
      return { ok: false, saved: null };
    }
    persistDraft(draft);
    closeDraft();
    return { ok: true, saved: draft };
  };

  const startAdd = (date: string) => {
    if (!canEdit) return;
    const { ok, saved } = commitDraftIfAny();
    if (!ok) return;
    if (!date.startsWith(monthKey)) onMonthChange(date.slice(0, 7));
    openDraft(emptyDraft(date, nextStartOf(byDay.get(date) ?? [], date, saved)));
  };

  const startDuplicate = (src: KpiEntry) => {
    if (!canEdit) return;
    const { ok, saved } = commitDraftIfAny();
    if (!ok) return;
    // Vừa tự lưu chính dòng nguồn → nhân bản theo nội dung mới nhất.
    const base = saved && saved.id === src.id ? { ...src, ...toEntryInput(saved, appIdOf) } : src;
    openDraft(
      duplicateDraft(base, nextStartOf(byDay.get(src.date) ?? [], src.date, saved), ctx),
    );
  };

  const startEdit = (e: KpiEntry) => {
    if (!canEdit || scores[e.id] || draft?.id === e.id) return;
    if (!commitDraftIfAny().ok) return;
    openDraft(draftOf(e));
  };

  const changeMonth = (n: number) => {
    if (!commitDraftIfAny().ok) return;
    onMonthChange(monthShift(monthKey, n));
  };

  const cancelEdit = () => {
    if (narrow && dirty) setAskDiscard(true);
    else closeDraft();
  };

  const confirmDelete = () => {
    const e = deleteTarget;
    setDeleteTarget(null);
    setDetailId(null);
    if (!e) return;
    if (draft?.id === e.id) closeDraft();
    onDelete(e.id);
    // Dòng plan chưa có giờ → chỉ nêu ngày, tránh hiện "— – —".
    const t = timeOf(e).text;
    notify({ text: t === '—' ? `Đã xóa dòng ngày ${dayLabel(e.date)}.` : `Đã xóa dòng ${t}, ${dayLabel(e.date)}.` });
  };

  // Chọn task estimate: điền nội dung + tự gắn mốc của task mà bảng estimate gắn với
  // (nếu dòng chưa chọn mốc và mốc đó còn trong danh sách của project).
  const onPickEst = (r: {
    estRef: KpiEstRef;
    taskText: string;
    featureText?: string;
    projectText?: string;
  }) => {
    if (!draft) return;
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
  };

  // Plan tuần: tuần hiện tại + tuần sau (nếu có); Thứ 6/7/CN mới lập plan tuần sau.
  const curWeekStart = mondayOf(today);
  const nextWeekStart = addDays(curWeekStart, 7);
  const dowToday = new Date(today + 'T00:00:00').getDay();
  const isWeekendNow = dowToday === 5 || dowToday === 6 || dowToday === 0;
  const shownWeekPlans = [curWeekStart, nextWeekStart].filter((w) => weekPlans?.[w]);
  const nextDay = nextWorkday(today);

  const editor = (variant: 'inline' | 'full') =>
    draft && (
      <KpiLogEditor
        key={draft.id || `new-${draft.date}`}
        draft={draft}
        errors={errors}
        variant={variant}
        isPlan={draft.date > today}
        categories={categories}
        projectNames={projectNames}
        strictProjects={strictProjects}
        relOptions={relOptionsOf(draft)}
        canPickEst={(estimates?.length ?? 0) > 0}
        scoredWhileEditing={draftScored}
        onPatch={patchDraft}
        onProjectChange={onProjectChange}
        onOpenEst={() => setEstPickOpen(true)}
        onSave={saveDraft}
        onCancel={cancelEdit}
        onDuplicate={() => {
          const src = entries.find((x) => x.id === draft.id);
          if (src) startDuplicate(src);
        }}
        onDelete={() => {
          const src = entries.find((x) => x.id === draft.id);
          if (src) setDeleteTarget(src);
        }}
      />
    );

  // ---------- Thanh tháng ----------
  const kpiSub = `${KPI_MONTH_BASE} ${monthTotal.delta >= 0 ? '+' : '−'} ${Math.abs(monthTotal.delta)}`;
  const skel = (w: number) => <span className="kml-skel" style={{ width: w }} />;
  const planMenuEl = canEdit && (
    <div className="kml-menu-anchor" ref={planMenu.ref}>
      {narrow ? (
        <button
          type="button"
          className="kml-iconbtn"
          aria-label="Plan"
          aria-haspopup="menu"
          aria-expanded={planMenu.open}
          onClick={() => planMenu.setOpen((v) => !v)}
        >
          <IcCalendar size={20} />
        </button>
      ) : (
        <button
          type="button"
          className="kml-btn kml-btn-outlined"
          aria-haspopup="menu"
          aria-expanded={planMenu.open}
          onClick={() => planMenu.setOpen((v) => !v)}
        >
          <IcCalendar size={16} />
          Plan
          <IcChevronDown size={14} />
        </button>
      )}
      {planMenu.open && (
        <div className="kml-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="kml-menu-item"
            onClick={() => {
              planMenu.setOpen(false);
              startAdd(nextDay);
            }}
          >
            <IcCalendarNext size={18} />
            <span>
              <span>Plan hôm sau</span>
              <small>Thêm dòng plan cho {dayLabel(nextDay)}</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="kml-menu-item"
            disabled={!isWeekendNow}
            onClick={() => {
              planMenu.setOpen(false);
              setWeekPlanEdit(nextWeekStart);
            }}
          >
            <IcList size={18} />
            <span>
              <span>{weekPlans?.[nextWeekStart] ? 'Sửa plan tuần sau' : 'Plan tuần sau'}</span>
              <small>
                {isWeekendNow
                  ? `Tuần ${dm(nextWeekStart)} – ${dm(addDays(nextWeekStart, 4))}`
                  : 'Mở từ thứ 6 đến chủ nhật'}
              </small>
            </span>
          </button>
        </div>
      )}
    </div>
  );

  const monthBar = (
    <div className="kml-monthbar" ref={barRef}>
      <div className="kml-month-nav">
        <button
          type="button"
          className="kml-iconbtn"
          aria-label="Tháng trước"
          onClick={() => changeMonth(-1)}
        >
          <IcChevronLeft size={20} />
        </button>
        <span className="kml-month-label" aria-live="polite">
          Tháng {monthKey.slice(5)}/{monthKey.slice(0, 4)}
        </span>
        <button
          type="button"
          className="kml-iconbtn"
          aria-label="Tháng sau"
          onClick={() => changeMonth(1)}
        >
          <IcChevronRight size={20} />
        </button>
      </div>
      {narrow ? (
        <div className="kml-mstats">
          <span className="kml-mstat">
            KPI{' '}
            {entriesLoading ? (
              skel(40)
            ) : (
              <>
                <b className={`kml-c-${kpiScoreClass(monthScore)}`}>{monthScore}</b> ({kpiSub})
              </>
            )}
          </span>
          <span className="kml-mstat">
            {entriesLoading ? (
              skel(90)
            ) : (
              <>
                <b>{fmtHours(monthTotal.minutes)}</b> {monthTotal.scoredCount}/{monthEntries.length} đã
                chấm
              </>
            )}
          </span>
        </div>
      ) : (
        <>
          <div className="kml-stat">
            <span className="kml-stat-label">KPI tháng</span>
            <span className="kml-stat-row">
              {entriesLoading ? (
                skel(56)
              ) : (
                <>
                  <span className={`kml-stat-value kml-c-${kpiScoreClass(monthScore)}`}>{monthScore}</span>
                  <span className="kml-stat-sub">{kpiSub}</span>
                </>
              )}
            </span>
          </div>
          <div className="kml-stat">
            <span className="kml-stat-label">Tổng giờ</span>
            <span className="kml-stat-row">
              {entriesLoading ? (
                skel(72)
              ) : (
                <>
                  <span className="kml-stat-value">{fmtHours(monthTotal.minutes)}</span>
                  <span className="kml-stat-sub">
                    {monthTotal.scoredCount}/{monthEntries.length} dòng đã chấm
                  </span>
                </>
              )}
            </span>
          </div>
        </>
      )}
      <div className="kml-monthbar-actions">
        {planMenuEl}
        {canEdit && !narrow && (
          <button type="button" className="kml-btn kml-btn-filled" onClick={() => startAdd(today)}>
            <IcPlus size={16} />
            Thêm dòng hôm nay
          </button>
        )}
      </div>
    </div>
  );

  // ---------- Danh sách ----------
  const dayTags = (date: string): ReactNode => {
    const leave = leaveMap.get(date);
    return (
      <>
        {date === today && <span className="kml-tag is-today">Hôm nay</span>}
        {date > today && (
          <span className="kml-tag is-plan" title="Dòng plan — điền giờ thực tế khi làm">
            <IcCalendarNext size={13} />
            Plan
          </span>
        )}
        {leave && (
          <span className="kml-tag is-leave">
            <IcUmbrella size={13} />
            Nghỉ phép: {leaveLabel(leave)}
          </span>
        )}
      </>
    );
  };
  const dayScore = (list: KpiEntry[]) => {
    const t = totalOf(list, scores);
    if (list.length === 0 || (t.scoredCount === 0 && t.delta === 0)) return { t, el: null };
    const cls = t.delta > 0 ? 'pos' : t.delta < 0 ? 'neg' : '';
    return {
      t,
      el: (
        <span className={`kml-day-score ${cls}`} title="Tổng điểm ngày">
          {fmtDelta(t.delta)}
        </span>
      ),
    };
  };
  const addDayBtn = (date: string) =>
    canEdit &&
    leaveMap.get(date) !== 'full' && (
      <button
        type="button"
        className="kml-iconbtn"
        aria-label={`Thêm dòng cho ${dayLabel(date)}`}
        title="Thêm dòng cho ngày này"
        onClick={() => startAdd(date)}
      >
        <IcPlus size={18} />
      </button>
    );

  /** Giờ trên dòng đọc + dòng phụ (thời lượng / Plan / cảnh báo giờ lỗi). */
  const timeOf = (e: KpiEntry) => {
    const dur = durationMin(e);
    const plan = e.date > today && !e.end;
    const text = plan ? e.start || '—' : e.start || e.end ? `${e.start || '—'} – ${e.end || '—'}` : '—';
    const sub =
      dur !== null ? (
        fmtHours(dur)
      ) : plan ? (
        'Plan'
      ) : e.start || e.end ? (
        <span className="kml-c-neg" title="Giờ không hợp lệ (kết thúc trước bắt đầu hoặc thiếu)">
          <IcAlert size={14} />
        </span>
      ) : null;
    return { text, sub };
  };

  const rowDesktop = (e: KpiEntry) => {
    if (draft?.id === e.id) return <div key={e.id}>{editor('inline')}</div>;
    const score = scores[e.id];
    const editable = canEdit && !score;
    const { text, sub } = timeOf(e);
    return (
      <div
        key={e.id}
        className={`kml-grid kml-row${editable ? ' is-editable' : ''}`}
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        aria-label={editable ? `Sửa dòng ${text}` : undefined}
        title={score ? 'Leader đã chấm — dòng bị khóa sửa' : undefined}
        onClick={editable ? () => startEdit(e) : undefined}
        onKeyDown={
          editable
            ? (ev) => {
                if (ev.target !== ev.currentTarget) return;
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  startEdit(e);
                }
              }
            : undefined
        }
      >
        <div className="kml-c-time">
          <div className="kml-time">{text}</div>
          {sub && <div className="kml-sub">{sub}</div>}
        </div>
        <div>{e.category || '—'}</div>
        <div className="kml-c-proj">
          <div>{e.project || '—'}</div>
          <RelChip entry={e} />
        </div>
        <div className="kml-c-task">
          {e.feature && <div className="kml-feat">{e.feature}</div>}
          <div className="kml-task">{e.task}</div>
          {(e.estRef || e.note) && (
            <div className="kml-meta">
              {e.estRef && (
                <span className="kml-meta-est" title="Giờ của dòng này cộng vào task estimate">
                  <IcRuler size={13} />
                  {e.estRef.title ?? 'task estimate'}
                </span>
              )}
              {e.note && (
                <span className="kml-meta-note">
                  <IcNote size={13} />
                  {e.note}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="kml-c-score">
          <ScoreCell entry={e} score={score} />
        </div>
        <div className="kml-c-act" onClick={(ev) => ev.stopPropagation()}>
          {canEdit && (
            <button
              type="button"
              className="kml-iconbtn"
              aria-label="Nhân bản thành dòng mới"
              title="Nhân bản thành dòng mới (copy nội dung, đỡ nhập lại)"
              onClick={() => startDuplicate(e)}
            >
              <IcCopy size={18} />
            </button>
          )}
          {editable ? (
            <button
              type="button"
              className="kml-iconbtn is-danger"
              aria-label="Xóa dòng"
              title="Xóa dòng"
              onClick={() => setDeleteTarget(e)}
            >
              <IcTrash size={18} />
            </button>
          ) : (
            canEdit && <span className="kml-iconslot" aria-hidden="true" />
          )}
        </div>
      </div>
    );
  };

  const desktopList = (
    <div className="kml-card">
      <div className="kml-grid kml-head">
        <span>Giờ</span>
        <span>Giai đoạn</span>
        <span>Project và mốc</span>
        <span>Task</span>
        <span className="kml-head-score" ref={legend.ref}>
          Điểm
          <button
            type="button"
            className="kml-iconbtn is-xs"
            aria-label="Cách đọc cột điểm"
            aria-expanded={legend.open}
            onClick={() => legend.setOpen((v) => !v)}
          >
            <IcInfo size={14} />
          </button>
          {legend.open && (
            <div className="kml-popover" role="dialog" aria-label="Cách đọc cột điểm">
              <strong>Cách đọc cột điểm</strong>
              <KpiScoreLegend />
            </div>
          )}
        </span>
        <span className="k-sr">Thao tác</span>
      </div>
      {days.map((date) => {
        const list = byDay.get(date) ?? [];
        const { t, el } = dayScore(list);
        const newHere = draft && !draft.id && draft.date === date;
        // Dòng mới chèn theo giờ bắt đầu (cùng chỗ nó sẽ nằm sau khi lưu).
        const newAt = newHere
          ? (() => {
              const i = list.findIndex((e) => (e.start ?? '99:99') > (draft.start || '99:99'));
              return i < 0 ? list.length : i;
            })()
          : -1;
        return (
          <section key={date} className="kml-day" aria-label={dayLabel(date)}>
            <div className="kml-grid kml-dayhead">
              <div className="kml-dayhead-main">
                <span className="kml-day-date">{dayLabel(date)}</span>
                {dayTags(date)}
                {t.minutes > 0 && <span className="kml-day-hours">{fmtHours(t.minutes)}</span>}
              </div>
              <div className="kml-c-score">{el}</div>
              <div className="kml-c-act">{addDayBtn(date)}</div>
            </div>
            {list.map((e, i) => (
              <div key={e.id} className="kml-row-wrap">
                {i === newAt && editor('inline')}
                {rowDesktop(e)}
              </div>
            ))}
            {newAt === list.length && editor('inline')}
          </section>
        );
      })}
    </div>
  );

  const mobileList = (
    <div className="kml-mdays">
      {days.map((date) => {
        const list = byDay.get(date) ?? [];
        const { t, el } = dayScore(list);
        return (
          <section key={date} className="kml-mday" aria-label={dayLabel(date)}>
            <div className="kml-mdayhead">
              <span className="kml-day-date">{dayLabel(date)}</span>
              <span className="kml-mday-tags">{dayTags(date)}</span>
              <span className="kml-mday-sum">
                {t.minutes > 0 && fmtHours(t.minutes)}
                {el}
              </span>
              {addDayBtn(date)}
            </div>
            <div className="kml-mlist">
              {list.length === 0 ? (
                <div className="kml-mrow is-empty">Chưa có dòng log.</div>
              ) : (
                list.map((e) => {
                  const { text, sub } = timeOf(e);
                  const editable = canEdit && !scores[e.id];
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className="kml-mrow"
                      onClick={() => (editable ? startEdit(e) : setDetailId(e.id))}
                    >
                      <span className="kml-mrow-l1">
                        <span className="kml-time">{text}</span>
                        {sub && <span className="kml-sub">{sub}</span>}
                        <span className="kml-spacer" />
                        <ScoreCell entry={e} score={scores[e.id]} />
                      </span>
                      <span className="kml-mrow-l2">
                        <span>{e.category || '—'}</span>
                        <span className="kml-mrow-proj">{e.project || '—'}</span>
                        <RelChip entry={e} />
                      </span>
                      <span className="kml-mrow-task">
                        {e.feature && <span className="kml-feat-inline">{e.feature}: </span>}
                        {e.task}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );

  const skeleton = (
    <div className="kml-card kml-skel-card" aria-busy="true">
      <div className="kml-progress" role="progressbar" aria-label="Đang tải log của tháng" />
      {[0, 1].map((i) => (
        <div key={i} className="kml-skel-day">
          {skel(140)}
          {[0, 1, 2].map((j) => (
            <div key={j} className="kml-skel-row">
              {skel(80)}
              {skel(narrow ? 160 : 240)}
              {!narrow && skel(320)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const isCurMonth = today.startsWith(monthKey);
  const empty = (
    <div className="kml-card kml-empty">
      <span className="kml-empty-ic">
        <IcCalendar size={32} />
      </span>
      <h2>Chưa có dòng log nào trong tháng này.</h2>
      {canEdit &&
        (isCurMonth ? (
          <>
            <p>Bấm "Thêm dòng hôm nay" để bắt đầu.</p>
            <button type="button" className="kml-btn kml-btn-filled" onClick={() => startAdd(today)}>
              <IcPlus size={16} />
              Thêm dòng hôm nay
            </button>
          </>
        ) : (
          <button
            type="button"
            className="kml-btn kml-btn-tonal"
            onClick={() => {
              if (commitDraftIfAny().ok) onMonthChange(today.slice(0, 7));
            }}
          >
            Về tháng {today.slice(5, 7)}/{today.slice(0, 4)}
          </button>
        ))}
    </div>
  );

  const detail = detailId ? entries.find((e) => e.id === detailId) : undefined;
  const detailScore = detail ? scores[detail.id] : undefined;

  return (
    <div className="kml-log" ref={rootRef}>
      {!locked && noProjects && (
        <div className="kml-banner is-warn" role="status">
          <IcWarn size={20} />
          <span>Bạn chưa được gán project nào — liên hệ leader để được gán trước khi log task.</span>
        </div>
      )}

      {monthBar}

      {/* Plan chung theo tuần: tuần hiện tại + tuần sau */}
      {!entriesLoading && shownWeekPlans.length > 0 && (
        <div className="kml-wplans">
          {shownWeekPlans.map((w) => (
            <section key={w} className="kml-wplan" aria-label="Plan tuần">
              <div className="kml-wplan-h">
                <IcList size={16} />
                <strong>
                  Plan tuần {dm(w)} – {formatDateVi(addDays(w, 4))}
                </strong>
                <span className={`kml-tag ${w === nextWeekStart ? 'is-plan' : 'is-today'}`}>
                  {w === nextWeekStart ? 'Tuần sau' : 'Tuần này'}
                </span>
                <span className="kml-spacer" />
                {canEdit && (
                  <button
                    type="button"
                    className="kml-iconbtn"
                    aria-label="Sửa plan tuần này"
                    title="Sửa plan tuần này"
                    onClick={() => setWeekPlanEdit(w)}
                  >
                    <IcEdit size={18} />
                  </button>
                )}
              </div>
              <div className="kml-wplan-text">{weekPlans![w].text}</div>
            </section>
          ))}
        </div>
      )}

      {entriesLoading ? skeleton : days.length === 0 ? empty : narrow ? mobileList : desktopList}

      {narrow && canEdit && !draft && (
        <button type="button" className="kml-fab" onClick={() => startAdd(today)}>
          <IcPlus size={20} />
          Thêm dòng
        </button>
      )}
      {narrow && editor('full')}

      {detail && (
        <KpiDialog
          sheet
          title={timeOf(detail).text}
          subtitle={dayLabel(detail.date)}
          onClose={() => setDetailId(null)}
          actions={
            <>
              {canEdit && (
                <button
                  type="button"
                  className="k-btn"
                  onClick={() => {
                    setDetailId(null);
                    startDuplicate(detail);
                  }}
                >
                  <IcCopy size={16} />
                  Nhân bản
                </button>
              )}
              <button type="button" className="k-btn" onClick={() => setDetailId(null)}>
                Đóng
              </button>
            </>
          }
        >
          {detailScore && (
            <div className="kml-alert is-neutral">
              <IcLock size={16} />
              <span>
                Leader đã chấm {fmtDelta(detailScore.delta)}
                {detailScore.reason ? ` — ${detailScore.reason}` : ''}. Dòng bị khóa sửa.
              </span>
            </div>
          )}
          <dl className="kml-detail">
            <dt>Thời lượng</dt>
            <dd>{timeOf(detail).sub ?? '—'}</dd>
            <dt>Giai đoạn</dt>
            <dd>{detail.category || '—'}</dd>
            <dt>Project</dt>
            <dd>{detail.project || '—'}</dd>
            <dt>Mốc</dt>
            <dd>{detail.rel?.label ?? 'Chưa có mốc'}</dd>
            {detail.feature && (
              <>
                <dt>Feature</dt>
                <dd>{detail.feature}</dd>
              </>
            )}
            <dt>Task</dt>
            <dd>{detail.task || '—'}</dd>
            {detail.note && (
              <>
                <dt>Note</dt>
                <dd>{detail.note}</dd>
              </>
            )}
          </dl>
        </KpiDialog>
      )}

      {deleteTarget && (
        <KsumConfirmDialog
          tone="danger"
          icon={<IcTrash size={18} />}
          title="Xóa dòng này?"
          subtitle={[dayLabel(deleteTarget.date), timeOf(deleteTarget).text, deleteTarget.project]
            .filter((s) => s && s !== '—')
            .join(', ')}
          confirmLabel="Xóa"
          confirmKind="danger-solid"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        >
          {deleteTarget.task && <p className="kml-clamp2">{deleteTarget.task}</p>}
          <p className="k-muted">Dòng bị xóa không khôi phục được.</p>
        </KsumConfirmDialog>
      )}

      {askDiscard && (
        <KsumConfirmDialog
          tone="warn"
          icon={<IcWarn size={18} />}
          title="Bỏ thay đổi?"
          subtitle="Các thay đổi ở dòng này chưa được lưu."
          confirmLabel="Bỏ thay đổi"
          confirmKind="danger"
          onConfirm={closeDraft}
          onCancel={() => setAskDiscard(false)}
        />
      )}

      {weekPlanEdit && (
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
          onPick={onPickEst}
          onClose={() => setEstPickOpen(false)}
        />
      )}
    </div>
  );
}
