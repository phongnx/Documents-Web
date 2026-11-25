// Mảnh UI dùng chung cho tab Manager (danh sách app + trang chi tiết app): 1 nhánh plan tuần,
// cột task dự kiến + dialog chi tiết, 1 dòng task sửa được (cùng markup trang Task).
import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import KpiDialog from './KpiDialog';
import MarkdownPreview from '../MarkdownPreview';
import { IcCalendarNext } from './ksumIcons';
import { statusMeta, type TaskItem, type WorkstreamState } from '../../pmTypes';
import {
  dashStateLabel,
  futureDay,
  shortDay,
  taskDate,
  type DashFuture,
  type DashItem,
  type DashRowData,
} from '../../lib/dashboardExport';
import { formatDay } from '../../lib/formatDate';
import { descLines } from '../../lib/pmText';

const ST_CLS: Record<WorkstreamState, string> = {
  todo: 'st-todo',
  doing: 'st-doing',
  testing: 'st-fix',
  done: 'st-done',
  blocked: 'st-block',
};

/** 1 nhánh plan tuần: Loại · tiêu đề · trạng thái, mục tiêu + mốc, thanh %, đầu việc. */
export function MgrItem({
  it,
  showProject,
  children,
}: {
  it: DashItem;
  showProject?: boolean;
  /** Nội dung thêm dưới nhánh (VD task nguồn ở trang chi tiết). */
  children?: ReactNode;
}) {
  const st = dashStateLabel(it.state);
  const meta = [it.target ? `🎯 ${it.target}` : '', it.date ? `Mốc ${shortDay(it.date)}` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={`mgr-it${it.state === 'done' ? ' is-done' : ''}`}>
      <div className="mgr-it-h">
        <span className={`mgr-cat${it.release ? ' is-rel' : ''}`}>{it.category}</span>
        <b>{showProject && it.project ? `${it.project} · ${it.title}` : it.title}</b>
        <span className={`task-badge ${ST_CLS[it.state]}`}>
          {st.icon} {st.label}
        </span>
      </div>
      {meta && <div className="mgr-it-meta">{meta}</div>}
      <div className="mgr-it-bar">
        <span className="mgr-bar" role="img" aria-label={`Tiến độ ${it.pct}%`}>
          <i style={{ width: `${it.pct}%` }} />
        </span>
        <span className="mgr-pct">{it.pct}%</span>
      </div>
      {it.itemsHtml && (
        <details className="mgr-details">
          <summary>Đầu việc</summary>
          {/* HTML đã escape trong renderItemsHtml (planItems) — chỉ dựng cấp bậc ul/li. */}
          <div dangerouslySetInnerHTML={{ __html: it.itemsHtml }} />
        </details>
      )}
      {children}
    </div>
  );
}

/** Cột 🕒 Dự kiến: hiện `limit` mục đầu; bấm 1 mục (hoặc "+N") → mở dialog chi tiết
 *  (`onOpen` nhận chỉ số mục trong `list` để dialog cuộn tới đúng thẻ). */
