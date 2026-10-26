// Bảng tổng kết KPI tháng dùng chung 2 chế độ:
// - sửa được (trang leader): sửa tại chỗ từng ô, thêm/xóa dòng, 🔄/🧹/🗑️ từng khối.
// - readonly (trang share): chữ thuần.
// Bố cục: mỗi member 1 khối = dòng tiêu đề khối (tên, Ngày nghỉ, KPI tháng, thao tác)
// + các dòng dạng lưới 4 cột. Tiêu đề cột và tiêu đề khối dính theo trang (sticky).
// Màn < 760px: dòng thành thẻ; trang leader chỉ sửa Ngày nghỉ + KPI tháng (CSS ẩn ô sửa).
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  kpiScoreClass,
  type KpiSummary,
  type KpiSummaryMember,
  type KpiSummaryRow,
} from '../../kpiTypes';
import { formatDateVi } from '../../lib/reportFormat';
import {
  fmtSigned,
  kpiScoreMismatch,
  parseDelta,
  parseKpiReasons,
  pmClass,
} from '../../lib/kpiSummary';
import DateInputVi from '../DateInputVi';
import {
  IcChevronDown,
  IcChevronRight,
  IcFlag,
  IcMerge,
  IcPlus,
  IcRefresh,
  IcTrash,
  IcWarn,
} from './ksumIcons';

// ---------- Trạng thái mở/thu gọn (dùng chung bảng + phần tổng quan) ----------

/**
 * Mở/thu gọn từng khối — chỉ là trạng thái hiển thị, không lưu. `defaultOpen`: leader
 * mở hết, share thu gọn hết. Lưu các khối KHÁC mặc định → khối mới thêm (hoặc dữ liệu
 * share dội về) tự theo mặc định, trạng thái người xem đã chọn không bị reset.
 */
