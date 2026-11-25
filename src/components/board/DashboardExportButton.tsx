// Nút "Export dashboard" (tab Manager): dựng trang HTML tổng hợp việc tuần này theo khung app
// của Manager → xem trước → upload / ghi đè 1 tài liệu cố định trong folder General của Docs.
// DocumentsProvider CHỈ mount khi dialog mở (nó onValue toàn bộ tài liệu kèm content, vài MB) —
// không bọc cả route /board/report.
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePm, useReleaseKeys } from '../../context/PmContext';
import { DocumentsProvider, useDocuments } from '../../context/DocumentsContext';
import HtmlFrame from '../HtmlFrame';
import KpiDialog from './KpiDialog';
import DashboardRowsDialog from './DashboardRowsDialog';
import { EstSnackbar, useEstNotice } from './EstSheetTable';
import { IcCheck, IcCopy, IcExternal, IcRules, IcTrendUp, IcWarn } from './ksumIcons';
import {
  buildDashboardData,
  buildDashboardHtml,
  DASHBOARD_DOC_TITLE,
  DASHBOARD_FOLDER_ID,
  resolveDashboardRows,
} from '../../lib/dashboardExport';
import { isoLocal } from '../../lib/pmDates';
import { escHtml } from '../../lib/planItems';
import { formatDayMonth } from '../../lib/reportFormat';

export default function DashboardExportButton() {
  // 'export' | 'rows' | null — dialog khung app thay chỗ dialog export, đóng thì quay lại.
  const [open, setOpen] = useState<'export' | 'rows' | null>(null);
  return (
    <>
      <button type="button" className="kml-btn kml-btn-outlined" onClick={() => setOpen('export')}>
        <IcTrendUp size={18} />
        Export dashboard
      </button>
      {/* Provider giữ nguyên khi chuyển qua lại 2 dialog → không tải lại toàn bộ tài liệu. */}
      {open && (
        <DocumentsProvider>
          {open === 'export' ? (
            <ExportDialog onClose={() => setOpen(null)} onEditRows={() => setOpen('rows')} />
          ) : (
            <DashboardRowsDialog onClose={() => setOpen('export')} />
          )}
        </DocumentsProvider>
      )}
    </>
  );
}

