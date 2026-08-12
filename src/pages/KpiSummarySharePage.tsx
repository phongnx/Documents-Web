// Trang xem bảng tổng kết KPI tháng qua link share (/share/kpisum/:id) — công khai
// theo capability URL, CHỈ XEM (rule server chặn ghi với người không phải owner).
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onValue, ref } from 'firebase/database';
import ThemeToggle from '../components/ThemeToggle';
import KpiSummaryTable from '../components/board/KpiSummaryTable';
import { db } from '../lib/firebase';
import { normalizeSummaryRead } from '../lib/kpiSummary';
import type { KpiSummary, KpiSummaryMember, KpiSummaryMeta } from '../kpiTypes';

export default function KpiSummarySharePage() {
  const { id = '' } = useParams();
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading');

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
      <header className="share-header">
        <span className="brand">📊 Tổng kết KPI{summary ? ` · tháng ${monthLabel}` : ''}</span>
        <div className="share-header-actions">
          <ThemeToggle />
          <span className="badge badge-shared">Chỉ xem</span>
        </div>
      </header>

      {state === 'loading' && <p className="muted">Đang tải…</p>}
      {state === 'notfound' && (
        <p className="muted empty">
          Bảng không tồn tại hoặc đã bị xóa. Liên hệ người gửi để lấy link mới.
        </p>
      )}
      {state === 'ready' && summary && (
        <>
          {summary.meta.commonHolidays && (
            <p className="muted ksum-holidays-view">
              🎌 Nghỉ lễ chung: {summary.meta.commonHolidays}
            </p>
          )}
          <KpiSummaryTable summary={summary} readonly />
        </>
      )}
    </div>
  );
}
