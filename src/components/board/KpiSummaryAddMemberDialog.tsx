// Dialog "＋ Thêm member" trên trang tổng kết KPI tháng — 2 đường:
// - Chọn KPI member có sẵn (chưa nằm trong bảng) → trang tự tổng hợp khối từ log tháng đó.
// - Nhập tay tên (người không có trang KPI, VD dữ liệu chuyển từ Excel) → khối trống
//   KPI 100 + 1 dòng để điền; khối này không có log nên không tổng hợp lại được.
import { useState } from 'react';
import type { KpiMember } from '../../kpiTypes';

interface Props {
  /** KPI member CHƯA có khối trong bảng. */
  available: KpiMember[];
  /** Tên các khối đang có — để cảnh báo trùng khi nhập tay. */
  existingNames: string[];
  onPickExisting: (member: KpiMember) => void;
  onAddManual: (name: string) => void;
  onClose: () => void;
}

export default function KpiSummaryAddMemberDialog({
  available,
  existingNames,
  onPickExisting,
  onAddManual,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'existing' | 'manual'>(
    available.length > 0 ? 'existing' : 'manual',
  );
  const [pickedId, setPickedId] = useState(available[0]?.id ?? '');
  const [name, setName] = useState('');

  const canSave = mode === 'existing' ? !!pickedId : !!name.trim();

  const save = () => {
    if (mode === 'existing') {
      const m = available.find((x) => x.id === pickedId);
      if (!m) return;
      onPickExisting(m);
    } else {
      const n = name.trim();
      if (!n) return;
      // Trùng tên vẫn cho thêm (có thể là 2 người trùng tên) nhưng phải hỏi lại.
      const dup = existingNames.some((x) => x.trim().toLowerCase() === n.toLowerCase());
      if (dup && !window.confirm(`Bảng đã có khối tên "${n}". Vẫn thêm khối mới?`)) return;
      onAddManual(n);
    }
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog ksum-add-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>＋ Thêm member vào bảng tổng kết</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <label className="ksum-add-mode">
          <input
            type="radio"
            checked={mode === 'existing'}
            disabled={available.length === 0}
            onChange={() => setMode('existing')}
          />
          Chọn member KPI có sẵn — tự tổng hợp từ log tháng này
        </label>
        {mode === 'existing' && (
          <div className="task-field ksum-add-body">
            {available.length === 0 ? (
              <p className="muted">Mọi member KPI đều đã có trong bảng.</p>
            ) : (
              <select value={pickedId} onChange={(e) => setPickedId(e.target.value)}>
                {available.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.active ? '' : ' (đã khóa)'}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <label className="ksum-add-mode">
          <input type="radio" checked={mode === 'manual'} onChange={() => setMode('manual')} />
          Nhập tay — người không có trang KPI (khối trống, KPI 100)
        </label>
        {mode === 'manual' && (
          <div className="task-field ksum-add-body">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên member"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) save();
              }}
            />
          </div>
        )}
        {available.length === 0 && (
          <p className="muted ksum-add-hint">
            Không còn member KPI nào chưa có trong bảng — chỉ nhập tay được.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="primary" disabled={!canSave} onClick={save}>
            Thêm
          </button>
        </div>
      </div>
    </div>
  );
}
