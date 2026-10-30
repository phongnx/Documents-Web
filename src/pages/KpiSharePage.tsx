// Trang log KPI của member — truy cập công khai qua link riêng /share/kpi/:token
// (capability URL, KHÔNG cần đăng nhập). Member tự thêm/sửa dòng log của mình;
// dòng đã được leader chấm điểm sẽ bị khóa (rule chặn cả phía server).
// Bản redesign Material 3: header gọn, dải release dạng chip, thông báo dạng snackbar.
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import KpiMemberLog, { type KpiNotice } from '../components/board/KpiMemberLog';
import KpiReleaseInfoDialog from '../components/board/KpiReleaseInfoDialog';
import KpiRulesPreviewDialog from '../components/board/KpiRulesPreviewDialog';
import { shortDay } from '../components/board/KpiLogEditor';
import {
  IcAlert,
  IcChevronDown,
  IcChevronUp,
  IcClose,
  IcLinkOff,
  IcLock,
  IcRocket,
  IcRuler,
  IcRules,
} from '../components/board/ksumIcons';
import { get, ref } from 'firebase/database';
import { useKpiSheet } from '../hooks/useKpiSheet';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { db } from '../lib/firebase';
import { completeEstMessage, completeEstTask } from '../lib/estKpiSync';
import type { EstGroup, EstLogs, KpiEstRef } from '../estTypes';
import { addDays, isoLocal, mondayOf } from '../lib/pmDates';
import { DEFAULT_KPI_RULES, type KpiRelease } from '../kpiTypes';

