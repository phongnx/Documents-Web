// Bảng log KPI dùng chung 2 chế độ:
// - mode 'member': sửa inline từng dòng (dòng đã chấm điểm bị khóa), thêm/xóa dòng.
// - mode 'leader': đọc nội dung, click cột Điểm để chấm, xóa dòng (kèm điểm).
// Cấu trúc theo file Excel: nhóm theo ngày (mới nhất trước) + dòng Tổng giờ/điểm mỗi ngày,
// header hiện "KPI Tháng = 100 + Σ" + tổng giờ của tháng đang chọn.
import { useState } from 'react';
import {
  durationMin,
  entriesOfMonth,
  fmtDelta,
  fmtHours,
  groupEntriesByDay,
  KPI_MONTH_BASE,
  totalOf,
  type KpiEntry,
  type KpiScore,
} from '../../kpiTypes';
import type { KpiEntryInput } from '../../hooks/useKpiSheet';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { isoLocal, weekdayVN } from '../../lib/pmDates';
import { formatDateVi } from '../../lib/reportFormat';

interface Props {
  mode: 'member' | 'leader';
  entries: KpiEntry[];
  scores: Record<string, KpiScore>;
  /** Tháng đang xem 'yyyy-mm'. */
  monthKey: string;
  onMonthChange: (m: string) => void;
  /** Danh mục giai đoạn cho dropdown. */
  categories: string[];
  /** Danh sách tên project (datalist gợi ý, hoặc select cứng khi strictProjects). */
  projectNames: string[];
  /** true = member CHỈ chọn được project trong projectNames (đã được leader gán). */
  strictProjects?: boolean;
  /** Member mode: true = sheet bị khóa, ẩn mọi nút sửa. */
  locked?: boolean;
  onAdd?: (input: KpiEntryInput) => string | null;
  onUpdate?: (id: string, patch: Partial<KpiEntryInput>) => void;
  onDelete?: (id: string) => void;
  /** Leader: click ô Điểm của 1 dòng. */
  onScoreClick?: (entry: KpiEntry) => void;
  /** Leader: xóa dòng (kèm điểm nếu có). */
  onDeleteWithScore?: (id: string) => void;
}

/** Giá trị form của dòng đang sửa (id rỗng = dòng mới). */
interface RowDraft {
  id: string;
  date: string;
  start: string;
  end: string;
  category: string;
  project: string;
  feature: string;
  task: string;
  note: string;
}

const emptyDraft = (date: string, start = ''): RowDraft => ({
  id: '',
  date,
  start,
  end: '',
  category: '',
  project: '',
  feature: '',
  task: '',
  note: '',
});

const draftOf = (e: KpiEntry): RowDraft => ({
  id: e.id,
  date: e.date,
  start: e.start ?? '',
  end: e.end ?? '',
  category: e.category ?? '',
  project: e.project ?? '',
  feature: e.feature ?? '',
  task: e.task ?? '',
  note: e.note ?? '',
});

