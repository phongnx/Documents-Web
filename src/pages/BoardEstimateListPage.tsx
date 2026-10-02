// Tab Estimate của leader (/board/estimates): estimate theo APP → TASK — toàn bộ task của
// mọi app (lọc mặc định chưa xong) + bảng của từng task, dùng chung MemberEstimateList với
// trang Estimate của từng member. Tạo bảng ngay trên dòng task (1 task ↔ 1 bảng chung);
// bảng tự do không gắn task (theo phase/release như trước) vẫn tạo được ở nút trên cùng
// và nằm ở nhóm "Bảng không gắn task" cuối trang. Xóa bảng bằng 🗑️ trên dòng.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePm, type EstMetaInput } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import EstMetaDialog from '../components/board/EstMetaDialog';
import MemberEstimateList, {
  estInitialFromTask,
  type EstRef,
} from '../components/board/MemberEstimateList';
import { taskSnapOf, type KpiTaskSnap } from '../kpiTypes';

export default function BoardEstimateListPage() {
  const { estimates, apps, tasks, members, loading, addEstimate, deleteEstimate } = usePm();
  const navigate = useNavigate();
  // undefined = đóng; null = bảng tự do; task = bảng gắn task đó.
  const [creating, setCreating] = useState<KpiTaskSnap | null | undefined>(undefined);

  // Task chưa gán app bị bỏ: dialog bắt chọn app trước mới gắn được task.
  const taskSnaps = useMemo(
    () =>
      tasks.flatMap((t) => {
        const app = t.appId ? apps.find((a) => a.id === t.appId) : undefined;
        return app ? [taskSnapOf(t, app.name)] : [];
      }),
    [tasks, apps],
  );

  const estRefs = useMemo<EstRef[]>(
    () =>
      estimates.map((e) => ({
        id: e.id,
        title: e.title,
        ...(e.taskId ? { taskId: e.taskId } : {}),
      })),
    [estimates],
  );

  const takenTaskIds = useMemo(
    () => new Set(estimates.map((e) => e.taskId).filter((x): x is string => !!x)),
    [estimates],
  );

  const onSave = (data: EstMetaInput) => {
    const id = addEstimate(data);
    if (id) navigate(`/board/estimates/${id}`);
  };

  return (
    <div className="container">
      <BoardNav />

      <div className="board-add-row">
        <button
          type="button"
          onClick={() => setCreating(null)}
          title="Bảng không gắn task — theo phase/release, gắn task sau cũng được"
        >
          ＋ Tạo bảng tự do
        </button>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <MemberEstimateList
          tasks={taskSnaps}
          estimates={estRefs}
          detailHref={(id) => `/board/estimates/${id}`}
          onCreate={setCreating}
          onDelete={(e) => deleteEstimate(e.id)}
          emptyHint="Chưa có task nào thuộc app — thêm task ở tab Task trước."
        />
      )}

      {creating !== undefined && (
        <EstMetaDialog
          title={creating ? '＋ Tạo bảng estimate cho task' : '＋ Tạo bảng tự do'}
          apps={apps}
          members={members.filter((m) => m.active)}
          tasks={tasks}
          takenTaskIds={takenTaskIds}
          initial={creating ? estInitialFromTask(creating, members) : undefined}
          onSave={onSave}
          onClose={() => setCreating(undefined)}
        />
      )}
    </div>
  );
}
