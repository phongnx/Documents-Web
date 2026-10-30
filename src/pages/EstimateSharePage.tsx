// Trang bảng Break task & Estimate cho MEMBER — truy cập ẩn danh qua link trong trang
// KPI riêng của member (/share/est/:id?t={kpiToken}). Draft: member tự break task +
// điền est; Approved: chỉ đổi status/note sub task của mình; chọn Xong → dòng log chốt
// bên bảng KPI tự nhận điểm gợi ý (completeEstTask).
// Bản redesign Material 3: header gọn, chip trạng thái, banner, thông báo dạng snackbar.
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import ThemeToggle from '../components/ThemeToggle';
import EstSheetTable, {
  EstHeader,
  EstNotFound,
  EstSheetSkeleton,
  EstSnackbar,
  useEstNotice,
} from '../components/board/EstSheetTable';
import { IcList } from '../components/board/ksumIcons';
import { useEstSheet } from '../hooks/useEstSheet';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { completeEstMessage, completeEstTask } from '../lib/estKpiSync';
import { db } from '../lib/firebase';
import type { KpiSheetMeta } from '../kpiTypes';
import type { EstSubTask, EstTaskStatus } from '../estTypes';

export default function EstimateSharePage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const kpiToken = params.get('t') ?? undefined;
  const narrow = useMediaQuery('(max-width: 839px)');

  const { notice, notify } = useEstNotice();
  const sheet = useEstSheet(id, (text) => notify({ text, kind: 'error' }));

  // Nhận diện member đang xem qua token KPI (?t) — để UI chỉ mở phần của họ.
  const [viewer, setViewer] = useState<{ id?: string; name?: string }>({});
  useEffect(() => {
    if (!db || !kpiToken) return;
    get(ref(db, `shared/kpi/${kpiToken}/meta`))
      .then((snap) => {
        const m = snap.val() as KpiSheetMeta | null;
        if (m) setViewer({ id: m.memberId, name: m.memberName });
      })
      .catch(() => {});
  }, [kpiToken]);

  // Tiêu đề tab theo bảng.
  useEffect(() => {
    const prev = document.title;
    if (sheet.meta) document.title = `Estimate · ${sheet.meta.title}`;
    return () => {
      document.title = prev;
    };
  }, [sheet.meta]);

  // taskOverride = bản vừa sửa trong dialog (est mới nhất, state chưa kịp dội về).
  const onSetStatus = async (
    gid: string,
    tid: string,
    status: EstTaskStatus,
    taskOverride?: EstSubTask,
  ) => {
    const task = taskOverride ?? sheet.groups[gid]?.tasks?.[tid];
    if (!task) return;
    if (status !== 'done') {
      sheet.setTaskStatus(gid, tid, status);
      return;
    }
    try {
      const result = await completeEstTask({
        estId: id,
        groupId: gid,
        taskId: tid,
        task,
        logs: sheet.logs,
        kpiToken,
      });
      notify({ text: completeEstMessage(result) }, 8000);
    } catch {
      notify({
        text: 'Không lưu được: bảng đã được duyệt/khóa hoặc link không còn hiệu lực.',
        kind: 'error',
      });
    }
  };

  if (!db) {
    return (
      <div className="container">
        <p className="warn">Không tải được trang (thiếu cấu hình Firebase).</p>
      </div>
    );
  }

  const back = kpiToken
    ? { to: `/share/kpi/${kpiToken}/estimates`, label: 'Estimate của tôi' }
    : undefined;
  const kpiLink = kpiToken
    ? narrow
      ? (
          <Link
            to={`/share/kpi/${kpiToken}`}
            className="kml-iconbtn"
            aria-label="Bảng KPI của tôi"
            title="Bảng KPI của tôi"
          >
            <IcList size={22} />
          </Link>
        )
      : (
          <Link to={`/share/kpi/${kpiToken}`} className="kml-btn kml-btn-text">
            <IcList size={16} />
            Bảng KPI của tôi
          </Link>
        )
    : null;

  return (
    <div className="container kml-page est-page">
      <EstHeader
        meta={sheet.state === 'ready' ? sheet.meta : null}
        groups={sheet.groups}
        narrow={narrow}
        back={back}
        actions={
          <>
            {kpiLink}
            <ThemeToggle className="kml-iconbtn" />
          </>
        }
      />

      {sheet.state === 'loading' && <EstSheetSkeleton />}
      {sheet.state === 'notfound' && (
        <EstNotFound
          title="Bảng không tồn tại hoặc đã bị xoá"
          text="Liên hệ leader để lấy link mới."
          back={back}
        />
      )}
      {sheet.state === 'ready' && sheet.meta && (
        <EstSheetTable
          mode="member"
          meta={sheet.meta}
          groups={sheet.groups}
          logs={sheet.logs}
          sheet={sheet}
          viewerId={viewer.id}
          viewerName={viewer.name}
          narrow={narrow}
          onSetStatus={onSetStatus}
          notify={notify}
        />
      )}

      <EstSnackbar notice={notice} onClose={() => notify(null)} />
    </div>
  );
}
