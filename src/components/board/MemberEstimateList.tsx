// Danh sách Estimate của 1 member — dùng chung cho trang leader (/board/kpi/:memberId/
// estimates) và trang member ẩn danh (/share/kpi/:token/estimates). Bố cục như trang task
// của 1 app: task các app được gán, nhóm theo app, lọc trạng thái/loại + tìm kiếm; mỗi
// task ↔ tối đa 1 bảng estimate (dùng chung cho mọi member làm task đó). Click dòng có
// bảng → vào detail; leader có thêm nút ＋ Tạo estimate trên dòng chưa có bảng.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { db } from '../../lib/firebase';
import { DONE_STATUS, statusMeta } from '../../pmTypes';
import type { KpiMember, KpiTaskSnap } from '../../kpiTypes';
import type { EstMetaInput } from '../../context/PmContext';
import {
  estSummaryOf,
  fmtEstHours,
  fmtMin,
  type EstGroup,
  type EstimateMeta,
  type EstLogs,
  type EstSummary,
} from '../../estTypes';
import { formatDay } from '../../lib/formatDate';

/** Tham chiếu 1 bảng estimate (taskId thiếu = bảng cũ theo phase/release). */
export interface EstRef {
  id: string;
  title: string;
  taskId?: string;
}

interface Props {
  tasks: KpiTaskSnap[];
  estimates: EstRef[];
  /** Đường dẫn tới detail của 1 bảng (2 phía khác route). */
  detailHref: (estId: string) => string;
  /** Chỉ leader truyền — hiện nút ＋ Tạo estimate trên dòng chưa có bảng. */
  onCreate?: (task: KpiTaskSnap) => void;
  /** Chỉ leader truyền — hiện nút 🗑️ xóa bảng trên dòng đã có bảng. */
  onDelete?: (est: EstRef) => void;
  /** Câu báo khi danh sách task rỗng. */
  emptyHint: string;
}

/** Giá trị seed cho dialog tạo bảng từ 1 task (dùng chung cho các trang leader):
 *  participants = member active đang được gán app của task — 1 bảng chung cho cả nhóm. */
export function estInitialFromTask(
  t: KpiTaskSnap,
  members: KpiMember[],
): Partial<EstMetaInput> {
  return {
    title: `${t.appName} - ${t.title}`,
    appId: t.appId,
    version: t.version,
    taskId: t.id,
    startDate: t.startDate,
    participantIds: members
      .filter((m) => m.active && m.projectIds?.includes(t.appId))
      .map((m) => m.id),
  };
}

// Giá trị filter đặc biệt: mặc định chỉ task chưa xong (326/355 task thật đã xong).
const OPEN = '__open';
const ALL = '';

const dateOf = (t: KpiTaskSnap) => t.planDate || t.endDate || t.startDate || '';

