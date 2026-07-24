// Trang quản lý KPI member (leader): danh sách member + điểm tháng/tổng giờ,
// copy link share, khóa/mở, đổi link, xóa; quản lý quy chế chấm điểm.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import KpiRulesDialog from '../components/board/KpiRulesDialog';
import MemberProjectsDialog from '../components/board/MemberProjectsDialog';
import { db } from '../lib/firebase';
import { isoLocal } from '../lib/pmDates';
import {
  entriesOfMonth,
  fmtHours,
  KPI_MONTH_BASE,
  totalOf,
  type KpiEntry,
  type KpiMember,
  type KpiScore,
} from '../kpiTypes';

/** Tóm tắt tháng của 1 member (đọc get() 1 lần, không subscribe). */
interface MemberSummary {
  minutes: number;
  delta: number;
  entryCount: number;
}

export default function BoardKpiListPage() {
  const {
    members,
    loading,
    addMember,
    updateMember,
    deleteMember,
    rotateMemberToken,
    setMemberLocked,
  } = usePm();
  const navigate = useNavigate();
  const [monthKey, setMonthKey] = useState(isoLocal(new Date()).slice(0, 7));
  const [summaries, setSummaries] = useState<Record<string, MemberSummary>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  // Member đang mở dialog gán project.
  const [assignFor, setAssignFor] = useState<KpiMember | null>(null);

  // Đọc tóm tắt từng sheet khi vào trang / đổi tháng / danh sách member đổi.
  useEffect(() => {
    if (!db) return;
    let active = true;
    (async () => {
      const next: Record<string, MemberSummary> = {};
      await Promise.all(
        members.map(async (m) => {
          try {
            const snap = await get(ref(db!, `shared/kpi/${m.token}`));
            const val = snap.val() as {
              entries?: Record<string, KpiEntry>;
              scores?: Record<string, KpiScore>;
            } | null;
            const entries = entriesOfMonth(Object.values(val?.entries ?? {}), monthKey);
            const t = totalOf(entries, val?.scores ?? {});
            next[m.id] = { minutes: t.minutes, delta: t.delta, entryCount: entries.length };
          } catch {
            // Bỏ qua sheet lỗi (node bị xóa tay…) — card hiện "—".
          }
        }),
      );
      if (active) setSummaries(next);
    })();
    return () => {
      active = false;
    };
  }, [members, monthKey]);

  const shareUrl = (token: string) => `${window.location.origin}/share/kpi/${token}`;

  const onCopy = async (id: string, token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      window.prompt('Copy link thủ công:', shareUrl(token));
    }
  };

  const onAdd = () => {
    const name = window.prompt('Tên member mới:');
    if (name === null) return;
    const n = name.trim();
    if (!n) return;
    if (members.some((m) => m.name.trim().toLowerCase() === n.toLowerCase())) {
      if (!window.confirm(`Đã có member tên "${n}". Vẫn tạo thêm?`)) return;
    }
    addMember(n);
  };

  const onRename = (id: string, current: string) => {
    const v = window.prompt('Tên member:', current);
    if (v === null) return;
    const t = v.trim();
    if (t && t !== current) updateMember(id, { name: t });
  };

  const onRotate = async (id: string, name: string) => {
    if (
      window.confirm(
        `Đổi link cho "${name}"? Link cũ sẽ VÔ HIỆU ngay — nhớ gửi link mới cho member.`,
      )
    )
      await rotateMemberToken(id);
  };

  const onDelete = (id: string, name: string) => {
    if (
      window.confirm(
        `Xóa member "${name}" và TOÀN BỘ log + điểm KPI? Không thể hoàn tác.`,
      )
    )
      deleteMember(id);
  };

  const visible = showLocked ? members : members.filter((m) => m.active);
  const lockedCount = members.length - members.filter((m) => m.active).length;

  return (
    <div className="container">
      <BoardNav />

      <div className="board-add-row">
        <button type="button" className="primary" onClick={onAdd}>
          ＋ Thêm member
        </button>
        <button type="button" onClick={() => setRulesOpen(true)}>
          ⚖️ Quy chế chấm điểm
        </button>
        <input
          type="month"
          className="kpi-month-input"
          value={monthKey}
          onChange={(e) => e.target.value && setMonthKey(e.target.value)}
          title="Tháng thống kê"
        />
        {lockedCount > 0 && (
          <label className="kpi-show-locked muted">
            <input
              type="checkbox"
              checked={showLocked}
              onChange={(e) => setShowLocked(e.target.checked)}
            />
            Hiện member đã khóa ({lockedCount})
          </label>
        )}
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : members.length === 0 ? (
        <p className="muted empty">
          Chưa có member nào. Bấm "＋ Thêm member" để tạo trang log + link share cho từng
          member trong team.
        </p>
      ) : (
        <div className="plan-cards">
          {visible.map((m) => {
            const s = summaries[m.id];
            const score = s ? Number((KPI_MONTH_BASE + s.delta).toFixed(2)) : null;
            return (
              <section key={m.id} className={`plan-card kpi-member-card${m.active ? '' : ' kpi-locked'}`}>
                <div className="plan-card-head">
                  <div className="plan-card-info">
                    <span className="plan-card-title">
                      {m.active ? '👤' : '🔒'} {m.name}
                    </span>
                    <span className="muted plan-card-meta">
                      {s
                        ? `${s.entryCount} dòng · ${fmtHours(s.minutes)} trong tháng ${monthKey.slice(5)}/${monthKey.slice(0, 4)}`
                        : 'Đang tải…'}
                      {(m.projectIds?.length ?? 0) > 0 &&
                        ` · 🧩 ${m.projectIds!.length} project`}
                    </span>
                  </div>
                  {score !== null && (
                    <span
                      className={`kpi-month-score ${score >= KPI_MONTH_BASE ? 'pos' : 'neg'}`}
                      title={`${KPI_MONTH_BASE} ${s!.delta >= 0 ? '+' : '−'} ${Math.abs(s!.delta)}`}
                    >
                      {score}
                    </span>
                  )}
                  <div className="doc-line-actions">
                    <button
                      type="button"
                      className="doc-action"
                      title="Xem log & chấm điểm"
                      onClick={() => navigate(`/board/kpi/${m.id}`)}
                    >
                      📊 Xem & chấm
                    </button>
                    <button
                      type="button"
                      className="doc-action"
                      title={shareUrl(m.token)}
                      onClick={() => onCopy(m.id, m.token)}
                    >
                      {copiedId === m.id ? '✓ Đã copy' : '📋 Copy link'}
                    </button>
                    <button
                      type="button"
                      className="doc-action"
                      title="Gán project cho member"
                      onClick={() => setAssignFor(m)}
                    >
                      🧩
                    </button>
                    <button
                      type="button"
                      className="doc-action"
                      title="Đổi tên"
                      onClick={() => onRename(m.id, m.name)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="doc-action"
                      title="Đổi link (link cũ vô hiệu)"
                      onClick={() => onRotate(m.id, m.name)}
                    >
                      🔁
                    </button>
                    <button
                      type="button"
                      className="doc-action"
                      title={m.active ? 'Khóa trang (member chỉ xem)' : 'Mở khóa trang'}
                      onClick={() => setMemberLocked(m.id, m.active)}
                    >
                      {m.active ? '🔒' : '🔓'}
                    </button>
                    <button
                      type="button"
                      className="doc-action danger"
                      title="Xóa member + toàn bộ log"
                      onClick={() => onDelete(m.id, m.name)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {rulesOpen && <KpiRulesDialog onClose={() => setRulesOpen(false)} />}
      {assignFor && (
        <MemberProjectsDialog member={assignFor} onClose={() => setAssignFor(null)} />
      )}
    </div>
  );
}
