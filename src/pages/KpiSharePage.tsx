// Trang log KPI của member — truy cập công khai qua link riêng /share/kpi/:token
// (capability URL, KHÔNG cần đăng nhập). Member tự thêm/sửa dòng log của mình;
// dòng đã được leader chấm điểm sẽ bị khóa (rule chặn cả phía server).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import KpiLogTable from '../components/board/KpiLogTable';
import KpiReleaseInfoDialog from '../components/board/KpiReleaseInfoDialog';
import KpiRulesPreviewDialog from '../components/board/KpiRulesPreviewDialog';
import { get, ref } from 'firebase/database';
import { useKpiSheet } from '../hooks/useKpiSheet';
import { db } from '../lib/firebase';
import { completeEstMessage, completeEstTask } from '../lib/estKpiSync';
import type { EstGroup, EstLogs, KpiEstRef } from '../estTypes';
import { addDays, isoLocal, mondayOf, weekdayVN } from '../lib/pmDates';
import { formatDateVi } from '../lib/reportFormat';
import { DEFAULT_KPI_RULES, type KpiRelease } from '../kpiTypes';

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

  // Thông báo kết quả chốt task estimate (done + điểm gợi ý) — tự ẩn sau 6s.
  const [estNotice, setEstNotice] = useState('');
  useEffect(() => {
    if (!estNotice) return;
    const t = window.setTimeout(() => setEstNotice(''), 6000);
    return () => window.clearTimeout(t);
  }, [estNotice]);

  // Tick "Hoàn thành task estimate" trên dòng log → dòng đó là DÒNG CHỐT:
  // set sub task done + điền điểm gợi ý vào chính dòng này (1 update nguyên tử).
  const onCompleteEst = async (
    estRef: KpiEstRef,
    entryId: string,
    entryMin: number | null,
  ) => {
    if (!db) return;
    try {
      const snap = await get(ref(db, `shared/est/${estRef.estId}`));
      const val = snap.val() as {
        groups?: Record<string, EstGroup>;
        logs?: EstLogs;
      } | null;
      const task = val?.groups?.[estRef.groupId]?.tasks?.[estRef.taskId];
      if (!task) return;
      const result = await completeEstTask({
        estId: estRef.estId,
        groupId: estRef.groupId,
        taskId: estRef.taskId,
        task,
        logs: val?.logs,
        kpiToken: token,
        entryId,
        entryMin,
      });
      setEstNotice(completeEstMessage(result));
    } catch {
      setWriteError('Không chốt được task estimate (bảng có thể đã khóa).');
    }
  };
  // Dialog xem quy chế (chỉ đọc) — sheet cũ chưa có snapshot thì fallback quy chế gốc.
  const [rulesOpen, setRulesOpen] = useState(false);
  const rules =
    sheet.meta?.rules && sheet.meta.rules.length > 0
      ? sheet.meta.rules
      : DEFAULT_KPI_RULES;

  // Mốc release sắp tới của các app được gán (snapshot trong meta.releases):
  // lọc lại từ hôm nay lúc render (snapshot có thể cũ), mặc định hiện 2 mốc gần nhất.
  const [relOpen, setRelOpen] = useState(false);
  // Mốc đang xem chi tiết trong dialog (null = đóng).
  const [relDetail, setRelDetail] = useState<KpiRelease | null>(null);
  const today = isoLocal(new Date());
  const weekStart = mondayOf(today);
  const weekEnd = addDays(weekStart, 6);
  const releases = (sheet.meta?.releases ?? []).filter((r) => r.date >= today);
  const visibleReleases = relOpen ? releases : releases.slice(0, 2);

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
          {releases.length > 0 && (
            <div className="kpi-releases">
              <span className="muted">🚀 Release sắp tới:</span>
              {visibleReleases.map((r, i) => (
                <button
                  type="button"
                  key={`${r.app}-${r.date}-${i}`}
                  className={
                    // Mốc nằm trong tuần hiện tại → highlight khác biệt.
                    r.date >= weekStart && r.date <= weekEnd
                      ? 'kpi-rel-chip kpi-rel-week'
                      : 'kpi-rel-chip'
                  }
                  title="Xem chi tiết các task trong release"
                  onClick={() => setRelDetail(r)}
                >
                  {r.app}
                  {r.version ? ` ${r.version}` : ''} · {weekdayVN(r.date)} {formatDateVi(r.date)}
                </button>
              ))}
              {releases.length > 2 && (
                <button
                  type="button"
                  className="doc-action kpi-rel-toggle"
                  onClick={() => setRelOpen((v) => !v)}
                >
                  {relOpen ? '▴ Thu gọn' : `+${releases.length - 2} ▾`}
                </button>
              )}
            </div>
          )}
          {(sheet.meta?.estimates?.length ?? 0) > 0 && (
            <div className="kpi-releases">
              <span className="muted">📐 Bảng estimate:</span>
              {sheet.meta!.estimates!.map((e) => (
                <Link
                  key={e.id}
                  className="kpi-rel-chip"
                  to={`/share/est/${e.id}?t=${token}`}
                  title="Mở bảng break task & estimate"
                >
                  {e.title}
                </Link>
              ))}
            </div>
          )}
          {locked && (
            <p className="warn kpi-locked-banner">
              🔒 Trang đã bị khóa — chỉ xem, không sửa được. Liên hệ leader nếu cần mở lại.
            </p>
          )}
          {writeError && <p className="warn kpi-write-error">{writeError}</p>}
          {estNotice && <p className="muted kpi-locked-banner">{estNotice}</p>}
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
            weekPlans={sheet.weekPlans}
            onSaveWeekPlan={sheet.setWeekPlan}
            estimates={sheet.meta?.estimates}
            releases={sheet.meta?.releases}
            kpiMemberId={sheet.meta?.memberId}
            kpiMemberName={sheet.meta?.memberName}
            onCompleteEst={onCompleteEst}
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
      {relDetail && (
        <KpiReleaseInfoDialog release={relDetail} onClose={() => setRelDetail(null)} />
      )}
    </div>
  );
}
