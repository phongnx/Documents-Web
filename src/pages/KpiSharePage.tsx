// Trang log KPI của member — truy cập công khai qua link riêng /share/kpi/:token
// (capability URL, KHÔNG cần đăng nhập). Member tự thêm/sửa dòng log của mình;
// dòng đã được leader chấm điểm sẽ bị khóa (rule chặn cả phía server).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import KpiLogTable from '../components/board/KpiLogTable';
import KpiRulesPreviewDialog from '../components/board/KpiRulesPreviewDialog';
import { useKpiSheet } from '../hooks/useKpiSheet';
import { db } from '../lib/firebase';
import { isoLocal } from '../lib/pmDates';
import { DEFAULT_KPI_RULES } from '../kpiTypes';

export default function KpiSharePage() {
  const { token } = useParams();
  const [monthKey, setMonthKey] = useState(isoLocal(new Date()).slice(0, 7));
  // Thông báo lỗi ghi (dòng đã chấm/sheet khóa/link hết hiệu lực) — tự ẩn sau 4s.
  const [writeError, setWriteError] = useState('');
  useEffect(() => {
    if (!writeError) return;
    const t = window.setTimeout(() => setWriteError(''), 4000);
    return () => window.clearTimeout(t);
  }, [writeError]);

  const sheet = useKpiSheet(token, setWriteError);
  const locked = sheet.meta?.locked === true;
  // Dialog xem quy chế (chỉ đọc) — sheet cũ chưa có snapshot thì fallback quy chế gốc.
  const [rulesOpen, setRulesOpen] = useState(false);
  const rules =
    sheet.meta?.rules && sheet.meta.rules.length > 0
      ? sheet.meta.rules
      : DEFAULT_KPI_RULES;

  // Tiêu đề tab theo tên member.
  useEffect(() => {
    const prev = document.title;
    if (sheet.meta) document.title = `KPI log · ${sheet.meta.memberName}`;
    return () => {
      document.title = prev;
    };
  }, [sheet.meta]);

  if (!db) {
    return (
      <div className="container">
        <p className="warn">Không tải được trang (thiếu cấu hình Firebase).</p>
      </div>
    );
  }

  return (
    <div className="container kpi-share-view">
      <header className="share-header">
        <span className="brand">📝 KPI log{sheet.meta ? ` · ${sheet.meta.memberName}` : ''}</span>
        <div className="share-header-actions">
          {sheet.state === 'ready' && (
            <button
              type="button"
              className="doc-action"
              title="Xem quy chế chấm điểm KPI"
              onClick={() => setRulesOpen(true)}
            >
              ℹ️ Quy chế
            </button>
          )}
          <ThemeToggle />
          <span className="badge badge-shared">Link riêng — không chia sẻ cho người khác</span>
        </div>
      </header>

      {sheet.state === 'loading' && <p className="muted">Đang tải…</p>}
      {sheet.state === 'notfound' && (
        <p className="muted empty">
          Trang không tồn tại hoặc leader đã ngừng chia sẻ. Liên hệ leader để lấy link mới.
        </p>
      )}
      {sheet.state === 'ready' && (
        <>
          {locked && (
            <p className="warn kpi-locked-banner">
              🔒 Trang đã bị khóa — chỉ xem, không sửa được. Liên hệ leader nếu cần mở lại.
            </p>
          )}
          {writeError && <p className="warn kpi-write-error">{writeError}</p>}
          <KpiLogTable
            mode="member"
            entries={sheet.entries}
            scores={sheet.scores}
            monthKey={monthKey}
            onMonthChange={setMonthKey}
            categories={sheet.meta?.categories ?? []}
            projectNames={sheet.meta?.projectNames ?? []}
            strictProjects={sheet.meta?.strictProjects === true}
            leaves={sheet.leaves}
            locked={locked}
            onAdd={sheet.addEntry}
            onUpdate={sheet.updateEntry}
            onDelete={sheet.deleteEntry}
          />
          <p className="muted kpi-share-hint">
            Dòng có badge điểm là đã được leader chấm — bị khóa sửa. Điểm tháng = 100 +
            tổng điểm cộng/trừ trong tháng (xem chi tiết ở nút "ℹ️ Quy chế").
          </p>
        </>
      )}

      {rulesOpen && (
        <KpiRulesPreviewDialog rules={rules} onClose={() => setRulesOpen(false)} />
      )}
    </div>
  );
}
