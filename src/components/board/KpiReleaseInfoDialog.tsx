// Dialog chi tiết 1 mốc release ở trang share KPI của member — CHỈ ĐỌC.
// Dữ liệu là snapshot trong meta.releases (member ẩn danh không đọc được task của leader).
import type { KpiRelease } from '../../kpiTypes';
import { statusMeta } from '../../pmTypes';
import { weekdayVN } from '../../lib/pmDates';
import { formatDateVi } from '../../lib/reportFormat';
import ItemLines from './ItemLines';
import KpiDialog from './KpiDialog';
import { IcRocket } from './ksumIcons';

interface Props {
  release: KpiRelease;
  onClose: () => void;
}

export default function KpiReleaseInfoDialog({ release, onClose }: Props) {
  const tasks = release.tasks ?? [];
  return (
    <KpiDialog
      icon={<IcRocket size={18} />}
      title={`${release.app}${release.version ? ` ${release.version}` : ''}`}
      subtitle={`Mốc release: ${weekdayVN(release.date)} ${formatDateVi(release.date)}`}
      scrollBody
      onClose={onClose}
      actions={
        <button type="button" className="k-btn" onClick={onClose}>
          Đóng
        </button>
      }
    >
      {tasks.length === 0 ? (
        <p className="k-muted">Chưa có dữ liệu chi tiết — leader mở trang chấm để đồng bộ.</p>
      ) : (
        <div className="kml-rel-tasks">
          {tasks.map((t, i) => (
            <section key={i} className="kml-rel-task">
              <div className="kml-rel-task-h">
                {/* Dòng đánh dấu "… còn N task khác" có status rỗng → ẩn badge. */}
                {t.status && (
                  <span className={`task-badge ${statusMeta(t.status).badgeClass}`}>{t.status}</span>
                )}
                <strong>{t.title}</strong>
                {t.type && <span className="k-muted">{t.type}</span>}
              </div>
              {t.items && t.items.length > 0 && (
                <ItemLines items={t.items} className="kml-rel-task-items" />
              )}
            </section>
          ))}
        </div>
      )}
    </KpiDialog>
  );
}
