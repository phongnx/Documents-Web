// Trang leader xem log + chấm điểm KPI của 1 member (/board/kpi/:memberId).
// Nội dung dòng là của member (leader không sửa hộ — muốn sửa thì mở link share);
// leader chấm điểm qua popover, xóa dòng (kèm điểm), copy link share.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import KpiLogTable from '../components/board/KpiLogTable';
import KpiScorePopover from '../components/board/KpiScorePopover';
import KpiLeaveDialog from '../components/board/KpiLeaveDialog';
import { useKpiSheet } from '../hooks/useKpiSheet';
import { isoLocal } from '../lib/pmDates';
import type { KpiEntry } from '../kpiTypes';

export default function BoardKpiMemberPage() {
  const { memberId = '' } = useParams();
  const { members, meta, loading, syncKpiSheetMeta } = usePm();
  const member = members.find((m) => m.id === memberId);

  const [monthKey, setMonthKey] = useState(isoLocal(new Date()).slice(0, 7));
  const [scoring, setScoring] = useState<KpiEntry | null>(null);
  const [copied, setCopied] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const sheet = useKpiSheet(member?.token);

  // Đồng bộ snapshot danh mục (categories/projectNames/tên) sang sheet mỗi lần mở trang.
  useEffect(() => {
    if (member) syncKpiSheetMeta(member.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  if (loading && !member) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted">Đang tải…</p>
      </div>
    );
  }
  if (!member) {
    return (
      <div className="container">
        <BoardNav />
        <p className="muted empty">Không tìm thấy member này.</p>
        <Link to="/board/kpi" className="board-docs-link">
          ← Danh sách member
        </Link>
      </div>
    );
  }

  // Accept nhanh điểm tự chấm: 1 dòng không hỏi; nhiều dòng confirm kèm tổng điểm.
  const acceptEntries = (list: KpiEntry[]) => {
    const pending = list.filter((e) => !sheet.scores[e.id]);
    if (pending.length === 0) return;
    if (pending.length > 1) {
      const total = Number(
        pending
          .reduce((s, e) => s + (typeof e.selfDelta === 'number' ? e.selfDelta : 0), 0)
          .toFixed(2),
      );
      if (
        !window.confirm(
          `Chấp nhận ${pending.length} dòng theo điểm tự chấm (tổng điểm ${total >= 0 ? '+' : ''}${total})?`,
        )
      )
        return;
    }
    sheet.setScoresBulk(
      pending.map((e) => ({
        entryId: e.id,
        score: {
          delta: typeof e.selfDelta === 'number' ? e.selfDelta : 0,
          reason: 'Chấp nhận điểm tự chấm',
        },
      })),
    );
  };

  const shareUrl = `${window.location.origin}/share/kpi/${member.token}`;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy link thủ công:', shareUrl);
    }
  };

  return (
    <div className="container">
      <BoardNav />

      <div className="cal-header">
        <Link to="/board/kpi" className="board-docs-link">
          ← Danh sách member
        </Link>
        <strong className="cal-title">
          {member.active ? '👤' : '🔒'} {member.name}
        </strong>
        <div className="plan-toolbar">
          <button type="button" onClick={() => setLeaveOpen(true)}>
            🏖 Nghỉ phép{sheet.leaves.length > 0 ? ` (${sheet.leaves.length})` : ''}
          </button>
          <button type="button" onClick={onCopy} title={shareUrl}>
            {copied ? '✓ Đã copy' : '📋 Copy link share'}
          </button>
        </div>
      </div>

      {!member.active && (
        <p className="warn kpi-locked-banner">
          🔒 Trang của member đang bị khóa — member chỉ xem, không log thêm được.
        </p>
      )}

      {sheet.state === 'loading' && <p className="muted">Đang tải log…</p>}
      {sheet.state === 'notfound' && (
        <p className="warn">
          Không đọc được sheet KPI (node có thể đã bị xóa). Thử "🔁 Đổi link" ở danh sách
          member để tạo lại.
        </p>
      )}
      {sheet.state === 'ready' && (
        <KpiLogTable
          mode="leader"
          entries={sheet.entries}
          scores={sheet.scores}
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          categories={sheet.meta?.categories ?? []}
          projectNames={sheet.meta?.projectNames ?? []}
          leaves={sheet.leaves}
          onScoreClick={setScoring}
          onAcceptEntries={acceptEntries}
          onDeleteWithScore={sheet.deleteEntryWithScore}
        />
      )}

      {leaveOpen && (
        <KpiLeaveDialog
          memberName={member.name}
          leaves={sheet.leaves}
          onAdd={sheet.addLeave}
          onDelete={sheet.deleteLeave}
          onClose={() => setLeaveOpen(false)}
        />
      )}

      {scoring && (
        <KpiScorePopover
          entry={scoring}
          current={sheet.scores[scoring.id]}
          rules={meta.kpiRules}
          onSave={(s) => sheet.setScore(scoring.id, s)}
          onClear={() => sheet.clearScore(scoring.id)}
          onClose={() => setScoring(null)}
        />
      )}
    </div>
  );
}
