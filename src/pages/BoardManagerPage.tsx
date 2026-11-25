// Tab Manager: danh sách app theo khung cố định của Manager + công việc theo plan tuần
// (nhánh, mục tiêu, tiến độ, cập nhật mới nhất từ báo cáo ngày, task dự kiến). Cùng nguồn
// dữ liệu với file HTML export (buildDashboardData) → web và bản trên Docs luôn khớp.
// Bấm app → trang chi tiết /board/manager/:appId (mọi task đang chạy & dự kiến, sửa được).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePm, useReleaseKeys } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import DashboardExportButton from '../components/board/DashboardExportButton';
import DashboardRowsDialog from '../components/board/DashboardRowsDialog';
import { MgrFuture, MgrFutureDialog, MgrItem } from '../components/board/ManagerParts';
import TaskEditDialog, { type TaskFormValues } from '../components/board/TaskEditDialog';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type { TaskItem } from '../pmTypes';
import { IcRules, IcWarn } from '../components/board/ksumIcons';
import {
  buildDashboardData,
  DASH_DONE_LABEL,
  DASHBOARD_OTHER_LABEL,
  emptyWeekPlan,
  resolveDashboardRows,
  shortDay,
  type DashRowData,
} from '../lib/dashboardExport';
import { isoLocal } from '../lib/pmDates';
import { formatDayMonth } from '../lib/reportFormat';

