// Hook đọc/ghi 1 sheet KPI tại shared/kpi/{token} — dùng chung cho cả trang member
// (edit ẩn danh qua link) lẫn trang leader (xem + chấm điểm).
// Nguyên tắc: ghi theo PATH HẸP từng entry/score (không set cả node) để member và leader
// thao tác đồng thời không đè nhau; onValue realtime tự hòa dữ liệu về.
import { useCallback, useEffect, useState } from 'react';
import {
  endAt,
  onValue,
  orderByChild,
  query,
  ref,
  set,
  startAt,
  update,
} from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import {
  durationMin,
  type KpiEntry,
  type KpiLeave,
  type KpiScore,
  type KpiSheetMeta,
  type KpiWeekPlan,
} from '../kpiTypes';

export type KpiSheetState = 'loading' | 'ready' | 'notfound';

export interface KpiSheet {
  state: KpiSheetState;
  meta: KpiSheetMeta | null;
  entries: KpiEntry[];
  scores: Record<string, KpiScore>;
  /** Các đợt nghỉ phép (leader quản lý, member đọc để hiển thị + validate giờ log). */
  leaves: KpiLeave[];
  /** Plan chung theo tuần (key = thứ 2 của tuần 'yyyy-mm-dd'). */
  weekPlans: Record<string, KpiWeekPlan>;
  /** Ticket đã leader rà soát và BỎ QUA nghi vấn reopen (key = entryId dòng mới nhất). */
  reopenChecks: Record<string, boolean>;
  /** Leader: đánh dấu bỏ qua nghi vấn reopen (không phải reopen, nguyên nhân khác). */
  dismissReopen: (entryId: string) => void;
  /** Member: ghi plan tuần (text rỗng = xóa plan của tuần đó). */
  setWeekPlan: (weekStart: string, text: string) => void;
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
    ...(e.estRef?.estId && e.estRef.taskId
      ? {
          estRef: {
            estId: e.estRef.estId,
            groupId: e.estRef.groupId,
            taskId: e.estRef.taskId,
            ...(e.estRef.title ? { title: e.estRef.title } : {}),
          },
        }
      : {}),
    ...(e.rel?.label
      ? {
          rel: {
            label: e.rel.label,
            ...(e.rel.date ? { date: e.rel.date } : {}),
          },
        }
      : {}),
  };
}

/** Path node "đóng góp phút" của 1 entry trên bảng estimate. */
const estLogPath = (e: KpiEntry): string | null =>
  e.estRef ? `shared/est/${e.estRef.estId}/logs/${e.estRef.taskId}/${e.id}` : null;

/**
 * @param token token của sheet (undefined/rỗng = chưa sẵn sàng, state giữ 'loading').
 * @param onWriteError gọi khi 1 lần ghi bị từ chối (thường do rule: dòng đã chấm điểm /
 *   sheet bị khóa / token không còn tồn tại) — UI hiện thông báo, dữ liệu tự revert qua onValue.
 * @param monthKey 'yyyy-mm' — CHỈ tải entries của tháng này (query theo index `date`).
 *   Sheet tích lũy nhiều tháng nên tải cả node là lãng phí: mọi nơi dùng entries đều lọc
 *   theo tháng trước khi tính. Bỏ trống = tải toàn bộ (giữ tương thích).
 */
