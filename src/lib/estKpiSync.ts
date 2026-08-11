// Đồng bộ "sub task estimate DONE → dòng chốt bên bảng KPI nhận điểm gợi ý".
// Dùng chung cho 3 đường: tick ✅ trên dòng log KPI (đường A — entryId chỉ định sẵn),
// tick done trên trang estimate của member (đường B — tra dòng mới nhất qua kpiToken),
// và leader tick hộ trên editor (token tra từ danh sách member riêng tư).
import { get, ref, update } from 'firebase/database';
import { db } from './firebase';
import type { KpiEntry, KpiScore } from '../kpiTypes';
import { actualMinOf, suggestDelta, type EstLogs, type EstSubTask } from '../estTypes';

export interface CompleteEstResult {
  /** suggested = đã điền selfDelta vào dòng chốt; scored = dòng chốt đã bị chấm (chỉ set done);
   *  no-entry = chưa có dòng log nào link sub task (chỉ set done); no-basis = không có est/actual. */
  outcome: 'suggested' | 'scored' | 'no-entry' | 'no-basis';
  delta?: number;
}

/**
 * Set sub task done + điền selfDelta gợi ý (±20% → +1/0/−1) vào dòng chốt.
 * - `entryId`/`entryMin`: flow tick ngay trên dòng log — dòng đó là dòng chốt, phút của nó
 *   dùng giá trị mới (logs trên server có thể chưa kịp dội về).
 * - Không có `entryId`: tra sheet KPI (kpiToken) tìm dòng MỚI NHẤT có estRef trỏ về sub task.
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
  const { estId, groupId, taskId, task, logs, kpiToken } = opts;
  if (!db) return { outcome: 'no-basis' };
  const writes: Record<string, unknown> = {
    [`shared/est/${estId}/groups/${groupId}/tasks/${taskId}/status`]: 'done',
  };
  const finish = async (r: CompleteEstResult): Promise<CompleteEstResult> => {
    await update(ref(db!), writes);
    return r;
  };

  // Tổng actual: Σ logs (thay phút của entryId bằng giá trị mới nếu được chỉ định).
  let actualMin = actualMinOf(logs, taskId);
  if (opts.entryId) {
    const stored = logs?.[taskId]?.[opts.entryId] ?? 0;
    actualMin = actualMin - stored + (opts.entryMin ?? 0);
  }
  const delta = suggestDelta(task.estHours, actualMin);

  if (!kpiToken) return finish({ outcome: delta === null ? 'no-basis' : 'no-entry' });

  // Tìm dòng chốt + kiểm tra đã bị chấm chưa.
  let entryId = opts.entryId ?? null;
  let scored = false;
  try {
    const snap = await get(ref(db, `shared/kpi/${kpiToken}`));
    const val = snap.val() as {
      entries?: Record<string, KpiEntry>;
      scores?: Record<string, KpiScore>;
    } | null;
    if (!entryId) {
      const linked = Object.values(val?.entries ?? {})
        .filter((e) => e.estRef?.taskId === taskId)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            (b.start ?? '').localeCompare(a.start ?? '') ||
            b.createdAt.localeCompare(a.createdAt),
        );
      entryId = linked[0]?.id ?? null;
    }
    if (entryId) scored = !!val?.scores?.[entryId];
  } catch {
    return finish({ outcome: 'no-entry' });
  }

  if (!entryId) return finish({ outcome: 'no-entry' });
  if (scored) return finish({ outcome: 'scored' });
  if (delta === null) return finish({ outcome: 'no-basis' });

  // Dòng chốt nhận điểm gợi ý — cùng 1 update nguyên tử với status done.
  writes[`shared/kpi/${kpiToken}/entries/${entryId}/selfDelta`] = delta;
  writes[`shared/kpi/${kpiToken}/entries/${entryId}/updatedAt`] =
    new Date().toISOString();
  return finish({ outcome: 'suggested', delta });
}

/** Diễn giải kết quả cho toast/alert phía UI. */
export function completeEstMessage(r: CompleteEstResult): string {
  switch (r.outcome) {
    case 'suggested':
      return `Đã đánh dấu hoàn thành — điểm tự chấm gợi ý ${r.delta! > 0 ? '+' : ''}${r.delta} đã điền vào dòng log chốt.`;
    case 'scored':
      return 'Đã đánh dấu hoàn thành. Dòng log chốt đã được leader chấm nên điểm giữ nguyên.';
    case 'no-entry':
      return 'Đã đánh dấu hoàn thành, nhưng chưa có dòng log KPI nào link tới task này — điểm sẽ do leader đối chiếu khi chấm.';
    case 'no-basis':
      return 'Đã đánh dấu hoàn thành (không có est/giờ log để gợi ý điểm).';
  }
}