export function useKsumOpen(memberIds: string[], defaultOpen: boolean) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const isOpen = useCallback(
    (id: string) => (flipped.has(id) ? !defaultOpen : defaultOpen),
    [flipped, defaultOpen],
  );
  const toggle = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const anyOpen = memberIds.some(isOpen);
  const toggleAll = () =>
    // Đang có khối mở → thu gọn hết; ngược lại mở hết.
    setFlipped(defaultOpen === anyOpen ? new Set(memberIds) : new Set());
  /** Mở khối (nếu đang thu gọn) rồi cuộn tới — dùng cho chip / xếp hạng / lý do. */
  const goTo = (id: string) => {
    if (!isOpen(id)) toggle(id);
    window.requestAnimationFrame(() =>
      document.getElementById(`ksum-m-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
  return { isOpen, toggle, anyOpen, toggleAll, goTo };
}

/**
 * Đo chiều cao thanh trang (toolbar có thể xuống dòng) → biến CSS --pagebar-h trên root,
 * để tiêu đề cột + tiêu đề khối dính ngay dưới thanh trang. Thanh trang phải luôn render.
 */
export function usePagebarHeight<T extends HTMLElement>() {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<T>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    if (!root || !bar) return;
    const apply = () => root.style.setProperty('--pagebar-h', `${bar.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  return { rootRef, barRef };
}

// ---------- Ô nhập tự giãn ----------

/** Textarea tự giãn theo nội dung — đọc thẳng, không cuộn trong ô. */
export function AutoTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = 'k-ta',
  minRows = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Tasks readonly: dòng '#' = tiêu đề nhóm đậm, '- ' = việc thụt treo. */
export function SummaryTasksText({ text }: { text?: string }) {
  if (!text) return <span className="k-muted">—</span>;
  return (
    <div className="k-tasks">
      {text
        .split('\n')
        .filter((l) => l.trim())
        .map((line, i) =>
          line.trimStart().startsWith('#') ? (
            <div key={i} className="is-head">
              {line.trimStart().replace(/^#+\s*/, '')}
            </div>
          ) : (
            <div key={i} className="is-item">
              {line.trimStart().replace(/^-\s*/, '– ')}
            </div>
          ),
        )}
    </div>
  );
}

/** Ô "Tiến độ/Kết quả · KPI ±" chế độ readonly. Lý do hiện cả khi ô KPI trống. */
function ResultCellRo({ r }: { r: KpiSummaryRow }) {
  const reasons = parseKpiReasons(r.kpiNote);
  const kpi = r.kpi?.trim();
  const kpiNum = kpi ? parseDelta(kpi) : null;
  const empty = !r.progress?.trim() && !kpi && reasons.length === 0;
  return (
    <div className={`k-c k-c-res${empty ? ' is-empty' : ''}`}>
      {r.progress?.trim() && (
        <div className="k-ro-prog">
          <div className="k-lbl">Tiến độ/Kết quả</div>
          <div className="k-preline">{r.progress}</div>
        </div>
      )}
      {kpi && (
        <div className="k-ro-total">
          <span className={`k-pm ${kpiNum === null ? 'zero' : pmClass(kpiNum)}`}>
            {kpiNum === null ? kpi : fmtSigned(kpiNum)}
          </span>
          <span>KPI ± của đầu mục</span>
        </div>
      )}
      {reasons.length > 0 && (
        <div className="k-ro-reasons">
          {reasons.map((x, i) => (
            <div key={i} className="k-ro-reason">
              <span className={`k-pm ${x.value === null ? 'zero' : pmClass(x.value)}`}>
                {x.value === null ? '•' : fmtSigned(x.value)}
              </span>
              <span>{x.text || <span className="k-muted">(không ghi lý do)</span>}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Dòng readonly — trang share, và trang leader trên màn hẹp (CSS chọn bản hiện). */
function RowReadonly({ r, extraCls = '' }: { r: KpiSummaryRow; extraCls?: string }) {
  return (
    <div className={`k-row k-grid${extraCls}`}>
      <div className="k-c k-c-meta">
        {r.category && <span className="k-ro-cat">{r.category}</span>}
        {r.app && <span className="k-ro-app">{r.app}</span>}
        {r.milestone && (
          <span className="k-ms">
            <IcFlag size={12} />
            {r.milestone}
          </span>
        )}
      </div>
      <div className="k-c">
        <SummaryTasksText text={r.tasks} />
      </div>
      <div className="k-c k-c-time">
        {r.start && <span className="k-ro-date">{formatDateVi(r.start)}</span>}
        {r.end && <span className="k-ro-date">→ {formatDateVi(r.end)}</span>}
        {typeof r.days === 'number' && <span className="k-ro-days">{r.days} ngày</span>}
        {r.spans && <span className="k-spans">{r.spans}</span>}
      </div>
      <ResultCellRo r={r} />
    </div>
  );
}

// ---------- Bảng ----------

interface Props {
  summary: KpiSummary;
  readonly?: boolean;
  /** Danh mục giai đoạn (datalist cho ô Giai đoạn — chỉ dùng khi sửa được). */
  categories?: string[];
  onChange?: (next: KpiSummary) => void;
  isOpen: (memberId: string) => boolean;
  onToggle: (memberId: string) => void;
  /** 🔄 Tổng hợp lại riêng khối này từ log (trang leader). */
  onRebuildMember?: (mi: number) => void;
  /** Khối có log để tổng hợp không (khối nhập tay / member đã xóa → false, khóa nút 🔄). */
  canRebuildMember?: (m: KpiSummaryMember) => boolean;
  /** 🧹 Tối ưu riêng khối này (trang leader). */
  onOptimizeMember?: (mi: number) => void;
  /** 🗑️ Bỏ member khỏi bảng — trang tự hỏi xác nhận (trang leader). */
  onDeleteMember?: (mi: number) => void;
  /** memberId khối đang đọc log (khóa thao tác của khối đó). */
  busyMemberId?: string | null;
  /** Các mục đang chọn để gộp tay — chỉ trong 1 member (trang leader). */
  selection?: { memberId: string; rowIds: string[] } | null;
  onToggleSelect?: (memberId: string, rowId: string) => void;
  /** Mở dialog gộp các mục đang chọn. */
  onMergeSelected?: () => void;
  onClearSelection?: () => void;
}

export default function KpiSummaryTable({
  summary,
  readonly: ro,
  categories,
  onChange,
  isOpen,
  onToggle,
  onRebuildMember,
  canRebuildMember,
  onOptimizeMember,
  onDeleteMember,
  busyMemberId,
  selection,
  onToggleSelect,
  onMergeSelected,
  onClearSelection,
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
    patchMember(mi, { rows: [...rows, { id: uuidv4(), order: rows.length }] });
  };

  const deleteRow = (mi: number, ri: number) =>
    patchMember(mi, { rows: summary.members[mi].rows.filter((_, j) => j !== ri) });

  // Lệch KPI tháng ↔ 100 + Σ ± dòng — tính 1 lần mỗi lần dữ liệu đổi.
  const mismatch = useMemo(
    () => new Map(summary.members.map((m) => [m.memberId, kpiScoreMismatch(m)])),
    [summary.members],
  );

  const renderRowEdit = (mi: number, r: KpiSummaryRow, ri: number) => {
    const kpiNum = r.kpi?.trim() ? parseDelta(r.kpi) : null;
    const kpiCls = kpiNum === null ? '' : kpiNum < 0 ? ' k-in-neg' : kpiNum > 0 ? ' k-in-pos' : '';
    const m = summary.members[mi];
    const selected = selection?.memberId === m.memberId && selection.rowIds.includes(r.id);
    // Đang chọn mục của member khác → khóa (chỉ gộp trong 1 member).
    const otherMember = !!selection && selection.memberId !== m.memberId;
    return (
      <div className={`k-row k-grid k-row-edit${selected ? ' is-selected' : ''}`}>
        <div className="k-c k-c-meta">
          <input
            className="k-in"
            list="ksum-categories"
            value={r.category ?? ''}
            onChange={(e) => patchRow(mi, ri, { category: e.target.value })}
            placeholder="Giai đoạn"
            aria-label="Giai đoạn"
          />
          <input
            className="k-in"
            value={r.app ?? ''}
            onChange={(e) => patchRow(mi, ri, { app: e.target.value })}
            placeholder="App"
            aria-label="App"
          />
          <div className="k-ms-in">
            <IcFlag />
            <input
              className="k-in"
              value={r.milestone ?? ''}
              onChange={(e) => patchRow(mi, ri, { milestone: e.target.value })}
              placeholder="Mốc"
              aria-label="Mốc"
              title="Mốc release/milestone các task thuộc về (auto từ dòng log có gắn mốc)"
            />
          </div>
        </div>
        <div className="k-c">
          <AutoTextarea
            value={r.tasks ?? ''}
            onChange={(v) => patchRow(mi, ri, { tasks: v })}
            placeholder={'# Nhóm việc\n- Việc đã làm…'}
            ariaLabel="Tasks"
            minRows={2}
          />
        </div>
        <div className="k-c k-c-time">
          <DateInputVi
            value={r.start}
            onChange={(v) => patchRow(mi, ri, { start: v })}
            ariaLabel="Start"
          />
          <DateInputVi
            value={r.end}
            onChange={(v) => patchRow(mi, ri, { end: v })}
            ariaLabel="End"
          />
          <div className="k-days">
            <input
              className="k-in k-in-num"
              type="number"
              min={0}
              value={typeof r.days === 'number' ? String(r.days) : ''}
              onChange={(e) =>
                patchRow(mi, ri, {
                  days: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
              aria-label="Số ngày"
            />
            <span>ngày</span>
          </div>
          {/* Các đợt làm việc rời nhau của đầu mục gộp — auto, không sửa tay. */}
          {r.spans && (
            <div className="k-spans" title="Các đợt có log của đầu mục này">
              {r.spans}
            </div>
          )}
        </div>
        <div className="k-c k-c-res">
          <AutoTextarea
            value={r.progress ?? ''}
            onChange={(v) => patchRow(mi, ri, { progress: v })}
            placeholder="Tiến độ/Kết quả…"
            ariaLabel="Tiến độ/Kết quả"
          />
          <div className="k-pmrow">
            <input
              className={`k-in k-in-num${kpiCls}`}
              value={r.kpi ?? ''}
              onChange={(e) => patchRow(mi, ri, { kpi: e.target.value })}
              placeholder="±"
              aria-label="KPI ±"
            />
            <AutoTextarea
              value={r.kpiNote ?? ''}
              onChange={(v) => patchRow(mi, ri, { kpiNote: v })}
              placeholder="Lý do ±…"
              ariaLabel="Lý do ±"
            />
          </div>
        </div>
        <div className="k-c k-c-act">
          {onToggleSelect && (
            <input
              type="checkbox"
              className="k-sel"
              checked={selected}
              disabled={otherMember || busyMemberId === m.memberId}
              aria-label="Chọn mục để gộp"
              title={
                otherMember
                  ? `Đang chọn mục của ${summary.members.find((x) => x.memberId === selection!.memberId)?.name ?? 'member khác'} — Bỏ chọn trước`
                  : 'Chọn mục để gộp'
              }
              onChange={() => onToggleSelect(m.memberId, r.id)}
            />
          )}
          <button
            type="button"
            className="k-iconbtn is-danger"
            aria-label="Xóa dòng"
            title="Xóa dòng"
            onClick={() => deleteRow(mi, ri)}
          >
            <IcTrash />
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="k-table" aria-label="Bảng tổng kết">
      {editable && (
        <datalist id="ksum-categories">
          {(categories ?? []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      )}
      <div className="k-thead k-grid" role="row">
        <div>Giai đoạn · App · Mốc</div>
        <div>Tasks</div>
        <div>{editable ? 'Start / End · Ngày' : 'Start → End · Ngày'}</div>
        <div>Tiến độ/Kết quả · KPI ±</div>
        {editable && (
          <div>
            <span className="k-sr">Thao tác</span>
          </div>
        )}
      </div>

      {summary.members.map((m, mi) => {
        const rows = m.rows ?? [];
        const open = isOpen(m.memberId);
        const manual = m.memberId.startsWith('manual-');
        const canRebuild = canRebuildMember ? canRebuildMember(m) : true;
        const busy = busyMemberId === m.memberId;
        const days = Number(
          rows.reduce((s, r) => s + (typeof r.days === 'number' ? r.days : 0), 0).toFixed(2),
        );
        const meta = rows.length === 0 ? 'Chưa có đầu mục' : `${rows.length} đầu mục · Σ ${days} ngày`;
        const cls = kpiScoreClass(m.kpiScore);
        const expected = mismatch.get(m.memberId) ?? null;
        const warnTitle =
          expected === null
            ? ''
            : `KPI tháng đã được sửa tay nên khác 100 + Σ ± các dòng (${expected}). Không phải lỗi; kiểm tra lại nếu không cố ý.`;

        return (
          <section
            key={m.memberId}
            id={`ksum-m-${m.memberId}`}
            className={`k-block${open ? ' is-open' : ''}`}
            aria-label={m.name}
          >
            <header className="k-bh">
              <button
                type="button"
                className="k-iconbtn k-chev"
                aria-expanded={open}
                aria-label={`${open ? 'Thu gọn' : 'Mở'} ${m.name}`}
                onClick={() => onToggle(m.memberId)}
              >
                {open ? <IcChevronDown /> : <IcChevronRight />}
              </button>
              <div className="k-bh-id">
                <h3 className="k-bh-name">{m.name}</h3>
                {manual && <span className="k-tag k-tag-manual">Nhập tay</span>}
                <span className="k-bh-meta">{meta}</span>
                {busy && (
                  <span className="k-bh-busy" role="status">
                    Đang đọc log…
                  </span>
                )}
              </div>

              {editable ? (
                <>
                  <div className="k-bh-fields">
                    <label className="k-field-inline">
                      <span>Ngày nghỉ</span>
                      <input
                        className="k-in k-bh-leave"
                        value={m.leaveNote ?? ''}
                        onChange={(e) => patchMember(mi, { leaveNote: e.target.value })}
                        placeholder="Nghỉ phép…"
                        disabled={busy}
                      />
                    </label>
                    <label className="k-field-inline">
                      <span>KPI tháng</span>
                      <input
                        className={`k-in k-in-num k-bh-score k-in-${cls}`}
                        type="number"
                        step={0.1}
                        value={String(m.kpiScore)}
                        onChange={(e) =>
                          patchMember(mi, { kpiScore: Number(e.target.value) || 0 })
                        }
                        disabled={busy}
                      />
                    </label>
                    {expected !== null && (
                      <span className="k-bh-warn" tabIndex={0} title={warnTitle} aria-label={warnTitle}>
                        <IcWarn size={14} />≠ 100 + Σ ± dòng ({expected})
                      </span>
                    )}
                  </div>
                  {selection?.memberId === m.memberId && selection.rowIds.length > 0 && (
                    <div className="k-bh-merge">
                      <button
                        type="button"
                        className="k-btn k-btn-sm k-btn-primary"
                        disabled={selection.rowIds.length < 2 || busy}
                        title={selection.rowIds.length < 2 ? 'Chọn từ 2 mục' : 'Gộp các mục đang chọn'}
                        onClick={onMergeSelected}
                      >
                        <IcMerge />
                        Gộp {selection.rowIds.length} mục
                      </button>
                      <button type="button" className="k-btn k-btn-sm" onClick={onClearSelection}>
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                  <div className="k-bh-actions">
                    {onRebuildMember && (
                      <button
                        type="button"
                        className="k-iconbtn"
                        disabled={!canRebuild || !!busyMemberId}
                        aria-label={`Tổng hợp lại khối ${m.name} từ log`}
                        title={
                          canRebuild
                            ? 'Tổng hợp lại riêng khối này từ log KPI'
                            : 'Không có log để tổng hợp (khối nhập tay hoặc member đã bị xóa)'
                        }
                        onClick={() => onRebuildMember(mi)}
                      >
                        <IcRefresh />
                      </button>
                    )}
                    {onOptimizeMember && (
                      <button
                        type="button"
                        className="k-iconbtn"
                        disabled={busy}
                        aria-label={`Tối ưu khối ${m.name}`}
                        title="Gộp các dòng cùng App + Giai đoạn + Mốc trong khối này"
                        onClick={() => onOptimizeMember(mi)}
                      >
                        <IcMerge />
                      </button>
                    )}
                    {onDeleteMember && (
                      <button
                        type="button"
                        className="k-iconbtn is-danger"
                        disabled={busy}
                        aria-label={`Bỏ ${m.name} khỏi bảng`}
                        title="Bỏ member khỏi bảng"
                        onClick={() => onDeleteMember(mi)}
                      >
                        <IcTrash />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="k-bh-ro">
                  <span className="k-bh-ro-leave">
                    Ngày nghỉ: <b>{m.leaveNote?.trim() || '—'}</b>
                  </span>
                  <span className={`k-score k-score-lg ${cls}`} aria-label={`KPI tháng ${m.kpiScore}`}>
                    {m.kpiScore}
                  </span>
                </div>
              )}
            </header>

            {open && (
              <>
                {rows.length > 0 && (
                  <div className="k-rows">
                    {rows.map((r, ri) =>
                      editable ? (
                        <div key={r.id} className="k-row-pair">
                          {renderRowEdit(mi, r, ri)}
                          {/* Bản readonly cho màn hẹp — CSS chỉ hiện 1 trong 2. */}
                          <RowReadonly r={r} extraCls=" k-row-ro" />
                        </div>
                      ) : (
                        <RowReadonly key={r.id} r={r} />
                      ),
                    )}
                  </div>
                )}
                {rows.length === 0 && (
                  <p className="k-empty">
                    Không có đầu mục nào — member chỉ có nghỉ phép hoặc không có log.
                  </p>
                )}
                {editable && (
                  <button type="button" className="k-addrow" onClick={() => addRow(mi)}>
                    <IcPlus />
                    Thêm dòng cho {m.name}
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}
    </section>
  );
}
