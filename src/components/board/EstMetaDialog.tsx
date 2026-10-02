// Dialog tạo/sửa meta bảng estimate (leader): tiêu đề, app, task, version, khoảng ngày,
// ngày nghỉ, participants (member KPI tham gia — link bảng sẽ hiện trên trang KPI của họ).
// Chọn app → hiện ô Task (task đang có của app) và thu gọn danh sách người tham gia về
// member được gán app đó; chọn task → tự điền các ô còn trống (tiêu đề/version/start).
import { useState } from 'react';
import { DONE_STATUS, type AppItem, type TaskItem } from '../../pmTypes';
import type { KpiMember } from '../../kpiTypes';
import type { EstMetaInput } from '../../context/PmContext';

interface Props {
  apps: AppItem[];
  members: KpiMember[];
  /** Có truyền → hiện ô "Task" (gắn bảng với 1 task của app đang chọn). */
  tasks?: TaskItem[];
  /** Task đã có bảng KHÁC (1 task ↔ tối đa 1 bảng) — hiện nhưng không chọn được. */
  takenTaskIds?: Set<string>;
  /** Giá trị ban đầu (sửa) — trống = tạo mới. */
  initial?: Partial<EstMetaInput>;
  title: string;
  onSave: (data: EstMetaInput) => void;
  onClose: () => void;
}

const taskDate = (t: TaskItem) => t.planDate || t.endDate || t.startDate || '';

