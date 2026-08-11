// Hook đọc/ghi 1 bảng estimate tại shared/est/{estId} — dùng chung cho trang leader
// (đăng nhập, toàn quyền) lẫn trang member (ẩn danh qua capability URL).
// Nguyên tắc như useKpiSheet: ghi PATH HẸP từng group/sub task để nhiều người thao tác
// đồng thời không đè nhau; onValue realtime tự hòa. Quyền thực thi ở database.rules.json:
// draft → member sửa được groups; approved → member chỉ còn status/note; locked → chỉ xem.
import { useCallback, useEffect, useState } from 'react';
import { onValue, ref, set, update } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import type {
  EstGroup,
  EstimateMeta,
  EstLogs,
  EstSubTask,
  EstTaskStatus,
} from '../estTypes';

export type EstSheetState = 'loading' | 'ready' | 'notfound';

/** Field nhập được của 1 sub task (id/order/status do hook quản lý khi tạo). */
export type EstTaskInput = Partial<
  Pick<EstSubTask, 'title' | 'assigneeId' | 'assigneeName' | 'estHours' | 'note'>
>;

export interface EstSheet {
  state: EstSheetState;
  meta: EstimateMeta | null;
  groups: Record<string, EstGroup>;
  logs: EstLogs;
  addGroup: (title: string, desc?: string) => string | null;
  updateGroup: (gid: string, patch: { title?: string; desc?: string }) => void;
  deleteGroup: (gid: string) => void;
  addTask: (gid: string, data: EstTaskInput) => string | null;
  /** Ghi đè cả node sub task đã chuẩn hóa (field rỗng trong patch = xóa field). */
  updateTask: (gid: string, tid: string, patch: EstTaskInput) => void;
  deleteTask: (gid: string, tid: string) => void;
  setTaskStatus: (gid: string, tid: string, status: EstTaskStatus) => void;
  setTaskNote: (gid: string, tid: string, note: string) => void;
}

// Chuẩn hóa sub task: chỉ giữ field optional có giá trị (RTDB ném lỗi nếu còn undefined).
function normalizeTask(t: EstSubTask): EstSubTask {
  return {
    id: t.id,
    title: t.title ?? '',
    status: t.status ?? 'todo',
    order: t.order,
    ...(t.assigneeId ? { assigneeId: t.assigneeId } : {}),
    ...(t.assigneeName ? { assigneeName: t.assigneeName } : {}),
    ...(typeof t.estHours === 'number' && t.estHours > 0
      ? { estHours: t.estHours }
      : {}),
    ...(t.note ? { note: t.note } : {}),
  };
}

