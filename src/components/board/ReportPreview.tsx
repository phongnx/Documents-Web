import type { DailyReport } from '../../pmTypes';
import { formatDateVi, parseBody, roman } from '../../lib/reportFormat';
import { IcArrowRight } from './ksumIcons';

const LINE_CLS = { section: 'l-sec', bullet: 'l-b', arrow: 'l-a', sub: 'l-s', text: 'l-t' } as const;

// Xem nhanh 1 báo cáo ngày: tiêu đề + ngày, các dự án đánh số La Mã, dòng theo marker.
// `highlight` = chỉ số dự án (theo mảng gốc) đang sửa → tô nền; mỗi mục có data-pidx
// để editor cuộn khung xem trước tới đúng dự án.
export default function ReportPreview({
  report,
  highlight,
}: {
  report: DailyReport;
  highlight?: number;
}) {
  // Giữ chỉ số gốc (i) để khớp dự án trong form; dự án trống bị bỏ như bản copy.
  const projects = (report.projects ?? [])
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.name.trim() || p.body.trim());
  return (
    <div className="rpv">
      <div className="rpv-title">
        {report.title || 'Report Mobile Team'} <span>{formatDateVi(report.date)}</span>
      </div>

      {projects.length === 0 ? (
        <p className="muted">Chưa có nội dung.</p>
      ) : (
        projects.map(({ p, i }, n) => (
          <section
            key={i}
            data-pidx={i}
            className={`rpv-proj${highlight === i ? ' is-cur' : ''}`}
          >
            <h3>
              <span>{roman(n + 1)} -</span> {p.name}
            </h3>
            <ul>
              {parseBody(p.body).map((ln, j) => (
                <li key={j} className={LINE_CLS[ln.kind]}>
                  {ln.kind === 'arrow' && <IcArrowRight size={12} />}
                  {ln.text}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
