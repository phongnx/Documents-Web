// Dialog tạo/sửa meta bảng estimate (leader): tiêu đề, app, version, khoảng ngày,
// ngày nghỉ, participants (member KPI tham gia — link bảng sẽ hiện trên trang KPI của họ).
import { useState } from 'react';
import type { AppItem } from '../../pmTypes';
import type { KpiMember } from '../../kpiTypes';
import type { EstMetaInput } from '../../context/PmContext';

interface Props {
  apps: AppItem[];
  members: KpiMember[];
  /** Giá trị ban đầu (sửa) — trống = tạo mới. */
  initial?: Partial<EstMetaInput>;
  title: string;
  onSave: (data: EstMetaInput) => void;
  onClose: () => void;
}

export default function EstMetaDialog({
  apps,
  members,
  initial,
  title: dialogTitle,
  onSave,
  onClose,
}: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [appId, setAppId] = useState(initial?.appId ?? '');
  const [version, setVersion] = useState(initial?.version ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [holidays, setHolidays] = useState(
    typeof initial?.holidays === 'number' ? String(initial.holidays) : '',
  );
  const [picked, setPicked] = useState<Set<string>>(
    new Set(initial?.participantIds ?? []),
  );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      appId: appId || undefined,
      version: version.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      holidays: holidays !== '' && !Number.isNaN(Number(holidays)) ? Number(holidays) : undefined,
      participantIds: [...picked],
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog est-meta-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>{dialogTitle}</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <label className="task-field">
          <span>Tiêu đề *</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: WF3 Release v1.73"
            autoFocus
          />
        </label>
        <div className="est-meta-grid">
          <label className="task-field">
            <span>App</span>
            <select value={appId} onChange={(e) => setAppId(e.target.value)}>
              <option value="">(không gắn app)</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.platform}
                </option>
              ))}
            </select>
          </label>
          <label className="task-field">
            <span>Version</span>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v1.73"
            />
          </label>
          <label className="task-field">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="task-field">
            <span>End date (trống = tự tính từ tổng est, 8h/ngày)</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className="task-field">
            <span>Ngày nghỉ/lễ</span>
            <input
              type="number"
              min={0}
              value={holidays}
              onChange={(e) => setHolidays(e.target.value)}
              placeholder="0"
            />
          </label>
        </div>

        <div className="task-field">
          <span>Người tham gia (link bảng hiện trên trang KPI của member được chọn)</span>
          <div className="est-participants">
            {members.length === 0 && (
              <p className="muted">Chưa có member KPI nào — tạo ở tab KPI trước.</p>
            )}
            {members.map((m) => (
              <label key={m.id} className="est-participant">
                <input
                  type="checkbox"
                  checked={picked.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="primary" disabled={!title.trim()} onClick={save}>
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
