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
import KpiDialog from './KpiDialog';
import { IcRuler } from './ksumIcons';

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
    <KpiDialog
      icon={<IcRuler size={18} />}
      title="Chọn task từ estimate"
      subtitle="Sub task được giao cho bạn. Chọn xong sẽ điền Task, Feature và Project."
      scrollBody
      onClose={onClose}
      actions={
        <button type="button" className="k-btn" onClick={onClose}>
          Hủy
        </button>
      }
    >
      {loaded === null ? (
        <p className="k-muted">Đang tải…</p>
      ) : loaded.length === 0 ? (
        <p className="k-muted">Không đọc được bảng estimate nào.</p>
      ) : (
        loaded.map((est) => {
          const rows = sortedGroups(est.groups).flatMap((g) =>
            sortedTasks(g)
              .filter((t) => mine(t))
              .map((t) => ({ g, t })),
          );
          if (rows.length === 0) return null;
          return (
            <div key={est.id} className="kml-est-board">
              <div className="kml-est-board-h">
                <IcRuler />
                <span>{est.meta.title}</span>
                {est.meta.version && (
                  <span className="task-badge ver">{est.meta.version}</span>
                )}
              </div>
              <ul>
                {rows.map(({ g, t }) => {
                  const logged = actualMinOf(est.logs, t.id);
                  const st = EST_STATUS_META[t.status];
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`kml-est-item${t.status === 'done' ? ' is-done' : ''}`}
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
                        <span className="kml-est-item-text">
                          <span>
                            {g.title ? `${g.title}: ` : ''}
                            {t.title}
                          </span>
                          <span className="k-muted">
                            {t.estHours ? `est ${fmtEstHours(t.estHours)}` : 'chưa est'}
                            {logged > 0 && ` · đã log ${fmtMin(logged)}`}
                          </span>
                        </span>
                        <span className={`task-badge ${st.badgeClass}`}>{st.label}</span>
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
          <p className="k-muted">
            Chưa có sub task nào được assign cho bạn trong các bảng estimate.
          </p>
        )}
    </KpiDialog>
  );
}
