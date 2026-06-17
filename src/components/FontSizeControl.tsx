import { useCallback, useState } from 'react';

// Cỡ chữ cho trang chia sẻ (chỉ đọc), tính bằng px.
const STORAGE_KEY = 'share-font-px';
const MIN_PX = 14;
const MAX_PX = 30;
const STEP_PX = 2;
const DEFAULT_PX = 16;

// Đọc cỡ chữ đã lưu (nếu hợp lệ), nếu không thì dùng mặc định.
function readStored(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(v) && v >= MIN_PX && v <= MAX_PX) return v;
  } catch {
    // localStorage có thể bị chặn (chế độ riêng tư) → bỏ qua, dùng mặc định.
  }
  return DEFAULT_PX;
}

/**
 * Quản lý cỡ chữ cho nội dung tài liệu chia sẻ.
 * Trả về cỡ chữ hiện tại (px) để gắn vào style, và `control` là cụm nút
 * tăng/giảm để đặt vào header. Lựa chọn được nhớ qua localStorage.
 */
export function useFontScale() {
  const [fontPx, setFontPx] = useState<number>(readStored);

  // delta dương = to hơn, âm = nhỏ hơn; luôn kẹp trong [MIN_PX, MAX_PX].
  const change = useCallback((delta: number) => {
    setFontPx((prev) => {
      const next = Math.min(MAX_PX, Math.max(MIN_PX, prev + delta));
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Không lưu được thì vẫn đổi cỡ chữ cho phiên hiện tại.
      }
      return next;
    });
  }, []);

  const control = (
    <div className="font-control" role="group" aria-label="Cỡ chữ">
      <button
        type="button"
        className="font-control-btn"
        onClick={() => change(-STEP_PX)}
        disabled={fontPx <= MIN_PX}
        aria-label="Giảm cỡ chữ"
        title="Giảm cỡ chữ"
      >
        A−
      </button>
      <span className="font-control-value" aria-live="polite">
        {fontPx}px
      </span>
      <button
        type="button"
        className="font-control-btn"
        onClick={() => change(STEP_PX)}
        disabled={fontPx >= MAX_PX}
        aria-label="Tăng cỡ chữ"
        title="Tăng cỡ chữ"
      >
        A+
      </button>
    </div>
  );

  return { fontPx, control };
}
