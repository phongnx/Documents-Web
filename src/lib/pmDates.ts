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

// Tên thứ tiếng Việt của 1 ngày iso ('Thứ 2'…'Thứ 7', 'Chủ nhật'); '' nếu không parse được.
export function weekdayVN(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const dow = d.getDay();
  return dow === 0 ? 'Chủ nhật' : `Thứ ${dow + 1}`;
}

// Số tuần ISO 8601 (tuần bắt đầu Thứ 2, tuần 1 chứa Thứ 5 đầu tiên của năm); 0 nếu không parse được.
export function isoWeek(iso: string): number {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return 0;
  // Dời về Thứ 5 cùng tuần → năm của Thứ 5 đó là năm của tuần ISO.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const days = (d.getTime() - jan4.getTime()) / 86400000;
  return 1 + Math.round((days - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

// Ngày iso của nhãn thứ ('Thứ 4', 'Chủ nhật') trong khoảng [start, end] (tối đa 7 ngày);
// không có / khoảng lỗi → ''.
export function dateOfWeekday(day: string, start: string, end: string): string {
  const want = day.trim().toLowerCase();
  if (!want || !start || !end || end < start) return '';
  for (let d = start, n = 0; d <= end && n < 7; d = addDays(d, 1), n++)
    if (weekdayVN(d).toLowerCase() === want) return d;
  return '';
}

// Ngày làm việc kế tiếp: Thứ 6/7/CN → Thứ 2 tuần sau, còn lại → ngày mai.
export function nextWorkday(iso: string): string {
  const dow = new Date(iso + 'T00:00:00').getDay(); // 0 = CN, 5 = Thứ 6, 6 = Thứ 7
  const n = dow === 5 ? 3 : dow === 6 ? 2 : 1;
  return addDays(iso, n);
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
