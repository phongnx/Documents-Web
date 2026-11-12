// Chốt "sub task estimate DONE". Dùng chung cho 3 đường: tick ✅ trên dòng log KPI (đường A
// — entryId chỉ định sẵn), tick done trên trang estimate của member (đường B), và leader tick
// hộ trên editor. Từ 11/2026 KHÔNG còn điền điểm tự chấm gợi ý vào dòng log (bỏ chấm theo giờ
// thực tế / est — xem DEFAULT_KPI_RULES); chỉ set done + báo khi thực tế lệch est lớn.
import { ref, update } from 'firebase/database';
import { db } from './firebase';
import { actualMinOf, estDeviation, fmtRatio, type EstLogs, type EstSubTask } from '../estTypes';

export interface CompleteEstResult {
  /** Tỉ lệ thực tế / est khi lệch lớn (≥ 2× hoặc ≤ 0.5×); null = trong ngưỡng / thiếu căn cứ. */
  deviation: number | null;
}

/**
 * Set sub task done (1 lần ghi). `entryId`/`entryMin`: flow tick ngay trên dòng log — phút
 * của dòng đó dùng giá trị mới (logs trên server có thể chưa kịp dội về) khi tính độ lệch.
 * `kpiToken` giữ trong chữ ký cho 3 nơi gọi, không còn dùng (không ghi gì sang sheet KPI).
 */
export async function completeEstTask(opts: {
  estId: string;
  groupId: string;
  taskId: string;
  task: EstSubTask;
  logs?: EstLogs;
  kpiToken?: string;
  entryId?: string;
  entryMin?: number | null;
}): Promise<CompleteEstResult> {
  const { estId, groupId, taskId, task, logs } = opts;
  let actualMin = actualMinOf(logs, taskId);
  if (opts.entryId) {
    const stored = logs?.[taskId]?.[opts.entryId] ?? 0;
    actualMin = actualMin - stored + (opts.entryMin ?? 0);
  }
  if (db) {
    await update(ref(db), {
      [`shared/est/${estId}/groups/${groupId}/tasks/${taskId}/status`]: 'done',
    });
  }
  return { deviation: estDeviation(task.estHours, actualMin) };
}

/** Diễn giải kết quả cho snackbar phía UI. */
export function completeEstMessage(r: CompleteEstResult): string {
  return r.deviation !== null
    ? `Đã đánh dấu hoàn thành. Thực tế lệch ${fmtRatio(r.deviation)} so với est — nên xem lại cách estimate (không tính điểm).`
    : 'Đã đánh dấu hoàn thành. Điểm do leader chấm theo quy chế.';
}
