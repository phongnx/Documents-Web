// Dialog gán list project (app) cho 1 member — member chỉ chọn được các project
// này khi log task; bỏ chọn hết = member nhập project tự do như cũ.
import { useState } from 'react';
import { usePm } from '../../context/PmContext';
import type { KpiMember } from '../../kpiTypes';

interface Props {
  member: KpiMember;
  onClose: () => void;
}

export default function MemberProjectsDialog({ member, onClose }: Props) {
  const { apps, setMemberProjects } = usePm();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(member.projectIds ?? []),
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    setMemberProjects(member.id, [...selected]);
    onClose();
  };

  // App chưa archived lên trước, cùng nhóm sắp theo tên.
  const sorted = [...apps].sort(
    (a, b) =>
      Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name),
  );

  return (
    <div className="modal-overlay">
      <div className="modal-dialog kpi-projects-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>🧩 Gán project — {member.name}</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <p className="muted modal-subtitle">
          Member CHỈ chọn được các project được gán khi log task. Chưa gán project nào =
          member không log được (trang log hiện cảnh báo liên hệ leader).
        </p>

        <div className="kpi-projects-list">
          {sorted.length === 0 ? (
            <p className="muted">Chưa có app nào trong Bảng dự án.</p>
          ) : (
            sorted.map((a) => (
              <label key={a.id} className="kpi-project-option">
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <span className="kpi-project-name">{a.name}</span>
                <span className="task-badge type">{a.platform}</span>
                {a.archived && <span className="muted">(archived)</span>}
              </label>
            ))
          )}
        </div>

        <div className="modal-actions">
          <span className="muted kpi-projects-count">
            Đã chọn {selected.size} project
          </span>
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
