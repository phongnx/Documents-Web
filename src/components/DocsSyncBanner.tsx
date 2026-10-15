// Banner trạng thái lưu tài liệu lên server (cố định đáy màn hình).
// Firebase hiện thay đổi trên UI ngay khi gọi ghi, kể cả khi chưa tới được server
// — banner này cho người dùng biết lúc nào thay đổi THỰC SỰ chưa được lưu.
import { useEffect, useState } from 'react';
import { useDocuments } from '../context/DocumentsContext';

// Mất kết nối quá lâu mới báo — tránh nháy banner lúc mới mở trang (kết nối ban đầu).
const OFFLINE_DELAY_MS = 3000;
// Lệnh ghi chờ quá lâu mới báo — auto-save khi đang gõ thường xong rất nhanh.
const PENDING_DELAY_MS = 1500;

// true khi `active` giữ nguyên true liên tục ít nhất `ms`.
function useDelayedFlag(active: boolean, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const t = window.setTimeout(() => setOn(true), ms);
    return () => window.clearTimeout(t);
  }, [active, ms]);
  return on;
}

export default function DocsSyncBanner() {
  const { connected, pendingWrites, writeError, clearWriteError } = useDocuments();
  const offline = useDelayedFlag(!connected, OFFLINE_DELAY_MS);
  const slow = useDelayedFlag(pendingWrites > 0, PENDING_DELAY_MS);

  if (writeError) {
    return (
      <div className="sync-banner sync-banner-error" role="alert">
        <span>❌ Lưu thất bại: {writeError}. Thay đổi đã bị hoàn tác.</span>
        <button type="button" onClick={clearWriteError} aria-label="Đóng">
          ✕
        </button>
      </div>
    );
  }
  if (offline) {
    return (
      <div className="sync-banner sync-banner-offline" role="status">
        ⚠️ Mất kết nối tới server
        {pendingWrites > 0
          ? ` — ${pendingWrites} thay đổi chưa được lưu, đừng đóng tab.`
          : '.'}
      </div>
    );
  }
  if (slow) {
    return (
      <div className="sync-banner" role="status">
        ⏳ Đang lưu {pendingWrites} thay đổi lên server…
      </div>
    );
  }
  return null;
}
