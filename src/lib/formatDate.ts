/** Định dạng chuỗi ISO thành ngày-giờ ngắn theo tiếng Việt. Chuỗi rỗng nếu không hợp lệ. */
export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

/** Chỉ ngày (dd/mm/yyyy), không giờ — dùng cho task có ngày dạng 'yyyy-mm-dd'. */
export function formatDay(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('vi-VN', { dateStyle: 'short' });
}
