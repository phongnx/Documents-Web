// Bảng log KPI dùng chung 2 chế độ:
// - mode 'member': sửa inline từng dòng (dòng đã chấm điểm bị khóa), thêm/xóa dòng.
// - mode 'leader': đọc nội dung, click cột Điểm để chấm, xóa dòng (kèm điểm).
// Cấu trúc theo file Excel: nhóm theo ngày (mới nhất trước) + dòng Tổng giờ/điểm mỗi ngày,
// header hiện "KPI Tháng = 100 + Σ" + tổng giờ của tháng đang chọn.
import { Fragment, useState } from 'react';
import {
  durationMin,
  entriesOfMonth,
  fmtDelta,
  fmtHours,
  groupEntriesByDay,
  KPI_MONTH_BASE,
  leaveLabel,
  leavePortionsOf,
  overlapsLeave,
  parseHm,
  totalOf,
  type KpiEntry,
  type KpiLeave,
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
  /** Các đợt nghỉ phép — hiển thị ở block ngày + validate giờ log không trùng giờ nghỉ. */
  leaves?: KpiLeave[];
  /** Member mode: true = sheet bị khóa, ẩn mọi nút sửa. */
  locked?: boolean;
  onAdd?: (input: KpiEntryInput) => string | null;
  onUpdate?: (id: string, patch: Partial<KpiEntryInput>) => void;
  onDelete?: (id: string) => void;
  /** Leader: click ô Điểm của 1 dòng. */
  onScoreClick?: (entry: KpiEntry) => void;
  /** Leader: chấp nhận nhanh điểm tự chấm cho các dòng chưa chấm (1 dòng / cả ngày / cả tháng). */
  onAcceptEntries?: (entries: KpiEntry[]) => void;
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
  /** Điểm tự chấm (chuỗi từ input number; rỗng = 0). */
  selfDelta: string;
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
  selfDelta: '0',
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
  selfDelta: typeof e.selfDelta === 'number' ? String(e.selfDelta) : '0',
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

// Badge điểm TỰ CHẤM (viền đứt, nhạt) — chưa được leader xác nhận.
function SelfScoreBadge({ delta }: { delta: number }) {
  const cls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero';
  return (
    <span
      className={`kpi-score self ${cls}`}
      title="Điểm tự chấm — chờ leader xác nhận"
    >
      {fmtDelta(delta)}
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
  leaves,
  locked,
  onAdd,
  onUpdate,
  onDelete,
  onScoreClick,
  onAcceptEntries,
  onDeleteWithScore,
}: Props) {
  const [draft, setDraft] = useState<RowDraft | null>(null);
  // Field đang lỗi validate + thông báo (chỉ set khi bấm Lưu, gõ vào ô nào thì bỏ lỗi ô đó).
  const [errFields, setErrFields] = useState<Set<string>>(new Set());
  const [errMsg, setErrMsg] = useState('');
  useUnsavedGuard(!!draft);
  const patchDraft = (u: Partial<RowDraft>) => {
    setDraft((d) => (d ? { ...d, ...u } : d));
    if (errFields.size > 0)
      setErrFields((prev) => {
        const next = new Set(prev);
        for (const k of Object.keys(u)) next.delete(k);
        return next;
      });
  };
  const openDraft = (d: RowDraft | null) => {
    setDraft(d);
    setErrFields(new Set());
    setErrMsg('');
  };

  // Map ngày → phần nghỉ phép (cả ngày / sáng / chiều) để hiển thị + validate.
  const leaveMap = leavePortionsOf(leaves ?? []);

  // Bộ field tối thiểu khi lưu 1 dòng: start/end hợp lệ + giai đoạn + project + task.
  const validateDraft = (d: RowDraft): { fields: Set<string>; msg: string } => {
    const fields = new Set<string>();
    const missing: string[] = [];
    if (!d.start) {
      fields.add('start');
      missing.push('Giờ bắt đầu');
    }
    if (!d.end) {
      fields.add('end');
      missing.push('Giờ kết thúc');
    }
    if (!d.category) {
      fields.add('category');
      missing.push('Giai đoạn');
    }
    if (!d.project.trim()) {
      fields.add('project');
      missing.push('Project');
    }
    if (!d.task.trim()) {
      fields.add('task');
      missing.push('Task');
    }
    let msg = missing.length > 0 ? `Thiếu: ${missing.join(', ')}.` : '';
    if (d.start && d.end && durationMin({ start: d.start, end: d.end }) === null) {
      fields.add('start');
      fields.add('end');
      msg += `${msg ? ' ' : ''}Giờ kết thúc phải sau giờ bắt đầu.`;
    }
    // Rule nghỉ phép: cả ngày → không log được; nửa ngày → giờ không được đè lên buổi nghỉ.
    const portion = leaveMap.get(d.date);
    if (portion === 'full') {
      fields.add('start');
      fields.add('end');
      msg += `${msg ? ' ' : ''}Ngày này nghỉ phép cả ngày — không log được task.`;
    } else if (portion) {
      const s = parseHm(d.start);
      const e = parseHm(d.end);
      if (s !== null && e !== null && e > s && overlapsLeave(portion, s, e)) {
        fields.add('start');
        fields.add('end');
        msg += `${msg ? ' ' : ''}Trùng thời gian nghỉ phép (${leaveLabel(portion)}) — ${
          portion === 'am' ? 'chỉ log từ 12:00 trở đi' : 'chỉ log trước 12:00'
        }.`;
      }
    }
    return { fields, msg };
  };

  // Member chưa được gán project nào → không log được (project là field bắt buộc).
  const noProjects = strictProjects === true && projectNames.length === 0;
  const canEdit = mode === 'member' && !locked && !noProjects;
  const monthEntries = entriesOfMonth(entries, monthKey);
  const byDay = groupEntriesByDay(monthEntries);
  // Dòng mới của ngày chưa có entry nào → thêm ngày đó vào danh sách nhóm.
  if (draft && !draft.id && draft.date.startsWith(monthKey) && !byDay.has(draft.date)) {
    byDay.set(draft.date, []);
  }
  // Ngày nghỉ phép trong tháng chưa có dòng log → vẫn hiện block ngày (kèm info nghỉ).
  for (const d of leaveMap.keys()) {
    if (d.startsWith(monthKey) && !byDay.has(d)) byDay.set(d, []);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const monthTotal = totalOf(monthEntries, scores);
  const monthScore = Number((KPI_MONTH_BASE + monthTotal.delta).toFixed(2));
  // Các dòng "chờ xác nhận" (chưa có điểm leader) — cho nút accept nhanh của leader.
  const pendingOf = (list: KpiEntry[]) => list.filter((e) => !scores[e.id]);
  const canAccept = mode === 'leader' && !!onAcceptEntries;
  const pendingMonth = canAccept ? pendingOf(monthEntries) : [];

  const saveDraft = () => {
    if (!draft || !draft.date) return;
    // Không cho hoàn thành khi thiếu field tối thiểu — highlight ô lỗi + thông báo.
    const v = validateDraft(draft);
    if (v.fields.size > 0) {
      setErrFields(v.fields);
      setErrMsg(v.msg);
      return;
    }
    const input: KpiEntryInput = {
      date: draft.date,
      start: draft.start || undefined,
      end: draft.end || undefined,
      category: draft.category || undefined,
      project: draft.project || undefined,
      feature: draft.feature || undefined,
      task: draft.task || undefined,
      note: draft.note || undefined,
      // Điểm tự chấm: rỗng/không hợp lệ → 0 (mặc định khi log done).
      selfDelta: Number(draft.selfDelta) || 0,
    };
    if (draft.id) onUpdate?.(draft.id, input);
    else onAdd?.(input);
    openDraft(null);
  };

  // Thêm dòng cho 1 ngày: seed start = end của dòng cuối ngày (nối ca làm việc).
  const startAdd = (date: string) => {
    const list = byDay.get(date) ?? [];
    const last = list[list.length - 1];
    openDraft(emptyDraft(date, last?.end ?? ''));
  };

  // Nhân bản 1 dòng thành dòng MỚI cùng ngày: copy nội dung, giờ seed nối ca,
  // điểm tự chấm về 0 (điểm là theo kết quả từng lần làm, không copy).
  const startDuplicate = (src: KpiEntry) => {
    const list = byDay.get(src.date) ?? [];
    const last = list[list.length - 1];
    openDraft({ ...draftOf(src), id: '', start: last?.end ?? '', end: '', selfDelta: '0' });
  };

  const onRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveDraft();
    if (e.key === 'Escape') openDraft(null);
  };

  // Class đánh dấu ô đang lỗi validate.
  const errCls = (k: string) => (errFields.has(k) ? 'kpi-input-err' : undefined);

  // Ô nhập của dòng đang sửa (dùng chung cho dòng mới & dòng sửa) + dòng báo lỗi validate.
  const renderEditRow = (d: RowDraft, key: string) => (
    <Fragment key={key}>
    <tr className="kpi-row kpi-row-edit" onKeyDown={onRowKeyDown}>
      <td>
        <input
          type="time"
          className={errCls('start')}
          value={d.start}
          onChange={(e) => patchDraft({ start: e.target.value })}
          autoFocus={!d.start}
        />
      </td>
      <td>
        <input
          type="time"
          className={errCls('end')}
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
          className={errCls('category')}
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
            className={errCls('project')}
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
            className={errCls('project')}
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
          className={errCls('task')}
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
      <td className="kpi-score-cell">
        <input
          type="number"
          step="0.1"
          className="kpi-self-input"
          title="Điểm tự chấm (mặc định 0) — leader sẽ xác nhận/chỉnh khi chấm"
          value={d.selfDelta}
          onChange={(e) => patchDraft({ selfDelta: e.target.value })}
        />
      </td>
      <td className="kpi-actions">
        <button type="button" className="doc-action" title="Lưu (Enter)" onClick={saveDraft}>
          ✓
        </button>
        <button
          type="button"
          className="doc-action"
          title="Hủy (Esc)"
          onClick={() => openDraft(null)}
        >
          ✕
        </button>
      </td>
    </tr>
    {errMsg && (
      <tr className="kpi-error-row">
        <td colSpan={10}>⚠ {errMsg}</td>
      </tr>
    )}
    </Fragment>
  );

  const renderRow = (e: KpiEntry) => {
    if (draft && draft.id === e.id) return renderEditRow(draft, e.id);
    const score = scores[e.id];
    const dur = durationMin(e);
    const editable = canEdit && !score;
    return (
      <tr
        key={e.id}
        className={`kpi-row${editable ? ' kpi-row-editable' : ''}`}
        onClick={editable ? () => openDraft(draftOf(e)) : undefined}
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
          {score ? (
            <ScoreBadge score={score} />
          ) : typeof e.selfDelta === 'number' ? (
            <>
              <SelfScoreBadge delta={e.selfDelta} />
              {mode === 'leader' && ' ✎'}
            </>
          ) : mode === 'leader' ? (
            '✎'
          ) : (
            ''
          )}
          {!score && canAccept && (
            <button
              type="button"
              className="doc-action kpi-accept-btn"
              title="Chấp nhận điểm tự chấm cho dòng này"
              onClick={(ev) => {
                ev.stopPropagation();
                onAcceptEntries!([e]);
              }}
            >
              ✓
            </button>
          )}
          {mode === 'member' && score && ' 🔒'}
        </td>
        <td className="kpi-actions" onClick={(ev) => ev.stopPropagation()}>
          {canEdit && (
            <button
              type="button"
              className="doc-action"
              title="Nhân bản thành dòng mới (copy nội dung, đỡ nhập lại)"
              onClick={() => startDuplicate(e)}
            >
              ⧉
            </button>
          )}
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
      {mode === 'member' && !locked && noProjects && (
        <p className="warn kpi-locked-banner">
          ⚠ Bạn chưa được gán project nào — liên hệ leader để được gán trước khi log
          task.
        </p>
      )}
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
        {canAccept && pendingMonth.length > 0 && (
          <button
            type="button"
            className="primary kpi-add-today"
            title="Chấp nhận điểm tự chấm cho mọi dòng chưa chấm trong tháng"
            onClick={() => onAcceptEntries!(pendingMonth)}
          >
            ✓ Chấp nhận tất cả ({pendingMonth.length})
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
              const leave = leaveMap.get(date);
              return (
                <tbody key={date}>
                  <tr className="kpi-day-row">
                    <td colSpan={8}>
                      {weekdayVN(date)} · {formatDateVi(date)}
                      {leave && (
                        <span className="kpi-leave-badge">
                          🏖 Nghỉ phép: {leaveLabel(leave)}
                        </span>
                      )}
                    </td>
                    <td colSpan={2} className="kpi-day-add">
                      {canEdit && leave !== 'full' && (
                        <button
                          type="button"
                          className="doc-action"
                          title="Thêm dòng cho ngày này"
                          onClick={() => startAdd(date)}
                        >
                          ＋
                        </button>
                      )}
                      {canAccept && pendingOf(list).length > 0 && (
                        <button
                          type="button"
                          className="doc-action"
                          title="Chấp nhận điểm tự chấm cho các dòng chưa chấm của ngày này"
                          onClick={() => onAcceptEntries!(pendingOf(list))}
                        >
                          ✓ Ngày ({pendingOf(list).length})
                        </button>
                      )}
                    </td>
                  </tr>
                  {list.map(renderRow)}
                  {draft && !draft.id && draft.date === date && renderEditRow(draft, 'new')}
                  {(list.length > 0 || (draft && !draft.id && draft.date === date)) && (
                    <tr className="kpi-sum-row">
                      <td colSpan={2}>Tổng</td>
                      <td className="kpi-dur">{fmtHours(dayTotal.minutes)}</td>
                      <td colSpan={5} />
                      <td className="kpi-score-cell">
                        {(dayTotal.scoredCount > 0 ||
                          list.some((e) => typeof e.selfDelta === 'number')) && (
                          <span
                            className={`kpi-score ${dayTotal.delta > 0 ? 'pos' : dayTotal.delta < 0 ? 'neg' : 'zero'}`}
                          >
                            {fmtDelta(dayTotal.delta)}
                          </span>
                        )}
                      </td>
                      <td />
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}