export function useEstSheet(
  estId: string | undefined,
  onWriteError?: (message: string) => void,
): EstSheet {
  const [state, setState] = useState<EstSheetState>('loading');
  const [meta, setMeta] = useState<EstimateMeta | null>(null);
  const [groups, setGroups] = useState<Record<string, EstGroup>>({});
  const [logs, setLogs] = useState<EstLogs>({});

  useEffect(() => {
    if (!db || !estId) {
      setState(estId ? 'notfound' : 'loading');
      return;
    }
    setState('loading');
    const unsub = onValue(
      ref(db, `shared/est/${estId}`),
      (snap) => {
        const val = snap.val() as {
          meta?: EstimateMeta;
          groups?: Record<string, EstGroup>;
          logs?: EstLogs;
        } | null;
        if (!val?.meta) {
          setMeta(null);
          setGroups({});
          setLogs({});
          setState('notfound');
          return;
        }
        setMeta(val.meta);
        setGroups(val.groups ?? {});
        setLogs(val.logs ?? {});
        setState('ready');
      },
      () => setState('notfound'),
    );
    return unsub;
  }, [estId]);

  const failed = useCallback(
    () =>
      onWriteError?.(
        'Không lưu được: bảng đã được duyệt/khóa hoặc link không còn hiệu lực.',
      ),
    [onWriteError],
  );

  const addGroup = useCallback(
    (title: string, desc?: string): string | null => {
      if (!db || !estId) return null;
      const id = uuidv4();
      const order =
        Math.max(0, ...Object.values(groups).map((g) => g.order + 1)) || 0;
      const group: EstGroup = {
        id,
        title: title.trim() || 'Nhóm mới',
        order,
        ...(desc?.trim() ? { desc: desc.trim() } : {}),
      };
      set(ref(db, `shared/est/${estId}/groups/${id}`), group).catch(failed);
      return id;
    },
    [estId, groups, failed],
  );

  const updateGroup = useCallback(
    (gid: string, patch: { title?: string; desc?: string }) => {
      if (!db || !estId) return;
      const writes: Record<string, unknown> = {};
      if (patch.title !== undefined)
        writes[`shared/est/${estId}/groups/${gid}/title`] = patch.title;
      if (patch.desc !== undefined)
        writes[`shared/est/${estId}/groups/${gid}/desc`] = patch.desc || null;
      if (Object.keys(writes).length) update(ref(db), writes).catch(failed);
    },
    [estId, failed],
  );

  const deleteGroup = useCallback(
    (gid: string) => {
      if (!db || !estId) return;
      set(ref(db, `shared/est/${estId}/groups/${gid}`), null).catch(failed);
    },
    [estId, failed],
  );

  const addTask = useCallback(
    (gid: string, data: EstTaskInput): string | null => {
      if (!db || !estId) return null;
      const g = groups[gid];
      if (!g) return null;
      const id = uuidv4();
      const order =
        Math.max(0, ...Object.values(g.tasks ?? {}).map((t) => t.order + 1)) || 0;
      const task = normalizeTask({
        id,
        title: data.title?.trim() || 'Task mới',
        status: 'todo',
        order,
        assigneeId: data.assigneeId,
        assigneeName: data.assigneeName,
        estHours: data.estHours,
        note: data.note,
      });
      set(ref(db, `shared/est/${estId}/groups/${gid}/tasks/${id}`), task).catch(
        failed,
      );
      return id;
    },
    [estId, groups, failed],
  );

  const updateTask = useCallback(
    (gid: string, tid: string, patch: EstTaskInput) => {
      if (!db || !estId) return;
      const cur = groups[gid]?.tasks?.[tid];
      if (!cur) return;
      const next = normalizeTask({ ...cur, ...patch, id: tid });
      set(ref(db, `shared/est/${estId}/groups/${gid}/tasks/${tid}`), next).catch(
        failed,
      );
    },
    [estId, groups, failed],
  );

  const deleteTask = useCallback(
    (gid: string, tid: string) => {
      if (!db || !estId) return;
      set(ref(db, `shared/est/${estId}/groups/${gid}/tasks/${tid}`), null).catch(
        failed,
      );
    },
    [estId, failed],
  );

  // status/note ghi path hẹp RIÊNG — sau khi duyệt (approved) member vẫn được ghi
  // 2 field này (rule mở ở đúng node con), các field khác bị chặn.
  const setTaskStatus = useCallback(
    (gid: string, tid: string, status: EstTaskStatus) => {
      if (!db || !estId) return;
      set(
        ref(db, `shared/est/${estId}/groups/${gid}/tasks/${tid}/status`),
        status,
      ).catch(failed);
    },
    [estId, failed],
  );

  const setTaskNote = useCallback(
    (gid: string, tid: string, note: string) => {
      if (!db || !estId) return;
      set(
        ref(db, `shared/est/${estId}/groups/${gid}/tasks/${tid}/note`),
        note.trim() || null,
      ).catch(failed);
    },
    [estId, failed],
  );

  return {
    state,
    meta,
    groups,
    logs,
    addGroup,
    updateGroup,
    deleteGroup,
    addTask,
    updateTask,
    deleteTask,
    setTaskStatus,
    setTaskNote,
  };
}
