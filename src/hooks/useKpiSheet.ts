// Hook đọc/ghi 1 sheet KPI tại shared/kpi/{token} — dùng chung cho cả trang member
// (edit ẩn danh qua link) lẫn trang leader (xem + chấm điểm).
// Nguyên tắc: ghi theo PATH HẸP từng entry/score (không set cả node) để member và leader
// thao tác đồng thời không đè nhau; onValue realtime tự hòa dữ liệu về.
import { useCallback, useEffect, useState } from 'react';
import { onValue, ref, set, update } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import type { KpiEntry, KpiLeave, KpiScore, KpiSheetMeta } from '../kpiTypes';

export type KpiSheetState = 'loading' | 'ready' | 'notfound';

export interface KpiSheet {
  state: KpiSheetState;
  meta: KpiSheetMeta | null;
  entries: KpiEntry[];
  scores: Record<string, KpiScore>;
  /** Các đợt nghỉ phép (leader quản lý, member đọc để hiển thị + validate giờ log). */
  leaves: KpiLeave[];
  /** Leader: thêm 1 đợt nghỉ phép. */
  addLeave: (input: Omit<KpiLeave, 'id' | 'createdAt'>) => void;
  /** Leader: xóa 1 đợt nghỉ phép. */
  deleteLeave: (id: string) => void;
  /** Thêm dòng mới; trả id (null nếu không ghi được). */
  addEntry: (input: KpiEntryInput) => string | null;
  /** Sửa 1 dòng (field undefined trong patch = xóa field). */
  updateEntry: (id: string, patch: Partial<KpiEntryInput>) => void;
  deleteEntry: (id: string) => void;
  /** Leader: chấm/ghi đè điểm 1 dòng. */
  setScore: (entryId: string, score: Omit<KpiScore, 'scoredAt'>) => void;
  /** Leader: chấm nhiều dòng trong 1 lần ghi nguyên tử (accept nhanh điểm tự chấm). */
  setScoresBulk: (
    items: { entryId: string; score: Omit<KpiScore, 'scoredAt'> }[],
  ) => void;
  /** Leader: xóa điểm (mở khóa dòng cho member sửa lại). */
  clearScore: (entryId: string) => void;
  /** Leader: xóa cả dòng + điểm trong 1 lần ghi. */
  deleteEntryWithScore: (entryId: string) => void;
}

/** Trường member được nhập (id/createdAt/updatedAt do hook quản lý). */
export type KpiEntryInput = Omit<KpiEntry, 'id' | 'createdAt' | 'updatedAt'>;

// Chuẩn hóa entry: chỉ giữ field optional có giá trị (RTDB ném lỗi nếu còn undefined).
function normalizeEntry(e: KpiEntry): KpiEntry {
  return {
    id: e.id,
    date: e.date,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    ...(e.start ? { start: e.start } : {}),
    ...(e.end ? { end: e.end } : {}),
    ...(e.category ? { category: e.category } : {}),
    ...(e.project ? { project: e.project } : {}),
    ...(e.feature ? { feature: e.feature } : {}),
    ...(e.task ? { task: e.task } : {}),
    ...(e.note ? { note: e.note } : {}),
    ...(typeof e.selfDelta === 'number' ? { selfDelta: e.selfDelta } : {}),
  };
}

/**
 * @param token token của sheet (undefined/rỗng = chưa sẵn sàng, state giữ 'loading').
 * @param onWriteError gọi khi 1 lần ghi bị từ chối (thường do rule: dòng đã chấm điểm /
 *   sheet bị khóa / token không còn tồn tại) — UI hiện thông báo, dữ liệu tự revert qua onValue.
 */
