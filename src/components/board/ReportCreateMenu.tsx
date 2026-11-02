// Nội dung menu "Tạo báo cáo" của danh sách Báo cáo ngày — dùng chung cho menu thả
// (desktop) và bottom sheet (mobile). Hôm nay đã có báo cáo → cảnh báo + lối tắt mở
// báo cáo đó, vẫn cho tạo thêm (sync Plan tuần đọc cả hai).
import type { DailyReport, WeeklyPlan } from '../../pmTypes';
import { countReportProjects, formatDateVi, formatDayMonth } from '../../lib/reportFormat';
import { IcCalendar, IcCopy, IcEye, IcPlus, IcWarn } from './ksumIcons';

interface Props {
  today: string;
  /** Báo cáo mới nhất (nguồn "Chép từ báo cáo gần nhất"); undefined khi chưa có báo cáo nào. */
  latest?: DailyReport;
  /** Báo cáo đã có của hôm nay (lấy cái mới nhất nếu có nhiều). */
  todayReport?: DailyReport;
  /** Plan tuần chứa hôm nay. */
  plan?: WeeklyPlan;
  onFromLatest: () => void;
  onFromPlan: () => void;
  onBlank: () => void;
  onOpenToday: () => void;
}

export default function ReportCreateMenu({
  today,
  latest,
  todayReport,
  plan,
  onFromLatest,
  onFromPlan,
  onBlank,
  onOpenToday,
}: Props) {
  return (
    <>
      {todayReport && (
        <>
          <div className="rpt-cm-warn">
            <div className="kml-banner is-warn">
              <IcWarn size={18} />
              <span>
                Hôm nay ({formatDayMonth(today)}) đã có báo cáo. Tạo thêm sẽ ra 2 báo cáo cùng
                ngày, sync Plan tuần đọc cả hai.
              </span>
            </div>
          </div>
          <button type="button" className="kml-menu-item" role="menuitem" onClick={onOpenToday}>
            <IcEye size={18} />
            <span>
              <span>Mở báo cáo hôm nay</span>
              <small>{countReportProjects(todayReport)} dự án</small>
            </span>
          </button>
          <div className="kml-menu-sep" />
          <p className="kml-menu-sub">Vẫn tạo báo cáo mới</p>
        </>
      )}
      {latest && (
        <button type="button" className="kml-menu-item" role="menuitem" onClick={onFromLatest}>
          <IcCopy size={18} />
          <span>
            <span>Chép từ báo cáo gần nhất</span>
            <small>
              {formatDateVi(latest.date)} · {countReportProjects(latest)} dự án
            </small>
          </span>
        </button>
      )}
      <button
        type="button"
        className="kml-menu-item"
        role="menuitem"
        disabled={!plan}
        onClick={onFromPlan}
      >
        <IcCalendar size={18} />
        <span>
          <span>Từ plan tuần</span>
          <small>
            {plan
              ? `Nhánh chưa xong của tuần ${formatDayMonth(plan.weekStart)} – ${formatDayMonth(plan.weekEnd)}`
              : 'Tuần này chưa có plan'}
          </small>
        </span>
      </button>
      <button type="button" className="kml-menu-item" role="menuitem" onClick={onBlank}>
        <IcPlus size={18} />
        <span>
          <span>Báo cáo trống</span>
          <small>1 dự án mẫu</small>
        </span>
      </button>
    </>
  );
}