function ExportDialog({ onClose, onEditRows }: { onClose: () => void; onEditRows: () => void }) {
  const { plans, reports, tasks, apps, meta } = usePm();
  const releaseKeys = useReleaseKeys();
  const { documents, folders, loading: docsLoading, addDocuments, updateDocument } = useDocuments();
  const { notice, notify } = useEstNotice();
  // Mốc "cập nhật lúc" chốt khi mở dialog → bản xem trước và bản upload giống hệt nhau.
  const [generatedAt] = useState(() => new Date());
  const [done, setDone] = useState<{ docId: string; replaced: boolean } | null>(null);
  const writing = useRef(false);

  const today = isoLocal(generatedAt);
  const plan = plans.find((p) => p.weekStart <= today && today <= p.weekEnd);

  // Bộ chuyển Markdown → HTML (mô tả task trong dialog Dự kiến của file export): import động,
  // chỉ tải khi mở dialog. Lỗi tải → mô tả giữ dạng chữ thô (escape, giữ xuống dòng).
  const [mdToHtml, setMdToHtml] = useState<((md: string) => string) | null>(null);
  useEffect(() => {
    let alive = true;
    import('../../lib/mdStatic')
      .then((m) => alive && setMdToHtml(() => m.mdToHtml))
      .catch(() => alive && setMdToHtml(() => (md: string) => `<p style="white-space:pre-wrap">${escHtml(md)}</p>`));
    return () => {
      alive = false;
    };
  }, []);

  const html = useMemo(() => {
    if (!plan || !mdToHtml) return '';
    const data = buildDashboardData({
      plan,
      plans,
      reports,
      tasks,
      apps,
      rows: resolveDashboardRows(meta.dashboardRows, apps),
      releaseKeys,
      generatedAt,
    });
    // Chỉ chuyển mô tả của task đang nằm trong cột Dự kiến.
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const descHtml = new Map<string, string>();
    for (const r of [...data.rows, ...data.other])
      for (const f of r.future) {
        const d = f.taskId ? taskById.get(f.taskId)?.description?.trim() : '';
        if (d && !descHtml.has(f.taskId)) descHtml.set(f.taskId, mdToHtml(d));
      }
    return buildDashboardHtml(data, {
      tasks: taskById,
      descHtml,
      appName: (id) => apps.find((a) => a.id === id)?.name ?? '',
    });
  }, [plan, plans, reports, tasks, apps, meta.dashboardRows, releaseKeys, generatedAt, mdToHtml]);

  const folder = folders.find((f) => f.id === DASHBOARD_FOLDER_ID);
  const titleKey = DASHBOARD_DOC_TITLE.toLowerCase();
  const existing = documents
    .filter((d) => d.folderId === DASHBOARD_FOLDER_ID && d.title.trim().toLowerCase() === titleKey)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))[0];

  const blocker = !plan
    ? 'Chưa có plan cho tuần này. Tạo Plan tuần trước rồi mới export dashboard.'
    : docsLoading
      ? ''
      : !folder
        ? 'Không tìm thấy folder General đích trên Docs (có thể đã bị xoá). Không upload được.'
        : '';

  const upload = () => {
    if (writing.current || docsLoading || blocker || !html) return;
    writing.current = true;
    try {
      if (existing) {
        updateDocument(existing.id, { content: html, type: 'html' });
        setDone({ docId: existing.id, replaced: true });
        return;
      }
      const made = addDocuments(
        [{ type: 'html', title: DASHBOARD_DOC_TITLE, content: html }],
        DASHBOARD_FOLDER_ID,
      )[0];
      if (!made) {
        notify({ text: 'Không upload được (thiếu cấu hình Firebase).', kind: 'error' });
        return;
      }
      setDone({ docId: made.id, replaced: false });
    } finally {
      writing.current = false;
    }
  };

  if (done) {
    // Copy link chỉ khi tài liệu đang chia sẻ: tự share → /share/d, nằm trong folder đang share → /share/f.
    const doc = documents.find((d) => d.id === done.docId);
    const shareUrl = doc?.isShared
      ? `${window.location.origin}/share/d/${done.docId}`
      : folder?.isShared
        ? `${window.location.origin}/share/f/${folder.id}/${done.docId}`
        : '';
    return (
      <KpiDialog
        title={done.replaced ? 'Đã cập nhật dashboard' : 'Đã upload dashboard'}
        subtitle={`${folder?.name ?? 'General'} / ${DASHBOARD_DOC_TITLE}`}
        icon={<IcCheck size={20} />}
        tone="pos"
        onClose={onClose}
        actions={
          <>
            {shareUrl && (
              <button
                type="button"
                className="kml-btn kml-btn-text"
                onClick={() => {
                  navigator.clipboard
                    .writeText(shareUrl)
                    .then(() => notify({ text: 'Đã copy link chia sẻ' }))
                    .catch(() =>
                      notify({ text: `Không copy được — link: ${shareUrl}`, kind: 'error' }, 12000),
                    );
                }}
              >
                <IcCopy size={18} />
                Copy link
              </button>
            )}
            <button
              type="button"
              className="kml-btn kml-btn-filled"
              onClick={() => {
                window.open(`/docs/view/document/${done.docId}`, '_blank', 'noopener');
                onClose();
              }}
            >
              <IcExternal size={18} />
              Mở tài liệu
            </button>
          </>
        }
      >
        <p>
          {done.replaced
            ? 'Đã ghi đè nội dung mới lên tài liệu cũ, link chia sẻ giữ nguyên.'
            : 'Đã tạo tài liệu mới. Các lần export sau sẽ ghi đè lên tài liệu này.'}
          {!shareUrl && ' Tài liệu chưa bật chia sẻ — bật ở trang Docs nếu cần gửi link.'}
        </p>
        <EstSnackbar notice={notice} onClose={() => notify(null)} />
      </KpiDialog>
    );
  }

  return (
    <KpiDialog
      title="Dashboard Manager"
      subtitle={
        plan
          ? `Tuần ${formatDayMonth(plan.weekStart)} – ${formatDayMonth(plan.weekEnd)} · ${folder?.name ?? 'General'} / ${DASHBOARD_DOC_TITLE}`
          : undefined
      }
      icon={<IcTrendUp size={20} />}
      wide
      className="dash-exp"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="kml-btn kml-btn-text dash-exp-rows" onClick={onEditRows}>
            <IcRules size={18} />
            Khung app
          </button>
          <button type="button" className="kml-btn kml-btn-text" onClick={onClose}>
            Huỷ
          </button>
          <button
            type="button"
            className="kml-btn kml-btn-filled"
            disabled={docsLoading || !!blocker || !html}
            onClick={upload}
          >
            {docsLoading ? 'Đang tải Docs…' : existing ? 'Ghi đè trên Docs' : 'Upload lên Docs'}
          </button>
        </>
      }
    >
      {blocker ? (
        <p className="dash-exp-warn">
          <IcWarn size={18} />
          {blocker}
        </p>
      ) : (
        <p className="dash-exp-note">
          {docsLoading
            ? 'Đang kiểm tra tài liệu trên Docs…'
            : existing
              ? 'Đã có dashboard trong folder: bấm Ghi đè để cập nhật nội dung, link chia sẻ giữ nguyên.'
              : 'Chưa có dashboard trong folder: bấm Upload để tạo mới.'}
        </p>
      )}
      {html ? (
        <div className="dash-exp-pv">
          <HtmlFrame value={html} />
        </div>
      ) : (
        plan && <p className="muted">Đang dựng bản xem trước…</p>
      )}
      <EstSnackbar notice={notice} onClose={() => notify(null)} />
    </KpiDialog>
  );
}
