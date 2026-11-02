// Chip trạng thái sync Plan tuần trong editor Báo cáo ngày (đợt 3 redesign, 01/11/2026).
// Rê chuột → tooltip (title); bấm (cả trên màn cảm ứng) → bong bóng giải thích,
// bấm ra ngoài / Esc để đóng. Chip trên dòng '#' nằm trong lớp tô màu của ô nội dung.
import { useEffect, useRef, useState } from 'react';
import { WORKSTREAM_STATE_META, type WorkstreamState } from '../../pmTypes';
import type { SyncChip } from '../../lib/planProgress';

export interface SyncChipView {
  cls: string;
  label: string;
  tip: string;
}

const STATE_CLS: Record<WorkstreamState, string> = {
  todo: 'is-noplan',
  blocked: 'is-noplan',
  doing: 'is-doing',
  testing: 'is-test',
  done: 'is-done',
};
const RANK: Record<WorkstreamState, number> = { blocked: 0, todo: 0, doing: 1, testing: 2, done: 3 };

// Plan đang ở trạng thái khác báo cáo này → nói rõ, vì chip chỉ là kết quả của 1 báo cáo.
function planNote(c: SyncChip): string {
  if (c.planState === c.state) return '';
  const lbl = WORKSTREAM_STATE_META[c.planState].label;
  return RANK[c.planState] > RANK[c.state]
    ? ` Plan đang: ${lbl}. Sync không hạ trạng thái đã có.`
    : ` Plan đang: ${lbl}.`;
}

interface Ctx {
  /** Tên dự án trong plan. */
  project: string;
  /** 'dd/mm – dd/mm' của plan tuần. */
  range: string;
}

// Chip trên dòng '#' (plan nhiều nhánh). `short` = nhãn ngắn cho màn hẹp.
export function sectionChipView(
  c: SyncChip | 'none',
  section: string,
  ctx: Ctx,
  short: boolean,
): SyncChipView {
  if (c === 'none')
    return {
      cls: 'is-noplan',
      label: short ? 'Ngoài plan' : 'Không có trong plan',
      tip: `Plan tuần ${ctx.range} của ${ctx.project} không có nhánh khớp “${section}”, nên sync Plan tuần không đổi gì từ nhánh này.`,
    };
  const label = WORKSTREAM_STATE_META[c.state].label;
  return {
    cls: STATE_CLS[c.state],
    label,
    tip: `Nhánh này khớp nhánh “${c.wsTitle}” của ${ctx.project} trong plan tuần ${ctx.range}. Sync Plan tuần gom mọi dòng của nhánh → ${label}.${planNote(c)}`,
  };
}

// Chip ở hàng tên dự án (plan chỉ có 1 nhánh).
export function wholeChipView(c: SyncChip, ctx: Ctx): SyncChipView {
  const label = WORKSTREAM_STATE_META[c.state].label;
  return {
    cls: STATE_CLS[c.state],
    label,
    tip: `Plan tuần ${ctx.range} của ${ctx.project} chỉ có 1 nhánh nên sync Plan tuần tính trên cả nội dung dự án → ${label}.${planNote(c)}`,
  };
}

export default function ReportSyncChip({
  view,
  inMirror = false,
}: {
  view: SyncChipView;
  /** Chip nằm trong lớp tô màu (đã aria-hidden) → không nhận focus bàn phím. */
  inMirror?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`rpt-sync-wrap${inMirror ? ' in-mirror' : ''}`}>
      <button
        type="button"
        className={`rpt-sync ${view.cls}`}
        title={open ? undefined : view.tip}
        tabIndex={inMirror ? -1 : undefined}
        aria-label={inMirror ? undefined : `Sync Plan tuần: ${view.label}`}
        aria-expanded={inMirror ? undefined : open}
        onClick={() => setOpen((o) => !o)}
      >
        {view.label}
      </button>
      {open && (
        <span className="rpt-sync-tip" role="tooltip">
          {view.tip}
        </span>
      )}
    </span>
  );
}