// 'yyyy-mm' ± n tháng.
function monthShift(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Badge điểm: dương xanh / âm đỏ / 0 xám.
function ScoreBadge({ score }: { score: KpiScore }) {
  const cls = score.delta > 0 ? 'pos' : score.delta < 0 ? 'neg' : 'zero';
  return (
    <span className={`kpi-score ${cls}`} title={score.reason || undefined}>
      {fmtDelta(score.delta)}
    </span>
  );
}

export default function KpiLogTable({
  mode,
  entries,
  scores,
  monthKey,
  onMonthChange,
  categories,
  projectNames,
  strictProjects,
  locked,
  onAdd,
  onUpdate,
  onDelete,
  onScoreClick,
  onDeleteWithScore,
}: Props) {
  const [draft, setDraft] = useState<RowDraft | null>(null);
  useUnsavedGuard(!!draft);
  const patchDraft = (u: Partial<RowDraft>) =>
    setDraft((d) => (d ? { ...d, ...u } : d));

  const canEdit = mode === 'member' && !locked;
  const monthEntries = entriesOfMonth(entries, monthKey);
  const byDay = groupEntriesByDay(monthEntries);
  // Dòng mới của ngày chưa có entry nào → thêm ngày đó vào danh sách nhóm.
  if (draft && !draft.id && draft.date.startsWith(monthKey) && !byDay.has(draft.date)) {
    byDay.set(draft.date, []);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const monthTotal = totalOf(monthEntries, scores);
  const monthScore = Number((KPI_MONTH_BASE + monthTotal.delta).toFixed(2));

  const saveDraft = () => {
    if (!draft || !draft.date) return;
    const input: KpiEntryInput = {
      date: draft.date,
      start: draft.start || undefined,
      end: draft.end || undefined,
      category: draft.category || undefined,
      project: draft.project || undefined,
      feature: draft.feature || undefined,
      task: draft.task || undefined,
      note: draft.note || undefined,
    };
    if (draft.id) onUpdate?.(draft.id, input);
    else onAdd?.(input);
    setDraft(null);
  };

  // Thêm dòng cho 1 ngày: seed start = end của dòng cuối ngày (nối ca làm việc).
  const startAdd = (date: string) => {
    const list = byDay.get(date) ?? [];
    const last = list[list.length - 1];
    setDraft(emptyDraft(date, last?.end ?? ''));
  };

  const onRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveDraft();
    if (e.key === 'Escape') setDraft(null);
  };

  // Ô nhập của dòng đang sửa (dùng chung cho dòng mới & dòng sửa).
  const renderEditRow = (d: RowDraft) => (
    <tr className="kpi-row kpi-row-edit" onKeyDown={onRowKeyDown}>
      <td>
        <input
          type="time"
          value={d.start}
          onChange={(e) => patchDraft({ start: e.target.value })}
          autoFocus={!d.start}
        />
      </td>
      <td>
        <input
          type="time"
          value={d.end}
          onChange={(e) => patchDraft({ end: e.target.value })}
        />
      </td>
      <td className="kpi-dur muted">
        {(() => {
          const m = durationMin({ start: d.start, end: d.end });
          return m === null ? (d.start || d.end ? '⚠' : '–') : fmtHours(m);
        })()}
      </td>
      <td>
        <select
          value={d.category}
          onChange={(e) => patchDraft({ category: e.target.value })}
        >
          <option value="">(chọn)</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {d.category && !categories.includes(d.category) && (
            <option value={d.category}>{d.category}</option>
          )}
        </select>
      </td>
      <td>
        {strictProjects ? (
          // Đã gán project → chỉ chọn trong danh sách (giữ option giá trị cũ nếu ngoài danh sách).
          <select
            value={d.project}
            onChange={(e) => patchDraft({ project: e.target.value })}
          >
            <option value="">(chọn)</option>
            {projectNames.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {d.project && !projectNames.includes(d.project) && (
              <option value={d.project}>{d.project}</option>
            )}
          </select>
        ) : (
          <input
            list="kpi-projects"
            value={d.project}
            onChange={(e) => patchDraft({ project: e.target.value })}
            placeholder="Project"
          />
        )}
      </td>
      <td>
        <input
          value={d.feature}
          onChange={(e) => patchDraft({ feature: e.target.value })}
          placeholder="Feature"
        />
      </td>
      <td className="kpi-task-cell">
        <input
          value={d.task}
          onChange={(e) => patchDraft({ task: e.target.value })}
          placeholder="Mô tả task…"
        />
      </td>
      <td>
        <input
          value={d.note}
          onChange={(e) => patchDraft({ note: e.target.value })}
          placeholder="Note"
        />
      </td>
      <td className="kpi-score-cell" />
      <td className="kpi-actions">
        <button type="button" className="doc-action" title="Lưu (Enter)" onClick={saveDraft}>
          ✓
        </button>
        <button
          type="button"
          className="doc-action"
          title="Hủy (Esc)"
          onClick={() => setDraft(null)}
        >
          ✕
        </button>
      </td>
    </tr>
  );

  const renderRow = (e: KpiEntry) => {
    if (draft && draft.id === e.id) return renderEditRow(draft);
    const score = scores[e.id];
    const dur = durationMin(e);
    const editable = canEdit && !score;
    return (
      <tr
        key={e.id}
        className={`kpi-row${editable ? ' kpi-row-editable' : ''}`}
        onClick={editable ? () => setDraft(draftOf(e)) : undefined}
        title={
          mode === 'member' && score
            ? 'Dòng đã chấm điểm — liên hệ leader nếu cần sửa'
            : editable
              ? 'Click để sửa'
              : undefined
        }
      >
        <td>{e.start ?? ''}</td>
        <td>{e.end ?? ''}</td>
        <td className="kpi-dur muted">
          {dur === null ? (
            e.start || e.end ? (
              <span className="kpi-warn" title="Giờ không hợp lệ (end < start hoặc thiếu)">
                ⚠
              </span>
            ) : (
              '–'
            )
          ) : (
            fmtHours(dur)
          )}
        </td>
        <td>{e.category ?? ''}</td>
        <td>{e.project ?? ''}</td>
        <td>{e.feature ?? ''}</td>
        <td className="kpi-task-cell">{e.task ?? ''}</td>
        <td className="muted">{e.note ?? ''}</td>
        <td
          className={`kpi-score-cell${mode === 'leader' ? ' kpi-score-click' : ''}`}
          onClick={
            mode === 'leader'
              ? (ev) => {
                  ev.stopPropagation();
                  onScoreClick?.(e);
                }
              : undefined
          }
          title={mode === 'leader' ? 'Chấm điểm dòng này' : undefined}
        >
          {score ? <ScoreBadge score={score} /> : mode === 'leader' ? '✎' : ''}
          {mode === 'member' && score && ' 🔒'}
        </td>
        <td className="kpi-actions" onClick={(ev) => ev.stopPropagation()}>
          {editable && (
            <button
              type="button"
              className="doc-action danger"
              title="Xóa dòng"
              onClick={() => {
                if (window.confirm('Xóa dòng này?')) onDelete?.(e.id);
              }}
            >
              🗑️
            </button>
          )}
          {mode === 'leader' && (
            <button
              type="button"
              className="doc-action danger"
              title="Xóa dòng (kèm điểm)"
              onClick={() => {
                if (window.confirm('Xóa dòng này (kèm điểm đã chấm)?'))
                  onDeleteWithScore?.(e.id);
              }}
            >
              🗑️
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="kpi-log">
      {/* Header tháng: điều hướng + KPI tháng + tổng giờ */}
      <div className="kpi-month-bar">
        <div className="kpi-month-nav">
          <button type="button" className="doc-action" onClick={() => onMonthChange(monthShift(monthKey, -1))}>
            ◀
          </button>
          <strong>
            Tháng {monthKey.slice(5)}/{monthKey.slice(0, 4)}
          </strong>
          <button type="button" className="doc-action" onClick={() => onMonthChange(monthShift(monthKey, 1))}>
            ▶
          </button>
        </div>
        <div className="kpi-month-sum">
          <span className={`kpi-month-score ${monthScore >= KPI_MONTH_BASE ? 'pos' : 'neg'}`}>
            KPI tháng: {KPI_MONTH_BASE} {monthTotal.delta >= 0 ? '+' : '−'}{' '}
            {Math.abs(monthTotal.delta)} = <strong>{monthScore}</strong>
          </span>
          <span className="muted">
            Tổng giờ: <strong>{fmtHours(monthTotal.minutes)}</strong> ·{' '}
            {monthTotal.scoredCount}/{monthEntries.length} dòng đã chấm
          </span>
        </div>
        {canEdit && (
          <button
            type="button"
            className="primary kpi-add-today"
            onClick={() => {
              const today = isoLocal(new Date());
              if (!today.startsWith(monthKey)) onMonthChange(today.slice(0, 7));
              startAdd(today);
            }}
          >
            ＋ Thêm dòng hôm nay
          </button>
        )}
      </div>

      {/* Datalist gợi ý project dùng chung cho mọi dòng đang sửa */}
      <datalist id="kpi-projects">
        {projectNames.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {days.length === 0 ? (
        <p className="muted empty">
          Chưa có dòng log nào trong tháng này.
          {canEdit && ' Bấm "＋ Thêm dòng hôm nay" để bắt đầu.'}
        </p>
      ) : (
        <div className="kpi-table-wrap">
          <table className="kpi-table">
            <thead>
              <tr>
                <th>Bắt đầu</th>
                <th>Kết thúc</th>
                <th>⏱</th>
                <th>Giai đoạn</th>
                <th>Project</th>
                <th>Feature</th>
                <th>Task</th>
                <th>Note</th>
                <th>Điểm</th>
                <th />
              </tr>
            </thead>
            {days.map((date) => {
              const list = byDay.get(date) ?? [];
              const dayTotal = totalOf(list, scores);
              return (
                <tbody key={date}>
                  <tr className="kpi-day-row">
                    <td colSpan={8}>
                      {weekdayVN(date)} · {formatDateVi(date)}
                    </td>
                    <td colSpan={2} className="kpi-day-add">
                      {canEdit && (
                        <button
                          type="button"
                          className="doc-action"
                          title="Thêm dòng cho ngày này"
                          onClick={() => startAdd(date)}
                        >
                          ＋
                        </button>
                      )}
                    </td>
                  </tr>
                  {list.map(renderRow)}
                  {draft && !draft.id && draft.date === date && renderEditRow(draft)}
                  <tr className="kpi-sum-row">
                    <td colSpan={2}>Tổng</td>
                    <td className="kpi-dur">{fmtHours(dayTotal.minutes)}</td>
                    <td colSpan={5} />
                    <td className="kpi-score-cell">
                      {dayTotal.scoredCount > 0 && (
                        <span
                          className={`kpi-score ${dayTotal.delta > 0 ? 'pos' : dayTotal.delta < 0 ? 'neg' : 'zero'}`}
                        >
                          {fmtDelta(dayTotal.delta)}
                        </span>
                      )}
                    </td>
                    <td />
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
