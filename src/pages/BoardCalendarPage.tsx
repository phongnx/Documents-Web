import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePm, useReleaseKeys } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import {
  catMeta,
  isReleaseWs,
  statusMeta,
  WORKSTREAM_STATE_META,
  type WeeklyPlan,
  type TaskItem,
} from '../pmTypes';
import { formatDay } from '../lib/formatDate';
import { isoLocal, addDays, mondayOf } from '../lib/pmDates';


const releaseCount = (p: WeeklyPlan, releaseKeys: Set<string>) =>
  (p.projects ?? [])
    .flatMap((pr) => pr.workstreams ?? [])
    .filter((w) => isReleaseWs(w, releaseKeys)).length;

// 'Thứ 2'..'Thứ 7' → 0..5, 'Chủ nhật'/'CN' → 6 (offset từ Thứ Hai). null nếu không rõ.
function dayOffset(day: string): number | null {
  const s = day.toLowerCase().replace(/\s|\./g, '');
  if (s.includes('cn') || s.includes('chunhat') || s.includes('chủnhật')) return 6;
  const m = s.match(/(\d)/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 2 && n <= 7) return n - 2;
  }
  return null;
}

// ---------- Data preset cũ (task.planDate) ----------
function releaseLines(t: TaskItem): string[] {
  return (t.description ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[#>*-]+\s*/, '').trim())
    .filter((l) => l.length > 0 && l !== t.title);
}

type TaskWeek = { monday: string; sunday: string; list: TaskItem[] };

export default function BoardCalendarPage() {
  const { apps, tasks, plans, loading } = usePm();
  const releaseKeys = useReleaseKeys();
  const now = new Date();
  const today = isoLocal(now);

  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const nameOf = useMemo(() => new Map(apps.map((a) => [a.id, a.name])), [apps]);

  // TUẦN: plan từ tuần này trở đi (weekEnd ≥ hôm nay), sắp tăng dần.
  const weekPlans = useMemo(
    () =>
      plans
        .filter((p) => p.weekEnd >= today)
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    [plans, today],
  );

  // THÁNG: mỗi tuần trong tháng → plan (nếu có) hoặc task preset (nếu không).
  const monthKey = `${view.y}-${String(view.m + 1).padStart(2, '0')}`;
  const monthWeeks = useMemo(() => {
    const planWeeks = new Map<string, WeeklyPlan>();
    for (const p of plans) {
      if (p.weekStart.startsWith(monthKey)) planWeeks.set(mondayOf(p.weekStart), p);
    }
    // Task preset chỉ cho các tuần KHÔNG có plan (tránh trùng với plan).
    const taskByWeek = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      if (!t.planDate || !t.planDate.startsWith(monthKey)) continue;
      const mon = mondayOf(t.planDate);
      if (planWeeks.has(mon)) continue;
      const arr = taskByWeek.get(mon) ?? [];
      arr.push(t);
      taskByWeek.set(mon, arr);
    }
    const keys = new Set<string>([...planWeeks.keys(), ...taskByWeek.keys()]);
    return [...keys].sort().map((mon) => {
      const plan = planWeeks.get(mon);
      if (plan) return { monday: mon, type: 'plan' as const, plan };
      const list = (taskByWeek.get(mon) ?? []).sort((x, y) =>
        x.planDate! < y.planDate! ? -1 : 1,
      );
      return {
        monday: mon,
        type: 'task' as const,
        week: { monday: mon, sunday: addDays(mon, 6), list } as TaskWeek,
      };
    });
  }, [tasks, plans, monthKey]);
  const monthTotal = monthWeeks.reduce(
    (s, e) =>
      s + (e.type === 'plan' ? releaseCount(e.plan, releaseKeys) : e.week.list.length),
    0,
  );

  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const goToday = () => setView({ y: now.getFullYear(), m: now.getMonth() });

  // ---------- Render 1 tuần từ PLAN (timeline + chi tiết release) ----------
  const renderPlanWeek = (plan: WeeklyPlan): ReactNode => {
    const isCurrent = plan.weekStart <= today && today <= plan.weekEnd;
    const timeline = (plan.timeline ?? [])
      .filter((t) => t.day.trim() || t.release.trim())
      .map((t) => {
        const off = dayOffset(t.day);
        return { ...t, date: off === null ? '' : addDays(plan.weekStart, off) };
      })
      .sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : 0));
    const releases = (plan.projects ?? []).flatMap((pr) =>
      (pr.workstreams ?? [])
        .filter((w) => isReleaseWs(w, releaseKeys))
        .map((w) => ({ project: pr.name, w })),
    );
    const releaseDone = releases.filter((r) => (r.w.state ?? 'todo') === 'done').length;
    return (
      <section key={plan.id} className="cal-week">
        <h2 className="cal-week-title">
          Tuần {formatDay(plan.weekStart)} – {formatDay(plan.weekEnd)}
          {isCurrent && <span className="plan-current-tag">Tuần này</span>}
          <span className="cal-src-tag">Plan</span>
          <span className="muted">
            {' '}
            · {releaseDone}/{releases.length} release đã xong
          </span>
          <Link to={`/board/plan/${plan.id}`} className="cal-edit-link">
            ✏️ Sửa
          </Link>
        </h2>

        {timeline.length > 0 && (
          <ul className="cal-timeline">
            {timeline.map((t, i) => (
              <li key={i} className="cal-tl-item">
                <span className="cal-tl-day">
                  {t.day}
                  {t.date && <span className="muted"> · {formatDay(t.date)}</span>}
                </span>
                <span className="cal-tl-rel">{t.release}</span>
              </li>
            ))}
          </ul>
        )}

        {releases.length === 0 ? (
          <p className="muted">Chưa có nhánh Release trong plan này.</p>
        ) : (
          <ul className="cal-list">
            {releases.map(({ project, w }, i) => {
              const meta = catMeta(w.category);
              const items = (w.items ?? []).filter((it) => it.trim());
              const st = WORKSTREAM_STATE_META[w.state ?? 'todo'];
              const done = (w.state ?? 'todo') === 'done';
              return (
                <li key={i} className={`cal-item${done ? ' cal-item-done' : ''}`}>
                  <div className="cal-main">
                    <span className="cal-body">
                      <span className="task-badge app">{project}</span>
                      {w.title && <span className="cal-title-text">{w.title}</span>}
                      <span className="task-badge type">{meta.label}</span>
                      <span className={`task-badge ${st.badgeClass}`}>
                        {st.icon} {st.label}
                      </span>
                      {w.milestone && (
                        <span
                          className={`task-badge ${
                            releaseKeys.has(w.milestone.type) ? 'st-done' : 'st-fix'
                          }`}
                        >
                          → {w.milestone.text}
                        </span>
                      )}
                    </span>
                    {items.length > 0 && (
                      <ul className="cal-notes">
                        {items.map((it, ii) => (
                          <li key={ii}>{it}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };

  // ---------- Render 1 tuần từ TASK preset (data cũ) ----------
  const renderTaskWeek = (w: TaskWeek): ReactNode => (
    <section key={w.monday} className="cal-week">
      <h2 className="cal-week-title">
        Tuần {formatDay(w.monday)} – {formatDay(w.sunday)}
        <span className="cal-src-tag preset">Preset</span>
        <span className="muted"> · {w.list.length}</span>
      </h2>
      <ul className="cal-list">
        {w.list.map((t) => {
          const lines = releaseLines(t);
          return (
            <li key={t.id} className="cal-item">
              <span className="cal-date">{formatDay(t.planDate)}</span>
              <div className="cal-main">
                <span className="cal-body">
                  {t.appId && nameOf.get(t.appId) && (
                    <span className="task-badge app">{nameOf.get(t.appId)}</span>
                  )}
                  {t.version && <span className="task-badge ver">{t.version}</span>}
                  <span className="cal-title-text">{t.title}</span>
                  <span className={`task-badge ${statusMeta(t.status).badgeClass}`}>
                    {t.status}
                  </span>
                </span>
                {lines.length > 0 && (
                  <ul className="cal-notes">
                    {lines.map((ln, i) => (
                      <li key={i}>{ln}</li>
                    ))}
                  </ul>
                )}
                {t.milestone && <span className="muted cal-milestone">🏁 {t.milestone}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div className="container">
      <BoardNav />

      <div className="cal-mode">
        <button
          type="button"
          className={mode === 'week' ? 'primary' : ''}
          onClick={() => setMode('week')}
        >
          Theo tuần
        </button>
        <button
          type="button"
          className={mode === 'month' ? 'primary' : ''}
          onClick={() => setMode('month')}
        >
          Theo tháng
        </button>
      </div>

      <p className="muted cal-note">
        Tuần có <Link to="/board/plan">Plan tuần</Link> lấy theo plan (tự cập nhật); tuần
        trước đó (không có plan) giữ data release cũ.
      </p>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : mode === 'week' ? (
        weekPlans.length === 0 ? (
          <p className="muted empty">
            Chưa có plan cho tuần này trở đi. Tạo ở <Link to="/board/plan">Plan tuần</Link>.
          </p>
        ) : (
          <div className="cal-weeks">{weekPlans.map((p) => renderPlanWeek(p))}</div>
        )
      ) : (
        <>
          <div className="cal-header">
            <button type="button" onClick={() => shift(-1)}>
              ← Tháng trước
            </button>
            <strong className="cal-title">
              Tháng {view.m + 1}/{view.y}
            </strong>
            <button type="button" onClick={() => shift(1)}>
              Tháng sau →
            </button>
            <button type="button" onClick={goToday}>
              Hôm nay
            </button>
            <span className="muted cal-count">{monthTotal} mốc release</span>
          </div>

          {monthWeeks.length === 0 ? (
            <p className="muted empty">Không có release nào trong tháng này.</p>
          ) : (
            <div className="cal-weeks">
              {monthWeeks.map((e) =>
                e.type === 'plan' ? renderPlanWeek(e.plan) : renderTaskWeek(e.week),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
