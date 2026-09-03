// Đọc 1 lần (không subscribe) phần dữ liệu KPI CỦA MỘT THÁNG từ shared/kpi/{token}.
//
// Vì sao không `get()` cả node: entries tích lũy theo thời gian (mỗi member vài trăm
// dòng/tháng), trong khi trang danh sách và bảng tổng kết chỉ cần đúng 1 tháng — tải
// cả node là lãng phí và phình dần. entries có index 'date' (khai báo .indexOn trong
// database.rules.json) nên query theo khoảng ngày được.
//
// Các nhánh còn lại (scores/leaves) không lọc được theo tháng vì không có index, nhưng
// chúng nhỏ nên đọc trọn vẹn: scores khóa theo entryId, leaves vài dòng/năm.
import { endAt, get, orderByChild, query, ref, startAt } from 'firebase/database';
import { db } from './firebase';
import type { KpiEntry, KpiLeave, KpiScore } from '../kpiTypes';

export interface MonthSheet {
  entries: KpiEntry[];
  scores: Record<string, KpiScore>;
  leaves: KpiLeave[];
}

/** Dữ liệu 1 tháng của 1 sheet KPI. Sheet lỗi/không tồn tại → các mảng rỗng. */
export async function fetchMonthSheet(
  token: string,
  monthKey: string,
): Promise<MonthSheet> {
  const empty: MonthSheet = { entries: [], scores: {}, leaves: [] };
  if (!db || !token || !monthKey) return empty;
  const base = `shared/kpi/${token}`;
  try {
    // Khoảng ngày tường minh: date 'yyyy-mm-dd' so sánh chuỗi nên '-01'..'-31' bao trọn tháng.
    const [entriesSnap, scoresSnap, leavesSnap] = await Promise.all([
      get(
        query(
          ref(db, `${base}/entries`),
          orderByChild('date'),
          startAt(`${monthKey}-01`),
          endAt(`${monthKey}-31`),
        ),
      ),
      get(ref(db, `${base}/scores`)),
      get(ref(db, `${base}/leaves`)),
    ]);
    return {
      entries: Object.values(
        (entriesSnap.val() as Record<string, KpiEntry> | null) ?? {},
      ),
      scores: (scoresSnap.val() as Record<string, KpiScore> | null) ?? {},
      leaves: Object.values(
        (leavesSnap.val() as Record<string, KpiLeave> | null) ?? {},
      ),
    };
  } catch {
    return empty;
  }
}
