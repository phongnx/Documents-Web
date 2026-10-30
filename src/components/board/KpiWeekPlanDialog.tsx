// Dialog nhập plan chung cho 1 tuần (trang share KPI của member).
// Text tự do, mỗi dòng 1 đầu việc; lưu text rỗng = xóa plan của tuần đó.
// Đã sửa nội dung → Esc / bấm nền không đóng (tránh mất chữ), chỉ Hủy hoặc ✕.
import { useState } from 'react';
import { addDays } from '../../lib/pmDates';
import { formatDateVi } from '../../lib/reportFormat';
import KpiDialog from './KpiDialog';
import { IcCalendar } from './ksumIcons';

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
    <KpiDialog
      icon={<IcCalendar size={18} />}
      title={`Plan tuần ${range}`}
      subtitle="Mỗi dòng 1 đầu việc dự kiến. Xóa hết nội dung rồi Lưu = xóa plan tuần này."
      dismissible={text === initialText}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="k-btn" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="k-btn k-btn-primary" onClick={save}>
            Lưu
          </button>
        </>
      }
    >
      <label className="kml-field">
        <span className="kml-field-label">Đầu việc</span>
        <textarea
          className="kml-input kml-week-plan-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          maxLength={4000}
          placeholder={'VD:\n- Hoàn thiện feature X app A\n- Fix bugs đợt release app B\n- Research SDK mới'}
          autoFocus
        />
      </label>
    </KpiDialog>
  );
}
