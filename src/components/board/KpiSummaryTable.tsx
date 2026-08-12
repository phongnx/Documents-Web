// Bảng tổng kết KPI tháng dùng chung 2 chế độ (cấu trúc theo file Excel mẫu):
// - editable (trang leader): sửa inline từng ô, thêm/xóa dòng, xóa member.
// - readonly (trang share): render text thuần, không input.
// Mỗi member 1 tbody: cột Tên / Ngày nghỉ / KPI tháng rowspan các dòng đầu mục.
import {
  KPI_MONTH_BASE,
  type KpiSummary,
  type KpiSummaryMember,
  type KpiSummaryRow,
} from '../../kpiTypes';
import { formatDateVi } from '../../lib/reportFormat';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  summary: KpiSummary;
  readonly?: boolean;
  /** Danh mục giai đoạn (datalist cho ô Category — chỉ dùng khi editable). */
  categories?: string[];
  onChange?: (next: KpiSummary) => void;
}

/** Render text Tasks nhiều dòng: dòng '#' đậm (heading), còn lại giữ nguyên. */
export function SummaryTasksText({ text }: { text?: string }) {
  if (!text) return <span className="muted">—</span>;
  return (
    <div className="ksum-tasks-text">
      {text.split('\n').map((line, i) =>
        line.trimStart().startsWith('#') ? (
          <div key={i} className="ksum-tasks-head">
            {line}
          </div>
        ) : (
          <div key={i}>{line}</div>
        ),
      )}
    </div>
  );
}

