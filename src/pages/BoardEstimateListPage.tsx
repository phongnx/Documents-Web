// Tab Estimate của leader (/board/estimates): danh sách APP — mỗi app 1 dòng (số bảng đã
// có + số task chưa xong), click → trang estimate của app đó (/board/estimates/app/:appId)
// liệt kê các bảng và tạo bảng mới từ task chưa xong. Không liệt kê từng task ở đây nữa.
// Bảng không xác định được app (bảng cũ không gắn app/task) gom vào dòng "Bảng không gắn app".
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import { DONE_STATUS } from '../pmTypes';
import { EST_NO_APP, estAppIdOf } from '../estTypes';

export default function BoardEstimateListPage() {
  const { estimates, apps, tasks, loading } = usePm();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const boards = new Map<string, number>();
    for (const e of estimates) {
      const aid = estAppIdOf(e, tasks);
      boards.set(aid, (boards.get(aid) ?? 0) + 1);
    }
    const open = new Map<string, number>();
    for (const t of tasks)
      if (t.appId && t.status !== DONE_STATUS) open.set(t.appId, (open.get(t.appId) ?? 0) + 1);
    const q = search.trim().toLowerCase();
    return apps
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .map((a) => ({ app: a, boards: boards.get(a.id) ?? 0, open: open.get(a.id) ?? 0 }))
      .sort(
        // App đã có bảng lên đầu (đang được estimate), rồi theo tên.
        (x, y) => Number(y.boards > 0) - Number(x.boards > 0) || x.app.name.localeCompare(y.app.name),
      );
  }, [apps, tasks, estimates, search]);

  const noAppCount = useMemo(
    () => estimates.filter((e) => estAppIdOf(e, tasks) === EST_NO_APP).length,
    [estimates, tasks],
  );

  return (
    <div className="container">
      <BoardNav />

      <div className="task-filters">
        <input
          className="task-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm app…"
        />
        <span className="muted cal-count">
          {rows.length} app · {estimates.length} bảng
        </span>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : apps.length === 0 && noAppCount === 0 ? (
        <p className="muted empty">Chưa có app nào — thêm app ở tab Task trước.</p>
      ) : (
        <ul className="task-list">
          {rows.map(({ app, boards, open }) => (
            <li
              key={app.id}
              className={`task-row${boards ? ' mest-has-est' : ''}${!boards && !open ? ' est-app-idle' : ''}`}
            >
              <button
                type="button"
                className="task-main"
                onClick={() => navigate(`/board/estimates/app/${app.id}`)}
              >
                <span className="task-head">
                  <span className="task-title">{app.name}</span>
                  <span className="task-tags">
                    <span className="task-badge type">{app.platform}</span>
                    {boards > 0 ? (
                      <span className="task-badge st-doing">📐 {boards} bảng</span>
                    ) : (
                      <span className="muted">Chưa có bảng</span>
                    )}
                    <span className="muted">
                      · {open > 0 ? `${open} task chưa xong` : 'không còn task chưa xong'}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
          {noAppCount > 0 && !search.trim() && (
            <li className="task-row mest-has-est">
              <button
                type="button"
                className="task-main"
                onClick={() => navigate(`/board/estimates/app/${EST_NO_APP}`)}
              >
                <span className="task-head">
                  <span className="task-title">Bảng không gắn app</span>
                  <span className="task-tags">
                    <span className="task-badge st-doing">📐 {noAppCount} bảng</span>
                    <span className="muted">· bảng cũ theo phase/release</span>
                  </span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
