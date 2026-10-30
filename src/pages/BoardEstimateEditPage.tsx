// Editor bảng Break task & Estimate (leader): toàn quyền sửa + duyệt/mở lại/khóa.
// Chọn Xong 1 sub task → chạy cùng flow completeEstTask như member (dòng log chốt bên
// bảng KPI của assignee nhận điểm gợi ý) — token tra từ danh sách member riêng tư.
// Bản redesign Material 3: header gọn + chip trạng thái, Duyệt & chốt qua dialog xác nhận,
// thông báo dạng snackbar.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import EstMetaDialog from '../components/board/EstMetaDialog';
import EstSheetTable, {
  EstHeader,
  EstNotFound,
  EstSheetSkeleton,
  EstSnackbar,
  useEstNotice,
} from '../components/board/EstSheetTable';
import KsumConfirmDialog from '../components/board/KsumConfirmDialog';
import { IcCheck, IcEdit, IcLock, IcUndo, IcUnlock } from '../components/board/ksumIcons';
import { useEstSheet } from '../hooks/useEstSheet';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { completeEstMessage, completeEstTask } from '../lib/estKpiSync';
import {
  estProgress,
  estProgressText,
  fmtEstHours,
  sortedGroups,
  sortedTasks,
  type EstSubTask,
  type EstTaskStatus,
} from '../estTypes';

const BACK = { to: '/board/estimates', label: 'Danh sách bảng' };

export default function BoardEstimateEditPage() {
  const { id = '' } = useParams();
  const {
    apps,
    members,
    tasks,
    estimates,
    setEstimateState,
    setEstimateLocked,
    updateEstimateMeta,
  } = usePm();
  const narrow = useMediaQuery('(max-width: 839px)');
  const { notice, notify } = useEstNotice();
  const sheet = useEstSheet(id, (text) => notify({ text, kind: 'error' }));
  const [metaOpen, setMetaOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);

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
    try {
      const result = await completeEstTask({
        estId: id,
        groupId: gid,
        taskId: tid,
        task,
        logs: sheet.logs,
        kpiToken: token,
      });
      notify({ text: completeEstMessage(result) }, 8000);
    } catch {
      notify({ text: 'Không lưu được trạng thái sub task. Thử lại sau.', kind: 'error' });
    }
  };

  if (sheet.state === 'loading') {
    return (
      <div className="container kml-page est-page">
        <BoardNav />
        <EstHeader meta={null} groups={{}} narrow={narrow} back={BACK} />
        <EstSheetSkeleton />
      </div>
    );
  }
  if (sheet.state === 'notfound' || !meta) {
    return (
      <div className="container kml-page est-page">
        <BoardNav />
        <EstHeader meta={null} groups={{}} narrow={narrow} back={BACK} />
        <EstNotFound
          title="Không tìm thấy bảng estimate này"
          text="Bảng có thể đã bị xoá. Quay lại danh sách để mở bảng khác."
          back={BACK}
        />
      </div>
    );
  }

  const draft = meta.state === 'draft';
  const locked = meta.locked === true;

  const infoBtn = (
    <button
      type="button"
      className={`kml-btn ${narrow ? 'kml-btn-outlined' : 'kml-btn-text'}`}
      onClick={() => setMetaOpen(true)}
    >
      {!narrow && <IcEdit size={16} />}
      Thông tin
    </button>
  );
  const stateBtn = draft ? (
    <button
      type="button"
      className="kml-btn kml-btn-filled"
      title="Chốt est — member chỉ còn đổi trạng thái / ghi chú"
      onClick={() => setApproveOpen(true)}
    >
      <IcCheck size={16} />
      Duyệt &amp; chốt
    </button>
  ) : (
    <button
      type="button"
      className="kml-btn kml-btn-outlined"
      title="Mở lại cho member sửa cấu trúc / est"
      onClick={() => setEstimateState(id, 'draft')}
    >
      <IcUndo size={16} />
      Mở lại Draft
    </button>
  );
  const lockBtn = (
    <button
      type="button"
      className="kml-iconbtn est-lockbtn"
      aria-label="Khoá bảng (chỉ xem)"
      title="Khoá bảng (chỉ xem)"
      onClick={() => setEstimateLocked(id, true)}
    >
      <IcLock size={20} />
    </button>
  );
  const unlockBtn = (
    <button type="button" className="kml-btn kml-btn-tonal" onClick={() => setEstimateLocked(id, false)}>
      <IcUnlock size={16} />
      Mở khoá
    </button>
  );
  // Màn hẹp: nút trạng thái (Duyệt / Mở lại) đứng đầu, giãn hết chiều ngang còn lại.
  const actions = locked ? (
    unlockBtn
  ) : narrow ? (
    <>
      {stateBtn}
      {infoBtn}
      {lockBtn}
    </>
  ) : (
    <>
      {infoBtn}
      {stateBtn}
      {lockBtn}
    </>
  );

  // Số liệu cho dialog Duyệt & chốt.
  const progress = estProgress(sheet.groups);
  const ptext = estProgressText(progress);
  const estTotal = sortedGroups(sheet.groups).reduce(
    (s, g) => s + sortedTasks(g).reduce((a, t) => a + (t.estHours ?? 0), 0),
    0,
  );

  return (
    <div className="container kml-page est-page">
      <BoardNav />

      <EstHeader
        meta={meta}
        groups={sheet.groups}
        narrow={narrow}
        back={BACK}
        showTask
        actions={narrow ? undefined : actions}
        below={narrow ? actions : undefined}
      />

      <EstSheetTable
        mode="leader"
        meta={meta}
        groups={sheet.groups}
        logs={sheet.logs}
        sheet={sheet}
        narrow={narrow}
        onSetStatus={onSetStatus}
        notify={notify}
      />

      {approveOpen && (
        <KsumConfirmDialog
          tone="info"
          icon={<IcCheck size={20} />}
          title="Duyệt & chốt bảng?"
          confirmLabel="Duyệt & chốt"
          onCancel={() => setApproveOpen(false)}
          onConfirm={() => {
            setEstimateState(id, 'approved');
            setApproveOpen(false);
          }}
        >
          <p className="est-confirm-text">
            Est sẽ đóng băng. Member chỉ đổi được trạng thái và ghi chú sub task của mình. Có
            thể mở lại Draft sau.
          </p>
          <div className="est-sum">
            <span className="kml-mstat">
              <b>{progress.total}</b> sub task
            </span>
            <span className="kml-mstat">
              est <b>{fmtEstHours(estTotal)}</b>
            </span>
            <span className="kml-mstat">
              <b>{(meta.participants ?? []).length}</b> người tham gia
            </span>
          </div>
          <div className="est-sum-prog">
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
        </KsumConfirmDialog>
      )}

      {metaOpen && (
        <EstMetaDialog
          title="Thông tin bảng"
          apps={apps}
          members={members}
          tasks={tasks}
          takenTaskIds={
            new Set(
              estimates
                .filter((e) => e.id !== id && e.taskId)
                .map((e) => e.taskId as string),
            )
          }
          initial={{
            title: meta.title,
            appId: meta.appId,
            version: meta.version,
            taskId: meta.taskId,
            startDate: meta.startDate,
            endDate: meta.endDate,
            holidays: meta.holidays,
            participantIds: (meta.participants ?? []).map((p) => p.memberId),
          }}
          onSave={(data) => updateEstimateMeta(id, data)}
          onClose={() => setMetaOpen(false)}
        />
      )}

      <EstSnackbar notice={notice} onClose={() => notify(null)} />
    </div>
  );
}
