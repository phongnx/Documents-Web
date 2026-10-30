// Bảng break task & estimate dùng chung 2 chế độ (cấu trúc theo docs/estimate.xlsx):
// - mode 'leader': toàn quyền sửa mọi lúc (trừ khi khóa hẳn).
// - mode 'member': draft = sửa cấu trúc + est (cùng lập kế hoạch); approved = chỉ đổi
//   status/note sub task CỦA MÌNH (viewerId); locked = chỉ xem.
// Bản redesign Material 3 (cùng hệ kml-* với trang Log KPI):
// - Desktop: thanh tổng kết dính đầu trang + MỘT lưới chung cho mọi nhóm (cột thẳng hàng).
//   Chip trạng thái mở menu đổi trạng thái (mục Xong xem trước điểm gợi ý); bấm dòng mở
//   dialog sửa; nút xoá chỉ hiện khi rê chuột.
// - Màn hẹp (< 840px): thẻ tổng kết + danh sách thẻ, đổi trạng thái qua bottom sheet.
// Cột "Thực tế" đọc từ logs (Σ phút các dòng log KPI link tới sub task) — không nhập tay.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  actualMinOf,
  EST_STATUS_META,
  estAutoEndDate,
  estHoursByAssignee,
  estProgress,
  estProgressText,
  fmtEstHours,
  fmtMin,
  sortedGroups,
  sortedTasks,
  totalWorkDays,
  type EstGroup,
  type EstimateMeta,
  type EstLogs,
  type EstSubTask,
  type EstTaskStatus,
} from '../../estTypes';
import type { EstSheet } from '../../hooks/useEstSheet';
import EstTaskDialog, { EstGroupDialog, type EstTaskDraft } from './EstTaskDialog';
import { EstStatusIcon, EstStatusMenu, EstStatusSheet } from './EstStatusPicker';
import KsumConfirmDialog from './KsumConfirmDialog';
import type { KpiNotice } from './KpiMemberLog';
import { usePagebarHeight } from './KpiSummaryTable';
import {
  IcAlert,
  IcArrowLeft,
  IcCheck,
  IcChevronDown,
  IcClose,
  IcEdit,
  IcInfo,
  IcLink,
  IcLinkOff,
  IcLock,
  IcPlus,
  IcRuler,
  IcTrash,
  IcTrendUp,
  IcUsers,
  IcWarn,
} from './ksumIcons';
import { fmtDelta } from '../../kpiTypes';
import { formatDateVi } from '../../lib/reportFormat';

// ---------- Thông báo dạng snackbar (dùng chung 2 trang bảng) ----------

