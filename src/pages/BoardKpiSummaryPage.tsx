// Trang tổng kết KPI tháng (leader, /board/kpi/summary/:monthKey): lần đầu mở tự
// tổng hợp từ log tất cả member thành bảng như file Excel mẫu; các lần sau load bản
// đã lưu (bản CHỐT — log đổi không tự cập nhật, muốn mới bấm 🔄). Sửa local + 💾 Lưu;
// 📋 Share copy link view-only /share/kpisum/{id}.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, ref } from 'firebase/database';
import { usePm } from '../context/PmContext';
import BoardNav from '../components/board/BoardNav';
import KpiSummaryTable from '../components/board/KpiSummaryTable';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { db } from '../lib/firebase';
import { normalizeSummaryRead, optimizeSummaryMembers } from '../lib/kpiSummary';
import type { KpiSummary, KpiSummaryMember, KpiSummaryMeta } from '../kpiTypes';

export default function BoardKpiSummaryPage() {
  const { monthKey = '' } = useParams();
  const { meta, ensureKpiSummary, saveKpiSummary, rebuildKpiSummaryMembers } = usePm();

  const [id, setId] = useState<string | null>(null);
  const [summary, setSummary] = useState<KpiSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  useUnsavedGuard(dirty);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const validMonth = /^\d{4}-\d{2}$/.test(monthKey);

  useEffect(() => {
    if (!validMonth) {
      setState('error');
      return;
    }
    let active = true;
    setState('loading');
    setSummary(null);
    setId(null);
    setDirty(false);
    (async () => {
      try {
        const sid = await ensureKpiSummary(monthKey);
        if (!sid || !db) {
          if (active) setState('error');
          return;
        }
        const snap = await get(ref(db, `shared/kpisum/${sid}`));
        const val = snap.val() as {
          meta: KpiSummaryMeta;
          members?: KpiSummaryMember[];
        } | null;
        if (!active) return;
        if (!val?.meta) {
          setState('error');
          return;
        }
        setId(sid);
        setSummary(normalizeSummaryRead(val));
        setState('ready');
      } catch {
        if (active) setState('error');
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, validMonth]);

  const onEdit = (next: KpiSummary) => {
    setSummary(next);
    setDirty(true);
  };

  const onSave = async () => {
    if (!id || !summary) return;
    setSaving(true);
    const ok = await saveKpiSummary(id, summary);
    setSaving(false);
    if (ok) {
      setDirty(false);
      setNotice('✓ Đã lưu bảng tổng kết.');
    } else {
      setNotice('⚠ Không lưu được — thử lại (kiểm tra mạng/quyền).');
    }
  };

  // Tổng hợp lại từ log hiện tại: thay toàn bộ khối member (giữ Nghỉ lễ chung),
  // chỉ đổi trên form — bấm 💾 Lưu mới ghi đè bản cũ.
  const onRebuild = async () => {
    if (!summary) return;
    if (
      !window.confirm(
        'Tổng hợp lại từ log sẽ THAY THẾ toàn bộ nội dung đã sửa tay (trừ ô Nghỉ lễ chung). Tiếp tục?',
      )
    )
      return;
    setRebuilding(true);
    const members = await rebuildKpiSummaryMembers(monthKey);
    setRebuilding(false);
    setSummary({ ...summary, members });
    setDirty(true);
    setNotice('Đã tổng hợp lại từ log — kiểm tra rồi bấm 💾 Lưu để chốt.');
  };

  // Tối ưu bảng HIỆN TẠI (không đọc lại log): gộp các dòng cùng App+Giai đoạn+Mốc —
  // dùng sau khi leader điền bổ sung mốc release cho các dòng tổng hợp còn thiếu.
  const onOptimize = () => {
    if (!summary) return;
    const preview = optimizeSummaryMembers(summary.members);
    if (preview.after === preview.before) {
      setNotice('Không có dòng nào gộp được (khác App / Giai đoạn / Mốc).');
      return;
    }
    if (
      !window.confirm(
        `Gộp ${preview.before} dòng còn ${preview.after} dòng (cùng App + Giai đoạn + Mốc)? Nội dung Tasks/Tiến độ/Lý do ± của các dòng sẽ được nối lại.`,
      )
    )
      return;
    setSummary({ ...summary, members: preview.members });
    setDirty(true);
    setNotice(
      `Đã gộp ${preview.before} → ${preview.after} dòng — kiểm tra rồi bấm 💾 Lưu để chốt.`,
    );
  };

  const shareUrl = id ? `${window.location.origin}/share/kpisum/${id}` : '';
  const onShare = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy link thủ công:', shareUrl);
    }
    if (dirty) setNotice('Link đã copy — nhớ 💾 Lưu để người xem thấy bản mới nhất.');
  };

  const monthLabel = validMonth ? `${monthKey.slice(5, 7)}/${monthKey.slice(0, 4)}` : monthKey;

  return (
    <div className="container ksum-page">
      <BoardNav />

      <div className="cal-header">
        <Link to="/board/kpi" className="board-docs-link">
          ← KPI member
        </Link>
        <strong className="cal-title">📊 Tổng kết KPI tháng {monthLabel}</strong>
        {state === 'ready' && (
          <div className="plan-toolbar">
            <button
              type="button"
              onClick={onRebuild}
              disabled={rebuilding}
              title="Tổng hợp lại từ log KPI hiện tại (đè nội dung đã sửa tay)"
            >
              {rebuilding ? '⏳ Đang tổng hợp…' : '🔄 Tổng hợp lại'}
            </button>
            <button
              type="button"
              onClick={onOptimize}
              title="Gộp các dòng cùng App + Giai đoạn + Mốc release (dùng sau khi điền bổ sung mốc)"
            >
              🧹 Tối ưu bảng
            </button>
            <button type="button" onClick={onShare} title={shareUrl}>
              {copied ? '✓ Đã copy' : '📋 Share (chỉ xem)'}
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={!dirty || saving}
            >
              {saving ? 'Đang lưu…' : dirty ? '💾 Lưu' : '✓ Đã lưu'}
            </button>
          </div>
        )}
      </div>

      {notice && <p className="muted kpi-locked-banner">{notice}</p>}

      {state === 'loading' && <p className="muted">Đang tổng hợp dữ liệu tháng…</p>}
      {state === 'error' && (
        <p className="warn">
          Không mở được bảng tổng kết (tháng không hợp lệ hoặc lỗi đọc dữ liệu).
        </p>
      )}

      {state === 'ready' && summary && (
        <>
          <label className="ksum-holidays">
            🎌 Nghỉ lễ chung của tháng (áp cho mọi member):
            <input
              value={summary.meta.commonHolidays ?? ''}
              onChange={(e) =>
                onEdit({
                  ...summary,
                  meta: { ...summary.meta, commonHolidays: e.target.value },
                })
              }
              placeholder="VD: 02/09 Quốc khánh (1d)"
            />
          </label>
          <KpiSummaryTable
            summary={summary}
            categories={meta.kpiRules.map((g) => g.label)}
            onChange={onEdit}
          />
          <p className="muted kpi-share-hint">
            Bảng là bản CHỐT tại thời điểm tổng hợp — log đổi sau đó không tự cập nhật
            (bấm "🔄 Tổng hợp lại" nếu muốn lấy số liệu mới). Link share chỉ xem, không
            sửa được.
          </p>
        </>
      )}
    </div>
  );
}
