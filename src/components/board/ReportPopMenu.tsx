// Menu thả dưới nút (⋮, Tạo báo cáo ▾) của Báo cáo ngày: bấm ra ngoài khung anchor / Esc để đóng.
// Đặt trong 1 phần tử .kml-menu-anchor chứa luôn nút mở menu.
import { useEffect, useRef, type ReactNode } from 'react';

export default function ReportPopMenu({
  label,
  className = '',
  onClose,
  children,
}: {
  label: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <div ref={ref} className={`kml-menu rpt-popmenu ${className}`.trim()} role="menu" aria-label={label}>
      {children}
    </div>
  );
}
