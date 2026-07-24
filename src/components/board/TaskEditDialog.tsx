import { useEffect, useRef, useState } from 'react';
import MarkdownPreview from '../MarkdownPreview';
import type { AppItem, PmMeta, TaskItem } from '../../pmTypes';

// Giá trị form của một task (dùng chung cho tạo mới lẫn sửa).
export interface TaskFormValues {
  appId?: string;
  title: string;
  type: string;
  status: string;
  version?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  planDate?: string;
  milestone?: string;
  assignee?: string;
  flavor?: string;
}

interface Props {
  task: TaskItem | null; // null = tạo mới
  apps: AppItem[];
  meta: PmMeta;
  onSave: (values: TaskFormValues) => void;
  onClose: () => void;
  onAddType: (name: string) => void;
  /** Tạo app mới (name + platform); trả id app vừa tạo để chọn sẵn. */
  onAddApp: (name: string, platform: string) => string | undefined;
  /** App chọn sẵn khi tạo mới (VD tạo task từ trang chi tiết app). */
  defaultAppId?: string;
}

// Trim rồi trả undefined nếu rỗng (để trường tùy chọn được clear khi lưu).
const clean = (s: string): string | undefined => {
  const t = s.trim();
  return t ? t : undefined;
};

export default function TaskEditDialog({
  task,
  apps,
  meta,
  onSave,
  onClose,
  onAddType,
  onAddApp,
  defaultAppId,
}: Props) {
  const [appId, setAppId] = useState(task?.appId ?? defaultAppId ?? '');
  const [title, setTitle] = useState(task?.title ?? '');
  const [type, setType] = useState(task?.type ?? meta.taskTypes[0] ?? 'Release');
  const [status, setStatus] = useState(
    task?.status ?? meta.statuses[0] ?? 'Chưa bắt đầu',
  );
  const [version, setVersion] = useState(task?.version ?? '');
  const [planDate, setPlanDate] = useState(task?.planDate ?? '');
  const [startDate, setStartDate] = useState(task?.startDate ?? '');
  const [endDate, setEndDate] = useState(task?.endDate ?? '');
  const [milestone, setMilestone] = useState(task?.milestone ?? '');
  const [assignee, setAssignee] = useState(task?.assignee ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [showPreview, setShowPreview] = useState(false);
  // Chế độ mở rộng vùng mô tả: phóng to dialog, tạm ẩn các field phụ (chỉ giữ Tiêu đề).
  const [expanded, setExpanded] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Khi bật mở rộng (và đang ở chế độ sửa) → focus vào textarea mô tả.
  useEffect(() => {
    if (expanded && !showPreview) descRef.current?.focus();
  }, [expanded, showPreview]);

  const onAddNewType = () => {
    const v = window.prompt('Tên loại task mới:');
    if (v === null) return;
    const t = v.trim();
    if (!t) return;
    onAddType(t);
    setType(t);
  };

  // Tạo app mới ngay trong dialog: hỏi tên + nền tảng (category), rồi chọn sẵn.
  const onAddNewApp = () => {
    const name = window.prompt('Tên app mới:');
    if (name === null) return;
    const n = name.trim();
    if (!n) return;
    const plat = window.prompt('Nền tảng (Android / Flutter / iOS / Web…):', 'Android');
    if (plat === null) return;
    const newId = onAddApp(n, plat.trim() || 'Android');
    if (newId) setAppId(newId);
  };

  const canSave = title.trim().length > 0;
  const submit = () => {
    if (!canSave) return;
    onSave({
      appId: appId || undefined,
      title: title.trim(),
      type,
      status,
      version: clean(version),
      description: clean(description),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      planDate: planDate || undefined,
      milestone: clean(milestone),
      assignee: clean(assignee),
    });
  };

  return (
    <div className="modal-overlay">
      <div
        className={`modal-dialog task-dialog${expanded ? ' task-dialog-expanded' : ''}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <strong>{task ? 'Sửa task' : 'Thêm task'}</strong>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div className="task-form">
          <label className="task-field task-field-wide">
            <span>Tiêu đề *</span>
            <input
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: v1.48 – Thêm History"
              autoFocus
            />
          </label>

          {/* Các field phụ — tạm ẩn bằng CSS khi mở rộng mô tả (state vẫn giữ nguyên). */}
          <label className="task-field">
            <span>App</span>
            <div className="task-inline">
              <select value={appId} onChange={(e) => setAppId(e.target.value)}>
                <option value="">(Chưa gán)</option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.platform}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="doc-action"
                title="Thêm app mới"
                onClick={onAddNewApp}
              >
                ＋
              </button>
            </div>
          </label>

          <label className="task-field">
            <span>Loại</span>
            <div className="task-inline">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {meta.taskTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {!meta.taskTypes.includes(type) && (
                  <option value={type}>{type}</option>
                )}
              </select>
              <button type="button" className="doc-action" title="Thêm loại" onClick={onAddNewType}>
                ＋
              </button>
            </div>
          </label>

          <label className="task-field">
            <span>Trạng thái</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {meta.statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {!meta.statuses.includes(status) && (
                <option value={status}>{status}</option>
              )}
            </select>
          </label>

          <label className="task-field">
            <span>Version</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.48" />
          </label>

          <label className="task-field">
            <span>Ngày plan (release)</span>
            <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
          </label>

          <label className="task-field">
            <span>Ngày bắt đầu</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>

          <label className="task-field">
            <span>Ngày kết thúc</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>

          <label className="task-field">
            <span>Cột mốc</span>
            <input value={milestone} onChange={(e) => setMilestone(e.target.value)} />
          </label>

          <label className="task-field">
            <span>Assignee</span>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
          </label>

          <div className="task-field task-field-wide task-field-desc">
            <div className="task-desc-head">
              <span>Mô tả (Markdown)</span>
              <div className="task-inline">
                <button
                  type="button"
                  className="doc-action"
                  onClick={() => setShowPreview((v) => !v)}
                >
                  {showPreview ? 'Sửa' : 'Xem trước'}
                </button>
                <button
                  type="button"
                  className="doc-action"
                  title={expanded ? 'Thu gọn vùng mô tả' : 'Mở rộng vùng mô tả'}
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? '🗕 Thu gọn' : '⛶ Mở rộng'}
                </button>
              </div>
            </div>
            {showPreview ? (
              <div className="task-desc-preview">
                <MarkdownPreview content={description} />
              </div>
            ) : (
              <textarea
                ref={descRef}
                className="md-textarea task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="- Mô tả chi tiết…"
              />
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="primary" disabled={!canSave} onClick={submit}>
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}
