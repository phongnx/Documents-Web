import { useMemo, useState } from 'react';
import { DONE_STATUS } from '../../pmTypes';
import type { AppItem, PlanWorkstream, TaskItem } from '../../pmTypes';
import { sortDate } from '../../lib/pmSort';
import { taskLines, taskToWorkstream } from '../../lib/planAutofill';

interface Props {
  apps: AppItem[];
  tasks: TaskItem[];
  /** App gợi ý mặc định (app đang gắn với dự án). */
  initialAppId?: string;
  onConfirm: (workstreams: PlanWorkstream[]) => void;
  onClose: () => void;
}

export default function TaskPickerDialog({
  apps,
  tasks,
  initialAppId,
  onConfirm,
  onClose,
}: Props) {
  const [appId, setAppId] = useState(initialAppId || apps[0]?.id || '');
  // Dòng đã chọn theo từng task: taskId → Set(chỉ số dòng).
  const [picked, setPicked] = useState<Record<string, Set<number>>>({});

  // Chỉ lấy task của app đang chọn và CHƯA hoàn thành (bỏ task đã "Đã hoàn thành").
  const appTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.appId === appId && t.status !== DONE_STATUS)
        .sort((a, b) => sortDate(b).localeCompare(sortDate(a))),
    [tasks, appId],
  );

  const toggleLine = (taskId: string, idx: number) =>
    setPicked((prev) => {
      const set = new Set(prev[taskId] ?? []);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      return { ...prev, [taskId]: set };
    });

  const toggleAll = (t: TaskItem) =>
    setPicked((prev) => {
      const lines = taskLines(t);
      const cur = prev[t.id] ?? new Set<number>();
      const allOn = cur.size === lines.length;
      return {
        ...prev,
        [t.id]: allOn ? new Set() : new Set(lines.map((_, i) => i)),
      };
    });

  // Số nhánh sẽ tạo = số task có ít nhất 1 dòng được chọn.
  const chosenTasks = appTasks.filter((t) => (picked[t.id]?.size ?? 0) > 0);

  const confirm = () => {
    const app = apps.find((a) => a.id === appId);
    const result: PlanWorkstream[] = chosenTasks.map((t) => {
      const lines = taskLines(t);
      const items = [...(picked[t.id] ?? [])]
        .sort((a, b) => a - b)
        .map((i) => lines[i])
        .filter(Boolean);
      return taskToWorkstream(t, app, items);
    });
    onConfirm(result);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog task-picker" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>Chọn task để tạo nhánh</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <label className="task-field">
          <span>App</span>
          <select value={appId} onChange={(e) => setAppId(e.target.value)}>
            {apps.length === 0 && <option value="">(Chưa có app)</option>}
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.platform}
              </option>
            ))}
          </select>
        </label>

        <div className="picker-list">
          {appTasks.length === 0 ? (
            <p className="muted">Không có task đang mở (chưa hoàn thành).</p>
          ) : (
            appTasks.map((t) => {
              const lines = taskLines(t);
              const cur = picked[t.id] ?? new Set<number>();
              const allOn = cur.size === lines.length && lines.length > 0;
              return (
                <div key={t.id} className="picker-task">
                  <label className="picker-task-head">
                    <input type="checkbox" checked={allOn} onChange={() => toggleAll(t)} />
                    <span className="picker-task-title">{t.title}</span>
                    {t.version && <span className="task-badge ver">{t.version}</span>}
                    <span className="task-badge type">{t.type}</span>
                  </label>
                  <ul className="picker-lines">
                    {lines.map((ln, i) => (
                      <li key={i}>
                        <label>
                          <input
                            type="checkbox"
                            checked={cur.has(i)}
                            onChange={() => toggleLine(t.id, i)}
                          />
                          <span>{ln}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className="primary"
            disabled={chosenTasks.length === 0}
            onClick={confirm}
          >
            Thêm {chosenTasks.length} nhánh
          </button>
        </div>
      </div>
    </div>
  );
}
