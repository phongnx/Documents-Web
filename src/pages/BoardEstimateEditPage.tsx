// Editor bảng Break task & Estimate (leader): toàn quyền sửa + duyệt/mở lại/khóa.
// Tick done 1 sub task → chạy cùng flow completeEstTask như member (dòng log chốt bên
// bảng KPI của assignee nhận điểm gợi ý) — token tra từ danh sách member riêng tư.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import EstMetaDialog from '../components/board/EstMetaDialog';
import EstSheetTable from '../components/board/EstSheetTable';
import { useEstSheet } from '../hooks/useEstSheet';
import { completeEstMessage, completeEstTask } from '../lib/estKpiSync';
import { estAutoEndDate, type EstSubTask, type EstTaskStatus } from '../estTypes';
import { formatDateVi } from '../lib/reportFormat';

export default function BoardEstimateEditPage() {
  const { id = '' } = useParams();
  const { apps, members, setEstimateState, setEstimateLocked, updateEstimateMeta } =
    usePm();
  const [writeError, setWriteError] = useState('');
  const sheet = useEstSheet(id, setWriteError);
  const [metaOpen, setMetaOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const meta = sheet.meta;

  // Đổi status sub task: done → flow chốt điểm (điểm gợi ý vào dòng log của assignee).
  // taskOverride = bản vừa sửa trong dialog (est mới nhất, state chưa kịp dội về).
  const onSetStatus = async (
    gid: string,
    tid: string,
    status: EstTaskStatus,
    taskOverride?: EstSubTask,
  ) => {
    const task = taskOverride ?? sheet.groups[gid]?.tasks?.[tid];
    if (!task) return;
    if (status !== 'done') {
      sheet.setTaskStatus(gid, tid, status);
      return;
    }
    const token = members.find((m) => m.id === task.assigneeId)?.token;
    const result = await completeEstTask({
      estId: id,
      groupId: gid,
      taskId: tid,
      task,
      logs: sheet.logs,
      kpiToken: token,
    });
    setNotice(completeEstMessage(result));
    window.setTimeout(() => setNotice(''), 5000);
  };

  if (sheet.state === 'loading') {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted">Đang tải…</p>
      </div>
    );
  }
  if (sheet.state === 'notfound' || !meta) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted empty">Không tìm thấy bảng estimate này.</p>
        <Link to="/board/estimates" className="board-docs-link">
          ← Danh sách bảng
        </Link>
      </div>
    );
  }

  const draft = meta.state === 'draft';
  // End tay thắng; trống → End dự kiến từ tổng est (max theo assignee, 8h/ngày).
  const autoEnd = meta.endDate
    ? null
    : estAutoEndDate(meta.startDate, meta.holidays, sheet.groups);

  return (
    <div className="container">
      <BoardNav />

      <div className="board-add-row est-head-row">
        <Link to="/board/estimates" className="board-docs-link">
          ←
        </Link>
        <strong className="est-page-title">
          📐 {meta.title}
          {meta.appName && <span className="muted"> · {meta.appName}</span>}
          {meta.version && <span className="task-badge ver">{meta.version}</span>}
          <span className={`task-badge ${draft ? 'st-doing' : 'st-done'}`}>
            {draft ? 'Draft — member đang tự fill' : 'Đã duyệt — est đóng băng'}
          </span>
          {meta.locked && <span className="task-badge st-block">🔒 Đã khóa</span>}
        </strong>
        <div className="doc-line-actions">
          <button type="button" className="doc-action" onClick={() => setMetaOpen(true)}>
            ✏️ Thông tin
          </button>
          {draft ? (
            <button
              type="button"
              className="primary"
              title="Chốt est — member chỉ còn đổi status/note"
              onClick={() => {
                if (
                  window.confirm(
                    'Duyệt & chốt bảng? Sau khi chốt member không sửa được cấu trúc/est nữa (chỉ status + note).',
                  )
                )
                  setEstimateState(id, 'approved');
              }}
            >
              ✅ Duyệt & chốt
            </button>
          ) : (
            <button
              type="button"
              className="doc-action"
              title="Mở lại cho member sửa cấu trúc/est"
              onClick={() => setEstimateState(id, 'draft')}
            >
              ↩ Mở lại Draft
            </button>
          )}
          <button
            type="button"
            className="doc-action"
            title={meta.locked ? 'Mở khóa bảng' : 'Khóa hẳn (chỉ xem)'}
            onClick={() => setEstimateLocked(id, !meta.locked)}
          >
            {meta.locked ? '🔓' : '🔒'}
          </button>
        </div>
      </div>

      {(meta.startDate || meta.endDate) && (
        <p className="muted est-range">
          {meta.startDate ? formatDateVi(meta.startDate) : '…'} –{' '}
          {meta.endDate
            ? formatDateVi(meta.endDate)
            : autoEnd
              ? `${formatDateVi(autoEnd)} (dự kiến)`
              : '…'}
          {' · '}👥 {(meta.participants ?? []).map((p) => p.name).join(', ') || 'chưa gán'}
        </p>
      )}

      {writeError && <p className="warn kpi-write-error">{writeError}</p>}
      {notice && <p className="muted kpi-locked-banner">{notice}</p>}

      <EstSheetTable
        mode="leader"
        meta={meta}
        groups={sheet.groups}
        logs={sheet.logs}
        sheet={sheet}
        onSetStatus={onSetStatus}
      />

      {metaOpen && (
        <EstMetaDialog
          title="✏️ Thông tin bảng"
          apps={apps}
          members={members}
          initial={{
            title: meta.title,
            appId: meta.appId,
            version: meta.version,
            startDate: meta.startDate,
            endDate: meta.endDate,
            holidays: meta.holidays,
            participantIds: (meta.participants ?? []).map((p) => p.memberId),
          }}
          onSave={(data) => updateEstimateMeta(id, data)}
          onClose={() => setMetaOpen(false)}
        />
      )}
    </div>
  );
}
