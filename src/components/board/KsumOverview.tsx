// Phần tổng quan phía trên bảng tổng kết KPI tháng.
// - Trang leader: chip điểm từng member + nút "Lý do ± (N)" mở danh sách lý do + thu gọn/mở tất cả.
// - Trang share (chỉ gửi leader/quản lý): 4 ô thống kê, xếp hạng điểm, danh sách lý do ±.
// Bấm tên/chip/dòng xếp hạng → mở khối đó (nếu đang thu gọn) rồi cuộn tới.
import { useMemo, useState } from 'react';
import { kpiScoreClass, KPI_MONTH_BASE, type KpiSummaryMember } from '../../kpiTypes';
import {
  fmtSigned,
  parseKpiReasons,
  pmClass,
  sumRowKpi,
  summaryStats,
} from '../../lib/kpiSummary';

interface ReasonItem {
  value: number | null;
  text: string;
  ctx: string;
}
interface ReasonGroup {
  memberId: string;
  name: string;
  score: number;
  pm: number | null;
  items: ReasonItem[];
}

/** Gom mọi lý do ± theo member (lấy từ kpiNote — hiện cả khi ô KPI của dòng trống). */
function reasonGroupsOf(members: KpiSummaryMember[]): ReasonGroup[] {
  return members
    .map((m) => {
      const items: ReasonItem[] = [];
      for (const r of m.rows ?? []) {
        const ctx = [r.app, r.milestone, r.category].filter(Boolean).join(' · ');
        for (const x of parseKpiReasons(r.kpiNote)) items.push({ ...x, ctx });
      }
      return {
        memberId: m.memberId,
        name: m.name,
        score: m.kpiScore,
        pm: sumRowKpi(m.rows ?? []),
        items,
      };
    })
    .filter((g) => g.items.length > 0);
}

