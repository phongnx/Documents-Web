import { Link } from 'react-router-dom';
import { usePm, useReleaseKeys } from '../../context/PmContext';
import {
  catMeta,
  isReleaseWs,
  WORKSTREAM_STATE_META,
  WORKSTREAM_STATES,
  workstreamPct,
  type WorkstreamState,
} from '../../pmTypes';
import { formatDay } from '../../lib/formatDate';
import { formatDateVi } from '../../lib/reportFormat';
import {
  pickCurrentPlan,
  planProgress,
  reportsInWeek,
  suggestFromReports,
} from '../../lib/planProgress';
import { isoLocal } from '../../lib/pmDates';

// Số ngày còn lại tính từ hôm nay tới hết weekEnd (bao gồm hôm nay).
function daysLeft(today: string, weekEnd: string): number {
  if (today > weekEnd) return 0;
  const a = new Date(today + 'T00:00:00');
  const b = new Date(weekEnd + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

// Dropdown chọn trạng thái 1 nhánh.
function StateSelect({
  value,
  onChange,
}: {
  value: WorkstreamState;
  onChange: (s: WorkstreamState) => void;
}) {
  return (
    <select
      className={`pp-state-select ${WORKSTREAM_STATE_META[value].badgeClass}`}
      value={value}
      onChange={(e) => onChange(e.target.value as WorkstreamState)}
    >
      {WORKSTREAM_STATES.map((s) => (
        <option key={s} value={s}>
          {WORKSTREAM_STATE_META[s].icon} {WORKSTREAM_STATE_META[s].label}
        </option>
      ))}
    </select>
  );
}

export default function PlanProgressCard() {
  const { plans, reports, setWorkstreamProgress } = usePm();
  const releaseKeys = useReleaseKeys();
  const today = isoLocal(new Date());

  const picked = pickCurrentPlan(plans, today);
  if (!picked) {
    return (
      <section className="chart-card pp-card-progress">
        <h2 className="chart-title">🎯 Tiến độ tuần này</h2>
        <p className="muted">
          Chưa có plan tuần. Tạo ở <Link to="/board/plan">Plan tuần</Link> để theo dõi tiến
          độ.
        </p>
      </section>
    );
  }

  const { plan, isCurrent } = picked;
  const prog = planProgress(plan, releaseKeys);
  // Đồng bộ tổng hợp từ MỌI báo cáo trong tuần (không chỉ báo cáo mới nhất).
  const weekReports = reportsInWeek(reports, plan);
  const left = daysLeft(today, plan.weekEnd);

  // Cập nhật trạng thái 1 nhánh (ghi kèm % ngầm định để thanh tiến độ khớp).
  const setState = (pi: number, wi: number, state: WorkstreamState) =>
    setWorkstreamProgress(plan.id, [
      { pi, wi, state, progress: WORKSTREAM_STATE_META[state].pct },
    ]);

  // Đồng bộ gợi ý tổng hợp từ các báo cáo ngày trong tuần.
  const onSync = () => {
    if (weekReports.length === 0) return;
    const sugs = suggestFromReports(plan, weekReports);
    if (sugs.length === 0) {
      window.alert('Không có gợi ý mới từ các báo cáo ngày trong tuần.');
      return;
    }
    const lines = sugs
      .map(
        (s) =>
          `• ${s.project} / ${s.wsTitle}: ${WORKSTREAM_STATE_META[s.state].label}` +
          (typeof s.progress === 'number' ? ` (${s.progress}%)` : '') +
          (s.date ? ` — theo báo cáo ${formatDateVi(s.date)}` : ''),
      )
      .join('\n');
    if (
      !window.confirm(
        `Cập nhật ${sugs.length} nhánh theo ${weekReports.length} báo cáo ngày trong tuần?\n\n${lines}`,
      )
    )
      return;
    setWorkstreamProgress(
      plan.id,
      sugs.map((s) => ({
        pi: s.pi,
        wi: s.wi,
        state: s.state,
        progress:
          typeof s.progress === 'number'
            ? s.progress
            : WORKSTREAM_STATE_META[s.state].pct,
      })),
    );
  };

  return (
    <section className="chart-card pp-card-progress">
      <div className="pp-prog-head">
        <h2 className="chart-title">🎯 Tiến độ tuần này</h2>
        <span className="muted pp-prog-week">
          {formatDay(plan.weekStart)} – {formatDay(plan.weekEnd)}
          {isCurrent ? (
            <> · còn {left} ngày</>
          ) : (
            <span className="plan-current-tag">plan mới nhất</span>
          )}
        </span>
        <button
          type="button"
          className="pp-sync-btn"
          onClick={onSync}
          disabled={weekReports.length === 0}
          title={
            weekReports.length > 0
              ? `Đồng bộ tổng hợp từ ${weekReports.length} báo cáo (${formatDateVi(
                  weekReports[0].date,
                )} → ${formatDateVi(weekReports[weekReports.length - 1].date)})`
              : 'Chưa có báo cáo ngày trong tuần này'
          }
        >
          🔄 Đồng bộ từ báo cáo
          {weekReports.length > 0 ? ` (${weekReports.length} ngày)` : ''}
        </button>
      </div>

      {prog.total === 0 ? (
        <p className="muted">
          Plan chưa có nhánh nào. Thêm ở <Link to={`/board/plan/${plan.id}`}>trang sửa plan</Link>.
        </p>
      ) : (
        <>
          {/* Tiến độ theo MỤC TIÊU tuần (release + nhánh có milestone), tính binary Xong */}
          {prog.goalTotal === 0 ? (
            <p className="muted pp-nogoal">
              Chưa đặt mục tiêu tuần (nhánh release hoặc có milestone). Tiến độ tuần tính
              theo các mục tiêu này.
            </p>
          ) : (
            <>
              <div className="pp-overall">
                <span className="pp-goal-label">
                  Mục tiêu tuần: <strong>{prog.goalDone}/{prog.goalTotal}</strong> đạt
                </span>
                <div className="pp-bar">
                  <div className="pp-bar-fill" style={{ width: `${prog.overallPct}%` }} />
                </div>
                <span className="pp-overall-pct">{prog.overallPct}%</span>
              </div>

              <div className="pp-releases">
                <div className="pp-sub-title">
                  🎯 Mục tiêu tuần ({prog.goalDone}/{prog.goalTotal} đạt)
                </div>
                <ul className="pp-release-list">
                  {prog.goals.map((r) => (
                    <li key={`${r.pi}:${r.wi}`}>
                      <span className="task-badge app">{r.project}</span>
                      {isReleaseWs(r.w, releaseKeys) && (
                        <span className="task-badge type">release</span>
                      )}
                      <span className="pp-rel-title">{r.w.title}</span>
                      {r.w.milestone && (
                        <span className="muted pp-rel-ms">→ {r.w.milestone.text}</span>
                      )}
                      <span
                        className={`task-badge ${WORKSTREAM_STATE_META[r.w.state ?? 'todo'].badgeClass}`}
                      >
                        {WORKSTREAM_STATE_META[r.w.state ?? 'todo'].icon}{' '}
                        {WORKSTREAM_STATE_META[r.w.state ?? 'todo'].label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Chip đếm trạng thái (toàn bộ nhánh) */}
          <div className="pp-chips">
            {WORKSTREAM_STATES.map((s) => (
              <span key={s} className={`pp-chip ${WORKSTREAM_STATE_META[s].badgeClass}`}>
                {WORKSTREAM_STATE_META[s].icon} {WORKSTREAM_STATE_META[s].label}:{' '}
                {prog.counts[s]}
              </span>
            ))}
          </div>

          {/* Chi tiết theo project + dropdown cập nhật.
              App CÓ milestone lên trên, app KHÔNG milestone xuống cuối (stable trong nhóm). */}
          <div className="pp-projects">
            {(plan.projects ?? [])
              .map((pr, pi) => ({ pr, pi }))
              .sort((a, b) => {
                const am = (a.pr.workstreams ?? []).some((w) => !!w.milestone) ? 0 : 1;
                const bm = (b.pr.workstreams ?? []).some((w) => !!w.milestone) ? 0 : 1;
                return am - bm;
              })
              .map(({ pr, pi }) => {
              const wss = pr.workstreams ?? [];
              if (wss.length === 0) return null;
              const avg = Math.round(
                wss.reduce((s, w) => s + workstreamPct(w), 0) / wss.length,
              );
              return (
                <div key={pi} className="pp-proj">
                  <div className="pp-proj-head">
                    <span className="pp-proj-name">{pr.name}</span>
                    <div className="pp-bar pp-bar-sm">
                      <div className="pp-bar-fill" style={{ width: `${avg}%` }} />
                    </div>
                    <span className="muted pp-proj-pct">{avg}%</span>
                  </div>
                  {wss.map((w, wi) => (
                    <div key={wi} className="pp-ws-row">
                      <span className="pp-ws-title">
                        {isReleaseWs(w, releaseKeys) && '🚀 '}
                        {w.title}
                      </span>
                      <span className="task-badge type">{catMeta(w.category).label}</span>
                      <StateSelect
                        value={w.state ?? 'todo'}
                        onChange={(s) => setState(pi, wi, s)}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
