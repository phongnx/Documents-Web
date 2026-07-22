import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import { useMultiSelect } from '../hooks/useMultiSelect';
import BoardNav from '../components/board/BoardNav';
import TaskEditDialog, {
  type TaskFormValues,
} from '../components/board/TaskEditDialog';
import AssignAppDialog from '../components/board/AssignAppDialog';
import { statusMeta, type TaskItem } from '../pmTypes';
import { formatDay } from '../lib/formatDate';
import { currentPlans, planLinks } from '../lib/planLinks';
import { isoLocal } from '../lib/pmDates';
import { sortDate } from '../lib/pmSort';
import { descLines } from '../lib/pmText';

const UNASSIGNED = '_none';

export default function BoardAppTasksPage() {
  const { appId = '' } = useParams();
  const { apps, tasks, meta, plans, loading, addApp, addTask, updateTask, deleteTask, deleteTasks, assignTasksToApp, addTaskType } =
    usePm();
  const sel = useMultiSelect();
  const [assigning, setAssigning] = useState(false);

  // Task nằm trong plan của tuần hiện tại (để đánh dấu + đưa lên đầu).
  const today = isoLocal(new Date());
  const planTaskIds = useMemo(
    () => planLinks(currentPlans(plans, today)).taskIds,
    [plans, today],
  );

  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<TaskItem | null | undefined>(undefined);

  const isNone = appId === UNASSIGNED;
  const app = apps.find((a) => a.id === appId);
  const appName = isNone ? 'Chưa gán app' : app?.name ?? '(App không tồn tại)';

  // Task của app này (hoặc chưa gán), lọc + sắp xếp theo ngày desc.
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter((t) => {
        const belongs = isNone
          ? !t.appId || !apps.some((a) => a.id === t.appId)
          : t.appId === appId;
        if (!belongs) return false;
        if (fStatus && t.status !== fStatus) return false;
        if (fType && t.type !== fType) return false;
        if (q) {
          const hay = `${t.title} ${t.version ?? ''} ${t.description ?? ''} ${
            t.milestone ?? ''
          }`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          // Task trong plan tuần lên đầu, rồi theo ngày desc.
          Number(planTaskIds.has(b.id)) - Number(planTaskIds.has(a.id)) ||
          sortDate(b).localeCompare(sortDate(a)) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  }, [tasks, apps, appId, isNone, fStatus, fType, search, planTaskIds]);

  const onSave = (values: TaskFormValues) => {
    if (editing) updateTask(editing.id, values);
    else addTask({ ...values, appId: isNone ? values.appId : appId });
    setEditing(undefined);
  };

  const onDelete = (t: TaskItem) => {
    if (window.confirm(`Xóa task "${t.title}"? Không thể hoàn tác.`)) deleteTask(t.id);
  };

  const handleBulkDelete = () => {
    if (sel.docs.size === 0) return;
    if (window.confirm(`Xóa ${sel.docs.size} task đã chọn? Không thể hoàn tác.`)) {
      deleteTasks([...sel.docs]);
      sel.exit();
    }
  };

  // Tạo mới với app đã chọn sẵn (trừ nhóm "chưa gán").
  const openCreate = () =>
    setEditing(null);

  return (
    <div className="container">
      <BoardNav />

      <div className="cal-header">
        <Link to="/board/tasks" className="board-docs-link">
          ← Danh sách app
        </Link>
        <strong className="cal-title">{appName}</strong>
        <span className="muted cal-count">{list.length} task</span>
      </div>

      <div className="actions">
        <button type="button" className="primary" onClick={openCreate}>
          ＋ Thêm task
        </button>
        <button
          type="button"
          className={sel.selectMode ? 'primary' : ''}
          onClick={sel.toggleMode}
        >
          {sel.selectMode ? '✖ Xong' : '☑️ Chọn'}
        </button>
      </div>

      {sel.selectMode && (
        <div className="select-bar">
          <span>Đã chọn {sel.docs.size}</span>
          <button
            type="button"
            disabled={sel.docs.size === 0}
            onClick={() => setAssigning(true)}
          >
            ➡️ Gán vào app
          </button>
          <button
            type="button"
            className="danger"
            disabled={sel.docs.size === 0}
            onClick={handleBulkDelete}
          >
            🗑️ Xóa task đã chọn
          </button>
        </div>
      )}

      <div className="task-filters">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {meta.statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">Mọi loại</option>
          {meta.taskTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className="task-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm…"
        />
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : list.length === 0 ? (
        <p className="muted empty">Không có task nào khớp.</p>
      ) : (
        <ul className="task-list">
          {list.map((t) => {
            const selected = sel.selectMode && sel.docs.has(t.id);
            const inPlan = planTaskIds.has(t.id);
            const preview = descLines(t).slice(0, 2);
            return (
              <li
                key={t.id}
                className={`task-row${selected ? ' selected' : ''}${
                  inPlan ? ' in-plan' : ''
                }`}
              >
                <button
                  type="button"
                  className="task-main"
                  onClick={() =>
                    sel.selectMode ? sel.toggleDoc(t.id) : setEditing(t)
                  }
                >
                  <span className="task-head">
                    {sel.selectMode && (
                      <span className={`sel-check sel-check-inline${selected ? ' on' : ''}`} />
                    )}
                    <span className="task-title">{t.title}</span>
                    <span className="task-tags">
                      {inPlan && <span className="plan-current-tag">📌 Plan tuần</span>}
                      <span className="task-badge type">{t.type}</span>
                      <span className={`task-badge ${statusMeta(t.status).badgeClass}`}>
                        {t.status}
                      </span>
                      {t.version && <span className="task-badge ver">{t.version}</span>}
                      {sortDate(t) && (
                        <span className="muted task-plan">📅 {formatDay(sortDate(t))}</span>
                      )}
                    </span>
                  </span>
                  {preview.length > 0 && (
                    <span className="task-preview">
                      {preview.map((ln, i) => (
                        <span key={i} className="task-desc-line">
                          {ln}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                {!sel.selectMode && (
                  <div className="doc-line-actions">
                    <button
                      type="button"
                      className="doc-action"
                      title="Sửa task"
                      onClick={() => setEditing(t)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="doc-action danger"
                      title="Xóa task"
                      onClick={() => onDelete(t)}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing !== undefined && (
        <TaskEditDialog
          task={editing ?? null}
          apps={apps}
          meta={meta}
          defaultAppId={isNone ? undefined : appId}
          onSave={onSave}
          onClose={() => setEditing(undefined)}
          onAddType={addTaskType}
          onAddApp={(name, platform) => addApp(name, platform)?.id}
        />
      )}

      {assigning && (
        <AssignAppDialog
          count={sel.docs.size}
          apps={apps}
          onCreateApp={(name, platform) => addApp(name, platform)?.id}
          onAssign={(appId) => {
            assignTasksToApp([...sel.docs], appId);
            setAssigning(false);
            sel.exit();
          }}
          onClose={() => setAssigning(false)}
        />
      )}
    </div>
  );
}
