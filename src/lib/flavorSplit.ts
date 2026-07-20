import type { TaskItem } from '../pmTypes';

// Nhận diện flavor từ 1 chuỗi (trường flavor hoặc tiêu đề task).
// Ưu tiên: Radar > WF1 > WF3(+Wearable/new) > Weather Channel. null = không nhận ra.
export function canonFlavor(s: string): string | null {
  const low = (s || '').toLowerCase();
  if (low.includes('radar')) return 'WF3_Radar';
  if (low.includes('wf1')) return 'WF1';
  if (
    low.includes('wearable') ||
    low.includes('wf3') ||
    low.includes('weather (new)') ||
    low.includes('weather(new)')
  )
    return 'WF3';
  if (low.includes('weather channel')) return 'Weather Channel';
  return null;
}

// Khóa flavor của 1 task: ưu tiên trường flavor, không có thì suy từ tiêu đề.
// Trả null nếu không nhận ra (coi là "All flavor").
export function keyOfTask(t: TaskItem): string | null {
  const f = (t.flavor ?? '').trim();
  if (f) return canonFlavor(f) ?? f;
  return canonFlavor(t.title ?? '');
}

// Tính danh sách app sẽ tạo khi tách:
// - coreKeys: các flavor lấy từ TRƯỜNG flavor (task "All flavor" sẽ nhân cho các key này).
// - allKeys: gồm coreKeys + flavor suy từ tiêu đề (VD 'Weather Channel').
export function computeSplit(appTasks: TaskItem[]): {
  allKeys: string[];
  coreKeys: string[];
} {
  const coreKeys: string[] = [];
  for (const t of appTasks) {
    const f = (t.flavor ?? '').trim();
    if (f) {
      const c = canonFlavor(f) ?? f;
      if (!coreKeys.includes(c)) coreKeys.push(c);
    }
  }
  const allKeys = [...coreKeys];
  for (const t of appTasks) {
    const k = keyOfTask(t);
    if (k && !allKeys.includes(k)) allKeys.push(k);
  }
  return { allKeys, coreKeys };
}
