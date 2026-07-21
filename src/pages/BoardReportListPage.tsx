import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import { newReportTemplate } from '../pmTypes';
import ReportPreview from '../components/board/ReportPreview';
import { formatDateVi } from '../lib/reportFormat';

// yyyy-mm-dd theo giờ địa phương (không lệch múi giờ như toISOString).
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function BoardReportListPage() {
  const { reports, loading, addReport, deleteReport } = usePm();
  const navigate = useNavigate();

  // Tập id đang mở preview. Mặc định mở báo cáo mới nhất (seed 1 lần).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || reports.length === 0) return;
    seeded.current = true;
    setExpanded(new Set([reports[0].id]));
  }, [reports]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const today = isoLocal(new Date());

  // Tạo báo cáo trắng cho hôm nay.
  const onCreate = () => {
    const created = addReport(newReportTemplate(today));
    if (created) navigate(`/board/report/${created.id}`);
  };

  // Tạo báo cáo hôm nay từ khung của báo cáo gần nhất (clone dự án + nội dung để sửa nhanh).
  const onCreateFromLatest = () => {
    const latest = reports[0];
    if (!latest) return;
    const created = addReport({
      title: latest.title,
      date: today,
      projects: latest.projects.map((p) => ({
        name: p.name,
        ...(p.appId ? { appId: p.appId } : {}),
        body: p.body,
      })),
    });
    if (created) navigate(`/board/report/${created.id}`);
  };

  const onDelete = (id: string, date: string) => {
    if (window.confirm(`Xóa báo cáo ngày ${formatDateVi(date)}? Không thể hoàn tác.`))
      deleteReport(id);
  };

  return (
    <div className="container">
      <BoardNav />

      <div className="board-add-row">
        <button type="button" className="primary" onClick={onCreate}>
          ＋ Báo cáo hôm nay
        </button>
        {reports.length > 0 && (
          <button type="button" onClick={onCreateFromLatest}>
            ⧉ Tạo từ báo cáo gần nhất
          </button>
        )}
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : reports.length === 0 ? (
        <p className="muted empty">
          Chưa có báo cáo nào. Bấm “Báo cáo hôm nay” để tạo và nhập nội dung.
        </p>
      ) : (
        <div className="plan-cards">
          {reports.map((r) => {
            const open = expanded.has(r.id);
            const isToday = r.date === today;
            return (
              <section key={r.id} className={`plan-card${open ? ' open' : ''}`}>
                <div
                  className="plan-card-head"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') toggle(r.id);
                  }}
                >
                  <span className="plan-chevron">{open ? '▾' : '▸'}</span>
                  <div className="plan-card-info">
                    <span className="plan-card-title">
                      {r.title || 'Report Mobile Team'}
                      {isToday && <span className="plan-current-tag">Hôm nay</span>}
                    </span>
                    <span className="muted plan-card-meta">
                      Ngày {formatDateVi(r.date)} · {r.projects?.length ?? 0} dự án
                    </span>
                  </div>
                  <div className="doc-line-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="doc-action"
                      title="Sửa báo cáo"
                      onClick={() => navigate(`/board/report/${r.id}`)}
                    >
                      ✏️ Sửa
                    </button>
                    <button
                      type="button"
                      className="doc-action danger"
                      title="Xóa báo cáo"
                      onClick={() => onDelete(r.id, r.date)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="plan-card-body">
                    <ReportPreview report={r} />
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
