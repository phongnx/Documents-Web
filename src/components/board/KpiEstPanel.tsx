// Panel đối chiếu estimate trên trang chấm KPI của leader: liệt kê sub task được
// assign cho member từ các bảng estimate họ tham gia — est vs thực tế + điểm gợi ý,
// cảnh báo task done chưa có giờ log. Chỉ đọc (chấm điểm vẫn trên dòng log).
import { useEffect, useState } from 'react';
import { get, ref } from 'firebase/database';
import { db } from '../../lib/firebase';
import { usePm } from '../../context/PmContext';
import {
  actualMinOf,
  EST_STATUS_META,
  fmtEstHours,
  fmtMin,
  sortedGroups,
  sortedTasks,
  suggestDelta,
  type EstGroup,
  type EstimateMeta,
  type EstLogs,
} from '../../estTypes';
import { fmtDelta } from '../../kpiTypes';

interface Row {
  estTitle: string;
  groupTitle: string;
  taskTitle: string;
  status: keyof typeof EST_STATUS_META;
  estHours?: number;
  actualMin: number;
}

export default function KpiEstPanel({ memberId }: { memberId: string }) {
  const { estimates } = usePm();
  const [rows, setRows] = useState<Row[] | null>(null);

  const joined = estimates.filter((e) => e.participantIds?.includes(memberId));

  useEffect(() => {
    if (!db || joined.length === 0) {
      setRows([]);
      return;
    }
    let active = true;
    (async () => {
      const next: Row[] = [];
      await Promise.all(
        joined.map(async (e) => {
          try {
            const snap = await get(ref(db!, `shared/est/${e.id}`));
            const val = snap.val() as {
              meta?: EstimateMeta;
              groups?: Record<string, EstGroup>;
              logs?: EstLogs;
            } | null;
            if (!val?.meta) return;
            for (const g of sortedGroups(val.groups))
              for (const t of sortedTasks(g)) {
                if (t.assigneeId !== memberId) continue;
                next.push({
                  estTitle: val.meta.title,
                  groupTitle: g.title,
                  taskTitle: t.title,
                  status: t.status,
                  estHours: t.estHours,
                  actualMin: actualMinOf(val.logs, t.id),
                });
              }
          } catch {
            // Bảng bị xóa — bỏ qua.
          }
        }),
      );
      if (active) setRows(next);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, estimates]);

  if (joined.length === 0) return null;

  return (
    <details className="est-panel">
      <summary>
        📐 Task estimate của member ({rows?.length ?? '…'}) — đối chiếu khi chấm
      </summary>
      {rows === null ? (
        <p className="muted">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Chưa có sub task nào được assign trong các bảng estimate.</p>
      ) : (
        <ul className="est-panel-list">
          {rows.map((r, i) => {
            const st = EST_STATUS_META[r.status];
            const delta =
              r.status === 'done' ? suggestDelta(r.estHours, r.actualMin) : null;
            const over =
              r.estHours && r.actualMin > 0 && r.actualMin > r.estHours * 60;
            return (
              <li key={i}>
                <span className={`task-badge ${st.badgeClass}`}>
                  {st.icon} {st.label}
                </span>
                <span className="est-panel-title">
                  {r.groupTitle ? `${r.groupTitle} · ` : ''}
                  {r.taskTitle}
                </span>
                <span className="muted">
                  [{r.estTitle}] est {r.estHours ? fmtEstHours(r.estHours) : '—'} · thực
                  tế{' '}
                  <span className={over ? 'est-slow' : r.actualMin > 0 ? 'est-fast' : ''}>
                    {r.actualMin > 0 ? fmtMin(r.actualMin) : '—'}
                  </span>
                </span>
                {delta !== null && (
                  <span
                    className={`kpi-score ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero'}`}
                    title="Điểm gợi ý theo est vs thực tế (nhanh ≥20% = +1 · đạt = 0 · chậm 10–20% = −0.5 · chậm >20% = −1)"
                  >
                    {fmtDelta(delta)}
                  </span>
                )}
                {r.status === 'done' && r.actualMin === 0 && (
                  <span className="kpi-warn" title="Done nhưng chưa có dòng log KPI nào link tới task">
                    ⚠ chưa log giờ
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
