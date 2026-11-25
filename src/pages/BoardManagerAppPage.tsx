// Tab Manager → chi tiết 1 app: mọi task chưa xong chia nhóm (tuần này theo plan / đang chạy
// ngoài plan / dự kiến / chưa có ngày / cần xem lại) + 5 task xong gần nhất. Bấm task mở
// dialog sửa như trang Task (dùng lại TaskEditDialog + mutator có sẵn của PmContext).
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePm, useReleaseKeys } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import TaskEditDialog, { type TaskFormValues } from '../components/board/TaskEditDialog';
import { MgrItem, MgrTaskRow } from '../components/board/ManagerParts';
import { DONE_STATUS, type TaskItem } from '../pmTypes';
import {
  appTaskGroups,
  buildDashboardData,
  emptyWeekPlan,
  futureDay,
  resolveDashboardRows,
  shortDay,
} from '../lib/dashboardExport';
import { isoLocal } from '../lib/pmDates';
import { relDate } from '../lib/pmSort';
import { formatDayMonth } from '../lib/reportFormat';

const RECENT_DONE = 5;

export default function BoardManagerAppPage() {
  const { appId = '' } = useParams();
  const { apps, tasks, plans, reports, meta, loading, addApp, addTask, updateTask, deleteTask, addTaskType } =
    usePm();
  const releaseKeys = useReleaseKeys();
  // undefined = đóng dialog, null = tạo mới, TaskItem = sửa.
  const [editing, setEditing] = useState<TaskItem | null | undefined>(undefined);

  // Vào từ danh sách đang cuộn sâu → luôn mở ở đầu trang.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [appId]);

  const app = apps.find((a) => a.id === appId);
  const today = isoLocal(new Date());
  const cur = plans.find((p) => p.weekStart <= today && today <= p.weekEnd);
  const plan = useMemo(() => cur ?? emptyWeekPlan(today), [cur, today]);

  const data = useMemo(
    () =>
      buildDashboardData({
        plan,
        plans,
        reports,
        tasks,
        apps,
        rows: resolveDashboardRows(meta.dashboardRows, apps),
        releaseKeys,
      }),
    [plan, plans, reports, tasks, apps, meta.dashboardRows, releaseKeys],
  );
  const row = [...data.rows, ...data.other].find((r) => r.appIds.includes(appId));
  const items = (row?.items ?? []).filter((i) => i.appId === appId);
  const planFuture = (row?.future ?? []).filter((f) => !f.taskId);
  const groups = useMemo(() => appTaskGroups(appId, tasks, plan), [appId, tasks, plan]);
  const recentDone = useMemo(
    () =>
      tasks
        .filter((t) => t.appId === appId && t.status === DONE_STATUS)
        .sort((a, b) => relDate(b).localeCompare(relDate(a)) || b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT_DONE),
    [tasks, appId],
  );
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const onSave = (values: TaskFormValues) => {
    if (editing) updateTask(editing.id, values);
    else addTask({ ...values, appId: values.appId || appId });
    setEditing(undefined);
  };
  const onDelete = (t: TaskItem) => {
    if (window.confirm(`Xóa task "${t.title}"? Không thể hoàn tác.`)) deleteTask(t.id);
  };
  const rowProps = { onEdit: (t: TaskItem) => setEditing(t), onDelete };

  const section = (title: string, list: TaskItem[], hint?: string, flagOf?: (t: TaskItem) => string) =>
    list.length > 0 && (
      <section className="mgr-sec">
        <h2 className="mgr-h2">
          {title} <span className="muted">({list.length})</span>
        </h2>
        {hint && <p className="muted mgr-hint">{hint}</p>}
        <ul className="task-list">
          {list.map((t) => (
            <MgrTaskRow key={t.id} t={t} flag={flagOf?.(t)} {...rowProps} />
          ))}
        </ul>
      </section>
    );

  if (!loading && !app) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted">
          App không tồn tại. <Link to="/board/manager">← Về Manager</Link>
        </p>
      </div>
    );
  }

  const range = `${formatDayMonth(plan.weekStart)} – ${formatDayMonth(plan.weekEnd)}`;
  const noUnfinished =
    items.length === 0 &&
    !row?.reportOnly &&
    planFuture.length === 0 &&
    groups.running.length + groups.upcoming.length + groups.undated.length + groups.review.length === 0;

  return (
    <div className="container mgr-page">
      <BoardNav />

      <div className="cal-header">
        <Link to="/board/manager" className="board-docs-link">
          ← Manager
        </Link>
        <strong className="cal-title">{app?.name ?? '…'}</strong>
        {app?.archived && <span className="task-badge st-todo">Đã lưu trữ</span>}
        <span className="muted cal-count">
          {row && row.label !== app?.name ? `Dòng "${row.label}" · ` : ''}
          {app?.platform}
        </span>
      </div>

      <div className="actions">
        <button type="button" className="primary" onClick={() => setEditing(null)}>
          ＋ Thêm task
        </button>
        <Link to={`/board/tasks/${appId}`} className="board-docs-link">
          Mọi task của app ›
        </Link>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <>
          <section className="mgr-sec">
            <h2 className="mgr-h2">
              Tuần này theo plan <span className="muted">({range})</span>
            </h2>
            {!cur && <p className="muted mgr-hint">Tuần này chưa có plan.</p>}
            {items.length > 0 ? (
              <div className="mgr-card">
                {items.map((it, k) => (
                  <MgrItem key={k} it={it}>
                    {it.taskIds.length > 0 && (
                      <ul className="task-list mgr-src">
                        {it.taskIds
                          .map((id) => taskById.get(id))
                          .filter((t): t is TaskItem => !!t)
                          .map((t) => (
                            <MgrTaskRow key={t.id} t={t} {...rowProps} />
                          ))}
                      </ul>
                    )}
                  </MgrItem>
                ))}
              </div>
            ) : row?.reportOnly ? (
              <p>
                <span className="mgr-ro">Chỉ có trong báo cáo ngày</span>
              </p>
            ) : (
              <p>
                <span className="mgr-na">N/A</span>
              </p>
            )}
            {row?.latest && (items.length > 0 || row.reportOnly) && (
              <div className="mgr-card mgr-latest">
                <span className="mgr-lt-d">Cập nhật mới nhất · {shortDay(row.latest.date)}</span>
                <ul className="mgr-lt">
                  {row.latest.lines.map((l, k) => (
                    <li key={k}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {section(
            'Đang chạy ngoài plan',
            groups.running,
            'Task đang thực hiện / đang fix nhưng không có trong plan tuần — dashboard không tính là việc tuần này.',
          )}
          {section('🕒 Dự kiến', groups.upcoming, 'Chưa bắt đầu, ngày sau tuần này.')}
          {planFuture.length > 0 && (
            <section className="mgr-sec">
              <h2 className="mgr-h2">
                Plan các tuần sau <span className="muted">({planFuture.length})</span>
              </h2>
              <ul className="mgr-lt">
                {planFuture.map((f, k) => (
                  <li key={k}>
                    <b>🕒 {futureDay(f.date)}</b> {f.title} <span className="muted">({f.note})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {section('Chưa có ngày', groups.undated, 'Chưa bắt đầu, chưa điền Ngày plan / Ngày bắt đầu.')}
          {section(
            'Cần xem lại',
            groups.review,
            'Chưa bắt đầu, ngày đã qua hoặc nằm trong tuần này nhưng không có trong plan tuần.',
            (t) => ((t.planDate || t.startDate || '') < today ? '⚠ quá hạn' : 'Ngoài plan tuần'),
          )}
          {noUnfinished && <p className="muted">App không có task nào chưa xong.</p>}
          {section('Đã xong gần nhất', recentDone)}
        </>
      )}

      {editing !== undefined && (
        <TaskEditDialog
          task={editing ?? null}
          apps={apps}
          meta={meta}
          defaultAppId={appId}
          onSave={onSave}
          onClose={() => setEditing(undefined)}
          onAddType={addTaskType}
          onAddApp={(name, platform) => addApp(name, platform)?.id}
        />
      )}
    </div>
  );
}
