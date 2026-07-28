// Dialog chi tiết 1 mốc release ở trang share KPI của member — CHỈ ĐỌC.
// Dữ liệu là snapshot trong meta.releases (member ẩn danh không đọc được task của leader).
import type { KpiRelease } from '../../kpiTypes';
import { statusMeta } from '../../pmTypes';
import { weekdayVN } from '../../lib/pmDates';
import { formatDateVi } from '../../lib/reportFormat';

interface Props {
  release: KpiRelease;
  onClose: () => void;
}

export default function KpiReleaseInfoDialog({ release, onClose }: Props) {
  const tasks = release.tasks ?? [];
  return (
    <div className="modal-overlay">
      <div className="modal-dialog kpi-rel-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>
            🚀 {release.app}
            {release.version ? ` ${release.version}` : ''}
          </strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <p className="muted modal-subtitle">
          Mốc release: {weekdayVN(release.date)} {formatDateVi(release.date)}
        </p>

        {tasks.length === 0 ? (
          <p className="muted kpi-rel-dialog-empty">
            Chưa có dữ liệu chi tiết — leader mở trang chấm để đồng bộ.
          </p>
        ) : (
          <div className="kpi-rel-dialog-body">
            {tasks.map((t, i) => (
              <section key={i} className="kpi-rel-task">
                <div className="kpi-rel-task-head">
                  {/* Dòng đánh dấu "… còn N task khác" có status rỗng → ẩn badge. */}
                  {t.status && (
                    <span className={`task-badge ${statusMeta(t.status).badgeClass}`}>
                      {t.status}
                    </span>
                  )}
                  <strong className="kpi-rel-task-title">{t.title}</strong>
                  {t.type && <span className="muted kpi-rel-task-type">{t.type}</span>}
                </div>
                {t.items && t.items.length > 0 && (
                  <ul className="kpi-rel-task-items">
                    {t.items.map((line, j) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
