// Chọn thứ cho 1 dòng Timeline release của Plan tuần: lưới các ngày trong khoảng ngày của plan
// (kèm dd/mm), lưu nhãn 'Thứ N' như trước. Giá trị cũ không đúng mẫu 'Thứ N' / 'Chủ nhật' được
// giữ nguyên và viền vàng để user tự chọn lại. Màn hẹp mở dạng bottom sheet.
import { DAY_ORDER, dayRank } from '../../pmTypes';
import { addDays, mondayOf, weekdayVN } from '../../lib/pmDates';
import { formatDayMonth, weekdayShort } from '../../lib/reportFormat';
import ReportPopMenu from './ReportPopMenu';
import KpiDialog from './KpiDialog';
import { IcCalendar, IcChevronDown, IcClose, IcWarn } from './ksumIcons';

interface Props {
  value: string;
  weekStart: string;
  weekEnd: string;
  open: boolean;
  narrow: boolean;
  /** Nhãn cho trình đọc màn hình (VD: "Thứ của Email Client v1.99"). */
  label: string;
  onToggle: (open: boolean) => void;
  onChange: (day: string) => void;
}

interface DayCell {
  day: string;
  short: string;
  date?: string;
}

// Các ngày của plan (tối đa 7, mỗi thứ 1 ô). Khoảng ngày lỗi → Thứ 2–6 của tuần ngày bắt đầu.
function daysOf(start: string, end: string): DayCell[] {
  const out: DayCell[] = [];
  if (start && end && start <= end) {
    for (let d = start; d <= end && out.length < 7; d = addDays(d, 1)) {
      const day = weekdayVN(d);
      if (!day || out.some((c) => c.day === day)) continue;
      out.push({ day, short: weekdayShort(d), date: formatDayMonth(d) });
    }
  }
  if (out.length > 0) return out;
  const mon = start ? mondayOf(start) : '';
  return DAY_ORDER.slice(0, 5).map((day, i) => {
    const d = mon ? addDays(mon, i) : '';
    return { day, short: `T${i + 2}`, date: d ? formatDayMonth(d) : undefined };
  });
}

export default function PlanDayPicker({
  value,
  weekStart,
  weekEnd,
  open,
  narrow,
  label,
  onToggle,
  onChange,
}: Props) {
  const cells = daysOf(weekStart, weekEnd);
  const v = value.trim();
  const cur = cells.find((c) => c.day.toLowerCase() === v.toLowerCase());
  const legacy = !!v && dayRank(v) === Number.MAX_SAFE_INTEGER;
  const cls = !v ? ' is-empty' : legacy ? ' is-legacy' : '';

  const pick = (day: string) => {
    onChange(day);
    onToggle(false);
  };
  const grid = (
    <>
      <div
        className="pl-daygrid"
        style={{ gridTemplateColumns: `repeat(${Math.min(cells.length, narrow ? 4 : 7)}, minmax(0, 1fr))` }}
      >
        {cells.map((c) => (
          <button
            key={c.day}
            type="button"
            className={cur?.day === c.day ? 'on' : ''}
            aria-pressed={cur?.day === c.day}
            onClick={() => pick(c.day)}
          >
            {c.short}
            {c.date && <small>{c.date}</small>}
          </button>
        ))}
      </div>
      <div className="pl-daygrid-foot">
        {legacy && (
          <span className="pl-daygrid-legacy">
            <IcWarn size={14} />
            Giá trị cũ «{v}» — chọn lại thứ
          </span>
        )}
        <span className="kml-spacer" />
        <button
          type="button"
          className="kml-btn kml-btn-text"
          disabled={!v}
          onClick={() => pick('')}
        >
          <IcClose size={16} />
          Bỏ chọn thứ
        </button>
      </div>
    </>
  );

  return (
    <div className="kml-menu-anchor pl-day-anchor">
      <button
        type="button"
        className={`pl-daysel${cls}${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${v || 'chưa chọn thứ'}`}
        title={legacy ? 'Giá trị cũ không đúng mẫu "Thứ N" — chọn lại thứ' : undefined}
        onClick={() => onToggle(!open)}
      >
        {v ? (
          <span className="pl-daysel-t">
            {legacy ? v : cur?.day ?? v}
            {cur?.date && <small>· {cur.date}</small>}
            {!legacy && !cur && <small>· ngoài khoảng ngày</small>}
          </span>
        ) : (
          <span className="pl-daysel-t">
            <IcCalendar size={16} />
            Chọn thứ
          </span>
        )}
        <IcChevronDown size={14} />
      </button>
      {open &&
        (narrow ? (
          <KpiDialog title="Chọn thứ release" subtitle={label} sheet onClose={() => onToggle(false)}>
            {grid}
          </KpiDialog>
        ) : (
          <ReportPopMenu label="Chọn thứ release" className="pl-daymenu" onClose={() => onToggle(false)}>
            {grid}
          </ReportPopMenu>
        ))}
    </div>
  );
}
