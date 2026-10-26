// Ô ngày luôn hiển thị dd/mm/yyyy (không phụ thuộc locale trình duyệt như input type=date
// — trước đây trang sửa hiện mm/dd còn trang share hiện dd/mm). Giá trị vào/ra vẫn ISO
// 'yyyy-mm-dd'. Gõ tay có mask tự chèn '/'; nút lịch mở bộ chọn ngày của trình duyệt
// qua 1 input type=date ẩn.
import { useEffect, useRef, useState } from 'react';
import { IcCalendar } from './board/ksumIcons';

interface Props {
  value?: string;
  onChange: (iso: string | undefined) => void;
  ariaLabel: string;
  className?: string;
}

const isoToVi = (iso?: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
};

/** 'dd/mm/yyyy' hợp lệ → ISO; rỗng → '' ; sai (31/02, thiếu số) → null. */
const viToIso = (s: string): string | null => {
  const t = s.trim();
  if (!t) return '';
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (
    dt.getFullYear() !== Number(y) ||
    dt.getMonth() !== Number(mo) - 1 ||
    dt.getDate() !== Number(d)
  )
    return null;
  return `${y}-${mo}-${d}`;
};

/** Chỉ giữ chữ số rồi chèn '/' sau ngày và tháng: '03082026' → '03/08/2026'. */
const mask = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export default function DateInputVi({ value, onChange, ariaLabel, className }: Props) {
  const [text, setText] = useState(isoToVi(value));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  // Giá trị đổi từ ngoài (tổng hợp lại, tối ưu, chọn lịch) → đồng bộ chữ, trừ lúc đang gõ.
  useEffect(() => {
    if (focused.current) return;
    setText(isoToVi(value));
    setInvalid(false);
  }, [value]);

  const commit = (s: string) => {
    const iso = viToIso(s);
    if (iso === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if ((iso || undefined) !== (value || undefined)) onChange(iso || undefined);
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      // Trình duyệt cũ không có showPicker → focus để bàn phím mở được bộ chọn.
      el.focus();
    }
  };

  return (
    <div className="k-date">
      <input
        className={`k-in${invalid ? ' is-invalid' : ''}${className ? ` ${className}` : ''}`}
        value={text}
        placeholder="dd/mm/yyyy"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={invalid ? 'Ngày không hợp lệ — nhập dạng dd/mm/yyyy' : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => {
          const v = mask(e.target.value);
          setText(v);
          // Đủ 10 ký tự hoặc xóa trống → ghi luôn, không chờ rời ô.
          if (v.length === 10 || v === '') commit(v);
          else setInvalid(false);
        }}
        onBlur={() => {
          focused.current = false;
          commit(text);
        }}
      />
      <button
        type="button"
        className="k-iconbtn"
        aria-label={`Chọn ngày ${ariaLabel}`}
        onClick={openPicker}
      >
        <IcCalendar />
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="k-date-picker"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ''}
        onChange={(e) => {
          const iso = e.target.value || undefined;
          setText(isoToVi(iso));
          setInvalid(false);
          onChange(iso);
        }}
      />
    </div>
  );
}