export function useKpiSheet(
  token: string | undefined,
  onWriteError?: (message: string) => void,
): KpiSheet {
  const [state, setState] = useState<KpiSheetState>('loading');
  const [meta, setMeta] = useState<KpiSheetMeta | null>(null);
  const [entries, setEntries] = useState<KpiEntry[]>([]);
  const [scores, setScores] = useState<Record<string, KpiScore>>({});
  const [leaves, setLeaves] = useState<KpiLeave[]>([]);

  useEffect(() => {
    if (!db || !token) {
      setState(token ? 'notfound' : 'loading');
      return;
    }
    setState('loading');
    const unsub = onValue(
      ref(db, `shared/kpi/${token}`),
      (snap) => {
        const val = snap.val() as {
          meta?: KpiSheetMeta;
          entries?: Record<string, KpiEntry>;
          scores?: Record<string, KpiScore>;
          leaves?: Record<string, KpiLeave>;
        } | null;
        if (!val?.meta) {
          // Token chưa được tạo hoặc đã bị leader thu hồi (đổi link/xóa member).
          setMeta(null);
          setEntries([]);
          setScores({});
          setLeaves([]);
          setState('notfound');
          return;
        }
        setMeta(val.meta);
        setEntries(Object.values(val.entries ?? {}));
        setScores(val.scores ?? {});
        // Mới nhất trước (theo ngày bắt đầu) để dialog quản lý dễ nhìn.
        setLeaves(
          Object.values(val.leaves ?? {}).sort((a, b) =>
            b.startDate.localeCompare(a.startDate),
          ),
        );
        setState('ready');
      },
      () => setState('notfound'),
    );
    return unsub;
  }, [token]);

  // Báo lỗi ghi thống nhất (rule từ chối → catch của promise set/update).
  const failed = useCallback(
    () =>
      onWriteError?.(
        'Không lưu được: dòng đã được chấm điểm, trang bị khóa hoặc link không còn hiệu lực.',
      ),
    [onWriteError],
  );

  const addEntry = useCallback(
    (input: KpiEntryInput): string | null => {
      if (!db || !token) return null;
      const now = new Date().toISOString();
      const entry = normalizeEntry({
        ...input,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      });
      set(ref(db, `shared/kpi/${token}/entries/${entry.id}`), entry).catch(failed);
      return entry.id;
    },
    [token, failed],
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<KpiEntryInput>) => {
      if (!db || !token) return;
      const cur = entries.find((e) => e.id === id);
      if (!cur) return;
      // Ghi đè cả entry đã chuẩn hóa (set) — patch field rỗng sẽ xóa hẳn field trên RTDB.
      const next = normalizeEntry({
        ...cur,
        ...patch,
        id,
        createdAt: cur.createdAt,
        updatedAt: new Date().toISOString(),
      });
      set(ref(db, `shared/kpi/${token}/entries/${id}`), next).catch(failed);
    },
    [token, entries, failed],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      if (!db || !token) return;
      set(ref(db, `shared/kpi/${token}/entries/${id}`), null).catch(failed);
    },
    [token, failed],
  );

  const setScore = useCallback(
    (entryId: string, score: Omit<KpiScore, 'scoredAt'>) => {
      if (!db || !token) return;
      const payload: KpiScore = {
        delta: score.delta,
        scoredAt: new Date().toISOString(),
        ...(score.reason ? { reason: score.reason } : {}),
        ...(score.ruleKey ? { ruleKey: score.ruleKey } : {}),
      };
      set(ref(db, `shared/kpi/${token}/scores/${entryId}`), payload).catch(failed);
    },
    [token, failed],
  );

  const setScoresBulk = useCallback(
    (items: { entryId: string; score: Omit<KpiScore, 'scoredAt'> }[]) => {
      if (!db || !token || items.length === 0) return;
      const now = new Date().toISOString();
      // Gom mọi score vào 1 multi-path update — hoặc tất cả hoặc không gì.
      const writes: Record<string, unknown> = {};
      for (const it of items) {
        writes[`shared/kpi/${token}/scores/${it.entryId}`] = {
          delta: it.score.delta,
          scoredAt: now,
          ...(it.score.reason ? { reason: it.score.reason } : {}),
          ...(it.score.ruleKey ? { ruleKey: it.score.ruleKey } : {}),
        } satisfies KpiScore;
      }
      update(ref(db), writes).catch(failed);
    },
    [token, failed],
  );

  const clearScore = useCallback(
    (entryId: string) => {
      if (!db || !token) return;
      set(ref(db, `shared/kpi/${token}/scores/${entryId}`), null).catch(failed);
    },
    [token, failed],
  );

  const addLeave = useCallback(
    (input: Omit<KpiLeave, 'id' | 'createdAt'>) => {
      if (!db || !token) return;
      const leave: KpiLeave = {
        id: uuidv4(),
        startDate: input.startDate,
        days: input.days,
        createdAt: new Date().toISOString(),
        ...(input.half ? { half: input.half } : {}),
        ...(input.note ? { note: input.note } : {}),
      };
      set(ref(db, `shared/kpi/${token}/leaves/${leave.id}`), leave).catch(failed);
    },
    [token, failed],
  );

  const deleteLeave = useCallback(
    (id: string) => {
      if (!db || !token) return;
      set(ref(db, `shared/kpi/${token}/leaves/${id}`), null).catch(failed);
    },
    [token, failed],
  );

  const deleteEntryWithScore = useCallback(
    (entryId: string) => {
      if (!db || !token) return;
      // Xóa entry + score trong 1 multi-path update (nguyên tử).
      update(ref(db), {
        [`shared/kpi/${token}/entries/${entryId}`]: null,
        [`shared/kpi/${token}/scores/${entryId}`]: null,
      }).catch(failed);
    },
    [token, failed],
  );

  return {
    state,
    meta,
    entries,
    scores,
    leaves,
    addEntry,
    updateEntry,
    deleteEntry,
    setScore,
    setScoresBulk,
    clearScore,
    deleteEntryWithScore,
    addLeave,
    deleteLeave,
  };
}
