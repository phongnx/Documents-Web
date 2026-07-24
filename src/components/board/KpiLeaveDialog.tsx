// Dialog quản lý nghỉ phép của 1 member (leader): thêm/xóa đợt nghỉ.
// Min nửa ngày (0.5), max 3 ngày; phần lẻ nửa ngày chọn buổi sáng/chiều.
import { useState } from 'react';
import {
  LEAVE_DAY_OPTIONS,
  leaveLabel,
  leavePortionsOf,
  type KpiLeave,
} from '../../kpiTypes';
import { isoLocal, weekdayVN } from '../../lib/pmDates';
import { formatDateVi } from '../../lib/reportFormat';

interface Props {
  memberName: string;
  leaves: KpiLeave[];
  onAdd: (input: Omit<KpiLeave, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function KpiLeaveDialog({
  memberName,
  leaves,
  onAdd,
  onDelete,
  onClose,
}: Props) {
  const [startDate, setStartDate] = useState(isoLocal(new Date()));
  const [days, setDays] = useState(1);
  const [half, setHalf] = useState<'am' | 'pm'>('am');
  const [note, setNote] = useState('');

  const add = () => {
    if (!startDate) return;
    // Chặn đợt mới đè lên ngày đã có nghỉ (kể cả nửa buổi).
    const existing = leavePortionsOf(leaves);
    const draft = leavePortionsOf([
      { id: '', startDate, days, half, createdAt: '' },
    ]);
    for (const d of draft.keys()) {
      if (existing.has(d)) {
        window.alert(
          `Ngày ${formatDateVi(d)} đã có nghỉ phép (${leaveLabel(existing.get(d)!)}). Xóa đợt cũ trước nếu muốn đổi.`,
        );
        return;
      }
    }
    onAdd({
      startDate,
      days,
      ...(days % 1 !== 0 ? { half } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setNote('');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog kpi-leave-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>🏖 Nghỉ phép — {memberName}</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <p className="muted modal-subtitle">
          Min nửa ngày, max 3 ngày/đợt (tính theo ngày lịch — tránh chọn vắt qua cuối
          tuần). Member không log được task trùng thời gian nghỉ.
        </p>

        {/* Form thêm đợt nghỉ */}
        <div className="task-form kpi-leave-form">
          <label className="task-field">
            <span>Từ ngày</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="task-field">
            <span>Số ngày</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {LEAVE_DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} ngày
                </option>
              ))}
            </select>
          </label>
          {days % 1 !== 0 && (
            <label className="task-field">
              <span>Nửa ngày lẻ vào</span>
              <select
                value={half}
                onChange={(e) => setHalf(e.target.value as 'am' | 'pm')}
              >
                <option value="am">Buổi sáng</option>
                <option value="pm">Buổi chiều</option>
              </select>
            </label>
          )}
          <label className="task-field task-field-wide">
            <span>Ghi chú</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: nghỉ phép năm, việc gia đình…"
            />
          </label>
        </div>
        <button type="button" className="primary kpi-leave-add" onClick={add}>
          ＋ Thêm đợt nghỉ
        </button>

        {/* Danh sách đợt nghỉ */}
        <div className="kpi-leave-list">
          {leaves.length === 0 ? (
            <p className="muted">Chưa có đợt nghỉ nào.</p>
          ) : (
            leaves.map((l) => (
              <div key={l.id} className="kpi-leave-item">
                <span>
                  🏖 {weekdayVN(l.startDate)} {formatDateVi(l.startDate)} ·{' '}
                  <strong>{l.days} ngày</strong>
                  {l.days % 1 !== 0 &&
                    ` (nửa ngày ${l.half === 'pm' ? 'chiều' : 'sáng'})`}
                  {l.note && <span className="muted"> — {l.note}</span>}
                </span>
                <button
                  type="button"
                  className="doc-action danger"
                  title="Xóa đợt nghỉ"
                  onClick={() => {
                    if (window.confirm('Xóa đợt nghỉ này?')) onDelete(l.id);
                  }}
                >
                  🗑️
                </button>
              </div>
            ))
          )}
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