export default function BoardManagerPage() {
  const { plans, reports, tasks, apps, meta, loading, addApp, updateTask, addTaskType } = usePm();
  const releaseKeys = useReleaseKeys();
  const narrow = useMediaQuery('(max-width: 839px)');
  const [rowsOpen, setRowsOpen] = useState(false);
  // Dialog Task dự kiến: dòng ('r:i' khung / 'o:i' Other — tra lại từ data mỗi lần render để
  // luôn thấy dữ liệu mới nhất) + mục vừa bấm.
  const [fut, setFut] = useState<{ key: string; focus: number } | null>(null);
  // Task đang sửa (mở từ dialog Dự kiến); trong lúc sửa ẩn dialog Dự kiến, đóng thì hiện lại.
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? '';

  const today = isoLocal(new Date());
  const plan = plans.find((p) => p.weekStart <= today && today <= p.weekEnd);
  const data = useMemo(
    () =>
      buildDashboardData({
        plan: plan ?? emptyWeekPlan(today),
        plans,
        reports,
        tasks,
        apps,
        rows: resolveDashboardRows(meta.dashboardRows, apps),
        releaseKeys,
      }),
    [plan, plans, reports, tasks, apps, meta.dashboardRows, releaseKeys, today],
  );
  const { stats } = data;
  const futRow = fut
    ? (fut.key[0] === 'o' ? data.other : data.rows)[Number(fut.key.slice(2))]
    : undefined;
  const range = `${formatDayMonth(data.plan.weekStart)} – ${formatDayMonth(data.plan.weekEnd)}`;

  const renderRow = (row: DashRowData, i: number, isOther: boolean) => {
    const na = row.items.length === 0 && !row.reportOnly;
    return (
      <tr key={`${row.label}-${i}`} className={na ? 'is-na' : ''}>
        <td className="mgr-c-app" data-label="App">
          {row.appIds.length === 1 ? (
            <Link className="mgr-app" to={`/board/manager/${row.appIds[0]}`}>
              {row.label} <span aria-hidden="true">›</span>
            </Link>
          ) : (
            <span className="mgr-app is-plain">{row.label}</span>
          )}
          {row.appIds.length > 1 ? (
            <span className="mgr-app-sub">
              {row.appIds.map((id, k) => (
                <Link key={id} to={`/board/manager/${id}`}>
                  {row.appNames[k]}
                </Link>
              ))}
            </span>
          ) : (
            row.appNames.length > 0 &&
            row.appNames[0] !== row.label && (
              <span className="mgr-app-sub">{row.appNames[0]}</span>
            )
          )}
        </td>
        <td className="mgr-c-work" data-label="Việc tuần này">
          {na ? (
            <span className="mgr-na">N/A</span>
          ) : row.reportOnly ? (
            <span className="mgr-ro">Chỉ có trong báo cáo ngày</span>
          ) : (
            row.items.map((it, k) => (
              <MgrItem key={k} it={it} showProject={isOther && it.project !== row.label} />
            ))
          )}
        </td>
        <td className="mgr-c-latest" data-label="Cập nhật mới nhất">
          {!na && row.latest ? (
            <>
              <span className="mgr-lt-d">{shortDay(row.latest.date)}</span>
              <ul className="mgr-lt">
                {row.latest.lines.map((l, k) => (
                  <li key={k}>{l}</li>
                ))}
              </ul>
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td className="mgr-c-fut" data-label="🕒 Dự kiến">
          <MgrFuture
            list={row.future}
            onOpen={(focus) => setFut({ key: `${isOther ? 'o' : 'r'}:${i}`, focus })}
          />
        </td>
      </tr>
    );
  };

  const head = (
    <thead>
      <tr>
        <th className="mgr-c-app">App</th>
        <th className="mgr-c-work">Việc tuần này · mục tiêu · tiến độ</th>
        <th className="mgr-c-latest">Cập nhật mới nhất</th>
        <th className="mgr-c-fut">🕒 Dự kiến</th>
      </tr>
    </thead>
  );

  return (
    <div className="container kml-page mgr-page">
      <BoardNav />

      <div className="kml-topbar">
        <div className="kml-topbar-title">
          <h1>Manager</h1>
          <p>
            Tuần {range}
            {plan ? ` · ${plan.title || 'Plan tuần'}` : ' · chưa có plan'}
          </p>
        </div>
        <div className="kml-topbar-actions">
          <button type="button" className="kml-btn kml-btn-text" onClick={() => setRowsOpen(true)}>
            <IcRules size={18} />
            Khung app
          </button>
          <DashboardExportButton />
        </div>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <>
          {!plan && (
            <p className="mgr-warn">
              <IcWarn size={18} />
              <span>
                Chưa có plan cho tuần {range}: mọi app hiện N/A, chỉ còn cột Dự kiến. Tạo ở{' '}
                <Link to="/board/plan">Plan tuần</Link>.
              </span>
            </p>
          )}

          <div className="kpi-grid">
            <div className="kpi-tile">
              <span className="kpi-value">
                {stats.activeRows}/{stats.totalRows}
              </span>
              <span className="kpi-label">App có việc tuần này</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-value">
                {stats.goalDone}/{stats.goalTotal}
              </span>
              <span className="kpi-label">Mục tiêu tuần đã xong</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-value">
                {stats.releaseDone}/{stats.releaseTotal}
              </span>
              <span className="kpi-label">Release tuần này đã xong</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-value">{stats.future}</span>
              <span className="kpi-label">🕒 Task dự kiến</span>
            </div>
          </div>

          <p className="mgr-legend">
            ⚪ Chưa làm · 🔵 Đang làm · 🧪 Testing · ⏳ Pending · ✅ {DASH_DONE_LABEL} · 🕒 Task dự
            kiến (sau tuần này / chưa có ngày) · <span className="mgr-na">N/A</span> Không có việc
            trong plan tuần
          </p>

          <table className="mgr-table">
            {head}
            <tbody>{data.rows.map((r, i) => renderRow(r, i, false))}</tbody>
          </table>

          <h2 className="mgr-h2">{DASHBOARD_OTHER_LABEL}</h2>
          {data.other.length ? (
            <table className="mgr-table">
              {head}
              <tbody>{data.other.map((r, i) => renderRow(r, i, true))}</tbody>
            </table>
          ) : (
            <p>
              <span className="mgr-na">N/A</span>
            </p>
          )}
        </>
      )}

      {rowsOpen && <DashboardRowsDialog onClose={() => setRowsOpen(false)} />}

      {futRow && !editing && (
        <MgrFutureDialog
          row={futRow}
          focus={fut!.focus}
          tasks={taskById}
          appName={appName}
          narrow={narrow}
          onEdit={setEditing}
          onClose={() => setFut(null)}
        />
      )}

      {editing && (
        <TaskEditDialog
          task={editing}
          apps={apps}
          meta={meta}
          onSave={(values: TaskFormValues) => {
            updateTask(editing.id, values);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
          onAddType={addTaskType}
          onAddApp={(name, platform) => addApp(name, platform)?.id}
        />
      )}
    </div>
  );
}
