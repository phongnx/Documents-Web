import { useState } from 'react';
import type { AppItem } from '../../pmTypes';

const PLATFORMS = ['Android', 'Flutter', 'iOS', 'Web'];
const NEW = '__new__';

interface Props {
  count: number;
  apps: AppItem[];
  /** Tạo app mới (name + platform) → trả id. */
  onCreateApp: (name: string, platform: string) => string | undefined;
  /** Gán các task đã chọn vào appId. */
  onAssign: (appId: string) => void;
  onClose: () => void;
}

// Dialog gán nhiều task vào 1 app: chọn app có sẵn hoặc tạo app mới.
export default function AssignAppDialog({
  count,
  apps,
  onCreateApp,
  onAssign,
  onClose,
}: Props) {
  const [sel, setSel] = useState(apps[0]?.id ?? NEW);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('Android');

  const isNew = sel === NEW;
  const canAssign = isNew ? name.trim().length > 0 : !!sel;

  const submit = () => {
    if (!canAssign) return;
    let appId = sel;
    if (isNew) {
      const id = onCreateApp(name.trim(), platform);
      if (!id) return;
      appId = id;
    }
    onAssign(appId);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>Gán {count} task vào app</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="task-form">
          <label className="task-field task-field-wide">
            <span>Chọn app</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.platform}
                </option>
              ))}
              <option value={NEW}>➕ Tạo app mới…</option>
            </select>
          </label>

          {isNew && (
            <>
              <label className="task-field">
                <span>Tên app mới *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Music v1"
                  autoFocus
                />
              </label>
              <label className="task-field">
                <span>Nền tảng</span>
                <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="primary" disabled={!canAssign} onClick={submit}>
            Gán
          </button>
        </div>
      </div>
    </div>
  );
}