export default function EstMetaDialog({
  apps,
  members,
  tasks,
  takenTaskIds,
  initial,
  title: dialogTitle,
  onSave,
  onClose,
}: Props) {
  const appMemberIds = (aid: string) =>
    aid ? members.filter((m) => m.projectIds?.includes(aid)).map((m) => m.id) : [];
  const sameSet = (a: Set<string>, b: string[]) =>
    a.size === b.length && b.every((x) => a.has(x));

  const [title, setTitle] = useState(initial?.title ?? '');
  const [appId, setAppId] = useState(initial?.appId ?? '');
  const [taskId, setTaskId] = useState(initial?.taskId ?? '');
  const [version, setVersion] = useState(initial?.version ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [holidays, setHolidays] = useState(
    typeof initial?.holidays === 'number' ? String(initial.holidays) : '',
  );
  const [picked, setPicked] = useState<Set<string>>(
    new Set(initial?.participantIds ?? []),
  );
  // Giá trị dialog TỰ điền từ task gần nhất — ô còn đúng giá trị này (hoặc trống) thì đổi
  // task được phép thay; leader đã gõ tay khác đi thì giữ nguyên.
  const [auto, setAuto] = useState({
    title: initial?.taskId ? (initial.title ?? '') : '',
    version: initial?.taskId ? (initial.version ?? '') : '',
    startDate: initial?.taskId ? (initial.startDate ?? '') : '',
  });
  // Leader đã tự tick/bỏ tick người tham gia → đổi app không reset nữa. Bảng đang sửa có
  // danh sách khác với member của app cũng coi như đã chọn tay (không ghi đè dữ liệu cũ).
  const [pickTouched, setPickTouched] = useState(
    () => (initial?.participantIds?.length ?? 0) > 0 &&
      !sameSet(new Set(initial?.participantIds ?? []), appMemberIds(initial?.appId ?? '')),
  );
  const [showAll, setShowAll] = useState(false);

  // Task của app đang chọn: chưa xong trước (mốc mới nhất lên đầu), đã xong để sau.
  const appTasks = (tasks ?? [])
    .filter((t) => !!appId && t.appId === appId)
    .sort((a, b) => taskDate(b).localeCompare(taskDate(a)) || b.createdAt.localeCompare(a.createdAt));
  const openTasks = appTasks.filter((t) => t.status !== DONE_STATUS);
  const doneTasks = appTasks.filter((t) => t.status === DONE_STATUS);
  const taskValid = !taskId || appTasks.some((t) => t.id === taskId);

  const onAppChange = (next: string) => {
    setAppId(next);
    if (taskId && !(tasks ?? []).some((t) => t.id === taskId && t.appId === next)) setTaskId('');
    if (!pickTouched) setPicked(new Set(appMemberIds(next)));
    setShowAll(false);
  };

  const onTaskChange = (next: string) => {
    setTaskId(next);
    const t = (tasks ?? []).find((x) => x.id === next);
    if (!t) return;
    const appName = apps.find((a) => a.id === t.appId)?.name ?? '';
    const replaceable = (cur: string, prevAuto: string) => !cur.trim() || cur === prevAuto;
    const nextAuto = { ...auto };
    if (replaceable(title, auto.title)) {
      nextAuto.title = appName ? `${appName} - ${t.title}` : t.title;
      setTitle(nextAuto.title);
    }
    if (t.version && replaceable(version, auto.version)) {
      nextAuto.version = t.version;
      setVersion(t.version);
    }
    if (t.startDate && replaceable(startDate, auto.startDate)) {
      nextAuto.startDate = t.startDate;
      setStartDate(t.startDate);
    }
    setAuto(nextAuto);
  };

  const toggle = (id: string) => {
    setPickTouched(true);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Danh sách người tham gia: đã chọn app → member của app + người ĐÃ tick (không bao giờ
  // ẩn người đang được chọn); app chưa gán ai, chưa chọn app, hoặc bấm mở rộng → tất cả.
  const inApp = new Set(appMemberIds(appId));
  const collapsed = !!appId && inApp.size > 0 && !showAll;
  const visibleMembers = collapsed
    ? members.filter((m) => inApp.has(m.id) || picked.has(m.id))
    : members;
  const hiddenCount = members.length - visibleMembers.length;

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
      // Chỉ gửi taskId khi dialog có ô Task — nơi gọi không truyền tasks thì patch
      // không mang key này, updateEstimateMeta giữ nguyên task đang gắn.
      ...(tasks ? { taskId: taskValid ? taskId : '' } : {}),
    });
    onClose();
  };

  const taskOption = (t: TaskItem) => {
    const taken = takenTaskIds?.has(t.id) && t.id !== initial?.taskId;
    return (
      <option key={t.id} value={t.id} disabled={taken}>
        {t.title}
        {t.version ? ` · ${t.version}` : ''}
        {taken ? ' (đã có bảng)' : ''}
      </option>
    );
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
            <select value={appId} onChange={(e) => onAppChange(e.target.value)}>
              <option value="">(không gắn app)</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.platform}
                </option>
              ))}
            </select>
          </label>
          {tasks && appId && (
            <label className="task-field">
              <span>Task của app (1 task ↔ 1 bảng)</span>
              <select value={taskValid ? taskId : ''} onChange={(e) => onTaskChange(e.target.value)}>
                <option value="">
                  {appTasks.length ? '(không gắn task)' : '(app chưa có task nào)'}
                </option>
                {openTasks.length > 0 && (
                  <optgroup label={`Chưa xong (${openTasks.length})`}>
                    {openTasks.map(taskOption)}
                  </optgroup>
                )}
                {doneTasks.length > 0 && (
                  <optgroup label={`Đã xong (${doneTasks.length})`}>
                    {doneTasks.map(taskOption)}
                  </optgroup>
                )}
              </select>
            </label>
          )}
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
          <span>
            Người tham gia
            {collapsed ? ' — member được gán app này' : ''} (link bảng hiện trên trang KPI
            của member được chọn)
          </span>
          {!!appId && inApp.size === 0 && members.length > 0 && (
            <p className="muted est-participants-note">
              Chưa có member nào được gán app này — chọn trong danh sách đầy đủ bên dưới.
            </p>
          )}
          <div className="est-participants">
            {members.length === 0 && (
              <p className="muted">Chưa có member KPI nào — tạo ở tab KPI trước.</p>
            )}
            {visibleMembers.map((m) => (
              <label
                key={m.id}
                className={`est-participant${appId && !inApp.has(m.id) ? ' est-outside' : ''}`}
                title={appId && !inApp.has(m.id) ? 'Không được gán app này' : undefined}
              >
                <input
                  type="checkbox"
                  checked={picked.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                {m.name}
              </label>
            ))}
          </div>
          {collapsed && hiddenCount > 0 && (
            <button type="button" className="doc-action est-participants-more" onClick={() => setShowAll(true)}>
              ＋ Thêm người ngoài app ({hiddenCount})
            </button>
          )}
          {!!appId && inApp.size > 0 && showAll && (
            <button type="button" className="doc-action est-participants-more" onClick={() => setShowAll(false)}>
              − Thu gọn theo app
            </button>
          )}
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
