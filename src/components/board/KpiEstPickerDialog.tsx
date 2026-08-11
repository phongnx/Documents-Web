// Dialog pick 1 sub task từ các bảng estimate member tham gia — fill vào dòng log KPI
// (Task text + Project + estRef). Hiển thị tiến độ từng sub task (est · đã log · status)
// để member log tiếp task đang dở mạch lạc; task done mờ đi nhưng vẫn pick được
// (TH phát sinh fix thêm sau khi tưởng xong).
import { useEffect, useState } from 'react';
import { get, ref } from 'firebase/database';
import { db } from '../../lib/firebase';
import {
  actualMinOf,
  EST_STATUS_META,
  fmtEstHours,
  fmtMin,
  sortedGroups,
  sortedTasks,
  type EstGroup,
  type EstimateMeta,
  type EstLogs,
  type KpiEstRef,
} from '../../estTypes';

export interface EstPickResult {
  estRef: KpiEstRef;
  /** Text gợi ý cho ô Task/Feature/Project của dòng log. */
  taskText: string;
  featureText?: string;
  projectText?: string;
}

interface Props {
  /** Danh sách bảng từ meta.estimates của sheet KPI. */
  estimates: { id: string; title: string }[];
  /** Member đang log (lọc sub task của mình). */
  memberId?: string;
  memberName?: string;
  onPick: (r: EstPickResult) => void;
  onClose: () => void;
}

interface LoadedEst {
  id: string;
  meta: EstimateMeta;
  groups: Record<string, EstGroup>;
  logs: EstLogs;
}

export default function KpiEstPickerDialog({
  estimates,
  memberId,
  memberName,
  onPick,
  onClose,
}: Props) {
  const [loaded, setLoaded] = useState<LoadedEst[] | null>(null);

  useEffect(() => {
    if (!db) return;
    let active = true;
    (async () => {
      const list: LoadedEst[] = [];
      await Promise.all(
        estimates.map(async (e) => {
          try {
            const snap = await get(ref(db!, `shared/est/${e.id}`));
            const val = snap.val() as {
              meta?: EstimateMeta;
              groups?: Record<string, EstGroup>;
              logs?: EstLogs;
            } | null;
            if (val?.meta)
              list.push({
                id: e.id,
                meta: val.meta,
                groups: val.groups ?? {},
                logs: val.logs ?? {},
              });
          } catch {
            // Bảng bị xóa — bỏ qua.
          }
        }),
      );
      if (active) setLoaded(list);
    })();
    return () => {
      active = false;
    };
  }, [estimates]);

  const mine = (t: { assigneeId?: string; assigneeName?: string }): boolean =>
    (!!memberId && t.assigneeId === memberId) ||
    (!t.assigneeId && !!memberName && t.assigneeName === memberName) ||
    (!memberId && !!memberName && t.assigneeName === memberName);

  return (
    <div className="modal-overlay">
      <div className="modal-dialog task-picker" role="dialog" aria-modal="true">
        <div className="modal-header">
          <strong>📐 Pick task từ estimate</strong>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="picker-list">
          {loaded === null ? (
            <p className="muted">Đang tải…</p>
          ) : loaded.length === 0 ? (
            <p className="muted">Không đọc được bảng estimate nào.</p>
          ) : (
            loaded.map((est) => {
              const rows = sortedGroups(est.groups).flatMap((g) =>
                sortedTasks(g)
                  .filter((t) => mine(t))
                  .map((t) => ({ g, t })),
              );
              if (rows.length === 0) return null;
              return (
                <div key={est.id} className="picker-task">
                  <div className="picker-task-head">
                    <span className="picker-task-title">📐 {est.meta.title}</span>
                    {est.meta.version && (
                      <span className="task-badge ver">{est.meta.version}</span>
                    )}
                  </div>
                  <ul className="picker-lines est-pick-lines">
                    {rows.map(({ g, t }) => {
                      const logged = actualMinOf(est.logs, t.id);
                      const st = EST_STATUS_META[t.status];
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            className={`est-pick-btn${t.status === 'done' ? ' est-pick-done' : ''}`}
                            onClick={() =>
                              onPick({
                                estRef: {
                                  estId: est.id,
                                  groupId: g.id,
                                  taskId: t.id,
                                  title: t.title,
                                },
                                taskText: t.title,
                                featureText: g.title,
                                projectText: est.meta.appName,
                              })
                            }
                          >
                            <span className="est-pick-title">
                              {st.icon} {g.title ? `${g.title} · ` : ''}
                              {t.title}
                            </span>
                            <span className="muted est-pick-meta">
                              {t.estHours ? `est ${fmtEstHours(t.estHours)}` : 'chưa est'}
                              {logged > 0 && ` · đã log ${fmtMin(logged)}`}
                              {` · ${st.label}`}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
          {loaded !== null &&
            loaded.length > 0 &&
            loaded.every((est) =>
              sortedGroups(est.groups).every(
                (g) => sortedTasks(g).filter((t) => mine(t)).length === 0,
              ),
            ) && (
              <p className="muted">
                Chưa có sub task nào được assign cho bạn trong các bảng estimate.
              </p>
            )}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
