import { useEffect } from 'react';

// Cảnh báo khi rời/tải lại trang (đóng tab, F5, back trình duyệt) lúc còn thay đổi chưa lưu.
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
