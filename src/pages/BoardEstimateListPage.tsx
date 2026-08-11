// Danh sách bảng Break task & Estimate (leader): card + tạo/xóa bảng.
// Tóm tắt từng bảng (state, tiến độ, Σ est/thực tế) đọc get() 1 lần như trang KPI list.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import EstMetaDialog from '../components/board/EstMetaDialog';
import { db } from '../lib/firebase';
import {
  actualMinOf,
  estProgress,
  fmtEstHours,
  fmtMin,
  sortedGroups,
  sortedTasks,
  type EstGroup,
  type EstimateMeta,
  type EstLogs,
} from '../estTypes';
import { formatDateVi } from '../lib/reportFormat';

interface EstSummary {
  state: EstimateMeta['state'];
  locked: boolean;
  pct: number;
  doneCount: number;
  total: number;
  estHours: number;
  actualMin: number;
  participants: number;
}

export default function BoardEstimateListPage() {
  const { estimates, apps, members, loading, addEstimate, deleteEstimate } = usePm();
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<Record<string, EstSummary>>({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!db) return;
    let active = true;
    (async () => {
      const next: Record<string, EstSummary> = {};
      await Promise.all(
        estimates.map(async (e) => {
          try {
            const snap = await get(ref(db!, `shared/est/${e.id}`));
            const val = snap.val() as {
              meta?: EstimateMeta;
              groups?: Record<string, EstGroup>;
              logs?: EstLogs;
            } | null;
            if (!val?.meta) return;
            const p = estProgress(val.groups);
            let estHours = 0;
            let actualMin = 0;
            for (const g of sortedGroups(val.groups))
              for (const t of sortedTasks(g)) {
                estHours += t.estHours ?? 0;
                actualMin += actualMinOf(val.logs, t.id);
              }
            next[e.id] = {
              state: val.meta.state,
              locked: val.meta.locked === true,
              pct: p.pct,
              doneCount: p.doneCount,
              total: p.total,
              estHours,
              actualMin,
              participants: val.meta.participants?.length ?? 0,
            };
          } catch {
            // Node bị xóa tay — card hiện "—".
          }
        }),
      );
      if (active) setSummaries(next);
    })();
    return () => {
      active = false;
    };
  }, [estimates]);

  const onCreate = (data: Parameters<typeof addEstimate>[0]) => {
    const id = addEstimate(data);
    if (id) navigate(`/board/estimates/${id}`);
  };

  return (
    <div className="container">
      <BoardNav />

      <div className="board-add-row">
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          ＋ Tạo bảng estimate
        </button>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : estimates.length === 0 ? (
        <p className="muted empty">
          Chưa có bảng nào. Tạo bảng break task & estimate cho 1 phase/release — member
          tham gia sẽ thấy link bảng trên trang KPI của họ và tự fill khi còn Draft.
        </p>
      ) : (
        <div className="plan-cards">
          {estimates.map((e) => {
            const s = summaries[e.id];
            return (
              <section
                key={e.id}
                className="plan-card kpi-member-card"
                title="Click để mở bảng"
                onClick={() => navigate(`/board/estimates/${e.id}`)}
              >
                <div className="plan-card-head">
                  <div className="plan-card-info">
                    <span className="plan-card-title">
                      📐 {e.title}
                      {s?.locked && ' 🔒'}
                      {s && (
                        <span
                          className={`task-badge ${s.state === 'draft' ? 'st-doing' : 'st-done'}`}
                        >
                          {s.state === 'draft' ? 'Draft' : 'Đã duyệt'}
                        </span>
                      )}
                    </span>
                    <span className="muted plan-card-meta">
                      {s
                        ? `${s.doneCount}/${s.total} task · est ${fmtEstHours(s.estHours)} · thực tế ${fmtMin(s.actualMin)} · 👥 ${s.participants}`
                        : 'Đang tải…'}
                      {' · '}
                      {formatDateVi(e.createdAt.slice(0, 10))}
                    </span>
                  </div>
                  {s && (
                    <span className={`kpi-month-score ${s.pct >= 100 ? 'pos' : 'neg'}`}>
                      {s.pct}%
                    </span>
                  )}
                  <div className="doc-line-actions" onClick={(ev) => ev.stopPropagation()}>
                    <button
                      type="button"
                      className="doc-action danger"
                      title="Xóa bảng (kèm toàn bộ nội dung)"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Xóa bảng "${e.title}" và toàn bộ nội dung? Không thể hoàn tác.`,
                          )
                        )
                          deleteEstimate(e.id);
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {creating && (
        <EstMetaDialog
          title="＋ Tạo bảng estimate"
          apps={apps}
          members={members.filter((m) => m.active)}
          onSave={onCreate}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
