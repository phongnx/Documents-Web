// Bảng break task & estimate dùng chung 2 chế độ (cấu trúc theo docs/estimate.xlsx):
// - mode 'leader': toàn quyền sửa mọi lúc.
// - mode 'member': draft = sửa cấu trúc + est (cùng lập kế hoạch); approved = chỉ đổi
//   status/note sub task CỦA MÌNH (viewerId); locked = chỉ xem.
// Row hiển thị dạng item CHỈ ĐỌC (text/badge) — thêm/sửa qua dialog lớn (EstTaskDialog),
// trên row chỉ giữ 1 thao tác nhanh: tick ✅ Xong (đi qua flow chốt điểm completeEstTask).
// Cột "Thực tế" đọc từ logs (Σ phút các dòng log KPI link tới sub task) — không nhập tay.
import { useState } from 'react';
import {
  actualMinOf,
  EST_STATUS_META,
  estAutoEndDate,
  estHoursByAssignee,
  estProgress,
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
import { formatDateVi } from '../../lib/reportFormat';

interface Props {
  mode: 'leader' | 'member';
  meta: EstimateMeta;
  groups: Record<string, EstGroup>;
  logs: EstLogs;
  sheet: EstSheet;
  /** member mode: người đang xem (từ meta sheet KPI qua ?t) — quyết định phần được sửa. */
  viewerId?: string;
  viewerName?: string;
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
}

export default function EstSheetTable({
  mode,
  meta,
  groups,
  logs,
  sheet,
  viewerId,
  viewerName,
  onSetStatus,
}: Props) {
  const locked = meta.locked === true;
  const draft = meta.state === 'draft';
  // Sửa cấu trúc/est: leader mọi lúc (trừ khóa hẳn); member chỉ khi draft.
  const canStructure = !locked && (mode === 'leader' || draft);
  // Sub task "của mình" (member): theo assigneeId, fallback tên (data cũ).
  const isMine = (t: EstSubTask): boolean =>
    mode === 'leader' ||
    (!!viewerId && t.assigneeId === viewerId) ||
    (!viewerId && !!viewerName && t.assigneeName === viewerName);
  const canStatusNote = (t: EstSubTask): boolean =>
    !locked && (mode === 'leader' || draft || isMine(t));

  const participants = meta.participants ?? [];
  const glist = sortedGroups(groups);
  const progress = estProgress(groups);
  const byAssignee = estHoursByAssignee(groups);
  // End tay thắng; trống → End dự kiến tính từ tổng est (max theo assignee, 8h/ngày).
  const autoEnd = meta.endDate
    ? null
    : estAutoEndDate(meta.startDate, meta.holidays, groups);
  const workDays = totalWorkDays(
    meta.startDate,
    meta.endDate ?? autoEnd ?? undefined,
    meta.holidays,
  );

  // Dialog sub task (thêm mới: task=null) + dialog nhóm ('new' = thêm mới).
  const [taskDialog, setTaskDialog] = useState<{
    gid: string;
    task: EstSubTask | null;
  } | null>(null);
  const [groupDialog, setGroupDialog] = useState<EstGroup | 'new' | null>(null);

  // Σ phút thực tế theo assignee (đối chiếu cột SUMIF của xlsx).
  const actualByAssignee = new Map<string, number>();
  for (const g of glist)
    for (const t of sortedTasks(g)) {
      const min = actualMinOf(logs, t.id);
      if (!min) continue;
      const key = t.assigneeName || '(chưa gán)';
      actualByAssignee.set(key, (actualByAssignee.get(key) ?? 0) + min);
    }

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

  const renderTask = (g: EstGroup, t: EstSubTask) => {
    const actual = actualMinOf(logs, t.id);
    const estMin = (t.estHours ?? 0) * 60;
    const actualCls =
      actual > 0 && estMin > 0 ? (actual <= estMin ? 'est-fast' : 'est-slow') : '';
    const stEditable = canStatusNote(t);
    const st = EST_STATUS_META[t.status];
    return (
      <tr
        key={t.id}
        className={`est-task-row${isMine(t) && mode === 'member' ? ' est-mine' : ''}`}
      >
        <td className="est-task-title">
          {t.title ? (
            <span className="est-task-name">{t.title}</span>
          ) : (
            <span className="muted">(chưa đặt tên)</span>
          )}
        </td>
        <td>{t.assigneeName ?? <span className="muted">—</span>}</td>
        <td className="est-hours-cell">
          {t.estHours ? fmtEstHours(t.estHours) : <span className="muted">—</span>}
        </td>
        <td className={`est-actual ${actualCls}`}>
          {actual > 0 ? fmtMin(actual) : '–'}
        </td>
        <td className="est-status-cell">
          <span className={`task-badge ${st.badgeClass}`}>
            {st.icon} {st.label}
          </span>
          {t.status === 'done' && actual === 0 && (
            <span
              className="kpi-warn"
              title="Done nhưng chưa có dòng log KPI nào link tới task này"
            >
              ⚠
            </span>
          )}
        </td>
        <td className="est-note-cell muted">{t.note ?? ''}</td>
        <td className="est-actions">
          {stEditable && (
            <label
              className="est-done-check"
              title={
                t.status === 'done'
                  ? 'Bỏ tick → quay về Đang làm'
                  : 'Chốt xong — dòng log KPI chốt tự nhận điểm gợi ý (±20%)'
              }
            >
              <input
                type="checkbox"
                checked={t.status === 'done'}
                onChange={(e) =>
                  onSetStatus(g.id, t.id, e.target.checked ? 'done' : 'doing')
                }
              />
              Xong
            </label>
          )}
          {stEditable && (
            <button
              type="button"
              className="doc-action"
              title="Sửa sub task"
              onClick={() => setTaskDialog({ gid: g.id, task: t })}
            >
              ✏️
            </button>
          )}
          {canStructure && (
            <button
              type="button"
              className="doc-action danger"
              title="Xóa sub task"
              onClick={() => {
                if (window.confirm(`Xóa sub task "${t.title}"?`))
                  sheet.deleteTask(g.id, t.id);
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
    <div className="est-sheet">
      {glist.length === 0 ? (
        <p className="muted empty">
          Chưa có nhóm task nào.
          {canStructure && ' Bấm "＋ Thêm nhóm" để bắt đầu break task.'}
        </p>
      ) : (
        glist.map((g) => (
          <section key={g.id} className="est-group">
            <div className="est-group-head">
              <strong className="est-group-title">{g.title}</strong>
              {canStructure && (
                <>
                  <button
                    type="button"
                    className="doc-action"
                    title="Sửa tên/mô tả nhóm"
                    onClick={() => setGroupDialog(g)}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="doc-action danger"
                    title="Xóa nhóm (kèm toàn bộ sub task)"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Xóa nhóm "${g.title}" và toàn bộ sub task bên trong?`,
                        )
                      )
                        sheet.deleteGroup(g.id);
                    }}
                  >
                    🗑️
                  </button>
                </>
              )}
            </div>
            {g.desc && <p className="muted est-group-desc">{g.desc}</p>}
            <div className="kpi-table-wrap">
              <table className="kpi-table est-table">
                <thead>
                  <tr>
                    <th>Sub task</th>
                    <th>Assignee</th>
                    <th>Est (h)</th>
                    <th>Thực tế</th>
                    <th>Status</th>
                    <th>Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedTasks(g).map((t) => renderTask(g, t))}
                  {canStructure && (
                    <tr>
                      <td colSpan={7}>
                        <button
                          type="button"
                          className="doc-action"
                          onClick={() => setTaskDialog({ gid: g.id, task: null })}
                        >
                          ＋ Sub task
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {canStructure && (
        <button
          type="button"
          className="doc-action est-add-group"
          onClick={() => setGroupDialog('new')}
        >
          ＋ Thêm nhóm
        </button>
      )}

      {/* Summary như cuối sheet xlsx: tổng giờ theo người + ngày + tiến độ */}
      <section className="est-summary">
        <div className="est-summary-block">
          <strong>Tổng est theo người</strong>
          <ul>
            {[...byAssignee.entries()].map(([name, hours]) => (
              <li key={name}>
                {name}: <strong>{fmtEstHours(hours)}</strong>
                {actualByAssignee.has(name) && (
                  <span className="muted"> · thực tế {fmtMin(actualByAssignee.get(name)!)}</span>
                )}
              </li>
            ))}
            {byAssignee.size === 0 && <li className="muted">(chưa có est)</li>}
          </ul>
        </div>
        <div className="est-summary-block">
          <strong>Thời gian</strong>
          <ul>
            <li>Start: {meta.startDate ? formatDateVi(meta.startDate) : '—'}</li>
            <li>
              End:{' '}
              {meta.endDate
                ? formatDateVi(meta.endDate)
                : autoEnd
                  ? `${formatDateVi(autoEnd)} (dự kiến)`
                  : '—'}
            </li>
            <li>Nghỉ/lễ: {meta.holidays ?? 0} ngày</li>
            <li>
              Tổng ngày công: <strong>{workDays ?? '—'}</strong>
            </li>
          </ul>
        </div>
        <div className="est-summary-block">
          <strong>Tiến độ</strong>
          <ul>
            <li>
              <strong>{progress.pct}%</strong> theo est · {progress.doneCount}/
              {progress.total} sub task done
            </li>
          </ul>
        </div>
      </section>

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
    </div>
  );
}
