// Khung dialog chung cho trang Log KPI của member (dùng lại style k-modal/k-dialog của
// trang Tổng kết): Esc / bấm nền để đóng, nút ✕, focus vào dialog khi mở và trả focus
// về chỗ cũ khi đóng. `dismissible=false` (form đã sửa) → chỉ đóng bằng nút.
// `sheet` → màn hẹp hiện dạng bottom sheet (chi tiết dòng).
// `fullscreen` → dialog toàn màn hình (màn hẹp): thanh trên = ✕ · tiêu đề · `headAction`.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IcClose } from './ksumIcons';

interface Props {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Màu ô icon ở header (mặc định info xanh). */
  tone?: 'info' | 'warn' | 'pos' | 'danger';
  children?: ReactNode;
  /** Nút cuối dialog (căn phải). */
  actions?: ReactNode;
  /** Hàng công cụ giữa header và thân (không cuộn theo thân). */
  toolbar?: ReactNode;
  dismissible?: boolean;
  wide?: boolean;
  sheet?: boolean;
  fullscreen?: boolean;
  /** Nút bên phải thanh trên khi `fullscreen`. */
  headAction?: ReactNode;
  /** Thân dialog cuộn riêng (danh sách dài) — có viền trên/dưới. */
  scrollBody?: boolean;
  /** Class thêm cho khung dialog. */
  className?: string;
  onClose: () => void;
}

export default function KpiDialog({
  title,
  subtitle,
  icon,
  tone = 'info',
  children,
  actions,
  toolbar,
  dismissible = true,
  wide,
  sheet,
  fullscreen,
  headAction,
  scrollBody,
  className,
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
      className={`k-modal kml-modal${sheet ? ' is-sheet' : ''}${fullscreen ? ' is-full' : ''}`}
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        className={`k-dialog kml-dialog${wide ? ' is-wide' : ''}${sheet ? ' is-sheet' : ''}${fullscreen ? ' is-full' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {fullscreen ? (
          <div className="kml-fs-bar">
            <button type="button" className="kml-iconbtn" aria-label="Đóng" onClick={onClose}>
              <IcClose size={20} />
            </button>
            <div className="kml-dialog-titles">
              <h3 id={titleId}>{title}</h3>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {headAction}
          </div>
        ) : (
          <div className="k-dialog-h">
            {icon && <span className={`k-dialog-ic is-${tone}`}>{icon}</span>}
            <div className="kml-dialog-titles">
              <h3 id={titleId}>{title}</h3>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button type="button" className="k-iconbtn k-dialog-x" aria-label="Đóng" onClick={onClose}>
              <IcClose />
            </button>
          </div>
        )}
        {toolbar && <div className="kml-dialog-tools">{toolbar}</div>}
        {children && (
          <div className={`k-dialog-b${scrollBody ? ' kml-dialog-scroll' : ''}`}>{children}</div>
        )}
        {actions && <div className="k-dialog-f">{actions}</div>}
      </div>
    </div>
  );
}
