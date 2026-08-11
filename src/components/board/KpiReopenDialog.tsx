// Dialog rà soát bug reopen (leader, trang chấm): liệt kê ticket fix-bugs bị log ≥2 lần
// trên ≥2 ngày trong tháng — nghi bị reopen, chưa chốt. Mỗi item:
// ✓ Reopen = xác nhận (đã kiểm tra thực tế) → fill −0.2 vào DÒNG MỚI NHẤT của ticket;
// ✗ Bỏ qua = không phải reopen (nguyên nhân khác) → lưu cờ, lần quét sau không hiện lại.
// Danh sách là prop suy từ realtime state — xử lý xong item tự biến mất khỏi dialog.
import { fmtDelta, REOPEN_DELTA, type ReopenSuspect } from '../../kpiTypes';
import { formatDateVi } from '../../lib/reportFormat';

interface Props {
  monthKey: string;
  suspects: ReopenSuspect[];
  onConfirm: (s: ReopenSuspect) => void;
  onDismiss: (s: ReopenSuspect) => void;
  onClose: () => void;
}

export default function KpiReopenDialog({
  monthKey,
  suspects,
  onConfirm,
  onDismiss,
  onClose,
}: Props) {
  return (
    <div className="modal-overlay">
      <div className="modal-dialog kpi-reopen-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>
            🐞 Nghi vấn bug reopen — tháng {monthKey.slice(5, 7)}/{monthKey.slice(0, 4)}
          </strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <p className="muted kpi-reopen-hint">
          Ticket fix bugs được log từ 2 lần trở lên trên các ngày khác nhau. Xác nhận
          reopen → dòng log mới nhất nhận {fmtDelta(REOPEN_DELTA)} điểm (quy chế Fix
          bugs); bỏ qua nếu do nguyên nhân khác (làm tiếp task dở…).
        </p>

        <div className="kpi-reopen-list">
          {suspects.length === 0 && (
            <p className="muted empty">
              Không còn ticket nghi reopen chưa chốt trong tháng này. 🎉
            </p>
          )}
          {suspects.map((s) => (
            <div key={s.key} className="kpi-reopen-item">
              <div className="kpi-reopen-head">
                <strong className="kpi-reopen-task">{s.task || '(không có mô tả)'}</strong>
                {s.project && <span className="task-badge ver">{s.project}</span>}
                <span className="muted">{s.entries.length} lần log</span>
              </div>
              <ul className="kpi-reopen-lines">
                {s.entries.map((e) => (
                  <li key={e.id} className={e.id === s.latest.id ? 'kpi-reopen-latest' : ''}>
                    {formatDateVi(e.date)}
                    {e.start && e.end ? ` · ${e.start}–${e.end}` : ''}
                    {e.note ? <span className="muted"> · {e.note}</span> : null}
                    {e.id === s.latest.id && (
                      <span className="kpi-reopen-mark">
                        {' '}
                        ← dòng nhận {fmtDelta(REOPEN_DELTA)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="kpi-reopen-actions">
                <button
                  type="button"
                  className="primary"
                  title="Đã kiểm tra thực tế — đúng là bug bị reopen"
                  onClick={() => onConfirm(s)}
                >
                  ✓ Reopen {fmtDelta(REOPEN_DELTA)}
                </button>
                <button
                  type="button"
                  title="Không phải reopen (làm tiếp task dở/nguyên nhân khác) — không hỏi lại"
                  onClick={() => onDismiss(s)}
                >
                  ✗ Bỏ qua
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
