// Trang bảng Break task & Estimate cho MEMBER — truy cập ẩn danh qua link trong trang
// KPI riêng của member (/share/est/:id?t={kpiToken}). Draft: member tự break task +
// điền est; Approved: chỉ đổi status/note sub task của mình; tick done → dòng log chốt
// bên bảng KPI tự nhận điểm gợi ý (completeEstTask).
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import ThemeToggle from '../components/ThemeToggle';
import EstSheetTable from '../components/board/EstSheetTable';
import { useEstSheet } from '../hooks/useEstSheet';
import { completeEstMessage, completeEstTask } from '../lib/estKpiSync';
import { db } from '../lib/firebase';
import type { KpiSheetMeta } from '../kpiTypes';
import { estAutoEndDate, type EstSubTask, type EstTaskStatus } from '../estTypes';
import { formatDateVi } from '../lib/reportFormat';

export default function EstimateSharePage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const kpiToken = params.get('t') ?? undefined;

  const [writeError, setWriteError] = useState('');
  useEffect(() => {
    if (!writeError) return;
    const t = window.setTimeout(() => setWriteError(''), 5000);
    return () => window.clearTimeout(t);
  }, [writeError]);
  const [notice, setNotice] = useState('');

  const sheet = useEstSheet(id, setWriteError);

  // Nhận diện member đang xem qua token KPI (?t) — để UI chỉ mở phần của họ.
  const [viewer, setViewer] = useState<{ id?: string; name?: string }>({});
  useEffect(() => {
    if (!db || !kpiToken) return;
    get(ref(db, `shared/kpi/${kpiToken}/meta`))
      .then((snap) => {
        const m = snap.val() as KpiSheetMeta | null;
        if (m) setViewer({ id: m.memberId, name: m.memberName });
      })
      .catch(() => {});
  }, [kpiToken]);

  // Tiêu đề tab theo bảng.
  useEffect(() => {
    const prev = document.title;
    if (sheet.meta) document.title = `Estimate · ${sheet.meta.title}`;
    return () => {
      document.title = prev;
    };
  }, [sheet.meta]);

  // taskOverride = bản vừa sửa trong dialog (est mới nhất, state chưa kịp dội về).
  const onSetStatus = async (
    gid: string,
    tid: string,
    status: EstTaskStatus,
    taskOverride?: EstSubTask,
  ) => {
    const task = taskOverride ?? sheet.groups[gid]?.tasks?.[tid];
    if (!task) return;
    if (status !== 'done') {
      sheet.setTaskStatus(gid, tid, status);
      return;
    }
    const result = await completeEstTask({
      estId: id,
      groupId: gid,
      taskId: tid,
      task,
      logs: sheet.logs,
      kpiToken,
    });
    setNotice(completeEstMessage(result));
    window.setTimeout(() => setNotice(''), 6000);
  };

  if (!db) {
    return (
      <div className="container">
        <p className="warn">Không tải được trang (thiếu cấu hình Firebase).</p>
      </div>
    );
  }

  const meta = sheet.meta;
  const draft = meta?.state === 'draft';
  // End tay thắng; trống → End dự kiến từ tổng est (max theo assignee, 8h/ngày).
  const autoEnd = meta?.endDate
    ? null
    : estAutoEndDate(meta?.startDate, meta?.holidays, sheet.groups);

  return (
    <div className="container kpi-share-view">
      <header className="share-header">
        <span className="brand">
          📐 Estimate{meta ? ` · ${meta.title}` : ''}
          {meta?.version && <span className="task-badge ver">{meta.version}</span>}
        </span>
        <div className="share-header-actions">
          {kpiToken && (
            <Link to={`/share/kpi/${kpiToken}`} className="board-docs-link">
              📝 Bảng KPI của tôi
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      {sheet.state === 'loading' && <p className="muted">Đang tải…</p>}
      {sheet.state === 'notfound' && (
        <p className="muted empty">
          Bảng không tồn tại hoặc đã bị xóa. Liên hệ leader để lấy link mới.
        </p>
      )}
      {sheet.state === 'ready' && meta && (
        <>
          <p className="muted est-range">
            <span className={`task-badge ${draft ? 'st-doing' : 'st-done'}`}>
              {draft
                ? 'Draft — tự break task + điền est, leader sẽ duyệt & chốt'
                : 'Đã duyệt — est đóng băng, chỉ cập nhật status/note task của bạn'}
            </span>
            {meta.locked && <span className="task-badge st-block">🔒 Đã khóa — chỉ xem</span>}
            {(meta.startDate || meta.endDate) && (
              <>
                {' '}
                · {meta.startDate ? formatDateVi(meta.startDate) : '…'} –{' '}
                {meta.endDate
                  ? formatDateVi(meta.endDate)
                  : autoEnd
                    ? `${formatDateVi(autoEnd)} (dự kiến)`
                    : '…'}
              </>
            )}
            {meta.appName && ` · ${meta.appName}`}
          </p>

          {writeError && <p className="warn kpi-write-error">{writeError}</p>}
          {notice && <p className="muted kpi-locked-banner">{notice}</p>}

          <EstSheetTable
            mode="member"
            meta={meta}
            groups={sheet.groups}
            logs={sheet.logs}
            sheet={sheet}
            viewerId={viewer.id}
            viewerName={viewer.name}
            onSetStatus={onSetStatus}
          />

          <p className="muted kpi-share-hint">
            Giờ "Thực tế" tự cộng từ các dòng log trên bảng KPI có 📐 pick task của bảng
            này. Tick ✅ Xong → dòng log chốt tự nhận điểm KPI gợi ý (nhanh hơn est ≥20%
            = +1 · đạt (đến chậm ≤10%) = 0 · chậm 10–20% = −0.5 · chậm &gt;20% = −1) —
            leader xác nhận khi chấm.
          </p>
        </>
      )}
    </div>
  );
}
