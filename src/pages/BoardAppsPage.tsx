import { useState } from 'react';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import ImportDataButton from '../components/board/ImportDataButton';
import { computeSplit } from '../lib/flavorSplit';
import { DONE_STATUS, type TaskItem } from '../pmTypes';

const PLATFORMS = ['Android', 'Flutter', 'iOS'];

// Bản release gần nhất của app (task Release đã hoàn thành, có ngày) — để hiển thị.
function latestRelease(tasks: TaskItem[]): TaskItem | undefined {
  const done = tasks.filter(
    (t) => t.status === DONE_STATUS && (t.endDate || t.planDate),
  );
  done.sort((a, b) =>
    (b.endDate || b.planDate || '').localeCompare(a.endDate || a.planDate || ''),
  );
  return done[0];
}

export default function BoardAppsPage() {
  const { apps, tasks, loading, addApp, updateApp, deleteApp, splitAppByFlavor, ungroupApps } =
    usePm();
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('Android');

  const onAdd = () => {
    const n = name.trim();
    if (!n) return;
    addApp(n, platform);
    setName('');
  };

  const onRename = (id: string, current: string) => {
    const v = window.prompt('Tên app mới:', current);
    if (v === null) return;
    const t = v.trim();
    if (t && t !== current) updateApp(id, { name: t });
  };

  const onEditNote = (id: string, current?: string) => {
    const v = window.prompt('Ghi chú cho app (link plan/figma…):', current ?? '');
    if (v === null) return;
    updateApp(id, { note: v.trim() });
  };

  const onDelete = (id: string, appName: string) => {
    const n = tasks.filter((t) => t.appId === id).length;
    const msg =
      n > 0
        ? `Xóa app "${appName}" và ${n} task bên trong? Không thể hoàn tác.`
        : `Xóa app "${appName}"?`;
    if (window.confirm(msg)) deleteApp(id);
  };

  // Các app sẽ tạo khi tách 1 app (theo flavor field + suy từ tiêu đề).
  const splitKeysOf = (appId: string): string[] =>
    computeSplit(tasks.filter((t) => t.appId === appId)).allKeys;

  const onSplit = (id: string, appName: string) => {
    const keys = splitKeysOf(id);
    if (keys.length < 2) {
      window.alert('App này không đủ flavor để tách (cần ≥ 2 flavor).');
      return;
    }
    const msg =
      `Tách app "${appName}" thành ${keys.length} app độc lập: ${keys.join(', ')}?\n` +
      `Các app mới thuộc cùng nền tảng, KHÔNG gom nhóm. Task "All flavor" sẽ được nhân cho các flavor gốc. ` +
      `App gốc sẽ bị thay thế.`;
    if (window.confirm(msg)) splitAppByFlavor(id);
  };

  // Render 1 dòng app (tái dùng cho cả section group lẫn platform).
  const renderApp = (a: (typeof apps)[number]) => {
    const appTasks = tasks.filter((t) => t.appId === a.id);
    const rel = latestRelease(appTasks);
    const canSplit = splitKeysOf(a.id).length >= 2;
    return (
      <li key={a.id} className="board-app-item">
        <div className="board-app-main">
          <span className="board-app-name">{a.name}</span>
          <span className="muted board-app-meta">
            {appTasks.length} task{rel?.version ? ` · mới nhất: ${rel.version}` : ''}
          </span>
          {a.note && <span className="muted board-app-note">{a.note}</span>}
        </div>
        <div className="doc-line-actions">
          {canSplit && (
            <button
              type="button"
              className="doc-action app-split-btn"
              title="Tách app theo flavor"
              onClick={() => onSplit(a.id, a.name)}
            >
              ⑂ Tách flavor
            </button>
          )}
          <button
            type="button"
            className="doc-action"
            title="Đổi tên"
            onClick={() => onRename(a.id, a.name)}
          >
            ✏️
          </button>
          <button
            type="button"
            className="doc-action"
            title="Sửa ghi chú"
            onClick={() => onEditNote(a.id, a.note)}
          >
            📝
          </button>
          <button
            type="button"
            className="doc-action danger"
            title="Xóa app"
            onClick={() => onDelete(a.id, a.name)}
          >
            🗑️
          </button>
        </div>
      </li>
    );
  };

  // Nhóm theo group trước (giữ thứ tự xuất hiện), rồi app không group theo platform.
  const groupsInUse: string[] = [];
  for (const a of apps) {
    if (a.group && !groupsInUse.includes(a.group)) groupsInUse.push(a.group);
  }
  const ungrouped = apps.filter((a) => !a.group);
  const platformsInUse = Array.from(
    new Set([...PLATFORMS, ...ungrouped.map((a) => a.platform)]),
  );

  return (
    <div className="container">
      <BoardNav />

      <div className="board-add-row">
        <input
          className="title-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd();
          }}
          placeholder="Tên app mới…"
        />
        <select
          className="type-select"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="button" className="primary" onClick={onAdd}>
          ＋ Thêm app
        </button>
        <ImportDataButton />
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : apps.length === 0 ? (
        <p className="muted empty">
          Chưa có app nào. Thêm app phía trên, hoặc dùng “Import” ở trang Tổng quan.
        </p>
      ) : (
        <>
          {/* Nhóm app (group) */}
          {groupsInUse.map((g) => {
            const list = apps.filter((a) => a.group === g);
            const onUngroup = () => {
              if (
                window.confirm(
                  `Bỏ gom nhóm "${g}"? ${list.length} app sẽ thành app độc lập theo platform.`,
                )
              )
                ungroupApps(list.map((a) => a.id));
            };
            return (
              <section key={`g-${g}`} className="board-app-group">
                <h2 className="board-group-title">
                  📦 {g}
                  <button
                    type="button"
                    className="doc-action app-split-btn"
                    title="Bỏ gom nhóm — đưa về app độc lập"
                    onClick={onUngroup}
                  >
                    Bỏ gom nhóm
                  </button>
                </h2>
                <ul className="board-app-list">{list.map(renderApp)}</ul>
              </section>
            );
          })}

          {/* App không group → theo platform */}
          {platformsInUse.map((plat) => {
            const list = ungrouped.filter((a) => a.platform === plat);
            if (list.length === 0) return null;
            return (
              <section key={`p-${plat}`} className="board-app-group">
                <h2 className="board-group-title">{plat}</h2>
                <ul className="board-app-list">{list.map(renderApp)}</ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
