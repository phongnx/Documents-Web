// Helper ngày dùng chung cho Bảng dự án (nguồn duy nhất — tránh mỗi page tự định nghĩa lại).

// yyyy-mm-dd theo giờ địa phương.
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

// Cộng/trừ n ngày cho 1 chuỗi iso, trả lại iso.
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

// Thứ Hai của tuần chứa iso (0 = Thứ Hai).
export function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return isoLocal(d);
}

// Thứ Hai → Thứ Sáu của tuần hiện tại.
export function currentWeek(): { start: string; end: string } {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Thứ Hai = 0
  const mon = new Date(now);
  mon.setDate(now.getDate() - dow);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return { start: isoLocal(mon), end: isoLocal(fri) };
}
