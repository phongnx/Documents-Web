// Đổi trạng thái sub task estimate — thay checkbox "Xong" cũ trên dòng.
// Desktop: menu thả xuống dưới chip trạng thái. Màn hẹp: bottom sheet (KpiDialog sheet).
// Mục "Xong" xem trước điểm gợi ý (estDonePreview — cùng căn cứ với completeEstTask)
// để người dùng biết trước sẽ ghi gì vào dòng log KPI. Chọn Xong không hỏi lại.
import { useEffect, useRef } from 'react';
import {
  EST_STATUS_META,
  estDonePreview,
  fmtEstHours,
  fmtMin,
  type EstSubTask,
  type EstTaskStatus,
} from '../../estTypes';
import { fmtDelta } from '../../kpiTypes';
import KpiDialog from './KpiDialog';
import { IcCheck, IcStDoing, IcStDone, IcStTodo } from './ksumIcons';

export function EstStatusIcon({ status, size = 16 }: { status: EstTaskStatus; size?: number }) {
  if (status === 'done') return <IcStDone size={size} />;
  if (status === 'doing') return <IcStDoing size={size} />;
  return <IcStTodo size={size} />;
}

const scoreCls = (d: number) => (d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero');

/** 3 lựa chọn trạng thái (dùng chung menu + sheet). */
function StatusOptions({
  task,
  actualMin,
  iconSize,
  onPick,
}: {
  task: EstSubTask;
  actualMin: number;
  iconSize: number;
  onPick: (s: EstTaskStatus) => void;
}) {
  const pv = estDonePreview(task.estHours, actualMin);
  const tick = (s: EstTaskStatus) =>
    task.status === s ? (
      <span className="est-menu-tick">
        <IcCheck size={16} />
      </span>
    ) : null;
  return (
    <>
      {(['todo', 'doing'] as const).map((s) => (
        <button
          key={s}
          type="button"
          className={`kml-menu-item est-mi-${s}`}
          role="menuitemradio"
          aria-checked={task.status === s}
          onClick={() => onPick(s)}
        >
          <EstStatusIcon status={s} size={iconSize} />
          <span>{EST_STATUS_META[s].label}</span>
          {tick(s)}
        </button>
      ))}
      <div className="kml-menu-sep" />
      <button
        type="button"
        className="kml-menu-item est-mi-done"
        role="menuitemradio"
        aria-checked={task.status === 'done'}
        onClick={() => onPick('done')}
      >
        <EstStatusIcon status="done" size={iconSize} />
        <span>
          <span className="est-mi-title">
            {pv.delta !== null ? 'Xong · ghi điểm gợi ý' : 'Xong'}
          </span>
          {task.status !== 'done' && (
            <>
              <small>{pv.lines[0]}</small>
              <small>{pv.lines[1]}</small>
            </>
          )}
        </span>
        {task.status === 'done'
          ? tick('done')
          : pv.delta !== null && (
              <span className={`kml-score ${scoreCls(pv.delta)}`}>{fmtDelta(pv.delta)}</span>
            )}
      </button>
    </>
  );
}

/** Menu thả xuống (desktop) — đặt trong khung position:relative của chip trạng thái. */
export function EstStatusMenu({
  task,
  actualMin,
  onPick,
  onClose,
}: {
  task: EstSubTask;
  actualMin: number;
  onPick: (s: EstTaskStatus) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // onClose đổi theo render → đọc qua ref để listener chỉ gắn 1 lần.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // Focus mục đang chọn để dùng được bàn phím (Tab / Enter).
    boxRef.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      const wrap = boxRef.current?.parentElement;
      if (wrap && !wrap.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={boxRef} className="kml-menu est-st-menu" role="menu" aria-label="Đổi trạng thái">
      <div className="kml-menu-h kml-ellipsis">Đổi trạng thái · {task.title}</div>
      <StatusOptions task={task} actualMin={actualMin} iconSize={18} onPick={onPick} />
    </div>
  );
}

/** Bottom sheet (màn hẹp). */
export function EstStatusSheet({
  task,
  actualMin,
  onPick,
  onClose,
}: {
  task: EstSubTask;
  actualMin: number;
  onPick: (s: EstTaskStatus) => void;
  onClose: () => void;
}) {
  return (
    <KpiDialog
      sheet
      title={task.title || '(chưa đặt tên)'}
      subtitle={`Đổi trạng thái · est ${task.estHours ? fmtEstHours(task.estHours) : '—'} · thực tế ${
        actualMin > 0 ? fmtMin(actualMin) : '—'
      }`}
      onClose={onClose}
    >
      <div className="est-sheet-opts" role="menu" aria-label="Đổi trạng thái">
        <StatusOptions task={task} actualMin={actualMin} iconSize={22} onPick={onPick} />
      </div>
    </KpiDialog>
  );
}
