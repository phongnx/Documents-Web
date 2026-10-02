// Trang Estimate của member — truy cập ẩn danh qua /share/kpi/:token/estimates (lối vào
// luôn có ở header trang KPI của member). Member không đọc được task gốc của leader nên
// đọc snapshot shared/kpi/{token}/tasks (leader đẩy xuống ở mọi mutation chạm task) +
// meta.estimates (bảng member tham gia, kèm taskId để ghép dòng). Chỉ đọc: tạo bảng là
// việc của leader; click dòng có bảng → /share/est/:id?t={token} như trước.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import ThemeToggle from '../components/ThemeToggle';
import MemberEstimateList from '../components/board/MemberEstimateList';
import { db } from '../lib/firebase';
import type { KpiSheetMeta, KpiTaskSnap } from '../kpiTypes';

export default function KpiEstimateListPage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const [meta, setMeta] = useState<KpiSheetMeta | null>(null);
  const [tasks, setTasks] = useState<KpiTaskSnap[]>([]);

  useEffect(() => {
    if (!db || !token) {
      setState('notfound');
      return;
    }
    let active = true;
    setState('loading');
    // 2 node riêng, đọc 1 lần: meta (tên, bảng tham gia) + task snapshot.
    Promise.all([
      get(ref(db, `shared/kpi/${token}/meta`)),
      get(ref(db, `shared/kpi/${token}/tasks`)),
    ])
      .then(([metaSnap, taskSnap]) => {
        if (!active) return;
        const m = metaSnap.val() as KpiSheetMeta | null;
        if (!m) {
          setState('notfound');
          return;
        }
        setMeta(m);
        setTasks(Object.values((taskSnap.val() as Record<string, KpiTaskSnap> | null) ?? {}));
        setState('ready');
      })
      .catch(() => {
        if (active) setState('notfound');
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    const prev = document.title;
    if (meta) document.title = `Estimate · ${meta.memberName}`;
    return () => {
      document.title = prev;
    };
  }, [meta]);

  if (!db) {
    return (
      <div className="container">
        <p className="warn">Không tải được trang (thiếu cấu hình Firebase).</p>
      </div>
    );
  }

  return (
    <div className="container kpi-share-view">
      <header className="share-header">
        <span className="brand">📐 Estimate{meta ? ` · ${meta.memberName}` : ''}</span>
        <div className="share-header-actions">
          <Link to={`/share/kpi/${token}`} className="board-docs-link">
            📝 Bảng KPI của tôi
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {state === 'loading' && <p className="muted">Đang tải…</p>}
      {state === 'notfound' && (
        <p className="muted empty">
          Trang không tồn tại hoặc leader đã ngừng chia sẻ. Liên hệ leader để lấy link mới.
        </p>
      )}
      {state === 'ready' && meta && (
        <>
          <MemberEstimateList
            tasks={tasks}
            estimates={meta.estimates ?? []}
            detailHref={(id) => `/share/est/${id}?t=${token}`}
            emptyHint="Bạn chưa được gán app nào — liên hệ leader để được gán project."
          />
          <p className="muted kpi-share-hint">
            Danh sách là task của các app bạn được gán. Task nào leader đã mở bảng estimate
            thì click vào để break sub task + điền est (khi bảng còn Draft); task chưa có
            bảng thì báo leader mở.
          </p>
        </>
      )}
    </div>
  );
}
