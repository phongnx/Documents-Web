import {
  catMeta,
  releaseKeysOf,
  WORKSTREAM_STATE_META,
  type PlanProject,
  type PlanWorkstream,
  type WeeklyPlan,
} from '../../pmTypes';
import { usePm } from '../../context/PmContext';

// Class màu badge (tái dùng từ trang Task) theo loại nhánh; loại tự thêm → mặc định.
const CAT_BADGE: Record<string, string> = {
  release: 'st-done',
  test: 'st-fix',
  ads: 'type',
  plan: 'type',
  other: '',
};

// Dự án có ít nhất 1 nhánh release (category release hoặc milestone thuộc loại release).
const hasRelease = (p: PlanProject, releaseKeys: Set<string>) =>
  (p.workstreams ?? []).some(
    (w) => w.category === 'release' || (!!w.milestone && releaseKeys.has(w.milestone.type)),
  );

// Render 1 nhánh (tiêu đề + badge loại + trạng thái + milestone + list item).
function Workstream({ w, releaseKeys }: { w: PlanWorkstream; releaseKeys: Set<string> }) {
  const meta = catMeta(w.category);
  const items = (w.items ?? []).filter((it) => it.trim());
  const msIsRelease = !!w.milestone && releaseKeys.has(w.milestone.type);
  const st = WORKSTREAM_STATE_META[w.state ?? 'todo'];
  const done = (w.state ?? 'todo') === 'done';
  return (
    <div className={`pp-ws${done ? ' pp-ws-done' : ''}`}>
      <div className="pp-ws-head">
        {w.title && <span className="pp-ws-title">{w.title}</span>}
        <span className={`task-badge ${CAT_BADGE[w.category] ?? ''}`}>{meta.label}</span>
        <span className={`task-badge ${st.badgeClass}`}>
          {st.icon} {st.label}
        </span>
        {w.milestone && (
          <span className={`task-badge ${msIsRelease ? 'st-done' : 'st-fix'}`}>
            → {w.milestone.text}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <ul className="pp-items">
          {items.map((it, ii) => (
            <li key={ii}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 1 card dự án.
function ProjectCard({ p, releaseKeys }: { p: PlanProject; releaseKeys: Set<string> }) {
  return (
    <div className="pp-project pp-card">
      <div className="pp-project-name">{p.name}</div>
      {(p.workstreams ?? []).map((w, wi) => (
        <Workstream key={wi} w={w} releaseKeys={releaseKeys} />
      ))}
    </div>
  );
}

// Xem nhanh plan tuần: card dự án, tách 2 grid — app có release / không release.
export default function PlanPreview({ plan }: { plan: WeeklyPlan }) {
  const { meta } = usePm();
  const releaseKeys = releaseKeysOf(meta.milestoneTypes);
  const projects = plan.projects ?? [];
  const timeline = (plan.timeline ?? []).filter((t) => t.day.trim() || t.release.trim());
  const releaseProjects = projects.filter((p) => hasRelease(p, releaseKeys));
  const otherProjects = projects.filter((p) => !hasRelease(p, releaseKeys));

  return (
    <div className="plan-preview">
      {plan.description && <p className="muted pp-desc">{plan.description}</p>}

      {projects.length === 0 ? (
        <p className="muted">Chưa có dự án nào.</p>
      ) : (
        <>
          {releaseProjects.length > 0 && (
            <div className="pp-line">
              <div className="pp-line-title">🚀 App có release ({releaseProjects.length})</div>
              <div className="pp-grid">
                {releaseProjects.map((p, pi) => (
                  <ProjectCard key={pi} p={p} releaseKeys={releaseKeys} />
                ))}
              </div>
            </div>
          )}

          {otherProjects.length > 0 && (
            <div className="pp-line">
              <div className="pp-line-title">App không release ({otherProjects.length})</div>
              <div className="pp-grid">
                {otherProjects.map((p, pi) => (
                  <ProjectCard key={pi} p={p} releaseKeys={releaseKeys} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {timeline.length > 0 && (
        <div className="pp-project pp-card pp-timeline">
          <div className="pp-project-name">Timeline release</div>
          <ul className="pp-items">
            {timeline.map((t, ti) => (
              <li key={ti}>
                <strong>{t.day}:</strong> {t.release}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
