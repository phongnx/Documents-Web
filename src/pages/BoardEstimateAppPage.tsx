// Trang estimate của 1 app (/board/estimates/app/:appId — appId '_none' = bảng không gắn
// app): chỉ liệt kê các bảng ĐÃ có (mới tạo lên đầu), click → editor bảng, 🗑️ xóa.
// "＋ Tạo estimate" mở dialog chọn task chưa xong của app — tick nhiều task → mỗi task 1
// bảng (addEstimates, 1 lần ghi). "＋ Tạo bảng tự do" giữ dialog meta cũ (app điền sẵn).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePm, type EstMetaInput } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import EstMetaDialog from '../components/board/EstMetaDialog';
import EstTaskPickerDialog from '../components/board/EstTaskPickerDialog';
import {
  EstDeleteButton,
  EstSummaryBadge,
  estInitialFromTask,
  useEstSummaries,
} from '../components/board/MemberEstimateList';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { EST_NO_APP, estAppIdOf } from '../estTypes';
import { taskSnapOf } from '../kpiTypes';
import { statusMeta } from '../pmTypes';
import { formatDay } from '../lib/formatDate';

const dateOf = (t: { planDate?: string; endDate?: string; startDate?: string }) =>
  t.planDate || t.endDate || t.startDate || '';

export default function BoardEstimateAppPage() {
  const { appId = '' } = useParams();
  const { estimates, apps, tasks, members, loading, addEstimate, addEstimates, deleteEstimate } =
    usePm();
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 839px)');
  const [picking, setPicking] = useState(false);
  const [freeOpen, setFreeOpen] = useState(false);

  // Vào từ danh sách đang cuộn sâu → luôn mở ở đầu trang.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [appId]);

  const isNone = appId === EST_NO_APP;
  const app = apps.find((a) => a.id === appId);
  const appName = isNone ? 'Bảng không gắn app' : app?.name ?? '';

  const boards = useMemo(
    () =>
      estimates
        .filter((e) => estAppIdOf(e, tasks) === appId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [estimates, tasks, appId],
  );
  const summaries = useEstSummaries(boards);
  const appTasks = useMemo(() => tasks.filter((t) => t.appId === appId), [tasks, appId]);
  const takenTaskIds = useMemo(
    () => new Set(estimates.map((e) => e.taskId).filter((x): x is string => !!x)),
    [estimates],
  );

  // Mỗi task tick → 1 bảng, seed như nút tạo trên dòng task cũ (tiêu đề/version/ngày/
  // người tham gia = member active được gán app). Tạo đúng 1 bảng → mở luôn bảng đó.
  const onPickTasks = (taskIds: string[]) => {
    if (!app) return;
    const inputs = taskIds
      .map((id) => tasks.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => estInitialFromTask(taskSnapOf(t, app.name), members) as EstMetaInput);
    const ids = addEstimates(inputs);
    setPicking(false);
    if (ids.length === 1 && ids[0]) navigate(`/board/estimates/${ids[0]}`);
  };

  // Bảng tự do: app điền sẵn + người tham gia = member active được gán app.
  const freeInitial: Partial<EstMetaInput> | undefined = isNone
    ? undefined
    : {
        appId,
        participantIds: members
          .filter((m) => m.active && m.projectIds?.includes(appId))
          .map((m) => m.id),
      };

  const onSaveFree = (data: EstMetaInput) => {
    const id = addEstimate(data);
    if (id) navigate(`/board/estimates/${id}`);
  };

  if (!loading && !isNone && !app) {
    return (
      <div className="container">
        <BoardNav />
        <div className="cal-header">
          <Link to="/board/estimates" className="board-docs-link">
            ← Danh sách app
          </Link>
        </div>
        <p className="muted empty">App không tồn tại hoặc đã bị xoá.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <BoardNav />

      <div className="cal-header">
        <Link to="/board/estimates" className="board-docs-link">
          ← Danh sách app
        </Link>
        <strong className="cal-title">{appName}</strong>
        <span className="muted cal-count">{boards.length} bảng</span>
      </div>

      <div className="actions">
        {!isNone && (
          <button type="button" className="primary" onClick={() => setPicking(true)}>
            ＋ Tạo estimate
          </button>
        )}
        <button
          type="button"
          onClick={() => setFreeOpen(true)}
          title="Bảng không gắn task — theo phase/release, gắn task sau cũng được"
        >
          ＋ Tạo bảng tự do
        </button>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : boards.length === 0 ? (
        <p className="muted empty">
          Chưa có bảng estimate nào{isNone ? '' : ' cho app này — bấm "＋ Tạo estimate" để chọn task'}.
        </p>
      ) : (
        <ul className="task-list">
          {boards.map((e) => {
            const task = e.taskId ? tasks.find((t) => t.id === e.taskId) : undefined;
            return (
              <li key={e.id} className="task-row mest-has-est">
                <button
                  type="button"
                  className="task-main"
                  title="Mở bảng estimate"
                  onClick={() => navigate(`/board/estimates/${e.id}`)}
                >
                  <span className="task-head">
                    <span className="task-title">{e.title}</span>
                    <span className="task-tags">
                      {task ? (
                        <>
                          {task.type && <span className="task-badge type">{task.type}</span>}
                          <span className={`task-badge ${statusMeta(task.status).badgeClass}`}>
                            {task.status}
                          </span>
                          {task.version && <span className="task-badge ver">{task.version}</span>}
                          {dateOf(task) && (
                            <span className="muted task-plan">📅 {formatDay(dateOf(task))}</span>
                          )}
                        </>
                      ) : e.taskId ? (
                        <span className="muted">Task không còn</span>
                      ) : (
                        <span className="muted">Bảng tự do</span>
                      )}
                    </span>
                  </span>
                  <span className="mest-est">
                    📐 <EstSummaryBadge summary={summaries[e.id]} />
                  </span>
                </button>
                <EstDeleteButton est={e} onDelete={(x) => deleteEstimate(x.id)} />
              </li>
            );
          })}
        </ul>
      )}

      {picking && app && (
        <EstTaskPickerDialog
          appName={app.name}
          tasks={appTasks}
          takenTaskIds={takenTaskIds}
          narrow={narrow}
          onConfirm={onPickTasks}
          onClose={() => setPicking(false)}
        />
      )}
      {freeOpen && (
        <EstMetaDialog
          title="＋ Tạo bảng tự do"
          apps={apps}
          members={members.filter((m) => m.active)}
          tasks={tasks}
          takenTaskIds={takenTaskIds}
          initial={freeInitial}
          onSave={onSaveFree}
          onClose={() => setFreeOpen(false)}
        />
      )}
    </div>
  );
}