export function MgrFuture({
  list,
  limit = 3,
  onOpen,
}: {
  list: DashFuture[];
  limit?: number;
  onOpen: (index: number) => void;
}) {
  if (list.length === 0) return <span className="muted">—</span>;
  return (
    <div className="mgr-fut">
      <ul>
        {list.slice(0, limit).map((f, i) => (
          <li key={`${f.taskId}-${i}`}>
            <button type="button" className="mgr-fut-btn" onClick={() => onOpen(i)}>
              <span className={`mgr-fut-d${f.date ? '' : ' is-nodate'}`}>🕒 {futureDay(f.date)}</span>{' '}
              {f.title}
              {f.note && <span className="muted"> ({f.note})</span>}
            </button>
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <button type="button" className="mgr-more" onClick={() => onOpen(limit)}>
          +{list.length - limit} task nữa
        </button>
      )}
    </div>
  );
}

/** Dialog "Task dự kiến" của 1 dòng: tách nhóm như trang chi tiết app (Dự kiến / Plan các
 *  tuần sau / Chưa có ngày), mỗi task 1 thẻ đầy đủ (mô tả Markdown), cuộn tới mục vừa bấm. */
export function MgrFutureDialog({
  row,
  focus,
  tasks,
  appName,
  narrow,
  onEdit,
  onClose,
}: {
  row: DashRowData;
  /** Chỉ số mục trong row.future vừa bấm. */
  focus: number;
  tasks: Map<string, TaskItem>;
  appName: (id: string) => string;
  narrow: boolean;
  onEdit: (t: TaskItem) => void;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // Cuộn tới thẻ vừa bấm 1 lần lúc mở (sửa task xong quay lại cũng cuộn lại đúng thẻ).
  useEffect(() => {
    bodyRef.current
      ?.querySelector(`[data-fi="${focus}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [focus]);

  // Giữ chỉ số gốc (data-fi) để khớp mục vừa bấm; task đã bị xoá ở nơi khác → bỏ.
  const entries = row.future
    .map((f, i) => ({ f, i, t: f.taskId ? tasks.get(f.taskId) : undefined }))
    .filter((e) => !e.f.taskId || e.t);
  const groups: { title: string; hint: string; list: typeof entries }[] = [
    {
      title: '🕒 Dự kiến',
      hint: 'Chưa bắt đầu, ngày sau tuần này.',
      list: entries.filter((e) => e.t && e.f.date),
    },
    {
      title: 'Plan các tuần sau',
      hint: 'Nhánh chưa xong trong plan của các tuần sau.',
      list: entries.filter((e) => !e.f.taskId),
    },
    {
      title: 'Chưa có ngày',
      hint: 'Chưa bắt đầu, chưa điền Ngày plan / Ngày bắt đầu.',
      list: entries.filter((e) => e.t && !e.f.date),
    },
  ];
  const multiApp = row.appIds.length > 1;
  const firstApp = row.appIds[0];

  return (
    <KpiDialog
      title={`Task dự kiến · ${row.label}`}
      subtitle={`${entries.length} mục`}
      icon={<IcCalendarNext size={20} />}
      wide
      scrollBody
      fullscreen={narrow}
      className="mgr-fdlg"
      onClose={onClose}
      actions={
        <>
          {firstApp && (
            <Link className="kml-btn kml-btn-text" to={`/board/manager/${firstApp}`}>
              Mở trang app ›
            </Link>
          )}
          <button type="button" className="kml-btn kml-btn-filled" onClick={onClose}>
            Đóng
          </button>
        </>
      }
    >
      <div ref={bodyRef}>
        {groups.map(
          (g) =>
            g.list.length > 0 && (
              <section key={g.title} className="mgr-fsec">
                <h3 className="mgr-fsec-h">
                  {g.title} <span className="muted">({g.list.length})</span>
                </h3>
                <p className="muted mgr-hint">{g.hint}</p>
                {g.list.map(({ f, i, t }) => (
                  <article
                    key={i}
                    data-fi={i}
                    className={`mgr-fcard${i === focus ? ' is-focus' : ''}`}
                  >
                    <div className="mgr-fcard-h">
                      <b className="mgr-fcard-t">{t ? t.title : f.title}</b>
                      {t && (
                        <button
                          type="button"
                          className="doc-action"
                          title="Sửa task"
                          aria-label={`Sửa task ${t.title}`}
                          onClick={() => onEdit(t)}
                        >
                          ✏️
                        </button>
                      )}
                    </div>
                    <div className="task-tags mgr-fcard-tags">
                      {multiApp && f.appId && (
                        <span className="task-badge type">{appName(f.appId)}</span>
                      )}
                      {t ? (
                        <>
                          <span className="task-badge type">{t.type}</span>
                          <span className={`task-badge ${statusMeta(t.status).badgeClass}`}>
                            {t.status}
                          </span>
                          {t.version && <span className="task-badge ver">{t.version}</span>}
                          <span className="muted task-plan">
                            📅 {f.date ? formatDay(f.date) : 'chưa có ngày'}
                          </span>
                        </>
                      ) : (
                        <span className="muted task-plan">🕒 {f.note}</span>
                      )}
                    </div>
                    {t && t.description?.trim() && (
                      <div className="mgr-fcard-b">
                        <MarkdownPreview content={t.description} />
                      </div>
                    )}
                    {!t && f.itemsHtml && (
                      <div
                        className="mgr-fcard-b mgr-details"
                        // HTML đã escape trong renderItemsHtml (planItems) — chỉ dựng cấp bậc ul/li.
                        dangerouslySetInnerHTML={{ __html: f.itemsHtml }}
                      />
                    )}
                  </article>
                ))}
              </section>
            ),
        )}
        {entries.length === 0 && <p className="muted">Không còn task dự kiến.</p>}
      </div>
    </KpiDialog>
  );
}

/** 1 dòng task — cùng markup/CSS với trang Task (task-row), bấm để sửa, ✏️ / 🗑️ bên phải. */
export function MgrTaskRow({
  t,
  flag,
  onEdit,
  onDelete,
}: {
  t: TaskItem;
  /** Nhãn cảnh báo thêm (VD "⚠ quá hạn"). */
  flag?: string;
  onEdit: (t: TaskItem) => void;
  onDelete: (t: TaskItem) => void;
}) {
  const preview = descLines(t).slice(0, 2);
  const d = taskDate(t);
  return (
    <li className="task-row">
      <button type="button" className="task-main" onClick={() => onEdit(t)}>
        <span className="task-head">
          <span className="task-title">{t.title}</span>
          <span className="task-tags">
            {flag && <span className="mgr-flag">{flag}</span>}
            <span className="task-badge type">{t.type}</span>
            <span className={`task-badge ${statusMeta(t.status).badgeClass}`}>{t.status}</span>
            {t.version && <span className="task-badge ver">{t.version}</span>}
            {d && <span className="muted task-plan">📅 {formatDay(d)}</span>}
          </span>
        </span>
        {preview.length > 0 && (
          <span className="task-preview">
            {preview.map((ln, i) => (
              <span key={i} className="task-desc-line">
                {ln}
              </span>
            ))}
          </span>
        )}
      </button>
      <div className="doc-line-actions">
        <button type="button" className="doc-action" title="Sửa task" onClick={() => onEdit(t)}>
          ✏️
        </button>
        <button
          type="button"
          className="doc-action danger"
          title="Xóa task"
          onClick={() => onDelete(t)}
        >
          🗑️
        </button>
      </div>
    </li>
  );
}
