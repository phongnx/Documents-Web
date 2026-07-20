import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import { newPlanTemplate } from '../pmTypes';
import PlanPreview from '../components/board/PlanPreview';
import { formatDay } from '../lib/formatDate';

// yyyy-mm-dd theo giờ địa phương (không lệch múi giờ như toISOString).
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
// Thứ Hai → Thứ Sáu của tuần hiện tại.
function currentWeek(): { start: string; end: string } {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Thứ Hai = 0
  const mon = new Date(now);
  mon.setDate(now.getDate() - dow);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return { start: isoLocal(mon), end: isoLocal(fri) };
}

export default function BoardPlanListPage() {
  const { plans, loading, addPlan, deletePlan } = usePm();
  const navigate = useNavigate();

  // Tập id đang mở preview. Mặc định mở plan của tuần hiện tại (seed 1 lần).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || plans.length === 0) return;
    seeded.current = true;
    const today = isoLocal(new Date());
    const current = plans.filter((p) => p.weekStart <= today && today <= p.weekEnd);
    // Không có plan cho tuần hiện tại → mở plan mới nhất (đầu danh sách).
    setExpanded(new Set((current.length ? current : [plans[0]]).map((p) => p.id)));
  }, [plans]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onCreate = () => {
    const { start, end } = currentWeek();
    const created = addPlan(newPlanTemplate(start, end));
    if (created) navigate(`/board/plan/${created.id}`);
  };

  const onDelete = (id: string, title: string) => {
    if (window.confirm(`Xóa plan "${title}"? Không thể hoàn tác.`)) deletePlan(id);
  };

  const today = isoLocal(new Date());

  return (
    <div className="container">
      <BoardNav />

      <div className="board-add-row">
        <button type="button" className="primary" onClick={onCreate}>
          ＋ Tạo plan tuần (từ mẫu)
        </button>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : plans.length === 0 ? (
        <p className="muted empty">
          Chưa có plan tuần nào. Bấm “Tạo plan tuần (từ mẫu)” để bắt đầu, rồi chỉnh sửa
          và export ra HTML.
        </p>
      ) : (
        <div className="plan-cards">
          {plans.map((p) => {
            const open = expanded.has(p.id);
            const isCurrent = p.weekStart <= today && today <= p.weekEnd;
            return (
              <section key={p.id} className={`plan-card${open ? ' open' : ''}`}>
                <div
                  className="plan-card-head"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggle(p.id);
                  }}
                >
                  <span className="plan-chevron">{open ? '▾' : '▸'}</span>
                  <div className="plan-card-info">
                    <span className="plan-card-title">
                      {p.title || '(chưa đặt tên)'}
                      {isCurrent && <span className="plan-current-tag">Tuần này</span>}
                    </span>
                    <span className="muted plan-card-meta">
                      Tuần {formatDay(p.weekStart)} – {formatDay(p.weekEnd)} ·{' '}
                      {p.projects?.length ?? 0} dự án
                    </span>
                  </div>
                  <div className="doc-line-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="doc-action"
                      title="Sửa plan"
                      onClick={() => navigate(`/board/plan/${p.id}`)}
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      type="button"
                      className="doc-action danger"
                      title="Xóa plan"
                      onClick={() => onDelete(p.id, p.title)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="plan-card-body">
                    <PlanPreview plan={p} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
