// Dialog xác nhận trong app cho trang Tổng kết KPI (thay window.confirm): nền mờ rõ,
// icon theo mức độ, focus mặc định ở Hủy, Esc / bấm nền để hủy.
import { useEffect, useRef, type ReactNode } from 'react';
import { IcClose } from './ksumIcons';

export type KsumTone = 'danger' | 'warn' | 'info';

interface Props {
  tone: KsumTone;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  confirmLabel: string;
  /** Kiểu nút đồng ý: primary (xanh), danger (viền đỏ), danger-solid (nền đỏ). */
  confirmKind?: 'primary' | 'danger' | 'danger-solid';
  confirmDisabled?: boolean;
  /** Dialog thông tin (không phải xác nhận nguy hiểm) → role dialog + nút ✕. */
  plain?: boolean;
  /** false = Esc / bấm nền KHÔNG đóng (dialog có form sửa — tránh mất nội dung đang sửa). */
  dismissible?: boolean;
  /** Dialog rộng (form nhiều cột). */
  wide?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function KsumConfirmDialog({
  tone,
  icon,
  title,
  subtitle,
  children,
  confirmLabel,
  confirmKind = 'primary',
  confirmDisabled,
  plain,
  dismissible = true,
  wide,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  // onCancel thường là hàm mới mỗi lần render → giữ qua ref để effect chỉ chạy lúc mở.
  const cancelFn = useRef(onCancel);
  cancelFn.current = onCancel;

  useEffect(() => {
    // Dialog thông tin tự focus ô nhập bên trong (autoFocus); dialog xác nhận focus Hủy.
    if (!plain) cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) cancelFn.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btnCls =
    confirmKind === 'danger-solid'
      ? 'k-btn k-btn-danger-solid'
      : confirmKind === 'danger'
        ? 'k-btn k-btn-danger'
        : 'k-btn k-btn-primary';

  return (
    <div
      className="k-modal"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={`k-dialog${tone === 'danger' && !plain ? ' is-danger' : ''}${wide ? ' is-wide' : ''}`}
        role={plain ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby="ksum-dialog-title"
      >
        <div className="k-dialog-h">
          <span className={`k-dialog-ic is-${tone}`}>{icon}</span>
          <div>
            <h3 id="ksum-dialog-title">{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {plain && (
            <button
              type="button"
              className="k-iconbtn k-dialog-x"
              aria-label="Đóng"
              onClick={onCancel}
            >
              <IcClose />
            </button>
          )}
        </div>
        {children && <div className="k-dialog-b">{children}</div>}
        <div className="k-dialog-f">
          <button ref={cancelRef} type="button" className="k-btn" onClick={onCancel}>
            Hủy
          </button>
          <button
            type="button"
            className={btnCls}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
