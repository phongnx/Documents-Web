import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import ImportDataButton from '../components/board/ImportDataButton';
import PlanProgressCard from '../components/board/PlanProgressCard';
import { BarChart, DonutChart, type DonutSegment } from '../components/board/charts';
import { DONE_STATUS, type TaskItem } from '../pmTypes';
import { formatDay } from '../lib/formatDate';

const RELEASE_TYPE = 'Release';

// Màu cho từng trạng thái (khớp badge ở trang Task).
const STATUS_COLOR: Record<string, string> = {
  'Đã hoàn thành': '#16a34a',
  'Đang thực hiện': '#2563eb',
  'Đang fix bugs': '#ea580c',
  'Chưa bắt đầu': '#94a3b8',
};
const FALLBACK_COLORS = ['#7c3aed', '#0891b2', '#db2777', '#ca8a04'];

// Ngày dùng để xếp release theo thời gian: ưu tiên planDate rồi endDate.
const relDate = (t: TaskItem) => t.planDate || t.endDate || '';

export default function BoardOverviewPage() {
  const { apps, tasks, meta, loading } = usePm();

  const stats = useMemo(() => {
    const releases = tasks.filter((t) => t.type === RELEASE_TYPE);
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Release theo 12 tháng gần nhất.
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthCount = new Map<string, number>(months.map((m) => [m, 0]));
    let releasesThisMonth = 0;
    for (const t of releases) {
      const d = relDate(t);
      if (d.length >= 7) {
        const key = d.slice(0, 7);
        if (monthCount.has(key)) monthCount.set(key, (monthCount.get(key) ?? 0) + 1);
        if (key === thisMonth) releasesThisMonth++;
      }
    }
    const releasesByMonth = months.map((m) => ({
      label: `${m.slice(5)}/${m.slice(2, 4)}`,
      value: monthCount.get(m) ?? 0,
    }));

    // Task theo app (top 10 theo số lượng).
    const appCount = new Map<string, number>();
    for (const t of tasks) {
      if (t.appId) appCount.set(t.appId, (appCount.get(t.appId) ?? 0) + 1);
    }
    const nameOf = new Map(apps.map((a) => [a.id, a.name]));
    const tasksByApp = [...appCount.entries()]
      .map(([id, value]) => ({ label: nameOf.get(id) ?? '(?)', value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Tỉ lệ trạng thái (donut).
    const statusCount = new Map<string, number>();
    for (const t of tasks) statusCount.set(t.status, (statusCount.get(t.status) ?? 0) + 1);
    let fi = 0;
    const statusSegments: DonutSegment[] = [...statusCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({
        label,
        value,
        color: STATUS_COLOR[label] ?? FALLBACK_COLORS[fi++ % FALLBACK_COLORS.length],
      }));

    // App đã release: có ít nhất 1 Release đã hoàn thành + có ngày → version/ngày mới nhất.
    type Released = { app: (typeof apps)[number]; version?: string; date: string };
    const released: Released[] = [];
    for (const a of apps) {
      const done = tasks
        .filter(
          (t) =>
            t.appId === a.id &&
            t.type === RELEASE_TYPE &&
            t.status === DONE_STATUS &&
            relDate(t),
        )
        .sort((x, y) => relDate(y).localeCompare(relDate(x)));
      if (done[0]) released.push({ app: a, version: done[0].version, date: relDate(done[0]) });
    }
    released.sort((a, b) => b.date.localeCompare(a.date));

    const doneCount = tasks.filter((t) => t.status === DONE_STATUS).length;
    const doingCount = tasks.filter((t) => t.status === 'Đang thực hiện').length;

    return {
      total: tasks.length,
      doneCount,
      doingCount,
      appTotal: apps.length,
      releasedCount: released.length,
      releasesThisMonth,
      releasesByMonth,
      tasksByApp,
      statusSegments,
      released,
    };
  }, [apps, tasks]);

  if (loading) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted">Đang tải…</p>
      </div>
    );
  }

  if (apps.length === 0 && tasks.length === 0) {
    return (
      <div className="container">
        <BoardNav />
        <div className="board-empty">
          <p className="muted">
            Chưa có dữ liệu. Nhập từ file JSON hoặc thêm app/task thủ công.
          </p>
          <div className="board-add-row">
            <ImportDataButton />
            <Link to="/board/apps" className="board-docs-link">
              ＋ Thêm app
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <BoardNav />

      <div className="kpi-grid">
        <div className="kpi-tile">
          <span className="kpi-value">{stats.total}</span>
          <span className="kpi-label">Tổng task</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-value">{stats.doneCount}</span>
          <span className="kpi-label">Đã hoàn thành</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-value">{stats.doingCount}</span>
          <span className="kpi-label">Đang thực hiện</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-value">{stats.appTotal}</span>
          <span className="kpi-label">App</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-value">{stats.releasedCount}</span>
          <span className="kpi-label">App đã release</span>
        </div>
        <div className="kpi-tile">
          <span className="kpi-value">{stats.releasesThisMonth}</span>
          <span className="kpi-label">Release tháng này</span>
        </div>
      </div>

      <PlanProgressCard />

      <div className="chart-grid">
        <section className="chart-card">
          <h2 className="chart-title">Release theo tháng (12 tháng)</h2>
          <BarChart data={stats.releasesByMonth} empty="Chưa có release nào có ngày." />
        </section>

        <section className="chart-card">
          <h2 className="chart-title">Tỉ lệ trạng thái</h2>
          <DonutChart segments={stats.statusSegments} />
        </section>

        <section className="chart-card">
          <h2 className="chart-title">Task theo app (top 10)</h2>
          <BarChart data={stats.tasksByApp} color="#0891b2" />
        </section>

        <section className="chart-card">
          <h2 className="chart-title">App đã release ({stats.released.length})</h2>
          {stats.released.length === 0 ? (
            <p className="muted">Chưa có app nào release.</p>
          ) : (
            <ul className="released-list">
              {stats.released.map((r) => (
                <li key={r.app.id}>
                  <span className="released-name">{r.app.name}</span>
                  <span className="task-badge type">{r.app.platform}</span>
                  {r.version && <span className="task-badge ver">{r.version}</span>}
                  <span className="muted released-date">{formatDay(r.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="muted board-hint">
        Xem chi tiết &amp; lọc ở <Link to="/board/tasks">Task</Link> · lịch mốc ở{' '}
        <Link to="/board/calendar">Lịch release</Link>. Loại task hiện có:{' '}
        {meta.taskTypes.join(', ')}.
      </p>
    </div>
  );
}
