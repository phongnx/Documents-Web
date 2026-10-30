// Dialog xem quy chế chấm điểm KPI — CHỈ ĐỌC (dùng ở trang share của member).
// Đầu dialog có phần "Cách đọc cột điểm" (3 dạng badge trên bảng log).
import { fmtDelta, KPI_MONTH_BASE, type KpiRuleGroup } from '../../kpiTypes';
import KpiDialog from './KpiDialog';
import { KpiScoreLegend } from './KpiMemberLog';
import { IcRules } from './ksumIcons';

interface Props {
  rules: KpiRuleGroup[];
  onClose: () => void;
}

export default function KpiRulesPreviewDialog({ rules, onClose }: Props) {
  return (
    <KpiDialog
      icon={<IcRules size={18} />}
      title="Quy chế chấm điểm KPI"
      subtitle={`Mỗi member có ${KPI_MONTH_BASE} điểm/tháng. Điểm tháng = ${KPI_MONTH_BASE} + tổng điểm cộng/trừ được chấm hàng ngày theo các mức dưới đây.`}
      scrollBody
      onClose={onClose}
      actions={
        <button type="button" className="k-btn" onClick={onClose}>
          Đóng
        </button>
      }
    >
      <div className="kml-legend-box">
        <strong>Cách đọc cột điểm</strong>
        <KpiScoreLegend />
      </div>
      {rules.map((g) => (
        <section key={g.key} className="kml-rules-group">
          <strong>{g.label}</strong>
          {g.levels.length === 0 ? (
            <p className="k-muted">(chưa có mức điểm)</p>
          ) : (
            <ul>
              {g.levels.map((lv, i) => (
                <li key={i}>
                  <span className={`kml-score ${lv.delta > 0 ? 'pos' : lv.delta < 0 ? 'neg' : 'zero'}`}>
                    {fmtDelta(lv.delta)}
                  </span>
                  <span>{lv.label}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </KpiDialog>
  );
}