function ReasonList({
  groups,
  onGoTo,
  className,
}: {
  groups: ReasonGroup[];
  onGoTo: (memberId: string) => void;
  className: string;
}) {
  return (
    <div className={className}>
      {groups.map((g) => (
        <div key={g.memberId} className="k-rg">
          <div className="k-rg-head">
            <button type="button" className="k-linkbtn" onClick={() => onGoTo(g.memberId)}>
              {g.name}
            </button>
            <span className={`k-score ${kpiScoreClass(g.score)}`}>{g.score}</span>
            {g.pm !== null && <span className="k-muted k-rg-pm">Σ ± {fmtSigned(g.pm)}</span>}
          </div>
          {g.items.map((it, i) => (
            <div key={i} className="k-ri">
              <span className={`k-pm ${it.value === null ? 'zero' : pmClass(it.value)}`}>
                {it.value === null ? '•' : fmtSigned(it.value)}
              </span>
              <span>
                {it.text || <span className="k-muted">(không ghi lý do)</span>}
                {it.ctx && <span className="k-ri-ctx">{it.ctx}</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface Props {
  members: KpiSummaryMember[];
  mode: 'leader' | 'share';
  anyOpen: boolean;
  onToggleAll: () => void;
  onGoTo: (memberId: string) => void;
  /** Trang share: nghỉ lễ chung (ẩn khi trống). */
  holidays?: string;
}

export default function KsumOverview({
  members,
  mode,
  anyOpen,
  onToggleAll,
  onGoTo,
  holidays,
}: Props) {
  const groups = useMemo(() => reasonGroupsOf(members), [members]);
  const reasonCount = groups.reduce((s, g) => s + g.items.length, 0);
  const [showReasons, setShowReasons] = useState(true);
  const toggleAllLabel = anyOpen ? 'Thu gọn tất cả' : 'Mở tất cả';

  if (mode === 'leader') {
    return (
      <section className="k-card k-ov" aria-label="Tổng quan điểm">
        <div className="k-ov-row">
          <span className="k-ov-label">Điểm KPI tháng</span>
          <div className="k-chips">
            {members.map((m) => (
              <button
                key={m.memberId}
                type="button"
                className="k-chip"
                title="Cuộn tới khối của member"
                onClick={() => onGoTo(m.memberId)}
              >
                {m.name}
                <span className={`k-score ${kpiScoreClass(m.kpiScore)}`}>{m.kpiScore}</span>
              </button>
            ))}
          </div>
          <div className="k-ov-actions">
            {reasonCount > 0 && (
              <button
                type="button"
                className="k-btn k-btn-sm"
                aria-expanded={showReasons}
                onClick={() => setShowReasons((v) => !v)}
              >
                Lý do ± ({reasonCount})
              </button>
            )}
            <button type="button" className="k-btn k-btn-sm" onClick={onToggleAll}>
              {toggleAllLabel}
            </button>
          </div>
        </div>
        {showReasons && reasonCount > 0 && (
          <ReasonList groups={groups} onGoTo={onGoTo} className="k-reasons" />
        )}
      </section>
    );
  }

  // ----- Trang share -----
  const st = summaryStats(members);
  // Xếp hạng: điểm giảm dần, hòa điểm giữ thứ tự trong bảng (sort ổn định).
  const ranked = [...members].sort((a, b) => b.kpiScore - a.kpiScore);
  const reasonsOf = new Map(groups.map((g) => [g.memberId, g.items.length]));

  return (
    <>
      <section className="k-stats" aria-label="Tổng quan tháng">
        <div className="k-card k-stat">
          <span className="k-stat-l">Member</span>
          <span className="k-stat-v">{st.members}</span>
          <span className="k-stat-s">{st.withReasons} member có lý do ±</span>
        </div>
        <div className="k-card k-stat">
          <span className="k-stat-l">Điểm KPI trung bình</span>
          <span className="k-stat-v">{st.avg}</span>
          <span className="k-stat-s">
            Thấp nhất {st.min} · cao nhất {st.max}
          </span>
        </div>
        <div className="k-card k-stat">
          <span className="k-stat-l">Phân bố điểm</span>
          <div className="k-dist-v">
            <span className="k-stat-v k-c-pos">{st.pos}</span>
            <span className="k-muted">/</span>
            <span className="k-stat-v k-c-base">{st.base}</span>
            <span className="k-muted">/</span>
            <span className="k-stat-v k-c-neg">{st.neg}</span>
          </div>
          <div className="k-distbar" aria-hidden="true">
            {st.pos > 0 && <span className="pos" style={{ flex: st.pos }} />}
            {st.base > 0 && <span className="base" style={{ flex: st.base }} />}
            {st.neg > 0 && <span className="neg" style={{ flex: st.neg }} />}
          </div>
          <span className="k-stat-s k-dist-s">trên 100 / bằng 100 / dưới 100</span>
        </div>
        <div className="k-card k-stat">
          <span className="k-stat-l">Đầu mục</span>
          <span className="k-stat-v">{st.rows}</span>
          <span className="k-stat-s">Σ {st.days} ngày làm việc</span>
        </div>
      </section>

      {holidays && (
        <p className="k-muted k-holiday-ro">
          Nghỉ lễ chung: <b>{holidays}</b>
        </p>
      )}

      <section className="k-sum">
        <div className="k-card k-panel">
          <div className="k-panel-h">
            <h2>Xếp hạng KPI tháng</h2>
            <span className="k-muted k-small">bấm để xem chi tiết</span>
          </div>
          <div className="k-legend">
            <span>
              <i className="pos" />
              Trên 100
            </span>
            <span>
              <i className="base" />
              Bằng 100
            </span>
            <span>
              <i className="neg" />
              Dưới 100
            </span>
          </div>
          <div className="k-rank">
            {ranked.map((m, i) => {
              const cls = kpiScoreClass(m.kpiScore);
              // Thanh lệch quanh mốc 100: ±5 điểm trở lên = nửa thanh.
              const barW = `${(Math.min(Math.abs(m.kpiScore - KPI_MONTH_BASE), 5) / 5) * 50}%`;
              const n = reasonsOf.get(m.memberId) ?? 0;
              return (
                <button
                  key={m.memberId}
                  type="button"
                  className="k-rank-row"
                  onClick={() => onGoTo(m.memberId)}
                >
                  <span className="k-rank-i">{i + 1}</span>
                  <span className="k-rank-name">
                    <span className="k-ellipsis">{m.name}</span>
                    {n > 0 && <span className="k-muted k-rank-n">{n} lý do ±</span>}
                  </span>
                  <span className="k-div" aria-hidden="true">
                    <span className={cls} style={cls === 'base' ? undefined : { width: barW }} />
                  </span>
                  <span className={`k-score ${cls}`}>{m.kpiScore}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="k-card k-panel">
          <div className="k-panel-h">
            <h2>Lý do cộng / trừ điểm</h2>
            <span className="k-muted k-small">
              {reasonCount} lý do · {groups.length} member
            </span>
          </div>
          {groups.length > 0 ? (
            <ReasonList groups={groups} onGoTo={onGoTo} className="k-share-reasons" />
          ) : (
            <p className="k-muted k-small">Không có lý do cộng/trừ điểm nào trong tháng.</p>
          )}
        </div>
      </section>

      <div className="k-sec-h">
        <h2>Chi tiết theo member</h2>
        <button type="button" className="k-btn k-btn-sm" onClick={onToggleAll}>
          {toggleAllLabel}
        </button>
      </div>
    </>
  );
}
