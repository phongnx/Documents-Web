// Trang xem bảng tổng kết KPI tháng qua link share (/share/kpisum/:id) — công khai
// theo capability URL, CHỈ XEM (rule server chặn ghi với người không phải owner).
// Chỉ gửi leader/quản lý: trên đầu có thống kê, xếp hạng điểm, lý do ±; các khối
// chi tiết mặc định THU GỌN, bấm tên/xếp hạng để mở khối cần xem.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onValue, ref } from 'firebase/database';
import ThemeToggle from '../components/ThemeToggle';
import KpiSummaryTable, {
  useKsumOpen,
  usePagebarHeight,
} from '../components/board/KpiSummaryTable';
import KsumOverview from '../components/board/KsumOverview';
import { db } from '../lib/firebase';
import { fmtDateTime, normalizeSummaryRead } from '../lib/kpiSummary';
import type { KpiSummary, KpiSummaryMember, KpiSummaryMeta } from '../kpiTypes';

export default function KpiSummarySharePage() {
  const { id = '' } = useParams();
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const { rootRef, barRef } = usePagebarHeight<HTMLElement>();
  const open = useKsumOpen(summary?.members.map((m) => m.memberId) ?? [], false);

  useEffect(() => {
    if (!db || !id) {
      setState(id ? 'notfound' : 'loading');
      return;
    }
    setState('loading');
    const unsub = onValue(
      ref(db, `shared/kpisum/${id}`),
      (snap) => {
        const val = snap.val() as {
          meta: KpiSummaryMeta;
          members?: KpiSummaryMember[];
        } | null;
        if (!val?.meta) {
          setSummary(null);
          setState('notfound');
          return;
        }
        setSummary(normalizeSummaryRead(val));
        setState('ready');
      },
      () => setState('notfound'),
    );
    return unsub;
  }, [id]);

  const monthLabel = summary
    ? `${summary.meta.monthKey.slice(5, 7)}/${summary.meta.monthKey.slice(0, 4)}`
    : '';

  // Tiêu đề tab theo tháng.
  useEffect(() => {
    const prev = document.title;
    if (summary) document.title = `Tổng kết KPI tháng ${monthLabel}`;
    return () => {
      document.title = prev;
    };
  }, [summary, monthLabel]);

  if (!db) {
    return (
      <div className="container">
        <p className="warn">Không tải được trang (thiếu cấu hình Firebase).</p>
      </div>
    );
  }

  return (
    <div className="container ksum-page">
      <div className="kp k-mode-share" ref={rootRef}>
        <header className="k-sharebar" ref={barRef}>
          <h1 className="k-title">Tổng kết KPI{summary ? ` · tháng ${monthLabel}` : ''}</h1>
          <span className="k-tag k-tag-ro">Chỉ xem</span>
          {summary && (
            <span className="k-title-sub">
              Cập nhật lúc {fmtDateTime(summary.meta.updatedAt)}
            </span>
          )}
          <div className="k-toolbar">
            <ThemeToggle />
          </div>
        </header>

        <main className="k-main">
          {state === 'loading' && (
            <div className="k-card k-state">
              <p className="k-muted">Đang tải…</p>
            </div>
          )}
          {state === 'notfound' && (
            <div className="k-card k-state">
              <p className="k-state-title">Bảng không tồn tại hoặc đã bị xóa.</p>
              <p className="k-muted k-small">Liên hệ người gửi để lấy link mới.</p>
            </div>
          )}
          {state === 'ready' && summary && (
            <>
              <KsumOverview
                members={summary.members}
                mode="share"
                anyOpen={open.anyOpen}
                onToggleAll={open.toggleAll}
                onGoTo={open.goTo}
                holidays={summary.meta.commonHolidays}
              />
              {summary.members.length > 0 ? (
                <KpiSummaryTable
                  summary={summary}
                  readonly
                  isOpen={open.isOpen}
                  onToggle={open.toggle}
                />
              ) : (
                <div className="k-card k-state">
                  <p className="k-muted">Bảng chưa có member nào.</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
