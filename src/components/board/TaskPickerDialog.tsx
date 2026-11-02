// Dialog chọn task để tạo nhánh (design Plan tuần 02/11/2026): chip chọn app (ReportAppPicker),
// lọc "Ẩn task đã có trong plan", mỗi task 1 thẻ thu gọn được (checkbox 3 trạng thái), cảnh báo
// khi task đã là nhánh trong plan mà vẫn chọn thêm. Màn hẹp: toàn màn hình.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DONE_STATUS } from '../../pmTypes';
import type { AppItem, PlanWorkstream, TaskItem } from '../../pmTypes';
import { sortDate } from '../../lib/pmSort';
import { taskLines, taskToWorkstream } from '../../lib/planAutofill';
import KpiDialog from './KpiDialog';
import ReportAppPicker from './ReportAppPicker';
import { IcChevronDown, IcChevronUp, IcLink, IcPin, IcPlus, IcTask, IcWarn } from './ksumIcons';

/** Nhánh trong plan đang lấy từ 1 task (tính trên form hiện tại, kể cả chưa lưu). */
export interface TaskInPlan {
  ws: string;
  project: string;
}

interface Props {
  apps: AppItem[];
  tasks: TaskItem[];
  /** App gợi ý mặc định (app đang gắn với dự án). */
  initialAppId?: string;
  /** Khoảng tuần của plan — milestone chỉ "tự tick" khi mốc task nằm trong tuần. */
  week?: { start: string; end: string };
  /** Tên dự án đang thêm nhánh (dòng phụ của dialog). */
  projectName: string;
  /** taskId → các nhánh trong plan đang lấy từ task đó. */
  inPlan: Map<string, TaskInPlan[]>;
  narrow: boolean;
  onConfirm: (workstreams: PlanWorkstream[]) => void;
  onClose: () => void;
}

