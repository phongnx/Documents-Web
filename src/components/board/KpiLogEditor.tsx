// Form sửa 1 dòng log KPI (trang member) — dùng cho 2 dạng:
// - 'inline': khung mở rộng ngay trong danh sách (desktop ≥ 840px).
// - 'full': dialog toàn màn hình (màn hẹp).
// Lỗi kiểm tra hiện ngay dưới từng ô. Phím: Ctrl/⌘+Enter lưu ở mọi ô; Enter lưu ở ô 1
// dòng (ô Task Enter = xuống dòng); Esc hủy. Bỏ qua Enter khi bộ gõ đang ghép chữ.
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import {
  durationMin,
  fmtHours,
  NO_MILESTONE,
  type KpiMilestoneOption,
} from '../../kpiTypes';
import {
  relMatches,
  relOf,
  shortRelLabel,
  type DraftCheck,
  type DraftField,
  type RowDraft,
} from '../../lib/kpiLogDraft';
import { weekdayVN } from '../../lib/pmDates';
import {
  IcAlert,
  IcCheck,
  IcClose,
  IcCopy,
  IcEdit,
  IcLock,
  IcPlus,
  IcRuler,
  IcTrash,
} from './ksumIcons';

interface Props {
  draft: RowDraft;
  errors: DraftCheck | null;
  variant: 'inline' | 'full';
  /** Ngày tương lai → dòng plan, chưa cần giờ. */
  isPlan: boolean;
  categories: string[];
  projectNames: string[];
  /** true = Project chỉ chọn trong danh sách được gán; false (sheet cũ) = ô nhập + gợi ý. */
  strictProjects: boolean;
  relOptions: KpiMilestoneOption[];
  /** Member có bảng estimate → hiện nút chọn task estimate trong ô Task. */
  canPickEst: boolean;
  /** Leader vừa chấm dòng đang sửa (realtime) → không lưu được nữa. */
  scoredWhileEditing: boolean;
  onPatch: (u: Partial<RowDraft>) => void;
  onProjectChange: (project: string) => void;
  onOpenEst: () => void;
  onSave: () => void;
  onCancel: () => void;
  /** Chỉ dòng đã có (không phải dòng mới). */
  onDuplicate?: () => void;
  onDelete?: () => void;
}

