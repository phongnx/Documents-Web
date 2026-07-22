// Helper text/khớp tên dùng chung cho Bảng dự án (nguồn duy nhất).
import type { AppItem, TaskItem } from '../pmTypes';

// Chuẩn hóa tên để so khớp: thường hóa + bỏ mọi ký tự không phải chữ/số.
export function normName(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Các dòng mô tả task đã làm sạch (bỏ #, gạch đầu dòng, dòng rỗng & dòng trùng tiêu đề).
export function descLines(t: TaskItem): string[] {
  return (t.description ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[#>*-]+\s*/, '').trim())
    .filter((l) => l.length > 0 && l !== t.title);
}

// Gợi ý app khớp tên (khớp chính xác trước, rồi chứa nhau); '' nếu không có.
export function suggestAppId(name: string, apps: AppItem[]): string {
  const pn = normName(name);
  if (!pn) return '';
  const exact = apps.find((a) => normName(a.name) === pn);
  if (exact) return exact.id;
  const partial = apps.find(
    (a) => normName(a.name).includes(pn) || pn.includes(normName(a.name)),
  );
  return partial?.id ?? '';
}
