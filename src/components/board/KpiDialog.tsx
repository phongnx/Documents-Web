// Khung dialog chung cho trang Log KPI của member (dùng lại style k-modal/k-dialog của
// trang Tổng kết): Esc / bấm nền để đóng, nút ✕, focus vào dialog khi mở và trả focus
// về chỗ cũ khi đóng. `dismissible=false` (form đã sửa) → chỉ đóng bằng nút.
// `sheet` → màn hẹp hiện dạng bottom sheet (chi tiết dòng).
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IcClose } from './ksumIcons';

interface Props {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  /** Nút cuối dialog (căn phải). */
  actions?: ReactNode;
  dismissible?: boolean;
  wide?: boolean;
  sheet?: boolean;
  /** Thân dialog cuộn riêng (danh sách dài) — có viền trên/dưới. */
  scrollBody?: boolean;
  onClose: () => void;
}

export default function KpiDialog({
  title,
  subtitle,
  icon,
  children,
  actions,
  dismissible = true,
  wide,
  sheet,
  scrollBody,
  onClose,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // onClose / dismissible đổi theo render → đọc qua ref để listener chỉ gắn 1 lần.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissRef = useRef(dismissible);
  dismissRef.current = dismissible;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // Con có autoFocus (ô nhập) thì giữ; không thì focus khung để Esc/Tab hoạt động.
    if (!boxRef.current?.contains(document.activeElement)) boxRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !dismissRef.current) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className={`k-modal kml-modal${sheet ? ' is-sheet' : ''}`}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        className={`k-dialog kml-dialog${wide ? ' is-wide' : ''}${sheet ? ' is-sheet' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="k-dialog-h">
          {icon && <span className="k-dialog-ic is-info">{icon}</span>}
          <div className="kml-dialog-titles">
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="k-iconbtn k-dialog-x" aria-label="Đóng" onClick={onClose}>
            <IcClose />
          </button>
        </div>
        {children && (
          <div className={`k-dialog-b${scrollBody ? ' kml-dialog-scroll' : ''}`}>{children}</div>
        )}
        {actions && <div className="k-dialog-f">{actions}</div>}
      </div>
    </div>
  );
}
