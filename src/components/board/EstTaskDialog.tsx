// Dialog lớn thêm/sửa 1 sub task của bảng estimate (thay cho sửa inline trong bảng):
// - canStructure: sửa được title/assignee/est (draft hoặc leader).
// - canStatusNote: sửa được status/note (sau approve member chỉ còn 2 field này).
// Task MỚI luôn tạo với status Todo (select disable) — done phải đi qua flow chốt điểm.
// Kèm EstGroupDialog: dialog nhỏ thêm/sửa nhóm (tên + mô tả).
import { useState } from 'react';
import {
  EST_STATUS_META,
  type EstParticipant,
  type EstSubTask,
  type EstTaskStatus,
} from '../../estTypes';

/** Dữ liệu form trả về khi Lưu — bảng tự quyết định ghi path nào theo quyền. */
export interface EstTaskDraft {
  title: string;
  assigneeId?: string;
  assigneeName?: string;
  estHours?: number;
  status: EstTaskStatus;
  note?: string;
}

interface Props {
  /** Sub task đang sửa — null = thêm mới. */
  task: EstSubTask | null;
  participants: EstParticipant[];
  /** Được sửa cấu trúc (title/assignee/est)? */
  canStructure: boolean;
  /** Được sửa status/note? (luôn true khi mở từ nút ✏️, giữ prop cho rõ ràng) */
  canStatusNote: boolean;
  /** Assignee mặc định cho task mới (member tự break → gán chính mình). */
  defaultAssigneeId?: string;
  onSave: (d: EstTaskDraft) => void;
  onClose: () => void;
}

export default function EstTaskDialog({
  task,
  participants,
  canStructure,
  canStatusNote,
  defaultAssigneeId,
  onSave,
  onClose,
}: Props) {
  const isNew = task === null;
  const [title, setTitle] = useState(task?.title ?? '');
  const [assigneeId, setAssigneeId] = useState(
    task ? (task.assigneeId ?? '') : (defaultAssigneeId ?? ''),
  );
  const [estHours, setEstHours] = useState(
    task?.estHours ? String(task.estHours) : '',
  );
  const [status, setStatus] = useState<EstTaskStatus>(task?.status ?? 'todo');
  const [note, setNote] = useState(task?.note ?? '');

  const save = () => {
    if (canStructure && !title.trim()) return;
    const p = participants.find((x) => x.memberId === assigneeId);
    onSave({
      title: title.trim(),
      assigneeId: p?.memberId,
      // Assignee cũ không còn trong participants → giữ nguyên id/tên cũ.
      assigneeName: p?.name ?? (assigneeId ? task?.assigneeName : undefined),
      estHours:
        estHours !== '' && Number(estHours) > 0 ? Number(estHours) : undefined,
      status,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog est-task-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>{isNew ? '＋ Thêm sub task' : '✏️ Sửa sub task'}</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <label className="task-field">
          <span>Sub task *</span>
          <input
            value={title}
            disabled={!canStructure}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Màn Settings — UI + logic lưu"
            autoFocus={canStructure}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </label>

        <div className="est-meta-grid">
          <label className="task-field">
            <span>Assignee</span>
            <select
              value={assigneeId}
              disabled={!canStructure}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">(chưa gán)</option>
              {participants.map((p) => (
                <option key={p.memberId} value={p.memberId}>
                  {p.name}
                </option>
              ))}
              {assigneeId && !participants.some((p) => p.memberId === assigneeId) && (
                <option value={assigneeId}>{task?.assigneeName ?? '?'}</option>
              )}
            </select>
          </label>
          <label className="task-field">
            <span>Est (h)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={estHours}
              disabled={!canStructure}
              onChange={(e) => setEstHours(e.target.value)}
              placeholder="VD: 6"
            />
          </label>
          <label className="task-field">
            <span>Status</span>
            <select
              value={status}
              disabled={isNew || !canStatusNote}
              title={isNew ? 'Task mới luôn bắt đầu ở Todo' : undefined}
              onChange={(e) => setStatus(e.target.value as EstTaskStatus)}
            >
              {(Object.keys(EST_STATUS_META) as EstTaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {EST_STATUS_META[s].icon} {EST_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="task-field">
          <span>Note</span>
          <textarea
            rows={3}
            value={note}
            disabled={!canStatusNote}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú tiến độ, vướng mắc…"
          />
        </label>

        {!isNew && status === 'done' && task?.status !== 'done' && (
          <p className="muted est-done-hint">
            ✅ Lưu với status Xong → dòng log KPI chốt của assignee sẽ tự nhận điểm gợi ý
            theo est vs thực tế (nhanh ≥20% = +1 · đạt = 0 · chậm 10–20% = −0.5 · chậm
            &gt;20% = −1).
          </p>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className="primary"
            disabled={canStructure && !title.trim()}
            onClick={save}
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

/** Dialog nhỏ thêm/sửa nhóm task (tên + mô tả yêu cầu). */
export function EstGroupDialog({
  group,
  onSave,
  onClose,
}: {
  /** Nhóm đang sửa — null = thêm mới. */
  group: { title: string; desc?: string } | null;
  onSave: (title: string, desc: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(group?.title ?? '');
  const [desc, setDesc] = useState(group?.desc ?? '');

  const save = () => {
    if (!title.trim()) return;
    onSave(title.trim(), desc.trim());
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog est-task-dialog" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>{group ? '✏️ Sửa nhóm task' : '＋ Thêm nhóm task'}</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <label className="task-field">
          <span>Tên nhóm *</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Onboarding + Paywall"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </label>
        <label className="task-field">
          <span>Mô tả yêu cầu</span>
          <textarea
            rows={3}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Mô tả phạm vi/yêu cầu của nhóm tính năng…"
          />
        </label>

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
