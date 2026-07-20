import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import TaskEditDialog, {
  type TaskFormValues,
} from '../components/board/TaskEditDialog';
import { DONE_STATUS, type TaskItem } from '../pmTypes';
import { formatDay } from '../lib/formatDate';
import { currentPlans, planLinks, isoLocal } from '../lib/planLinks';

// Ngày release để tìm bản mới nhất: ưu tiên planDate rồi endDate.
const relDate = (t: TaskItem) => t.planDate || t.endDate || '';
// Ngày để sắp xếp task đang chạy (mới nhất trước).
const actDate = (t: TaskItem) => t.planDate || t.endDate || t.startDate || '';

// Task "đang chạy" = đã bắt đầu, chưa xong (Đang thực hiện / Đang fix bugs).
const isRunning = (t: TaskItem) => t.status.startsWith('Đang');
// Task "đang chờ" = chưa bắt đầu.
const isWaiting = (t: TaskItem) => t.status === 'Chưa bắt đầu';

// Task đang chờ "gần nhất": có ngày plan/bắt đầu sớm nhất; không có ngày thì tạo gần nhất.
function nearestWaiting(list: TaskItem[]): TaskItem | undefined {
  return list
    .filter(isWaiting)
    .sort((a, b) => {
      const da = a.planDate || a.startDate || '';
      const dbb = b.planDate || b.startDate || '';
      if (da && dbb) return da.localeCompare(dbb);
      if (da) return -1;
      if (dbb) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    })[0];
}

// Task đã hoàn thành gần nhất (có version) của một nhóm task.
function latest(tasks: TaskItem[]): TaskItem | undefined {
  return tasks
    .filter((t) => t.status === DONE_STATUS && relDate(t))
    .sort((a, b) => relDate(b).localeCompare(relDate(a)))[0];
}

// Class màu badge trạng thái (đồng bộ trang Task chi tiết).
function statusClass(status: string): string {
  if (status === DONE_STATUS) return 'st-done';
  if (status.includes('Đang fix')) return 'st-fix';
  if (status.includes('Đang')) return 'st-doing';
  return 'st-todo';
}

