// Trang Estimate của 1 member phía leader (/board/kpi/:memberId/estimates): task các app
// được gán cho member (đọc thẳng task thật — không cần snapshot) + bảng estimate của
// từng task. Leader tạo bảng ngay trên dòng task; participants mặc định = mọi member
// đang được gán app của task đó (1 bảng chung cho cả nhóm, mỗi người break phần mình).
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePm, type EstMetaInput } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import EstMetaDialog from '../components/board/EstMetaDialog';
import MemberEstimateList, {
  estInitialFromTask,
  type EstRef,
} from '../components/board/MemberEstimateList';
import { taskSnapOf, type KpiTaskSnap } from '../kpiTypes';

export default function BoardKpiEstimateListPage() {
  const { memberId = '' } = useParams();
  const navigate = useNavigate();
  const { members, apps, tasks, estimates, loading, addEstimate, deleteEstimate } = usePm();
  const member = members.find((m) => m.id === memberId);
  const [creating, setCreating] = useState<KpiTaskSnap | null>(null);

  const assignedIds = useMemo(() => new Set(member?.projectIds ?? []), [member]);

  const taskSnaps = useMemo(
    () =>
      tasks
        .filter((t) => !!t.appId && assignedIds.has(t.appId))
        .map((t) => taskSnapOf(t, apps.find((a) => a.id === t.appId)?.name ?? '')),
    [tasks, apps, assignedIds],
  );

  // Leader thấy MỌI bảng của các task này (kể cả member chưa được thêm làm participant),
  // cộng với bảng cũ/không gắn task mà member có tham gia.
  const estRefs = useMemo<EstRef[]>(() => {
    const taskIds = new Set(taskSnaps.map((t) => t.id));
    return estimates
      .filter(
        (e) =>
          (e.taskId && taskIds.has(e.taskId)) || e.participantIds?.includes(memberId),
      )
      .map((e) => ({ id: e.id, title: e.title, ...(e.taskId ? { taskId: e.taskId } : {}) }));
  }, [estimates, taskSnaps, memberId]);

  const takenTaskIds = useMemo(
    () => new Set(estimates.map((e) => e.taskId).filter((x): x is string => !!x)),
    [estimates],
  );

  if (loading && !member) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted">Đang tải…</p>
      </div>
    );
  }
  if (!member) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted empty">Không tìm thấy member này.</p>
        <Link to="/board/kpi" className="board-docs-link">
          ← Danh sách member
        </Link>
      </div>
    );
  }

  const onSave = (data: EstMetaInput) => {
    const id = addEstimate(data);
    if (id) navigate(`/board/estimates/${id}`);
  };

  return (
    <div className="container">
      <BoardNav />

      <div className="cal-header">
        <Link to={`/board/kpi/${member.id}`} className="board-docs-link">
          ← KPI của {member.name}
        </Link>
        <strong className="cal-title">📐 Estimate · {member.name}</strong>
      </div>

      <MemberEstimateList
        tasks={taskSnaps}
        estimates={estRefs}
        detailHref={(id) => `/board/estimates/${id}`}
        onCreate={setCreating}
        onDelete={(e) => deleteEstimate(e.id)}
        emptyHint="Member chưa được gán app nào — gán project ở danh sách member KPI trước."
      />

      {creating && (
        <EstMetaDialog
          title="＋ Tạo bảng estimate cho task"
          apps={apps}
          members={members.filter((m) => m.active)}
          tasks={tasks}
          takenTaskIds={takenTaskIds}
          initial={estInitialFromTask(creating, members)}
          onSave={onSave}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}