export default function KpiSharePage() {
  const { token } = useParams();
  const narrow = useMediaQuery('(max-width: 839px)');
  const [monthKey, setMonthKey] = useState(isoLocal(new Date()).slice(0, 7));

  // Snackbar: lỗi ghi giữ tới khi đóng; thông báo thường tự ẩn sau 5s (chốt estimate 8s).
  const [notice, setNotice] = useState<KpiNotice | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const notify = (n: KpiNotice | null) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(n);
    if (n && !n.persistent && n.kind !== 'error')
      noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
  };
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);
  const onWriteError = (text: string) => notify({ text, kind: 'error' });

  const sheet = useKpiSheet(token, onWriteError, monthKey);
  const locked = sheet.meta?.locked === true;

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
      window.clearTimeout(noticeTimer.current);
      setNotice({ text: completeEstMessage(result) });
      noticeTimer.current = window.setTimeout(() => setNotice(null), 8000);
    } catch {
      notify({ text: 'Không chốt được task estimate (bảng có thể đã khóa).', kind: 'error' });
    }
  };
  // Dialog xem quy chế (chỉ đọc) — sheet cũ chưa có snapshot thì fallback quy chế gốc.
  const [rulesOpen, setRulesOpen] = useState(false);
  const rules =
    sheet.meta?.rules && sheet.meta.rules.length > 0
      ? sheet.meta.rules
      : DEFAULT_KPI_RULES;

  // Mốc release sắp tới của các app được gán (snapshot trong meta.releases):
  // lọc lại từ hôm nay lúc render (snapshot có thể cũ). Mặc định hiện 3 mốc gần nhất
  // (màn hẹp 1 mốc), bấm "+N" để xem hết.
  const [relOpen, setRelOpen] = useState(false);
  // Mốc đang xem chi tiết trong dialog (null = đóng).
  const [relDetail, setRelDetail] = useState<KpiRelease | null>(null);
  const today = isoLocal(new Date());
  const weekStart = mondayOf(today);
  const weekEnd = addDays(weekStart, 6);
  const releases = (sheet.meta?.releases ?? []).filter((r) => r.date >= today);
  const relLimit = narrow ? 1 : 3;
  const visibleReleases = relOpen ? releases : releases.slice(0, relLimit);

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

  const ready = sheet.state === 'ready';

  return (
    <div className="container kml-page">
      <header className="kml-topbar">
        <div className="kml-topbar-title">
          <h1>{sheet.meta ? `KPI log của ${sheet.meta.memberName}` : 'KPI log'}</h1>
          {ready && (
            <p>
              <IcLock size={13} />
              {narrow ? 'Link riêng — không chia sẻ' : 'Link riêng — không chia sẻ cho người khác'}
            </p>
          )}
        </div>
        <div className="kml-topbar-actions">
          {ready &&
            token &&
            // Lối vào LUÔN có (kể cả chưa tham gia bảng nào) — trang Estimate liệt kê task
            // các app được gán, task nào leader đã mở bảng thì click vào được.
            (narrow ? (
              <Link
                to={`/share/kpi/${token}/estimates`}
                className="kml-iconbtn"
                aria-label="Estimate của tôi"
                title="Task các app được gán + bảng estimate của từng task"
              >
                <IcRuler size={20} />
              </Link>
            ) : (
              <Link
                to={`/share/kpi/${token}/estimates`}
                className="kml-btn kml-btn-text"
                title="Task các app được gán + bảng estimate của từng task"
              >
                <IcRuler size={16} />
                Estimate của tôi
              </Link>
            ))}
          {ready &&
            (narrow ? (
              <button
                type="button"
                className="kml-iconbtn"
                aria-label="Quy chế chấm điểm"
                onClick={() => setRulesOpen(true)}
              >
                <IcRules size={20} />
              </button>
            ) : (
              <button type="button" className="kml-btn kml-btn-text" onClick={() => setRulesOpen(true)}>
                <IcRules size={16} />
                Quy chế
              </button>
            ))}
          <ThemeToggle className="kml-iconbtn" />
        </div>
      </header>

      {sheet.state === 'loading' && <p className="k-muted">Đang tải…</p>}
      {sheet.state === 'notfound' && (
        <div className="kml-card kml-empty">
          <span className="kml-empty-ic">
            <IcLinkOff size={32} />
          </span>
          <h2>Không mở được trang này</h2>
          <p>Trang không tồn tại hoặc leader đã ngừng chia sẻ. Liên hệ leader để lấy link mới.</p>
        </div>
      )}
      {ready && (
        <>
          {releases.length > 0 && (
            <div className={`kml-rels${relOpen ? ' is-open' : ''}`} role="group" aria-label="Release sắp tới">
              <span className={narrow ? 'k-sr' : 'kml-rels-label'}>Release sắp tới</span>
              {visibleReleases.map((r, i) => (
                <button
                  type="button"
                  key={`${r.app}-${r.date}-${i}`}
                  // Mốc nằm trong tuần hiện tại → tô nền khác biệt.
                  className={`kml-chip${r.date >= weekStart && r.date <= weekEnd ? ' is-week' : ''}`}
                  title="Xem chi tiết các task trong release"
                  onClick={() => setRelDetail(r)}
                >
                  <IcRocket size={15} />
                  <span className="kml-ellipsis">
                    {r.app}
                    {r.version ? ` ${r.version}` : ''}
                  </span>
                  <span className="kml-chip-sub">{shortDay(r.date)}</span>
                </button>
              ))}
              {releases.length > relLimit && (
                <button
                  type="button"
                  className="kml-chip"
                  aria-expanded={relOpen}
                  onClick={() => setRelOpen((v) => !v)}
                >
                  {relOpen ? 'Thu gọn' : `+${releases.length - relLimit}`}
                  {relOpen ? <IcChevronUp size={14} /> : <IcChevronDown size={14} />}
                </button>
              )}
            </div>
          )}
          {locked && (
            <div className="kml-banner" role="status">
              <IcLock size={20} />
              <span>Trang đã bị khóa — chỉ xem, không sửa được. Liên hệ leader nếu cần mở lại.</span>
            </div>
          )}
          <KpiMemberLog
            entries={sheet.entries}
            entriesLoading={sheet.entriesLoading}
            scores={sheet.scores}
            monthKey={monthKey}
            onMonthChange={setMonthKey}
            categories={sheet.meta?.categories ?? []}
            projectNames={sheet.meta?.projectNames ?? []}
            projectIds={sheet.meta?.projectIds}
            strictProjects={sheet.meta?.strictProjects === true}
            leaves={sheet.leaves}
            weekPlans={sheet.weekPlans}
            onSaveWeekPlan={sheet.setWeekPlan}
            estimates={sheet.meta?.estimates}
            tasks={sheet.tasks}
            kpiMemberId={sheet.meta?.memberId}
            kpiMemberName={sheet.meta?.memberName}
            onCompleteEst={onCompleteEst}
            locked={locked}
            onAdd={sheet.addEntry}
            onUpdate={sheet.updateEntry}
            onDelete={sheet.deleteEntry}
            notify={notify}
          />
        </>
      )}

      {notice && (
        <div className={`kml-snack${notice.kind === 'error' ? ' is-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.kind === 'error' && <IcAlert size={18} />}
          <span className="kml-snack-text">{notice.text}</span>
          <button
            type="button"
            className="kml-iconbtn is-inverse"
            aria-label="Đóng thông báo"
            onClick={() => {
              window.clearTimeout(noticeTimer.current);
              setNotice(null);
            }}
          >
            <IcClose size={18} />
          </button>
        </div>
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