/** 'T3 10/11' — nhãn ngày ngắn cho lựa chọn mốc. */
export const shortDay = (iso: string): string => {
  const w = weekdayVN(iso);
  return `${w === 'Chủ nhật' ? 'CN' : w.replace('Thứ ', 'T')} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
};

// Thứ tự ô để focus ô lỗi đầu tiên.
const FIELD_ORDER: DraftField[] = ['start', 'end', 'category', 'project', 'rel', 'task'];
const FIELD_LABEL: Record<DraftField, string> = {
  start: 'Giờ bắt đầu',
  end: 'Giờ kết thúc',
  category: 'Giai đoạn',
  project: 'Project',
  rel: 'Mốc release',
  task: 'Task',
};

export default function KpiLogEditor({
  draft: d,
  errors,
  variant,
  isPlan,
  categories,
  projectNames,
  strictProjects,
  relOptions,
  canPickEst,
  scoredWhileEditing,
  onPatch,
  onProjectChange,
  onOpenEst,
  onSave,
  onCancel,
  onDuplicate,
  onDelete,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<HTMLTextAreaElement>(null);
  const isNew = !d.id;
  const err = errors?.fields ?? {};

  const focusField = (k: string) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-field="${k}"]`)?.focus();

  // Mở form: cuộn vào tầm nhìn + focus ô cần nhập đầu tiên (chạy 1 lần lúc mount —
  // component được remount theo key mỗi khi đổi dòng).
  useEffect(() => {
    if (variant === 'inline') rootRef.current?.scrollIntoView({ block: 'nearest' });
    focusField(
      isPlan
        ? !d.category ? 'category' : 'task'
        : !d.start ? 'start' : !d.end ? 'end' : !d.category ? 'category' : 'task',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lưu thất bại → focus ô lỗi đầu tiên.
  useEffect(() => {
    if (!errors) return;
    const first = FIELD_ORDER.find((k) => errors.fields[k]);
    if (first) focusField(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors]);

  // Ô Task tự giãn theo nội dung.
  useLayoutEffect(() => {
    const el = taskRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [d.task]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave();
      return;
    }
    if (e.key === 'Enter' && (e.target as HTMLElement).dataset.enterSave !== undefined) {
      e.preventDefault();
      onSave();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  // 1 ô nhập: nhãn nổi trên viền + dấu * bắt buộc + dòng lỗi / hướng dẫn bên dưới.
  const field = (
    k: string,
    label: string,
    required: boolean,
    control: ReactNode,
    help?: ReactNode,
    cls = '',
  ) => {
    const msg = err[k as DraftField];
    return (
      <div className={`kml-field${msg ? ' is-err' : ''} ${cls}`.trim()}>
        <span className="kml-field-label">
          {label}
          {required && <span className="kml-req" aria-hidden="true">*</span>}
        </span>
        {control}
        {msg ? (
          <span className="kml-field-sup is-err" id={`kml-sup-${k}`}>
            <IcAlert size={14} />
            {msg}
          </span>
        ) : help ? (
          <span className="kml-field-sup">{help}</span>
        ) : null}
      </div>
    );
  };
  const aria = (k: DraftField, required = true) => ({
    'data-field': k,
    'aria-label': FIELD_LABEL[k],
    'aria-required': required || undefined,
    'aria-invalid': err[k] ? true : undefined,
    'aria-describedby': err[k] ? `kml-sup-${k}` : undefined,
  });

  const dur = durationMin({ start: d.start, end: d.end });
  const durBad = !!d.start && !!d.end && dur === null;

  // Mốc: lựa chọn đang lưu không còn trong danh sách (dòng cũ) → giữ 1 option riêng.
  const cur =
    d.rel && d.rel.label !== NO_MILESTONE ? relOptions.find((o) => relMatches(d.rel!, o)) : undefined;
  const legacy = !!d.rel && d.rel.label !== NO_MILESTONE && !cur;
  const relValue = !d.rel ? '' : d.rel.label === NO_MILESTONE ? NO_MILESTONE : cur ? cur.key : '__cur';
  const noOpenMs = !!d.project.trim() && relOptions.length === 0;

  const title = isNew ? (isPlan ? 'Thêm dòng plan' : 'Thêm dòng') : 'Sửa dòng';
  const sub = `${weekdayVN(d.date)}, ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}${
    isPlan ? ' — dòng plan, chưa cần điền giờ' : ''
  }`;

  const timeFields = (
    <>
      {field(
        'start',
        'Bắt đầu',
        !isPlan,
        <input
          type="time"
          className="kml-input"
          data-enter-save
          value={d.start}
          onChange={(e) => onPatch({ start: e.target.value })}
          {...aria('start', !isPlan)}
        />,
      )}
      {field(
        'end',
        'Kết thúc',
        !isPlan,
        <input
          type="time"
          className="kml-input"
          data-enter-save
          value={d.end}
          onChange={(e) => onPatch({ end: e.target.value })}
          {...aria('end', !isPlan)}
        />,
      )}
      <div className="kml-dur-box" aria-live="polite">
        <span className="kml-field-label">Thời lượng</span>
        <span className={`kml-dur-val${durBad ? ' is-err' : ''}`}>{dur !== null ? fmtHours(dur) : '—'}</span>
      </div>
    </>
  );

  const categoryField = field(
    'category',
    'Giai đoạn',
    true,
    <select
      className="kml-input"
      value={d.category}
      onChange={(e) => onPatch({ category: e.target.value })}
      {...aria('category')}
    >
      <option value="">Chọn…</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      {d.category && !categories.includes(d.category) && <option value={d.category}>{d.category}</option>}
    </select>,
  );

  const projectField = field(
    'project',
    'Project',
    true,
    strictProjects ? (
      // Option giá trị cũ ngoài danh sách chỉ hiện khi sửa dòng CŨ (dòng mới bị validate chặn).
      <select
        className="kml-input"
        value={d.project}
        onChange={(e) => onProjectChange(e.target.value)}
        {...aria('project')}
      >
        <option value="">Chọn…</option>
        {projectNames.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        {d.project && !projectNames.includes(d.project) && (
          <option value={d.project}>{d.project} (tên cũ)</option>
        )}
      </select>
    ) : (
      <>
        <input
          className="kml-input"
          list="kml-projects"
          data-enter-save
          value={d.project}
          onChange={(e) => onProjectChange(e.target.value)}
          placeholder="Tên project"
          {...aria('project')}
        />
        <datalist id="kml-projects">
          {projectNames.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </>
    ),
  );

  const relField = field(
    'rel',
    'Mốc release',
    true,
    <select
      className="kml-input"
      value={relValue}
      disabled={!d.project.trim()}
      title="Bảng tổng kết tháng gom các dòng theo mốc này"
      onChange={(e) => {
        const v = e.target.value;
        if (!v) return onPatch({ rel: undefined });
        if (v === NO_MILESTONE) return onPatch({ rel: { label: NO_MILESTONE } });
        if (v === '__cur') return;
        const o = relOptions.find((x) => x.key === v);
        if (o) onPatch({ rel: relOf(o) });
      }}
      {...aria('rel')}
    >
      <option value="">{d.project.trim() ? 'Chọn mốc…' : 'Chọn project trước'}</option>
      {relOptions.map((o) => (
        <option key={o.key} value={o.key}>
          {shortRelLabel(o.label, d.project)}
          {o.date ? ` · ${shortDay(o.date)}` : ''}
        </option>
      ))}
      {legacy && <option value="__cur">{shortRelLabel(d.rel!.label, d.project)} (đã đóng)</option>}
      <option value={NO_MILESTONE}>{NO_MILESTONE}</option>
    </select>,
    noOpenMs
      ? `${d.project} chưa có mốc mở — chọn "${NO_MILESTONE}" hoặc báo leader thêm mốc trên page Task.`
      : undefined,
  );

  const taskField = (
    <>
      {field(
        'task',
        'Task',
        true,
        <div className="kml-task-box">
          <textarea
            ref={taskRef}
            className="kml-input kml-task-input"
            rows={3}
            value={d.task}
            placeholder="Mô tả task, mã ticket…"
            onChange={(e) => onPatch({ task: e.target.value })}
            {...aria('task')}
          />
          {canPickEst && (
            <button
              type="button"
              className="kml-iconbtn kml-task-est"
              aria-label="Chọn task từ estimate"
              title="Chọn task từ estimate"
              onClick={onOpenEst}
            >
              <IcRuler size={18} />
            </button>
          )}
        </div>,
        variant === 'inline' ? 'Enter để xuống dòng · Ctrl + Enter để lưu' : undefined,
      )}
      {d.estRef && (
        <div className="kml-est-line">
          <span className="kml-input-chip" title="Giờ của dòng này sẽ cộng vào task estimate">
            <IcRuler size={14} />
            <span className="kml-ellipsis">{d.estRef.title ?? 'task estimate'}</span>
            <button
              type="button"
              className="kml-iconbtn is-xs"
              aria-label="Bỏ liên kết estimate"
              title="Bỏ liên kết estimate"
              onClick={() => onPatch({ estRef: undefined, estDone: false })}
            >
              <IcClose size={14} />
            </button>
          </span>
          <label
            className="kml-check"
            title="Chốt task estimate xong — dòng này nhận điểm gợi ý theo est so với thực tế"
          >
            <input
              type="checkbox"
              checked={d.estDone}
              onChange={(e) => onPatch({ estDone: e.target.checked })}
            />
            Hoàn thành task estimate
          </label>
        </div>
      )}
    </>
  );

  const optionalFields = (
    <>
      {field(
        'feature',
        'Feature',
        false,
        <input
          className="kml-input"
          data-field="feature"
          aria-label="Feature"
          data-enter-save
          value={d.feature}
          placeholder="Không bắt buộc"
          onChange={(e) => onPatch({ feature: e.target.value })}
        />,
      )}
      {field(
        'note',
        'Note',
        false,
        <input
          className="kml-input"
          data-field="note"
          aria-label="Note"
          data-enter-save
          value={d.note}
          placeholder="Không bắt buộc"
          onChange={(e) => onPatch({ note: e.target.value })}
        />,
      )}
      {field(
        'selfDelta',
        'Điểm tự chấm',
        false,
        <input
          type="number"
          step="0.1"
          className="kml-input kml-num"
          data-field="selfDelta"
          aria-label="Điểm tự chấm"
          data-enter-save
          title="Điểm tự chấm (mặc định 0) — leader sẽ xác nhận/chỉnh khi chấm"
          value={d.selfDelta}
          onChange={(e) => onPatch({ selfDelta: e.target.value })}
        />,
      )}
    </>
  );

  const alerts = (
    <>
      {scoredWhileEditing && (
        <div className="kml-alert" role="alert">
          <IcLock size={16} />
          <span>Leader vừa chấm dòng này — không lưu được nữa. Bấm Hủy để đóng.</span>
        </div>
      )}
      {errors?.top && (
        <div className="kml-alert" role="alert">
          <IcAlert size={16} />
          <span>{errors.top}</span>
        </div>
      )}
    </>
  );

  if (variant === 'full') {
    return (
      <div
        ref={rootRef}
        className="kml-fullscreen"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onKeyDown}
      >
        <div className="kml-fs-bar">
          <button type="button" className="kml-iconbtn" aria-label="Đóng" onClick={onCancel}>
            <IcClose size={20} />
          </button>
          <div className="kml-fs-title">
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <button
            type="button"
            className="kml-btn kml-btn-text"
            disabled={scoredWhileEditing}
            onClick={onSave}
          >
            Lưu
          </button>
        </div>
        <div className="kml-fs-body">
          {alerts}
          <div className="kml-fs-grid2">
            {timeFields}
          </div>
          {categoryField}
          {projectField}
          {relField}
          {taskField}
          {optionalFields}
          {!isNew && (
            <div className="kml-fs-actions">
              <button type="button" className="kml-btn kml-btn-tonal" onClick={onDuplicate}>
                <IcCopy size={16} />
                Nhân bản
              </button>
              <button type="button" className="kml-btn kml-btn-text is-danger" onClick={onDelete}>
                <IcTrash size={16} />
                Xóa dòng
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="kml-editor" role="group" aria-label={title} onKeyDown={onKeyDown}>
      <div className="kml-editor-title">
        {isNew ? <IcPlus size={16} /> : <IcEdit size={16} />}
        <strong>{title}</strong>
        <span className="k-muted">{sub}</span>
      </div>
      {alerts}
      <div className="kml-ed-row1">
        <div className="kml-ed-time">{timeFields}</div>
        {categoryField}
        {projectField}
        {relField}
      </div>
      <div className="kml-ed-task">{taskField}</div>
      <div className="kml-ed-row3">{optionalFields}</div>
      <div className="kml-ed-foot">
        {!isNew && (
          <>
            <button type="button" className="kml-btn kml-btn-text" onClick={onDuplicate}>
              <IcCopy size={16} />
              Nhân bản
            </button>
            <button type="button" className="kml-btn kml-btn-text is-danger" onClick={onDelete}>
              <IcTrash size={16} />
              Xóa
            </button>
          </>
        )}
        <span className="kml-spacer" />
        <span className="kml-ed-hint">Ctrl + Enter để lưu · Esc để hủy</span>
        <button type="button" className="kml-btn kml-btn-text" onClick={onCancel}>
          Hủy
        </button>
        <button
          type="button"
          className="kml-btn kml-btn-filled"
          disabled={scoredWhileEditing}
          onClick={onSave}
        >
          <IcCheck size={16} />
          Lưu
        </button>
      </div>
    </div>
  );
}
