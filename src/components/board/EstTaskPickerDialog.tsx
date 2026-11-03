// Dialog "＋ Tạo estimate" ở trang estimate của 1 app (/board/estimates/app/:appId):
// liệt kê task CHƯA XONG của app (mốc gần nhất lên đầu), tick nhiều task → mỗi task tạo
// 1 bảng (giữ mô hình 1 task ↔ 1 bảng). Task đã có bảng hiện mờ, không chọn được.
import { useState } from 'react';
import { DONE_STATUS, statusMeta, type TaskItem } from '../../pmTypes';
import { formatDay } from '../../lib/formatDate';
import KpiDialog from './KpiDialog';
import { IcTask } from './ksumIcons';

interface Props {
  appName: string;
  /** Mọi task của app (dialog tự lọc chưa xong). */
  tasks: TaskItem[];
  /** Task đã có bảng (1 task ↔ tối đa 1 bảng). */
  takenTaskIds: Set<string>;
  narrow: boolean;
  onConfirm: (taskIds: string[]) => void;
  onClose: () => void;
}

const dateOf = (t: TaskItem) => t.planDate || t.endDate || t.startDate || '';

export default function EstTaskPickerDialog({
  appName,
  tasks,
  takenTaskIds,
  narrow,
  onConfirm,
  onClose,
}: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Chưa xong; mốc gần nhất lên đầu, task không có ngày xuống cuối.
  const open = tasks
    .filter((t) => t.status !== DONE_STATUS)
    .sort(
      (a, b) =>
        (dateOf(a) || '9999').localeCompare(dateOf(b) || '9999') || a.order - b.order,
    );
  const free = open.filter((t) => !takenTaskIds.has(t.id));
  const allOn = free.length > 0 && free.every((t) => picked.has(t.id));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = () => {
    // Giữ thứ tự hiển thị (bảng tạo theo mốc gần nhất trước).
    const ids = free.filter((t) => picked.has(t.id)).map((t) => t.id);
    if (ids.length) onConfirm(ids);
  };

  const count = picked.size;
  const createBtn = (
    <button type="button" className="k-btn k-btn-primary" disabled={count === 0} onClick={confirm}>
      {count > 1 ? `Tạo ${count} bảng` : 'Tạo bảng'}
    </button>
  );

  return (
    <KpiDialog
      icon={<IcTask size={18} />}
      title="Tạo bảng estimate"
      subtitle={`${appName} · chọn task chưa xong — mỗi task 1 bảng`}
      scrollBody
      fullscreen={narrow}
      headAction={narrow ? createBtn : undefined}
      dismissible={count === 0}
      onClose={onClose}
      toolbar={
        free.length > 1 ? (
          <label className="etp-all">
            <input
              type="checkbox"
              className="pl-tk-cbx"
              checked={allOn}
              onChange={() => setPicked(allOn ? new Set() : new Set(free.map((t) => t.id)))}
            />
            Chọn tất cả ({free.length})
          </label>
        ) : undefined
      }
      actions={
        <>
          <span className="pl-tk-sum">{count > 0 ? `Đã chọn ${count} task` : ''}</span>
          <button type="button" className="k-btn" onClick={onClose}>
            Huỷ
          </button>
          {!narrow && createBtn}
        </>
      }
    >
      {open.length === 0 ? (
        <p className="k-muted">
          App không còn task chưa xong — thêm task ở tab Task, hoặc dùng "Tạo bảng tự do".
        </p>
      ) : (
        <ul className="etp-list">
          {open.map((t) => {
            const taken = takenTaskIds.has(t.id);
            return (
              <li key={t.id}>
                <label className={`etp-row${taken ? ' is-taken' : ''}`}>
                  <input
                    type="checkbox"
                    className="pl-tk-cbx"
                    disabled={taken}
                    checked={!taken && picked.has(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                  <span className="etp-main">
                    <span className="etp-title">{t.title}</span>
                    <span className="etp-tags">
                      {t.type && <span className="task-badge type">{t.type}</span>}
                      <span className={`task-badge ${statusMeta(t.status).badgeClass}`}>
                        {t.status}
                      </span>
                      {t.version && <span className="task-badge ver">{t.version}</span>}
                      {dateOf(t) && <span className="muted">📅 {formatDay(dateOf(t))}</span>}
                      {taken && <span className="muted">· đã có bảng</span>}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </KpiDialog>
  );
}
