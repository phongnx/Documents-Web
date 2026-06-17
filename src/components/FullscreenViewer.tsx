import { useEffect, useState, type ReactNode } from 'react';

// Bọc vùng nội dung tài liệu, thêm nút phóng to phủ kín vùng hiển thị của app
// (overlay position:fixed). Mục đích: bỏ header/padding xung quanh để đọc rộng hơn.
// Thoát bằng nút ✕ hoặc phím ESC. Đây là "maximize trong trang" (không dùng
// Fullscreen API), nên hoạt động đồng nhất trên mọi trình duyệt.
export default function FullscreenViewer({ children }: { children: ReactNode }) {
  const [max, setMax] = useState(false);

  // Khi đang phóng to: nghe ESC để thoát và khóa scroll nền.
  useEffect(() => {
    if (!max) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMax(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [max]);

  return (
    <div className={`fs-wrap${max ? ' is-max' : ''}`}>
      <button
        type="button"
        className="fs-btn"
        onClick={() => setMax((v) => !v)}
        title={max ? 'Thoát toàn màn hình (ESC)' : 'Xem toàn màn hình'}
        aria-label={max ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'}
      >
        {max ? '✕' : '⛶'}
      </button>
      {children}
    </div>
  );
}