// Các dòng mô tả task đã làm sạch (bỏ #, gạch đầu dòng, dòng rỗng & dòng trùng tiêu đề).
function descLines(t: TaskItem): string[] {
  return (t.description ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[#>*-]+\s*/, '').trim())
    .filter((l) => l.length > 0 && l !== t.title);
}

const UNASSIGNED = '_none';

export default function BoardTasksPage() {
  const { apps, tasks, meta, plans, loading, addApp, addTask, addTaskType } = usePm();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  // App/task nằm trong plan của tuần hiện tại.
  const today = isoLocal(new Date());
  const { taskIds: planTaskIds, appIds: planAppIds } = useMemo(
    () => planLinks(currentPlans(plans, today)),
    [plans, today],
  );

  // Gom task theo app: đếm + bản mới nhất + số task đang trong plan tuần.
  // App có trong plan tuần được đưa lên đầu. Task không khớp app nào → "Chưa gán".
  const groups = useMemo(() => {
    const byApp = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      const key = t.appId && apps.some((a) => a.id === t.appId) ? t.appId : UNASSIGNED;
      const arr = byApp.get(key) ?? [];
      arr.push(t);
      byApp.set(key, arr);
    }
    const q = search.trim().toLowerCase();
    const rows = apps
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .map((a) => {
        const list = byApp.get(a.id) ?? [];
        const inPlan = planAppIds.has(a.id);
        const planCount = list.filter((t) => planTaskIds.has(t.id)).length;
        // Task đang chạy (mới nhất trước) — để hiện thêm & đưa app lên đầu.
        const running = list
          .filter(isRunning)
          .sort((x, y) => actDate(y).localeCompare(actDate(x)));
        // App không chạy → lấy task đang chờ gần nhất để hiển thị.
        const nextWaiting = running.length === 0 ? nearestWaiting(list) : undefined;
        return {
          id: a.id,
          name: a.name,
          platform: a.platform,
          group: a.group,
          list,
          rel: latest(list),
          inPlan,
          planCount,
          running,
          nextWaiting,
        };
      })
      // Thứ tự: app đang chạy → app có task đang chờ → app trong plan tuần → còn lại.
      .sort(
        (a, b) =>
          Number(b.running.length > 0) - Number(a.running.length > 0) ||
          Number(!!b.nextWaiting) - Number(!!a.nextWaiting) ||
          Number(b.inPlan) - Number(a.inPlan),
      );
    const none = byApp.get(UNASSIGNED) ?? [];

    // Cụm: group trước (theo thứ tự xuất hiện), rồi app không group theo platform.
    type Row = (typeof rows)[number];
    const clusters: { key: string; label: string; rows: Row[] }[] = [];
    const groupOrder: string[] = [];
    for (const r of rows) if (r.group && !groupOrder.includes(r.group)) groupOrder.push(r.group);
    for (const g of groupOrder) {
      clusters.push({
        key: `g-${g}`,
        label: `📦 ${g}`,
        rows: rows.filter((r) => r.group === g),
      });
    }
    const platOrder: string[] = [];
    for (const r of rows)
      if (!r.group && !platOrder.includes(r.platform)) platOrder.push(r.platform);
    for (const p of platOrder) {
      clusters.push({
        key: `p-${p}`,
        label: p,
        rows: rows.filter((r) => !r.group && r.platform === p),
      });
    }
    return { clusters, noneCount: none.length };
  }, [apps, tasks, search, planAppIds, planTaskIds]);

  const onCreate = (values: TaskFormValues) => {
    addTask(values);
    setCreating(false);
  };

  return (
    <div className="container">
      <BoardNav />

      <div className="actions">
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          ＋ Thêm task
        </button>
        <input
          className="task-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm app…"
        />
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : apps.length === 0 && tasks.length === 0 ? (
        <p className="muted empty">
          Chưa có dữ liệu. Thêm app ở tab App hoặc Import ở tab Tổng quan.
        </p>
      ) : (
        <>
          {groups.clusters.map((cl) => (
            <section key={cl.key} className="board-app-group">
              <h2 className="board-group-title">{cl.label}</h2>
              <ul className="board-app-list">
                {cl.rows.map((g) => (
                  <li
                    key={g.id}
                    className={`board-app-item app-clickable${g.inPlan ? ' in-plan' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/board/tasks/${g.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        navigate(`/board/tasks/${g.id}`);
                    }}
                  >
                    <div className="board-app-main">
                      <span className="board-app-name">
                        {g.name}
                        {g.running.length > 0 && (
                          <span className="app-running-tag">▶ đang chạy</span>
                        )}
                        {g.inPlan && <span className="plan-current-tag">📌 Plan tuần</span>}
                      </span>
                      <span className="muted board-app-meta">
                        {g.list.length} task
                        {g.running.length > 0 ? ` · ${g.running.length} đang chạy` : ''}
                        {g.planCount > 0 ? ` · ${g.planCount} trong plan` : ''}
                        {g.rel?.version ? ` · mới nhất: ${g.rel.version}` : ''}
                        {g.rel ? ` (${formatDay(relDate(g.rel))})` : ''}
                      </span>
                      {g.running.slice(0, 2).map((t) => (
                        <span key={t.id} className="app-running-block">
                          <span className="app-running-line">
                            <span className={`task-badge ${statusClass(t.status)}`}>
                              {t.status}
                            </span>
                            <span className="app-running-title">{t.title}</span>
                            {t.version && (
                              <span className="task-badge ver">{t.version}</span>
                            )}
                          </span>
                          {descLines(t)
                            .slice(0, 2)
                            .map((ln, i) => (
                              <span key={i} className="app-running-desc">
                                {ln}
                              </span>
                            ))}
                        </span>
                      ))}
                      {g.nextWaiting && (
                        <span className="app-running-line app-waiting-line">
                          <span className="wait-tag">⏳ chờ</span>
                          <span className="task-badge st-todo">
                            {g.nextWaiting.status}
                          </span>
                          <span className="app-running-title">{g.nextWaiting.title}</span>
                          {g.nextWaiting.version && (
                            <span className="task-badge ver">{g.nextWaiting.version}</span>
                          )}
                          {(g.nextWaiting.planDate || g.nextWaiting.startDate) && (
                            <span className="muted">
                              📅{' '}
                              {formatDay(g.nextWaiting.planDate || g.nextWaiting.startDate)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <span className="task-badge type app-plat">{g.platform}</span>
                    <span className="app-chevron">›</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {groups.noneCount > 0 && (
            <ul className="board-app-list">
              <li
                className="board-app-item app-clickable"
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/board/tasks/${UNASSIGNED}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    navigate(`/board/tasks/${UNASSIGNED}`);
                }}
              >
                <div className="board-app-main">
                  <span className="board-app-name">Chưa gán app</span>
                  <span className="muted board-app-meta">{groups.noneCount} task</span>
                </div>
                <span className="app-chevron">›</span>
              </li>
            </ul>
          )}
        </>
      )}

      {creating && (
        <TaskEditDialog
          task={null}
          apps={apps}
          meta={meta}
          onSave={onCreate}
          onClose={() => setCreating(false)}
          onAddType={addTaskType}
          onAddApp={(name, platform) => addApp(name, platform)?.id}
        />
      )}
    </div>
  );
}
