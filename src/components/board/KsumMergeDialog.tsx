// Dialog "Gộp N mục" trên trang tổng kết KPI tháng (leader): dựng sẵn mục kết quả bằng
// cùng luật với Tối ưu bảng (`mergeSummaryRows`), leader sửa mọi ô rồi Lưu → trang thay
// các mục đã chọn bằng mục này (chỉ đổi trên form, bấm Lưu ở thanh trang mới ghi DB).
// Esc / bấm nền KHÔNG đóng để không mất nội dung đang sửa — chỉ Hủy hoặc ✕.
import { useMemo, useState } from 'react';
import type { KpiSummaryRow } from '../../kpiTypes';
import { formatDateVi } from '../../lib/reportFormat';
import { mergeSummaryRows } from '../../lib/kpiSummary';
import DateInputVi from '../DateInputVi';
import KsumConfirmDialog from './KsumConfirmDialog';
import { AutoTextarea } from './KpiSummaryTable';
import { IcMerge } from './ksumIcons';

interface Props {
  memberName: string;
  /** Các mục đã chọn, theo thứ tự trong bảng. */
  rows: KpiSummaryRow[];
  /** Danh mục giai đoạn (gợi ý cho ô Giai đoạn). */
  categories?: string[];
  onSave: (merged: KpiSummaryRow) => void;
  onCancel: () => void;
}

/** Giá trị khác nhau (bỏ rỗng, không phân biệt hoa/thường) — gợi ý cho ô datalist. */
const distinct = (values: (string | undefined)[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v?.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
};

export default function KsumMergeDialog({
  memberName,
  rows,
  categories,
  onSave,
  onCancel,
}: Props) {
  const [row, setRow] = useState<KpiSummaryRow>(() => mergeSummaryRows(rows));
  const [showSources, setShowSources] = useState(false);
  const patch = (p: Partial<KpiSummaryRow>) => setRow((r) => ({ ...r, ...p }));

  const hints = useMemo(
    () => ({
      category: distinct([...rows.map((r) => r.category), ...(categories ?? [])]),
      app: distinct(rows.map((r) => r.app)),
      milestone: distinct(rows.map((r) => r.milestone)),
    }),
    [rows, categories],
  );
  // Ô có giá trị khác nhau giữa các mục nguồn → nhắc leader kiểm lại.
  const differs = (k: 'category' | 'app' | 'milestone') =>
    distinct(rows.map((r) => r[k])).length > 1;

  const save = () => {
    // Bỏ field rỗng sau khi sửa (trang chuẩn hóa lại lần nữa khi ghi DB).
    const t = (s?: string) => (s?.trim() ? s : undefined);
    onSave({
      ...row,
      category: t(row.category),
      app: t(row.app),
      milestone: t(row.milestone),
      tasks: t(row.tasks),
      spans: t(row.spans),
      progress: t(row.progress),
      kpi: t(row.kpi),
      kpiNote: t(row.kpiNote),
    });
  };

  const field = (
    k: 'category' | 'app' | 'milestone',
    label: string,
  ) => (
    <label className="k-field">
      <span>
        {label}
        {differs(k) && <em className="k-merge-diff"> · các mục khác nhau</em>}
      </span>
      <input
        className="k-in"
        list={`ksum-merge-${k}`}
        value={row[k] ?? ''}
        onChange={(e) => patch({ [k]: e.target.value })}
      />
      <datalist id={`ksum-merge-${k}`}>
        {hints[k].map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </label>
  );

  return (
    <KsumConfirmDialog
      plain
      wide
      dismissible={false}
      tone="info"
      icon={<IcMerge size={18} />}
      title={`Gộp ${rows.length} mục của ${memberName}`}
      subtitle="Sửa mục kết quả rồi Lưu — mục này thay cho các mục đã chọn. Bấm Lưu ở thanh trang mới ghi."
      confirmLabel="Lưu mục đã gộp"
      onConfirm={save}
      onCancel={onCancel}
    >
      <div className="k-merge-grid k-merge-3">
        {field('category', 'Giai đoạn')}
        {field('app', 'App')}
        {field('milestone', 'Mốc')}
      </div>

      <label className="k-field">
        <span>Tasks</span>
        <AutoTextarea
          value={row.tasks ?? ''}
          onChange={(v) => patch({ tasks: v })}
          ariaLabel="Tasks"
          minRows={3}
        />
      </label>

      <div className="k-merge-grid k-merge-time">
        {/* div thay label: ô ngày có nút lịch bên trong, label sẽ cướp click. */}
        <div className="k-field">
          <span>Start</span>
          <DateInputVi value={row.start} onChange={(v) => patch({ start: v })} ariaLabel="Start" />
        </div>
        <div className="k-field">
          <span>End</span>
          <DateInputVi value={row.end} onChange={(v) => patch({ end: v })} ariaLabel="End" />
        </div>
        <label className="k-field">
          <span>Ngày</span>
          <input
            className="k-in k-in-num"
            type="number"
            min={0}
            step={0.1}
            value={typeof row.days === 'number' ? String(row.days) : ''}
            onChange={(e) =>
              patch({ days: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label className="k-field">
          <span>Các đợt</span>
          <input
            className="k-in"
            value={row.spans ?? ''}
            onChange={(e) => patch({ spans: e.target.value })}
            placeholder="VD: 01/10 · 08/10–13/10"
          />
        </label>
      </div>

      <div className="k-merge-grid k-merge-2">
        <label className="k-field">
          <span>Tiến độ/Kết quả</span>
          <AutoTextarea
            value={row.progress ?? ''}
            onChange={(v) => patch({ progress: v })}
            ariaLabel="Tiến độ/Kết quả"
            minRows={2}
          />
        </label>
        <div className="k-field">
          <span>KPI ± · Lý do</span>
          <div className="k-pmrow">
            <input
              className="k-in k-in-num"
              value={row.kpi ?? ''}
              onChange={(e) => patch({ kpi: e.target.value })}
              placeholder="±"
              aria-label="KPI ±"
            />
            <AutoTextarea
              value={row.kpiNote ?? ''}
              onChange={(v) => patch({ kpiNote: v })}
              placeholder="Lý do ±…"
              ariaLabel="Lý do ±"
              minRows={2}
            />
          </div>
        </div>
      </div>

      <div className="k-merge-src">
        <button
          type="button"
          className="k-linkbtn"
          aria-expanded={showSources}
          onClick={() => setShowSources((v) => !v)}
        >
          {showSources ? '▾' : '▸'} {rows.length} mục nguồn
        </button>
        {showSources && (
          <ol className="k-merge-src-list">
            {rows.map((r) => (
              <li key={r.id}>
                <b>{[r.category, r.app, r.milestone].filter(Boolean).join(' · ') || '(trống)'}</b>
                <span className="k-muted k-small">
                  {' '}
                  {r.start ? formatDateVi(r.start) : '—'} → {r.end ? formatDateVi(r.end) : '—'}
                  {typeof r.days === 'number' ? ` · ${r.days} ngày` : ''}
                  {r.kpi ? ` · KPI ${r.kpi}` : ''}
                </span>
                {r.tasks && <div className="k-preline k-small k-muted">{r.tasks}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </KsumConfirmDialog>
  );
}
