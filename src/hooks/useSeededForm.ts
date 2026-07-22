import { useCallback, useEffect, useRef, useState } from 'react';

// Hook form dùng chung cho các trang editor (Plan tuần, Báo cáo ngày…):
// - Nạp dữ liệu vào form MỘT LẦN khi entity (theo id) sẵn sàng, tránh ghi đè khi đang gõ.
// - Không re-seed khi Firebase dội data về (id không đổi) → không nhảy con trỏ.
// - Quản lý cờ `dirty` + `patch` (merge + đánh dấu thay đổi).
export function useSeededForm<T extends object, E extends { id: string }>(
  entity: E | undefined,
  toForm: (e: E) => T,
) {
  const [form, setForm] = useState<T | null>(null);
  const [dirty, setDirty] = useState(false);
  const seeded = useRef<string | null>(null);
  // Giữ toForm trong ref để deps effect chỉ phụ thuộc entity (tránh stale mà không re-seed thừa).
  const toFormRef = useRef(toForm);
  toFormRef.current = toForm;

  useEffect(() => {
    if (entity && seeded.current !== entity.id) {
      seeded.current = entity.id;
      setForm(toFormRef.current(entity));
      setDirty(false);
    }
  }, [entity]);

  const patch = useCallback((u: Partial<T>) => {
    setForm((f) => (f ? { ...f, ...u } : f));
    setDirty(true);
  }, []);

  return { form, setForm, dirty, setDirty, patch };
}