export default function MemberEstimateList({
  tasks,
  estimates,
  detailHref,
  onCreate,
  onDelete,
  emptyHint,
}: Props) {
  const navigate = useNavigate();
  const [fApp, setFApp] = useState('');
  const [fStatus, setFStatus] = useState(OPEN);
  const [fType, setFType] = useState('');
  const [search, setSearch] = useState('');
  const [summaries, setSummaries] = useState<Record<string, EstSummary | null>>({});

  const estByTask = useMemo(() => {
    const map = new Map<string, EstRef>();
    for (const e of estimates) if (e.taskId) map.set(e.taskId, e);
    return map;
  }, [estimates]);

  // Bảng không ghép được task nào trong danh sách: bảng cũ theo phase/release, hoặc
  // task của bảng đã bị xóa / chuyển sang app không còn gán cho member.
  const orphans = useMemo(() => {
    const ids = new Set(tasks.map((t) => t.id));
    return estimates.filter((e) => !e.taskId || !ids.has(e.taskId));
  }, [estimates, tasks]);

  // Tóm tắt từng bảng: get() 1 lần (như trang danh sách estimate của leader).
  const estKey = estimates.map((e) => e.id).join(',');
  useEffect(() => {
    if (!db || estimates.length === 0) {
      setSummaries({});
      return;
    }
    let active = true;
    (async () => {
      const next: Record<string, EstSummary | null> = {};
      await Promise.all(
        estimates.map(async (e) => {
          try {
            const snap = await get(ref(db!, `shared/est/${e.id}`));
            const val = snap.val() as {
              meta?: EstimateMeta;
              groups?: Record<string, EstGroup>;
              logs?: EstLogs;
            } | null;
            next[e.id] = val?.meta ? estSummaryOf(val.meta, val.groups, val.logs) : null;
          } catch {
            next[e.id] = null;
          }
        }),
      );
      if (active) setSummaries(next);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estKey]);

  // App có trong danh sách (cho bộ lọc App — chỉ hiện khi hơn 1 app).
  const appOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) if (!map.has(t.appId)) map.set(t.appId, t.appName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);
  const statuses = useMemo(() => [...new Set(tasks.map((t) => t.status))].sort(), [tasks]);
  const types = useMemo(
    () => [...new Set(tasks.map((t) => t.type).filter((x): x is string => !!x))].sort(),
    [tasks],
  );

  // Lọc + nhóm theo app (tên app tăng dần, trong app: ngày mốc mới nhất lên đầu).
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (fApp && t.appId !== fApp) return false;
      if (fStatus === OPEN ? t.status === DONE_STATUS : fStatus && t.status !== fStatus)
        return false;
      if (fType && t.type !== fType) return false;
      if (q && !`${t.title} ${t.version ?? ''} ${t.appName}`.toLowerCase().includes(q))
        return false;
      return true;
    });
    const byApp = new Map<string, { appId: string; appName: string; items: KpiTaskSnap[] }>();
    for (const t of list) {
      const g = byApp.get(t.appId) ?? { appId: t.appId, appName: t.appName, items: [] };
      g.items.push(t);
      byApp.set(t.appId, g);
    }
    for (const g of byApp.values())
      g.items.sort(
        (a, b) =>
          // Task đã có bảng lên đầu — đó là việc đang được estimate/theo dõi.
          Number(estByTask.has(b.id)) - Number(estByTask.has(a.id)) ||
          dateOf(b).localeCompare(dateOf(a)) ||
          a.order - b.order,
      );
    return [...byApp.values()].sort((a, b) => a.appName.localeCompare(b.appName));
  }, [tasks, fApp, fStatus, fType, search, estByTask]);

  const shown = groups.reduce((s, g) => s + g.items.length, 0);

  const summaryText = (s: EstSummary) =>
    `${s.doneCount}/${s.total} sub task · est ${fmtEstHours(s.estHours)} · thực tế ${fmtMin(s.actualMin)}`;

  const estBadge = (estId: string) => {
    const s = summaries[estId];
    if (s === undefined) return <span className="muted">Đang tải…</span>;
    if (s === null) return <span className="muted">Bảng không đọc được</span>;
    return (
      <>
        <span className={`task-badge ${s.state === 'draft' ? 'st-doing' : 'st-done'}`}>
          {s.state === 'draft' ? 'Draft' : 'Đã duyệt'}
        </span>
        {s.locked && <span className="task-badge st-block">🔒</span>}
        <span className="muted">{summaryText(s)}</span>
        <span className={`kpi-month-score ${s.pct >= 100 ? 'pos' : 'neg'}`}>{s.pct}%</span>
      </>
    );
  };

  // Xóa bảng — confirm mạnh vì mất cả sub task lẫn giờ thực tế đã log vào bảng.
  const deleteButton = (e: EstRef) => (
    <div className="doc-line-actions">
      <button
        type="button"
        className="doc-action danger"
        title="Xóa bảng (kèm toàn bộ nội dung)"
        onClick={() => {
          if (
            window.confirm(`Xóa bảng "${e.title}" và toàn bộ nội dung? Không thể hoàn tác.`)
          )
            onDelete?.(e);
        }}
      >
        🗑️
      </button>
    </div>
  );

  if (tasks.length === 0 && estimates.length === 0) {
    return <p className="muted empty">{emptyHint}</p>;
  }

  return (
    <>
      <div className="task-filters">
        {appOptions.length > 1 && (
          <select value={fApp} onChange={(e) => setFApp(e.target.value)}>
            <option value="">Mọi app ({appOptions.length})</option>
            {appOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value={OPEN}>Chưa xong</option>
          <option value={ALL}>Mọi trạng thái</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">Mọi loại</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className="task-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm…"
        />
        <span className="muted cal-count">{shown} task</span>
      </div>

      {tasks.length === 0 ? (
        <p className="muted empty">{emptyHint}</p>
      ) : shown === 0 ? (
        <p className="muted empty">
          Không có task nào khớp bộ lọc
          {fStatus === OPEN ? ' — chọn "Mọi trạng thái" để xem cả task đã xong' : ''}.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.appId} className="mest-app">
            <h3 className="mest-app-title">
              {g.appName} <span className="muted">· {g.items.length} task</span>
            </h3>
            <ul className="task-list">
              {g.items.map((t) => {
                const est = estByTask.get(t.id);
                return (
                  <li key={t.id} className={`task-row${est ? ' mest-has-est' : ''}`}>
                    <button
                      type="button"
                      className="task-main"
                      disabled={!est}
                      title={est ? 'Mở bảng estimate' : 'Task chưa có bảng estimate'}
                      onClick={() => est && navigate(detailHref(est.id))}
                    >
                      <span className="task-head">
                        <span className="task-title">{t.title}</span>
                        <span className="task-tags">
                          {t.type && <span className="task-badge type">{t.type}</span>}
                          <span className={`task-badge ${statusMeta(t.status).badgeClass}`}>
                            {t.status}
                          </span>
                          {t.version && <span className="task-badge ver">{t.version}</span>}
                          {dateOf(t) && (
                            <span className="muted task-plan">📅 {formatDay(dateOf(t))}</span>
                          )}
                        </span>
                      </span>
                      <span className="mest-est">
                        📐{' '}
                        {est ? (
                          estBadge(est.id)
                        ) : (
                          <span className="muted">
                            Chưa có estimate{onCreate ? '' : ' — liên hệ leader để mở bảng'}
                          </span>
                        )}
                      </span>
                    </button>
                    {onCreate && !est && (
                      <div className="doc-line-actions">
                        <button
                          type="button"
                          className="doc-action"
                          title="Tạo bảng estimate cho task này"
                          onClick={() => onCreate(t)}
                        >
                          ＋ Tạo estimate
                        </button>
                      </div>
                    )}
                    {onDelete && est && deleteButton(est)}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {orphans.length > 0 && (
        <section className="mest-app">
          <h3 className="mest-app-title">
            Bảng không gắn task{' '}
            <span className="muted">
              · bảng theo phase/release cũ, hoặc task đã bị xóa / không còn thuộc app được gán
            </span>
          </h3>
          <ul className="task-list">
            {orphans.map((e) => (
              <li key={e.id} className="task-row mest-has-est">
                <button
                  type="button"
                  className="task-main"
                  onClick={() => navigate(detailHref(e.id))}
                >
                  <span className="task-head">
                    <span className="task-title">📐 {e.title}</span>
                  </span>
                  <span className="mest-est">{estBadge(e.id)}</span>
                </button>
                {onDelete && deleteButton(e)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