export function useKpiSheet(
  token: string | undefined,
  onWriteError?: (message: string) => void,
  monthKey?: string,
): KpiSheet {
  const [state, setState] = useState<KpiSheetState>('loading');
  const [meta, setMeta] = useState<KpiSheetMeta | null>(null);
  const [entries, setEntries] = useState<KpiEntry[]>([]);
  const [scores, setScores] = useState<Record<string, KpiScore>>({});
  const [leaves, setLeaves] = useState<KpiLeave[]>([]);
  const [weekPlans, setWeekPlans] = useState<Record<string, KpiWeekPlan>>({});
  const [reopenChecks, setReopenChecks] = useState<Record<string, boolean>>({});

  // Các nhánh NHỎ (meta/scores/leaves/weekPlans/reopenChecks) subscribe cả node —
  // chúng không lọc được theo tháng (không có index) nhưng tổng chỉ vài chục KB.
  // meta là nguồn quyết định state: không có meta = token chưa tạo hoặc đã bị thu hồi.
  useEffect(() => {
    if (!db || !token) {
      setState(token ? 'notfound' : 'loading');
      return;
    }
    setState('loading');
    const base = `shared/kpi/${token}`;
    const subs = [
      onValue(
        ref(db, `${base}/meta`),
        (snap) => {
          const val = snap.val() as KpiSheetMeta | null;
          if (!val) {
            setMeta(null);
            setEntries([]);
            setScores({});
            setLeaves([]);
            setWeekPlans({});
            setReopenChecks({});
            setState('notfound');
            return;
          }
          setMeta(val);
          setState('ready');
        },
        () => setState('notfound'),
      ),
      onValue(ref(db, `${base}/scores`), (snap) =>
        setScores((snap.val() as Record<string, KpiScore> | null) ?? {}),
      ),
      onValue(ref(db, `${base}/leaves`), (snap) =>
        // Mới nhất trước (theo ngày bắt đầu) để dialog quản lý dễ nhìn.
        setLeaves(
          Object.values(
            (snap.val() as Record<string, KpiLeave> | null) ?? {},
          ).sort((a, b) => b.startDate.localeCompare(a.startDate)),
        ),
      ),
      onValue(ref(db, `${base}/weekPlans`), (snap) =>
        setWeekPlans((snap.val() as Record<string, KpiWeekPlan> | null) ?? {}),
      ),
      onValue(ref(db, `${base}/reopenChecks`), (snap) =>
        setReopenChecks((snap.val() as Record<string, boolean> | null) ?? {}),
      ),
    ];
    return () => subs.forEach((u) => u());
  }, [token]);

  // entries tách riêng vì đây là nhánh phình theo thời gian — query đúng tháng đang
  // xem qua index 'date' (khai báo .indexOn trong database.rules.json).
  // Khoảng ngày tường minh: date 'yyyy-mm-dd' so sánh chuỗi nên '-01'..'-31' bao trọn tháng.
  useEffect(() => {
    if (!db || !token) return;
    const entriesRef = ref(db, `shared/kpi/${token}/entries`);
    const q = monthKey
      ? query(
          entriesRef,
          orderByChild('date'),
          startAt(`${monthKey}-01`),
          endAt(`${monthKey}-31`),
        )
      : entriesRef;
    return onValue(
      q,
      (snap) => setEntries(Object.values((snap.val() as Record<string, KpiEntry> | null) ?? {})),
      () => setEntries([]),
    );
  }, [token, monthKey]);

  // Báo lỗi ghi thống nhất (rule từ chối → catch của promise set/update).
  const failed = useCallback(
    () =>
      onWriteError?.(
        'Không lưu được: dòng đã được chấm điểm, trang bị khóa hoặc link không còn hiệu lực.',
      ),
    [onWriteError],
  );

  // Ghi entry + node phút bên bảng estimate trong 1 update nguyên tử; nếu bị từ chối
  // (VD bảng estimate đã khóa hẳn) → thử lại chỉ phần entry để member không mất log.
  const writeWithEstLog = useCallback(
    (writes: Record<string, unknown>, estPaths: string[]) => {
      if (!db) return;
      update(ref(db), writes).catch(() => {
        if (estPaths.length === 0) return failed();
        const rest = { ...writes };
        for (const p of estPaths) delete rest[p];
        update(ref(db!), rest)
          .then(() =>
            onWriteError?.(
              'Đã lưu dòng log, nhưng không cộng được giờ sang bảng estimate (bảng có thể đã khóa).',
            ),
          )
          .catch(failed);
      });
    },
    [failed, onWriteError],
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
      const writes: Record<string, unknown> = {
        [`shared/kpi/${token}/entries/${entry.id}`]: entry,
      };
      const estPaths: string[] = [];
      const lp = estLogPath(entry);
      if (lp) {
        const min = durationMin(entry);
        writes[lp] = min === null ? null : min;
        estPaths.push(lp);
      }
      writeWithEstLog(writes, estPaths);
      return entry.id;
    },
    [token, writeWithEstLog],
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
      const writes: Record<string, unknown> = {
        [`shared/kpi/${token}/entries/${id}`]: next,
      };
      const estPaths: string[] = [];
      // estRef đổi/bỏ → gỡ node phút cũ; có estRef → ghi đè phút mới (giờ lỗi → null).
      const oldLp = estLogPath(cur);
      const newLp = estLogPath(next);
      if (oldLp && oldLp !== newLp) {
        writes[oldLp] = null;
        estPaths.push(oldLp);
      }
      if (newLp) {
        const min = durationMin(next);
        writes[newLp] = min === null ? null : min;
        estPaths.push(newLp);
      }
      writeWithEstLog(writes, estPaths);
    },
    [token, entries, writeWithEstLog],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      if (!db || !token) return;
      const cur = entries.find((e) => e.id === id);
      const writes: Record<string, unknown> = {
        [`shared/kpi/${token}/entries/${id}`]: null,
      };
      const estPaths: string[] = [];
      const lp = cur ? estLogPath(cur) : null;
      if (lp) {
        writes[lp] = null;
        estPaths.push(lp);
      }
      writeWithEstLog(writes, estPaths);
    },
    [token, entries, writeWithEstLog],
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

  const setWeekPlan = useCallback(
    (weekStart: string, text: string) => {
      if (!db || !token) return;
      const t = text.trim();
      // Text rỗng = xóa plan của tuần đó.
      const payload: KpiWeekPlan | null = t
        ? { text: t, updatedAt: new Date().toISOString() }
        : null;
      set(ref(db, `shared/kpi/${token}/weekPlans/${weekStart}`), payload).catch(failed);
    },
    [token, failed],
  );

  // Bỏ qua nghi vấn reopen — chỉ owner ghi được (rule cascade ở tầng $token).
  const dismissReopen = useCallback(
    (entryId: string) => {
      if (!db || !token) return;
      set(ref(db, `shared/kpi/${token}/reopenChecks/${entryId}`), true).catch(failed);
    },
    [token, failed],
  );

  const deleteEntryWithScore = useCallback(
    (entryId: string) => {
      if (!db || !token) return;
      const cur = entries.find((e) => e.id === entryId);
      // Xóa entry + score (+ node phút bên estimate nếu có) trong 1 update nguyên tử.
      const writes: Record<string, unknown> = {
        [`shared/kpi/${token}/entries/${entryId}`]: null,
        [`shared/kpi/${token}/scores/${entryId}`]: null,
      };
      const lp = cur ? estLogPath(cur) : null;
      if (lp) writes[lp] = null;
      update(ref(db), writes).catch(failed);
    },
    [token, entries, failed],
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
    weekPlans,
    setWeekPlan,
    reopenChecks,
    dismissReopen,
  };
}