export default function KpiSummaryTable({
  summary,
  readonly: ro,
  categories,
  onChange,
}: Props) {
  const editable = !ro && !!onChange;

  const patchMember = (mi: number, patch: Partial<KpiSummaryMember>) =>
    onChange?.({
      ...summary,
      members: summary.members.map((m, i) => (i === mi ? { ...m, ...patch } : m)),
    });

  const patchRow = (mi: number, ri: number, patch: Partial<KpiSummaryRow>) =>
    patchMember(mi, {
      rows: summary.members[mi].rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)),
    });

  const addRow = (mi: number) => {
    const rows = summary.members[mi].rows;
    patchMember(mi, {
      rows: [...rows, { id: uuidv4(), order: rows.length }],
    });
  };

  const deleteRow = (mi: number, ri: number) =>
    patchMember(mi, { rows: summary.members[mi].rows.filter((_, j) => j !== ri) });

  const deleteMember = (mi: number) => {
    const m = summary.members[mi];
    if (!window.confirm(`Bỏ "${m.name}" khỏi bảng tổng kết?`)) return;
    onChange?.({ ...summary, members: summary.members.filter((_, i) => i !== mi) });
  };

  // Tổng số cột (để colSpan dòng "＋ Thêm dòng" / placeholder).
  const totalCols = 11 + (editable ? 1 : 0);

  const renderRowCells = (mi: number, r: KpiSummaryRow, ri: number) =>
    editable ? (
      <>
        <td className="ksum-cat">
          <input
            list="ksum-categories"
            value={r.category ?? ''}
            onChange={(e) => patchRow(mi, ri, { category: e.target.value })}
            placeholder="Giai đoạn"
          />
        </td>
        <td className="ksum-app">
          <input
            value={r.app ?? ''}
            onChange={(e) => patchRow(mi, ri, { app: e.target.value })}
            placeholder="App"
          />
          <input
            className="ksum-milestone-input"
            value={r.milestone ?? ''}
            onChange={(e) => patchRow(mi, ri, { milestone: e.target.value })}
            placeholder="🚀 Mốc…"
            title="Mốc release/milestone các task thuộc về (auto từ dòng log có gắn mốc)"
          />
        </td>
        <td className="ksum-tasks">
          {/* Auto-grow theo nội dung — đọc thẳng không phải cuộn trong ô. */}
          <textarea
            rows={Math.min(Math.max((r.tasks ?? '').split('\n').length + 1, 3), 18)}
            value={r.tasks ?? ''}
            onChange={(e) => patchRow(mi, ri, { tasks: e.target.value })}
            placeholder={'# Đầu mục:\n- việc đã làm…'}
          />
        </td>
        <td className="ksum-date">
          <input
            type="date"
            value={r.start ?? ''}
            onChange={(e) => patchRow(mi, ri, { start: e.target.value || undefined })}
          />
        </td>
        <td className="ksum-date">
          <input
            type="date"
            value={r.end ?? ''}
            onChange={(e) => patchRow(mi, ri, { end: e.target.value || undefined })}
          />
        </td>
        <td className="ksum-days">
          <input
            type="number"
            min={0}
            value={typeof r.days === 'number' ? String(r.days) : ''}
            onChange={(e) =>
              patchRow(mi, ri, {
                days: e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
        </td>
        <td className="ksum-progress">
          <textarea
            rows={2}
            value={r.progress ?? ''}
            onChange={(e) => patchRow(mi, ri, { progress: e.target.value })}
            placeholder="Tiến độ/Kết quả"
          />
        </td>
        <td className="ksum-kpi">
          <input
            value={r.kpi ?? ''}
            onChange={(e) => patchRow(mi, ri, { kpi: e.target.value })}
            placeholder="±"
          />
          <textarea
            rows={Math.min(Math.max((r.kpiNote ?? '').split('\n').length, 2), 6)}
            value={r.kpiNote ?? ''}
            onChange={(e) => patchRow(mi, ri, { kpiNote: e.target.value })}
            placeholder="Lý do ±…"
            title="Lý do cộng/trừ điểm — hiển thị cả trên bảng share"
          />
        </td>
      </>
    ) : (
      <>
        <td className="ksum-cat">{r.category ?? ''}</td>
        <td className="ksum-app">
          {r.app ?? ''}
          {r.milestone && <div className="ksum-milestone">🚀 {r.milestone}</div>}
        </td>
        <td className="ksum-tasks">
          <SummaryTasksText text={r.tasks} />
        </td>
        <td className="ksum-date">{r.start ? formatDateVi(r.start) : ''}</td>
        <td className="ksum-date">{r.end ? formatDateVi(r.end) : ''}</td>
        <td className="ksum-days">{typeof r.days === 'number' ? r.days : ''}</td>
        <td className="ksum-progress ksum-preline">{r.progress ?? ''}</td>
        <td className="ksum-kpi">
          {r.kpi ? (
            <span
              className={`kpi-score ${r.kpi.startsWith('-') || r.kpi.startsWith('−') ? 'neg' : 'pos'}`}
            >
              {r.kpi}
            </span>
          ) : (
            ''
          )}
          {r.kpiNote && <div className="ksum-kpi-note">{r.kpiNote}</div>}
        </td>
      </>
    );

  return (
    <div className="kpi-table-wrap">
      {editable && (
        <datalist id="ksum-categories">
          {(categories ?? []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      )}
      <table className="kpi-table ksum-table">
        {/* Chốt độ rộng cột (table-layout: fixed) — Tasks ưu tiên lớn nhất,
            các cột trống (Tiến độ/Ngày nghỉ) không còn phình chiếm chỗ. */}
        <colgroup>
          <col className="ksc-name" />
          <col className="ksc-cat" />
          <col className="ksc-app" />
          <col className="ksc-tasks" />
          <col className="ksc-date" />
          <col className="ksc-date" />
          <col className="ksc-days" />
          <col className="ksc-progress" />
          <col className="ksc-kpi" />
          <col className="ksc-leave" />
          <col className="ksc-score" />
          {editable && <col className="ksc-act" />}
        </colgroup>
        <thead>
          <tr>
            <th>Tên</th>
            <th>Giai đoạn</th>
            <th>App</th>
            <th>Tasks</th>
            <th>Start</th>
            <th>End</th>
            <th>Ngày</th>
            <th>Tiến độ/Kết quả</th>
            <th>KPI</th>
            <th>Ngày nghỉ</th>
            <th>KPI tháng</th>
            {editable && <th />}
          </tr>
        </thead>
        {summary.members.map((m, mi) => {
          const rows = m.rows ?? [];
          const span = Math.max(rows.length, 1);
          const memberCells = (
            <>
              <td className="ksum-leave" rowSpan={span}>
                {editable ? (
                  <textarea
                    rows={2}
                    value={m.leaveNote ?? ''}
                    onChange={(e) => patchMember(mi, { leaveNote: e.target.value })}
                    placeholder="Nghỉ phép…"
                  />
                ) : m.leaveNote ? (
                  <span className="ksum-preline">🏖 {m.leaveNote}</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="ksum-score" rowSpan={span}>
                {editable ? (
                  <input
                    type="number"
                    step={0.1}
                    value={String(m.kpiScore)}
                    onChange={(e) =>
                      patchMember(mi, { kpiScore: Number(e.target.value) || 0 })
                    }
                  />
                ) : (
                  <strong
                    className={
                      m.kpiScore >= KPI_MONTH_BASE
                        ? 'kpi-month-score pos'
                        : 'kpi-month-score neg'
                    }
                  >
                    {m.kpiScore}
                  </strong>
                )}
              </td>
            </>
          );
          return (
            <tbody key={m.memberId}>
              {rows.length === 0 ? (
                <tr>
                  <td className="ksum-name" rowSpan={1}>
                    <strong>{m.name}</strong>
                    {editable && (
                      <button
                        type="button"
                        className="doc-action danger"
                        title="Bỏ member khỏi bảng"
                        onClick={() => deleteMember(mi)}
                      >
                        🗑️
                      </button>
                    )}
                  </td>
                  <td colSpan={8} className="muted">
                    (không có đầu mục nào — member chỉ có nghỉ phép/không log)
                  </td>
                  {memberCells}
                  {editable && <td className="ksum-row-actions" />}
                </tr>
              ) : (
                rows.map((r, ri) => (
                  <tr key={r.id}>
                    {ri === 0 && (
                      <td className="ksum-name" rowSpan={span}>
                        <strong>{m.name}</strong>
                        {editable && (
                          <button
                            type="button"
                            className="doc-action danger"
                            title="Bỏ member khỏi bảng"
                            onClick={() => deleteMember(mi)}
                          >
                            🗑️
                          </button>
                        )}
                      </td>
                    )}
                    {renderRowCells(mi, r, ri)}
                    {ri === 0 && memberCells}
                    {/* Ô actions đặt SAU 2 ô rowspan — khớp thứ tự cột với header. */}
                    {editable && (
                      <td className="ksum-row-actions">
                        <button
                          type="button"
                          className="doc-action danger"
                          title="Xóa dòng"
                          onClick={() => deleteRow(mi, ri)}
                        >
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
              {editable && (
                <tr className="ksum-add-row">
                  <td colSpan={totalCols}>
                    <button type="button" className="doc-action" onClick={() => addRow(mi)}>
                      ＋ Thêm dòng cho {m.name}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
      {summary.members.length === 0 && (
        <p className="muted empty">Không có member nào có log trong tháng này.</p>
      )}
    </div>
  );
}
