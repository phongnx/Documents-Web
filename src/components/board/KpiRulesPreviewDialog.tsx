// Dialog xem quy chế chấm điểm KPI — CHỈ ĐỌC (dùng ở trang share của member).
import { fmtDelta, KPI_MONTH_BASE, type KpiRuleGroup } from '../../kpiTypes';

interface Props {
  rules: KpiRuleGroup[];
  onClose: () => void;
}

export default function KpiRulesPreviewDialog({ rules, onClose }: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-dialog kpi-rules-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>ℹ️ Quy chế chấm điểm KPI</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <p className="muted modal-subtitle">
          Mỗi member có {KPI_MONTH_BASE} điểm/tháng. Điểm tháng = {KPI_MONTH_BASE} + tổng
          điểm cộng/trừ được chấm hàng ngày theo các mức dưới đây.
        </p>

        <div className="kpi-rules-body">
          {rules.map((g) => (
            <section key={g.key} className="kpi-rules-group">
              <strong className="kpi-rules-group-title">{g.label}</strong>
              {g.levels.length === 0 ? (
                <p className="muted kpi-rules-empty">(chưa có mức điểm)</p>
              ) : (
                <ul className="kpi-rules-preview-list">
                  {g.levels.map((lv, i) => (
                    <li key={i}>
                      <span
                        className={`kpi-score ${lv.delta > 0 ? 'pos' : lv.delta < 0 ? 'neg' : 'zero'}`}
                      >
                        {fmtDelta(lv.delta)}
                      </span>
                      <span>{lv.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="primary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
