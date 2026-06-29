import { useEffect, type ReactNode } from 'react';
import type { DocItem, Folder } from '../types';

interface Props {
  doc: DocItem;
  folders: Folder[];
  onPick: (folderId: string | undefined) => void;
  onClose: () => void;
}

// Dialog chọn folder đích để di chuyển một tài liệu. Liệt kê "General" + các
// folder theo phân cấp (gốc / sub). Đóng bằng nút Hủy, click nền mờ hoặc ESC.
export default function MoveToFolderDialog({
  doc,
  folders,
  onPick,
  onClose,
}: Props) {
  // ESC để đóng.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = doc.folderId ?? '';

  // Một dòng lựa chọn folder; chọn đúng folder hiện tại = không làm gì (đóng).
  const option = (id: string, label: string, indent: boolean): ReactNode => {
    const isCurrent = current === id;
    return (
      <button
        key={id || '__none__'}
        type="button"
        className={`move-option${indent ? ' indent' : ''}${
          isCurrent ? ' current' : ''
        }`}
        onClick={() => (isCurrent ? onClose() : onPick(id || undefined))}
      >
        <span>{label}</span>
        {isCurrent && <span className="move-current-tag">(hiện tại)</span>}
      </button>
    );
  };

  const rows: ReactNode[] = [option('', '📤 Đưa ra ngoài (General)', false)];
  for (const root of folders.filter((f) => !f.parentId)) {
    rows.push(option(root.id, `📁 ${root.name}`, false));
    for (const s of folders.filter((x) => x.parentId === root.id)) {
      rows.push(option(s.id, `↳ ${s.name}`, true));
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <strong>Di chuyển tới…</strong>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <p className="muted modal-subtitle">
          Tài liệu: {doc.title || '(không tiêu đề)'}
        </p>
        <div className="move-list">{rows}</div>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
