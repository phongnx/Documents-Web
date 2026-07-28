// Dialog nhập plan chung cho 1 tuần (trang share KPI của member).
// Text tự do, mỗi dòng 1 đầu việc; lưu text rỗng = xóa plan của tuần đó.
import { useState } from 'react';
import { addDays } from '../../lib/pmDates';
import { formatDateVi } from '../../lib/reportFormat';

interface Props {
  /** Thứ 2 của tuần cần lập plan ('yyyy-mm-dd'). */
  weekStart: string;
  initialText: string;
  onSave: (text: string) => void;
  onClose: () => void;
}

export default function KpiWeekPlanDialog({
  weekStart,
  initialText,
  onSave,
  onClose,
}: Props) {
  const [text, setText] = useState(initialText);
  // Nhãn tuần làm việc Thứ 2 → Thứ 6.
  const range = `${formatDateVi(weekStart)} – ${formatDateVi(addDays(weekStart, 4))}`;

  const save = () => {
    onSave(text);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog kpi-week-plan-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>📋 Plan tuần {range}</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <p className="muted modal-subtitle">
          Mỗi dòng 1 đầu việc dự kiến. Xóa hết nội dung rồi Lưu = xóa plan tuần này.
        </p>
        <textarea
          className="kpi-week-plan-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={4000}
          placeholder={'VD:\n- Hoàn thiện feature X app A\n- Fix bugs đợt release app B\n- Research SDK mới'}
          autoFocus
        />
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="primary" onClick={save}>
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
