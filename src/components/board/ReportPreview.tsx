import type { DailyReport } from '../../pmTypes';
import { formatDateVi, parseBody, roman } from '../../lib/reportFormat';

// Xem nhanh 1 báo cáo ngày: tiêu đề + ngày, các dự án đánh số La Mã, dòng theo marker.
export default function ReportPreview({ report }: { report: DailyReport }) {
  const projects = (report.projects ?? []).filter(
    (p) => p.name.trim() || p.body.trim(),
  );
  return (
    <div className="report-preview">
      <div className="rp-head">
        <strong>{report.title || 'Report Mobile Team'}</strong>{' '}
        <span className="muted">{formatDateVi(report.date)}</span>
      </div>

      {projects.length === 0 ? (
        <p className="muted">Chưa có nội dung.</p>
      ) : (
        <div className="rp-projects">
          {projects.map((p, i) => (
            <div key={i} className="rp-project">
              <div className="rp-project-name">
                <span className="rp-roman">{roman(i + 1)} -</span> {p.name}
              </div>
              <div className="rp-lines">
                {parseBody(p.body).map((ln, j) => {
                  if (ln.kind === 'section')
                    return (
                      <div key={j} className="rp-line rp-section">
                        {ln.text}
                      </div>
                    );
                  if (ln.kind === 'arrow')
                    return (
                      <div key={j} className="rp-line rp-arrow">
                        <span className="rp-mark">➜</span> {ln.text}
                      </div>
                    );
                  if (ln.kind === 'sub')
                    return (
                      <div key={j} className="rp-line rp-sub">
                        <span className="rp-mark">◦</span> {ln.text}
                      </div>
                    );
                  if (ln.kind === 'bullet')
                    return (
                      <div key={j} className="rp-line rp-bullet">
                        <span className="rp-mark">•</span> {ln.text}
                      </div>
                    );
                  return (
                    <div key={j} className="rp-line rp-text">
                      {ln.text}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