// Checkbox gốc có trạng thái "chọn một phần" (indeterminate chỉ đặt được qua DOM).
function TriCheck({ checked, mixed, label, onChange }: { checked: boolean; mixed: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return <input ref={ref} type="checkbox" className="pl-tk-cbx" checked={checked} aria-label={label} onChange={onChange} />;
}

export default function TaskPickerDialog({
  apps,
  tasks,
  initialAppId,
  week,
  projectName,
  inPlan,
  narrow,
  onConfirm,
  onClose,
}: Props) {
  const [appId, setAppId] = useState(initialAppId || apps[0]?.id || '');
  // Dòng đã chọn theo từng task: taskId → Set(chỉ số dòng). Đổi app / ẩn task vẫn giữ lựa chọn.
  const [picked, setPicked] = useState<Record<string, Set<number>>>({});
  const [hideIn, setHideIn] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  // Thu gọn: mặc định task đã có trong plan thu gọn, task chưa có mở sẵn; bấm ▴/▾ thì ghi đè.
  const [fold, setFold] = useState<Record<string, boolean>>({});
  const isFolded = (id: string) => fold[id] ?? inPlan.has(id);

  // Chỉ lấy task của app đang chọn và CHƯA hoàn thành, mới nhất trước.
  const appTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.appId === appId && t.status !== DONE_STATUS)
        .sort((a, b) => sortDate(b).localeCompare(sortDate(a))),
    [tasks, appId],
  );
  const inCount = appTasks.filter((t) => inPlan.has(t.id)).length;
  const shown = hideIn ? appTasks.filter((t) => !inPlan.has(t.id)) : appTasks;
  const app = apps.find((a) => a.id === appId);

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

  // Số nhánh sẽ tạo = số task (của app đang chọn) có ít nhất 1 dòng được chọn.
  const chosenTasks = appTasks.filter((t) => (picked[t.id]?.size ?? 0) > 0);
  const lineCount = chosenTasks.reduce((n, t) => n + (picked[t.id]?.size ?? 0), 0);
  const n = chosenTasks.length;

  const confirm = () => {
    const result: PlanWorkstream[] = chosenTasks.map((t) => {
      const lines = taskLines(t);
      const items = [...(picked[t.id] ?? [])]
        .sort((a, b) => a - b)
        .map((i) => lines[i])
        .filter(Boolean);
      return taskToWorkstream(t, app, items, week);
    });
    onConfirm(result);
  };

  const addLabel = `Thêm ${n} nhánh`;
  const toolbar = (
    <div className="pl-tk-bar">
      <div className="kml-menu-anchor pl-tk-app">
        <button
          type="button"
          className={`rpt-appchip${app ? '' : ' is-none'}${appOpen ? ' is-open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={appOpen}
          disabled={apps.length === 0}
          onClick={() => setAppOpen((o) => !o)}
        >
          <IcLink size={14} />
          <span>{app ? `${app.name} · ${app.platform}` : 'Chưa có app'}</span>
          <IcChevronDown size={14} />
        </button>
        {appOpen && (
          <ReportAppPicker
            apps={apps}
            usedBy={new Map()}
            currentAppId={appId}
            title="Chọn app"
            sheet={narrow}
            onPick={setAppId}
            onClose={() => setAppOpen(false)}
          />
        )}
      </div>
      <label className="kml-check">
        <input type="checkbox" checked={hideIn} onChange={(e) => setHideIn(e.target.checked)} />
        Ẩn task đã có trong plan
      </label>
      <span className="pl-tk-count">
        {appTasks.length} task chưa hoàn thành{inCount > 0 && ` · ${inCount} đã có trong plan`}
      </span>
    </div>
  );

  return (
    <KpiDialog
      title={narrow ? 'Chọn task' : 'Chọn task để tạo nhánh'}
      subtitle={
        narrow
          ? `Dự án ${projectName} · ${lineCount} dòng đã chọn`
          : `Dự án ${projectName} · mỗi task có dòng được chọn thành 1 nhánh`
      }
      icon={<IcTask size={20} />}
      wide
      fullscreen={narrow}
      className="pl-tk-dlg"
      // Menu chọn app đang mở: Esc / bấm nền chỉ đóng menu, không đóng dialog.
      dismissible={!appOpen}
      scrollBody
      toolbar={toolbar}
      headAction={
        <button type="button" className="kml-btn kml-btn-text" disabled={n === 0} onClick={confirm}>
          {addLabel}
        </button>
      }
      actions={
        narrow ? undefined : (
          <>
            <span className="pl-tk-sum">
              {lineCount} dòng · {n} task
            </span>
            <button type="button" className="kml-btn kml-btn-text" onClick={onClose}>
              Huỷ
            </button>
            <button type="button" className="kml-btn kml-btn-filled" disabled={n === 0} onClick={confirm}>
              <IcPlus size={18} />
              {addLabel}
            </button>
          </>
        )
      }
      onClose={onClose}
    >
      {shown.length === 0 ? (
        <p className="pl-tk-empty">
          {appTasks.length === 0
            ? 'Không có task đang mở (chưa hoàn thành).'
            : 'Mọi task đang mở đều đã có trong plan — bỏ "Ẩn task đã có trong plan" để xem.'}
        </p>
      ) : (
        shown.map((t) => {
          const lines = taskLines(t);
          const cur = picked[t.id] ?? new Set<number>();
          const allOn = cur.size === lines.length && lines.length > 0;
          const ins = inPlan.get(t.id);
          const folded = isFolded(t.id);
          return (
            <div key={t.id} className={`pl-tk${ins ? ' is-in' : ''}`}>
              <div className="pl-tk-h">
                <TriCheck
                  checked={allOn}
                  mixed={cur.size > 0 && !allOn}
                  label={`Chọn mọi dòng của task ${t.title}`}
                  onChange={() => toggleAll(t)}
                />
                <span className="pl-tk-hm">
                  <span className="pl-tk-t">{t.title}</span>
                  {t.version && <span className="kml-tag is-outline">{t.version}</span>}
                  {t.type && <span className="kml-tag is-neutral">{t.type}</span>}
                  {ins && (
                    <span className="kml-tag is-plan" title={ins.map((x) => `${x.project} · ${x.ws}`).join('\n')}>
                      <IcPin size={14} />
                      {ins.length > 1 ? `Đã có: ${ins.length} nhánh` : `Đã có: nhánh ${ins[0].ws}`}
                    </span>
                  )}
                </span>
                {folded && <span className="pl-tk-n">{lines.length} dòng</span>}
                <button
                  type="button"
                  className="kml-iconbtn is-xs"
                  aria-label={folded ? `Mở task ${t.title}` : `Thu gọn task ${t.title}`}
                  aria-expanded={!folded}
                  onClick={() => setFold((f) => ({ ...f, [t.id]: !folded }))}
                >
                  {folded ? <IcChevronDown size={16} /> : <IcChevronUp size={16} />}
                </button>
              </div>
              {ins && cur.size > 0 && (
                <div className="kml-banner is-warn pl-tk-warn">
                  <IcWarn size={14} />
                  <span>
                    Task này đã là nhánh {ins[0].ws} của dự án {ins[0].project}. Thêm nữa sẽ ra nhánh thứ{' '}
                    {ins.length + 1} từ cùng task.
                  </span>
                </div>
              )}
              {!folded && (
                <div className="pl-tk-lines">
                  {lines.map((ln, i) => (
                    <label key={i} className="pl-tk-ln">
                      <input
                        type="checkbox"
                        className="pl-tk-cbx"
                        checked={cur.has(i)}
                        onChange={() => toggleLine(t.id, i)}
                      />
                      <span>{ln}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </KpiDialog>
  );
}