/** Snackbar: lỗi giữ tới khi đóng; thông báo thường tự ẩn sau `ms` (mặc định 5s). */
export function useEstNotice() {
  const [notice, setNotice] = useState<KpiNotice | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const notify = (n: KpiNotice | null, ms = 5000) => {
    window.clearTimeout(timer.current);
    setNotice(n);
    if (n && !n.persistent && n.kind !== 'error')
      timer.current = window.setTimeout(() => setNotice(null), ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { notice, notify };
}

export function EstSnackbar({
  notice,
  onClose,
}: {
  notice: KpiNotice | null;
  onClose: () => void;
}) {
  if (!notice) return null;
  const err = notice.kind === 'error';
  return (
    <div
      className={`kml-snack${err ? ' is-error' : ' is-ok'}`}
      role={err ? 'alert' : 'status'}
    >
      {err ? <IcAlert size={18} /> : <IcCheck size={18} />}
      <span className="kml-snack-text">{notice.text}</span>
      <button
        type="button"
        className="kml-iconbtn is-inverse"
        aria-label="Đóng thông báo"
        onClick={onClose}
      >
        <IcClose size={18} />
      </button>
    </div>
  );
}

// ---------- Header trang bảng ----------

/** Khoảng ngày của bảng: End tay thắng; trống → End dự kiến từ tổng est. */
function dateRange(meta: EstimateMeta, groups: Record<string, EstGroup>): string | null {
  if (!meta.startDate && !meta.endDate) return null;
  const autoEnd = meta.endDate ? null : estAutoEndDate(meta.startDate, meta.holidays, groups);
  const start = meta.startDate ? formatDateVi(meta.startDate) : '…';
  const end = meta.endDate
    ? formatDateVi(meta.endDate)
    : autoEnd
      ? `${formatDateVi(autoEnd)} (dự kiến)`
      : '…';
  return `${start} – ${end}`;
}

export function EstStateChip({ meta }: { meta: EstimateMeta }) {
  if (meta.locked)
    return (
      <span className="est-state is-locked">
        <IcLock size={12} />
        Đã khoá
      </span>
    );
  return meta.state === 'draft' ? (
    <span className="est-state is-draft">
      <IcEdit size={12} />
      Draft
    </span>
  ) : (
    <span className="est-state is-approved">
      <IcCheck size={12} />
      Đã duyệt
    </span>
  );
}

/**
 * Thanh tiêu đề trang bảng: nút quay lại, tên bảng, chip trạng thái + app/version/task/
 * khoảng ngày/người tham gia. `actions` nằm bên phải; `below` (màn hẹp) là hàng nút
 * riêng dưới tiêu đề.
 */
export function EstHeader({
  meta,
  groups,
  narrow,
  back,
  showTask,
  actions,
  below,
}: {
  meta: EstimateMeta | null;
  groups: Record<string, EstGroup>;
  narrow: boolean;
  back?: { to: string; label: string };
  /** Hiện task đang gắn (chỉ leader). */
  showTask?: boolean;
  actions?: ReactNode;
  below?: ReactNode;
}) {
  const range = meta ? dateRange(meta, groups) : null;
  const people = (meta?.participants ?? []).map((p) => p.name).join(', ');
  return (
    <>
      <header className="kml-topbar est-topbar">
        {back && (
          <Link to={back.to} className="kml-iconbtn est-back" aria-label={back.label} title={back.label}>
            <IcArrowLeft size={20} />
          </Link>
        )}
        <div className="kml-topbar-title">
          <h1 title={meta?.title}>{meta?.title ?? 'Estimate'}</h1>
          {meta && (
            <p>
              <EstStateChip meta={meta} />
              {narrow ? (
                (meta.appName || meta.version) && (
                  <span>{[meta.appName, meta.version].filter(Boolean).join(' · ')}</span>
                )
              ) : (
                <>
                  {meta.appName && <span>{meta.appName}</span>}
                  {meta.version && <span className="est-ver">{meta.version}</span>}
                  {showTask && meta.taskTitle && (
                    <span className="est-inline">
                      <IcLink size={13} />
                      Task: {meta.taskTitle}
                    </span>
                  )}
                  {range && <span className="est-dot">{range}</span>}
                  {people && (
                    <span className="est-dot est-inline">
                      <IcUsers />
                      {people}
                    </span>
                  )}
                </>
              )}
            </p>
          )}
        </div>
        {actions && <div className="kml-topbar-actions">{actions}</div>}
      </header>
      {below && <div className="est-m-actions">{below}</div>}
    </>
  );
}

/** Khung chờ tải bảng. */
export function EstSheetSkeleton() {
  return (
    <>
      <div className="kml-progress est-loadbar" />
      <div className="kml-card est-skel" aria-busy="true" aria-label="Đang tải">
        <span className="kml-skel" style={{ width: 240, height: 20 }} />
        {[420, 360, 480, 300, 400].map((w, i) => (
          <div key={i} className="est-skel-row">
            <span className="kml-skel" style={{ width: 96, height: 28 }} />
            <span className="kml-skel" style={{ width: w, maxWidth: '50%' }} />
            <span className="kml-spacer" />
            <span className="kml-skel" style={{ width: 64 }} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Bảng không tồn tại / đã xoá. */
export function EstNotFound({
  title,
  text,
  back,
}: {
  title: string;
  text: string;
  back?: { to: string; label: string };
}) {
  return (
    <div className="kml-card">
      <div className="kml-empty">
        <span className="kml-empty-ic">
          <IcLinkOff size={32} />
        </span>
        <h2>{title}</h2>
        <p>{text}</p>
        {back && (
          <Link to={back.to} className="kml-btn kml-btn-tonal">
            <IcArrowLeft size={16} />
            {back.label}
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------- Bảng ----------

interface Props {
  mode: 'leader' | 'member';
  meta: EstimateMeta;
  groups: Record<string, EstGroup>;
  logs: EstLogs;
  sheet: EstSheet;
  /** member mode: người đang xem (từ meta sheet KPI qua ?t) — quyết định phần được sửa. */
  viewerId?: string;
  viewerName?: string;
  /** < 840px: bố cục thẻ + bottom sheet. */
  narrow: boolean;
  /**
   * Chuyển status; status='done' đi qua flow completeEstTask ở page (điểm gợi ý).
   * taskOverride: bản task vừa sửa trong dialog (est mới nhất) — không chờ realtime dội về.
   */
  onSetStatus: (
    gid: string,
    tid: string,
    status: EstTaskStatus,
    taskOverride?: EstSubTask,
  ) => void;
  notify: (n: KpiNotice | null) => void;
}

type Confirm =
  | { kind: 'task'; gid: string; task: EstSubTask; groupTitle: string }
  | { kind: 'group'; group: EstGroup; count: number };

const shortTitle = (s: string) => (s.length > 28 ? `${s.slice(0, 26)}…` : s);

export default function EstSheetTable({
  mode,
  meta,
  groups,
  logs,
  sheet,
  viewerId,
  viewerName,
  narrow,
  onSetStatus,
  notify,
}: Props) {
  const leader = mode === 'leader';
  const locked = meta.locked === true;
  const draft = meta.state === 'draft';
  // Sửa cấu trúc/est: leader mọi lúc (trừ khóa hẳn); member chỉ khi draft.
  const canStructure = !locked && (leader || draft);
  // Sub task "của mình" (member): theo assigneeId, fallback tên (data cũ).
  const isMine = (t: EstSubTask): boolean =>
    leader ||
    (!!viewerId && t.assigneeId === viewerId) ||
    (!viewerId && !!viewerName && t.assigneeName === viewerName);
  const canStatusNote = (t: EstSubTask): boolean =>
    !locked && (leader || draft || isMine(t));

  const participants = meta.participants ?? [];
  const glist = sortedGroups(groups);
  const progress = estProgress(groups);
  const ptext = estProgressText(progress);
  const byAssignee = estHoursByAssignee(groups);
  const autoEnd = meta.endDate ? null : estAutoEndDate(meta.startDate, meta.holidays, groups);
  const workDays = totalWorkDays(meta.startDate, meta.endDate ?? autoEnd ?? undefined, meta.holidays);

  // Nhiều người làm → tô nền + nhãn "bạn" cho dòng của viewer (1 người thì không cần).
  const assignees = new Set<string>();
  let estTotal = 0;
  let actTotal = 0;
  const actualByAssignee = new Map<string, number>();
  for (const g of glist)
    for (const t of sortedTasks(g)) {
      if (t.assigneeId || t.assigneeName) assignees.add(t.assigneeId || t.assigneeName!);
      estTotal += t.estHours ?? 0;
      const min = actualMinOf(logs, t.id);
      actTotal += min;
      if (!min) continue;
      const key = t.assigneeName || '(chưa gán)';
      actualByAssignee.set(key, (actualByAssignee.get(key) ?? 0) + min);
    }
  const multiPeople = assignees.size > 1;
  const youOf = (t: EstSubTask) => !leader && multiPeople && isMine(t);
  // Chip "Est theo người": người có est trước, người chỉ có giờ thực tế sau.
  const peopleStats = [
    ...[...byAssignee.entries()].map(([name, h]) => ({ name, est: fmtEstHours(h) })),
    ...[...actualByAssignee.keys()]
      .filter((n) => !byAssignee.has(n))
      .map((name) => ({ name, est: '—' })),
  ].map((p) => ({ ...p, act: fmtMin(actualByAssignee.get(p.name) ?? 0) }));

  const timeSub = [
    meta.endDate
      ? `End ${formatDateVi(meta.endDate)}`
      : autoEnd
        ? `End ${formatDateVi(autoEnd)} (dự kiến)`
        : meta.startDate
          ? `Start ${formatDateVi(meta.startDate)}`
          : 'Chưa có ngày bắt đầu',
    `nghỉ/lễ ${meta.holidays ?? 0}`,
  ].join(' · ');

  // Dialog sub task (thêm mới: task=null) + dialog nhóm ('new' = thêm mới).
  const [taskDialog, setTaskDialog] = useState<{ gid: string; task: EstSubTask | null } | null>(null);
  const [groupDialog, setGroupDialog] = useState<EstGroup | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Menu / sheet đổi trạng thái đang mở.
  const [menu, setMenu] = useState<{ gid: string; tid: string } | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const legendRef = useRef<HTMLSpanElement>(null);
  const { rootRef, barRef } = usePagebarHeight<HTMLDivElement>();

  // Người khác xoá sub task / nhóm đang mở → đóng dialog, menu (realtime).
  useEffect(() => {
    if (taskDialog) {
      const g = groups[taskDialog.gid];
      if (!g || (taskDialog.task && !g.tasks?.[taskDialog.task.id])) {
        setTaskDialog(null);
        notify({ text: g ? 'Sub task vừa bị xoá ở nơi khác.' : 'Nhóm vừa bị xoá ở nơi khác.' });
      }
    }
    if (groupDialog && groupDialog !== 'new' && !groups[groupDialog.id]) {
      setGroupDialog(null);
      notify({ text: 'Nhóm vừa bị xoá ở nơi khác.' });
    }
    if (menu && !groups[menu.gid]?.tasks?.[menu.tid]) setMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // Bảng vừa bị khoá / duyệt → đóng menu của dòng không còn quyền.
  const menuTask = menu ? groups[menu.gid]?.tasks?.[menu.tid] : undefined;
  useEffect(() => {
    if (menuTask && !canStatusNote(menuTask)) setMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuTask, locked, draft]);

  // Popover chú giải: bấm ra ngoài / Esc để đóng.
  useEffect(() => {
    if (!legendOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!legendRef.current?.contains(e.target as Node)) setLegendOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLegendOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [legendOpen]);

  const pickStatus = (gid: string, t: EstSubTask, s: EstTaskStatus) => {
    setMenu(null);
    if (s === t.status) return;
    onSetStatus(gid, t.id, s);
  };

  // Lưu từ dialog: quyền quyết định path ghi — cấu trúc (node đầy đủ) hay chỉ note;
  // status đổi thì đi riêng qua onSetStatus (done → flow chốt điểm).
  const saveTask = (gid: string, cur: EstSubTask | null, d: EstTaskDraft) => {
    if (!cur) {
      sheet.addTask(gid, {
        title: d.title,
        assigneeId: d.assigneeId,
        assigneeName: d.assigneeName,
        estHours: d.estHours,
        note: d.note,
      });
      return;
    }
    if (canStructure) {
      sheet.updateTask(gid, cur.id, {
        title: d.title,
        assigneeId: d.assigneeId,
        assigneeName: d.assigneeName,
        estHours: d.estHours,
        note: d.note,
      });
    } else if ((d.note ?? '') !== (cur.note ?? '')) {
      sheet.setTaskNote(gid, cur.id, d.note ?? '');
    }
    if (d.status !== cur.status) {
      // Bản merge từ form để completeEstTask dùng est/assignee MỚI (state chưa kịp dội).
      onSetStatus(gid, cur.id, d.status, {
        ...cur,
        title: d.title || cur.title,
        status: d.status,
        ...(canStructure
          ? {
              assigneeId: d.assigneeId,
              assigneeName: d.assigneeName,
              estHours: d.estHours,
            }
          : {}),
        note: d.note,
      });
    }
  };

  const groupMeta = (g: EstGroup) => {
    const ts = sortedTasks(g);
    if (ts.length === 0) return 'Chưa có sub task';
    const done = ts.filter((t) => t.status === 'done').length;
    const est = ts.reduce((s, t) => s + (t.estHours ?? 0), 0);
    const act = ts.reduce((s, t) => s + actualMinOf(logs, t.id), 0);
    return [
      `${done}/${ts.length} xong`,
      est ? `est ${fmtEstHours(est)}` : 'chưa có est',
      ...(act ? [`thực tế ${fmtMin(act)}`] : []),
    ].join(' · ');
  };

  /** Ô "Thực tế": nhanh (≤ est) xanh, vượt est đỏ, chưa log "—", Xong mà chưa log → tag. */
  const actualView = (t: EstSubTask, prefix = '') => {
    const actual = actualMinOf(logs, t.id);
    const estMin = (t.estHours ?? 0) * 60;
    if (actual > 0) {
      const txt = `${prefix}${fmtMin(actual)}`;
      if (!estMin) return <span className="est-num">{txt}</span>;
      return actual <= estMin ? (
        <span className="est-num est-fast">{txt}</span>
      ) : (
        <span className="est-num est-slow" title="Vượt est">
          {txt}
          <IcTrendUp />
        </span>
      );
    }
    if (t.status === 'done')
      return (
        <span className="kml-tag is-warn" title="Đã Xong nhưng chưa có dòng log KPI nào gắn sub task này">
          <IcWarn size={12} />
          chưa log
        </span>
      );
    return prefix ? null : <span className="est-empty-v">—</span>;
  };

  const askDeleteGroup = (g: EstGroup) =>
    setConfirm({ kind: 'group', group: g, count: sortedTasks(g).length });

  // ---------- Banner theo vai trò × trạng thái ----------
  let banner: { text: string; info: boolean } | null = null;
  if (locked)
    banner = {
      text: leader ? 'Bảng đã khoá — chỉ xem. Mở khoá để sửa tiếp.' : 'Bảng đã khoá — chỉ xem.',
      info: false,
    };
  else if (!leader && draft)
    banner = {
      text: 'Bảng đang Draft: cả nhóm cùng break task và điền est. Leader sẽ duyệt & chốt.',
      info: true,
    };
  else if (!leader)
    banner = {
      text: multiPeople
        ? 'Est đã chốt. Bạn chỉ đổi được trạng thái và ghi chú các sub task của mình (dòng tô nền, nhãn “bạn”).'
        : 'Est đã chốt. Bạn chỉ đổi được trạng thái và ghi chú sub task của mình.',
      info: true,
    };
  else if (!draft)
    banner = {
      text: 'Est đã chốt. Member chỉ đổi được trạng thái và ghi chú sub task của họ. Leader vẫn sửa được mọi thứ.',
      info: true,
    };

  const bannerEl = banner && (
    <div className={`kml-banner${banner.info ? ' is-info' : ''}`} role="note">
      {banner.info ? <IcInfo size={20} /> : <IcLock size={20} />}
      <span className="kml-banner-text">{banner.text}</span>
    </div>
  );

  const addGroupBtn = (cls: string) => (
    <button type="button" className={`kml-btn ${cls}`} onClick={() => setGroupDialog('new')}>
      <IcPlus size={16} />
      Thêm nhóm
    </button>
  );

  const emptyEl = (
    <div className="kml-card">
      <div className="kml-empty">
        <span className="kml-empty-ic">
          <IcRuler size={32} />
        </span>
        <h2>Chưa có nhóm task nào</h2>
        {canStructure ? (
          <>
            <p>Tạo nhóm tính năng đầu tiên, rồi thêm sub task vào nhóm để bắt đầu break task.</p>
            {!narrow && addGroupBtn('kml-btn-filled')}
          </>
        ) : (
          <p>Bảng chưa có nội dung.</p>
        )}
      </div>
    </div>
  );

  // ---------- Desktop ----------
  const renderRow = (g: EstGroup, t: EstSubTask) => {
    const can = canStatusNote(t);
    const you = youOf(t);
    const open = menu?.gid === g.id && menu.tid === t.id;
    const label = EST_STATUS_META[t.status].label;
    const cls = [
      'est-grid est-row',
      can ? 'is-click' : '',
      you ? 'is-mine' : '',
      (!can && !leader) || locked ? 'is-ro' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const openEdit = () => setTaskDialog({ gid: g.id, task: t });
    return (
      <div key={t.id} className={cls} onClick={can ? openEdit : undefined}>
        <div className="est-st-wrap" onClick={(e) => e.stopPropagation()}>
          {can ? (
            <button
              type="button"
              className={`est-st is-${t.status}${open ? ' is-open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-label={`Trạng thái ${label} — đổi trạng thái`}
              onClick={() => setMenu(open ? null : { gid: g.id, tid: t.id })}
            >
              <EstStatusIcon status={t.status} />
              {label}
              <span className="est-chev">
                <IcChevronDown size={14} />
              </span>
            </button>
          ) : (
            <span className={`est-st is-ro is-${t.status}`}>
              <EstStatusIcon status={t.status} />
              {label}
            </span>
          )}
          {open && (
            <EstStatusMenu
              task={t}
              actualMin={actualMinOf(logs, t.id)}
              onPick={(s) => pickStatus(g.id, t, s)}
              onClose={() => setMenu(null)}
            />
          )}
        </div>
        <div className="est-name">
          {can ? (
            <button
              type="button"
              className="est-name-btn"
              onClick={(e) => {
                e.stopPropagation();
                openEdit();
              }}
            >
              {t.title || <span className="est-empty-v">(chưa đặt tên)</span>}
            </button>
          ) : (
            t.title || <span className="est-empty-v">(chưa đặt tên)</span>
          )}
        </div>
        <div className="est-who">
          {t.assigneeName ? (
            <span className="kml-ellipsis" title={t.assigneeName}>
              {t.assigneeName}
            </span>
          ) : (
            <span className="est-empty-v">—</span>
          )}
          {you && <span className="est-you">bạn</span>}
        </div>
        <div className="est-num is-num">
          {t.estHours ? fmtEstHours(t.estHours) : <span className="est-empty-v">—</span>}
        </div>
        <div className="est-act-cell">{actualView(t)}</div>
        <div className="est-note" title={t.note}>
          {t.note ?? ''}
        </div>
        <div className="est-act" onClick={(e) => e.stopPropagation()}>
          {canStructure && (
            <button
              type="button"
              className="kml-iconbtn is-danger"
              aria-label={`Xoá sub task ${t.title}`}
              title="Xoá sub task"
              onClick={() => setConfirm({ kind: 'task', gid: g.id, task: t, groupTitle: g.title })}
            >
              <IcTrash size={18} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const groupActions = (g: EstGroup, size: number) =>
    canStructure && (
      <>
        <button
          type="button"
          className="kml-iconbtn"
          aria-label={`Sửa nhóm ${g.title}`}
          title="Sửa tên / mô tả nhóm"
          onClick={() => setGroupDialog(g)}
        >
          <IcEdit size={size} />
        </button>
        <button
          type="button"
          className="kml-iconbtn is-danger"
          aria-label={`Xoá nhóm ${g.title}`}
          title="Xoá nhóm (kèm toàn bộ sub task)"
          onClick={() => askDeleteGroup(g)}
        >
          <IcTrash size={size} />
        </button>
      </>
    );

  const desktop = (
    <>
      <div className="est-stats" ref={barRef}>
        <div className="est-prog">
          <span className="kml-stat-label">Tiến độ</span>
          <div className="kml-stat-row">
            <span className="kml-stat-value">{ptext.mainPct}%</span>
            <span className="kml-stat-sub">{ptext.mainSub}</span>
          </div>
          <div className="est-bar">
            <i style={{ width: `${ptext.mainPct}%` }} />
          </div>
          {ptext.secText && <span className="kml-stat-sub">{ptext.secText}</span>}
        </div>
        <div className="kml-stat">
          <span className="kml-stat-label">Est</span>
          <span className="kml-stat-value">{fmtEstHours(estTotal)}</span>
        </div>
        <div className="kml-stat">
          <span className="kml-stat-label">Thực tế</span>
          <span className="kml-stat-value">{fmtMin(actTotal)}</span>
        </div>
        <div className="kml-stat">
          <span className="kml-stat-label">Thời gian</span>
          <div className="kml-stat-row">
            <span className="kml-stat-value">{workDays ?? '—'}</span>
            <span className="kml-stat-sub">ngày công</span>
          </div>
          <span className="kml-stat-sub">{timeSub}</span>
        </div>
        {peopleStats.length > 0 && (
          <div className="est-people-col">
            <span className="kml-stat-label">Est theo người</span>
            <div className="est-people">
              {peopleStats.map((p) => (
                <span key={p.name} className="kml-mstat">
                  {p.name} <b>{p.est}</b> thực tế {p.act}
                </span>
              ))}
            </div>
          </div>
        )}
        {canStructure && <div className="est-stats-actions">{addGroupBtn('kml-btn-tonal')}</div>}
      </div>

      {glist.length === 0 ? (
        emptyEl
      ) : (
        <div className="kml-card est-card">
          <div className="est-grid est-head" role="row">
            <span>Trạng thái</span>
            <span>Sub task</span>
            <span>Người làm</span>
            <span className="is-num">Est</span>
            <span className="est-head-act" ref={legendRef}>
              Thực tế
              <button
                type="button"
                className={`kml-iconbtn is-xs${legendOpen ? ' is-on' : ''}`}
                aria-label="Chú giải cột thực tế và điểm gợi ý"
                aria-expanded={legendOpen}
                onClick={() => setLegendOpen((v) => !v)}
              >
                <IcInfo size={15} />
              </button>
              {legendOpen && (
                <div className="kml-popover est-legend-pop" role="dialog" aria-label="Chú giải">
                  <h3>Cột thực tế</h3>
                  <div className="kml-legend">
                    <div>
                      <span className="est-num est-fast">4h30</span>
                      <span>Bằng hoặc ít hơn est</span>
                    </div>
                    <div>
                      <span className="est-num est-slow">
                        2h10
                        <IcTrendUp />
                      </span>
                      <span>Vượt est</span>
                    </div>
                    <div>
                      <span className="est-empty-v">—</span>
                      <span>Chưa có giờ log</span>
                    </div>
                    <div>
                      <span className="kml-tag is-warn">
                        <IcWarn size={12} />
                        chưa log
                      </span>
                      <span>Đã Xong nhưng chưa có dòng log KPI nào gắn sub task này</span>
                    </div>
                  </div>
                  <h3>Điểm gợi ý khi chuyển sang Xong</h3>
                  <div className="kml-legend">
                    <div>
                      <span className="kml-score pos">{fmtDelta(1)}</span>
                      <span>Thực tế ≤ 80% est</span>
                    </div>
                    <div>
                      <span className="kml-score zero">0</span>
                      <span>Thực tế ≤ 110% est</span>
                    </div>
                    <div>
                      <span className="kml-score neg">{fmtDelta(-0.5)}</span>
                      <span>Thực tế ≤ 120% est</span>
                    </div>
                    <div>
                      <span className="kml-score neg">{fmtDelta(-1)}</span>
                      <span>Thực tế &gt; 120% est</span>
                    </div>
                  </div>
                  <p className="est-pop-note">
                    Giờ thực tế cộng từ các dòng log KPI gắn sub task. Điểm điền vào dòng log
                    mới nhất; leader xác nhận khi chấm.
                  </p>
                </div>
              )}
            </span>
            <span>Ghi chú</span>
            <span />
          </div>
          {glist.map((g) => (
            <div key={g.id} className="est-gblock">
              <div className="est-ghead">
                <h2>{g.title}</h2>
                <span className="est-gmeta">{groupMeta(g)}</span>
                <div className="est-gacts">{groupActions(g, 18)}</div>
              </div>
              {g.desc && <p className="est-gdesc">{g.desc}</p>}
              {sortedTasks(g).map((t) => renderRow(g, t))}
              {canStructure && (
                <div className="est-addrow">
                  <button
                    type="button"
                    className="kml-btn kml-btn-text"
                    onClick={() => setTaskDialog({ gid: g.id, task: null })}
                  >
                    <IcPlus size={16} />
                    Thêm sub task vào “{shortTitle(g.title)}”
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  // ---------- Màn hẹp ----------
  const renderMRow = (g: EstGroup, t: EstSubTask) => {
    const can = canStatusNote(t);
    const you = youOf(t);
    const label = EST_STATUS_META[t.status].label;
    const body = (
      <>
        <span className="m-row-name">{t.title || '(chưa đặt tên)'}</span>
        <span className="m-row-meta">
          <span className={`is-st-${t.status}`}>{label}</span>
          {t.assigneeName && <span>{t.assigneeName}</span>}
          {you && <span className="est-you">bạn</span>}
          <span>est {t.estHours ? fmtEstHours(t.estHours) : '—'}</span>
          {actualView(t, 'thực tế ')}
        </span>
        {t.note && <span className="m-row-note">{t.note}</span>}
      </>
    );
    return (
      <div key={t.id} className={`m-row${you ? ' is-mine' : ''}`}>
        {can ? (
          <button
            type="button"
            className={`m-st is-${t.status}`}
            aria-haspopup="dialog"
            aria-label={`Trạng thái ${label} — đổi trạng thái`}
            onClick={() => setMenu({ gid: g.id, tid: t.id })}
          >
            <EstStatusIcon status={t.status} size={22} />
          </button>
        ) : (
          <span className={`m-st is-ro is-${t.status}`} role="img" aria-label={label}>
            <EstStatusIcon status={t.status} size={22} />
          </span>
        )}
        {can ? (
          <button
            type="button"
            className="m-row-main"
            aria-label={`Sửa sub task ${t.title}`}
            onClick={() => setTaskDialog({ gid: g.id, task: t })}
          >
            {body}
          </button>
        ) : (
          <div className="m-row-main">{body}</div>
        )}
      </div>
    );
  };

  const mobile = (
    <>
      <section className="m-statcard" aria-label="Tổng kết">
        <div className="m-statrow">
          <span className="kml-stat-value">{ptext.mainPct}%</span>
          <span className="kml-stat-sub">{ptext.mainSub}</span>
        </div>
        <div className="est-bar">
          <i style={{ width: `${ptext.mainPct}%` }} />
        </div>
        {ptext.secText && <span className="kml-stat-sub">{ptext.secText}</span>}
        <div className="m-statmeta">
          <span>
            est <b>{fmtEstHours(estTotal)}</b>
          </span>
          <span>
            thực tế <b>{fmtMin(actTotal)}</b>
          </span>
          <span>{workDays ?? '—'} ngày công</span>
          <span>{timeSub}</span>
        </div>
        {peopleStats.length > 0 && (
          <div className="est-people">
            {peopleStats.map((p) => (
              <span key={p.name} className="kml-mstat">
                {p.name} <b>{p.est}</b> thực tế {p.act}
              </span>
            ))}
          </div>
        )}
      </section>
      {glist.length === 0
        ? emptyEl
        : glist.map((g) => (
            <section key={g.id} className="m-group">
              <div className="m-ghead">
                <div className="m-ghead-t">
                  <h2>{g.title}</h2>
                  <span className="est-gmeta">{groupMeta(g)}</span>
                </div>
                {groupActions(g, 20)}
              </div>
              <div className="m-list">
                {g.desc && <p className="m-gdesc">{g.desc}</p>}
                {sortedTasks(g).map((t) => renderMRow(g, t))}
                {canStructure && (
                  <div className="m-add">
                    <button
                      type="button"
                      className="kml-btn kml-btn-text"
                      onClick={() => setTaskDialog({ gid: g.id, task: null })}
                    >
                      <IcPlus size={16} />
                      Thêm sub task
                    </button>
                  </div>
                )}
              </div>
            </section>
          ))}
      {canStructure && addGroupBtn('kml-btn-tonal est-m-addgroup')}
    </>
  );

  const confirmEl = confirm && (
    <KsumConfirmDialog
      tone="danger"
      icon={<IcTrash size={20} />}
      title={
        confirm.kind === 'task'
          ? 'Xoá sub task?'
          : confirm.count > 0
            ? `Xoá nhóm và ${confirm.count} sub task?`
            : 'Xoá nhóm?'
      }
      confirmLabel={confirm.kind === 'task' ? 'Xoá sub task' : 'Xoá nhóm'}
      confirmKind="danger-solid"
      onCancel={() => setConfirm(null)}
      onConfirm={() => {
        if (confirm.kind === 'task') sheet.deleteTask(confirm.gid, confirm.task.id);
        else sheet.deleteGroup(confirm.group.id);
        setConfirm(null);
      }}
    >
      <p className="est-confirm-text">
        {confirm.kind === 'task'
          ? `“${confirm.task.title}” sẽ bị xoá khỏi nhóm ${confirm.groupTitle}. Không thể hoàn tác.`
          : confirm.count > 0
            ? `Nhóm “${confirm.group.title}” cùng ${confirm.count} sub task bên trong sẽ bị xoá. Không thể hoàn tác.`
            : `Nhóm “${confirm.group.title}” sẽ bị xoá. Không thể hoàn tác.`}
      </p>
    </KsumConfirmDialog>
  );

  return (
    <div className="est-sheet-v2" ref={rootRef}>
      {bannerEl}
      {narrow ? mobile : desktop}

      {narrow && menu && menuTask && (
        <EstStatusSheet
          task={menuTask}
          actualMin={actualMinOf(logs, menuTask.id)}
          onPick={(s) => pickStatus(menu.gid, menuTask, s)}
          onClose={() => setMenu(null)}
        />
      )}
      {taskDialog && (
        <EstTaskDialog
          task={taskDialog.task}
          participants={participants}
          canStructure={canStructure}
          canStatusNote={taskDialog.task ? canStatusNote(taskDialog.task) : true}
          // Member tự break → task mới mặc định assign cho chính mình.
          defaultAssigneeId={mode === 'member' ? viewerId : undefined}
          onSave={(d) => saveTask(taskDialog.gid, taskDialog.task, d)}
          onClose={() => setTaskDialog(null)}
        />
      )}
      {groupDialog && (
        <EstGroupDialog
          group={groupDialog === 'new' ? null : groupDialog}
          onSave={(title, desc) => {
            if (groupDialog === 'new') sheet.addGroup(title, desc);
            else sheet.updateGroup(groupDialog.id, { title, desc });
          }}
          onClose={() => setGroupDialog(null)}
        />
      )}
      {confirmEl}
    </div>
  );
}
