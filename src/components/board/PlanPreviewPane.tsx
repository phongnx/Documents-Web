// Xem trước Plan tuần (redesign 02/11/2026) — dùng chung editor (tab/khung Xem trước) và
// danh sách plan (khung phải): timeline + phân bố trạng thái ở đầu, rồi 2 nhóm dự án có
// release / không release, mỗi dự án 1 thẻ. Plan truyền vào đã mang trạng thái MỚI NHẤT
// từ DB (mergeLatestState) — trạng thái chỉ sửa ở Tổng quan.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  catMeta,
  dayRank,
  isReleaseWs,
  WORKSTREAM_STATE_META,
  type AppItem,
  type MilestoneType,
  type PlanProject,
  type PlanWorkstream,
  type TaskItem,
  type WeeklyPlan,
  type WorkstreamState,
} from '../../pmTypes';
import { formatDateVi, formatDayMonth } from '../../lib/reportFormat';
import { dateOfWeekday } from '../../lib/pmDates';
import { matchTimelineRow, msVersion, releasedInWeek, sortPlanWorkstreamsByDate } from '../../lib/planProgress';
import ItemLines from './ItemLines';
import {
  IcCalendar,
  IcCheck,
  IcChevronDown,
  IcChevronUp,
  IcExternal,
  IcFlag,
  IcLink,
  IcList,
  IcPending,
  IcRocket,
  IcStDoing,
  IcStDone,
  IcStTest,
  IcStTodo,
  IcTimeline,
} from './ksumIcons';

// Class màu theo trạng thái (dùng chung tag ở editor và thanh phân bố).
export const ST_CLS: Record<WorkstreamState, string> = {
  todo: 'is-todo',
  doing: 'is-doing',
  testing: 'is-test',
  done: 'is-done',
  blocked: 'is-pend',
};
// Icon 14px đứng trước nhãn trong tag trạng thái (editor + xem trước).
export const ST_ICON: Record<WorkstreamState, (p: { size?: number }) => ReactNode> = {
  todo: IcStTodo,
  doing: IcStDoing,
  testing: IcStTest,
  done: IcStDone,
  blocked: IcPending,
};
const ST_ORDER: WorkstreamState[] = ['done', 'testing', 'doing', 'todo', 'blocked'];

// Tone theo NHÃN hiển thị (key có thể đã bị đổi nhãn, VD key 'test' mang nhãn "Development"):
// "Development…" xanh dương · có "test"/"fix"/"bug" đỏ · còn lại xám.
function labelTone(label: string): string {
  const s = label.trim().toLowerCase();
  if (s.startsWith('develop')) return 'is-c-dev';
  if (/test|fix|bug/.test(s)) return 'is-c-fix';
  return 'is-c-oth';
}
// Màu theo loại nhánh (design 02/11/2026): release teal · Test/Fix đỏ · Development xanh dương ·
// còn lại (Khác, Ads, Plan, loại tự thêm) xám. Trả class `is-c-*` dùng chung editor + xem trước.
export function catTone(category: string): string {
  return category === 'release' ? 'is-c-rel' : labelTone(catMeta(category).label);
}
// Màu theo loại milestone: tính là release → teal; mốc thường → theo nhãn như loại nhánh.
export function msTone(type: string, releaseKeys: Set<string>, types: MilestoneType[]): string {
  if (releaseKeys.has(type)) return 'is-c-rel';
  return labelTone(types.find((t) => t.key === type)?.label ?? type);
}

// 'Thứ 4' → 'Thứ 4 · 04/11' (ngày trong khoảng plan); ngoài khoảng → giữ nguyên.
function dayLabel(day: string, plan: WeeklyPlan): string {
  const iso = dateOfWeekday(day, plan.weekStart, plan.weekEnd);
  return iso ? `${day} · ${formatDayMonth(iso)}` : day;
}

// Khối đầu: thẻ Timeline release + thẻ Trạng thái (design 02/11/2026: thanh phân bố, ô số theo
// trạng thái + "Đã release K/T", chip đếm theo loại nhánh và theo loại mốc).
// `flat` = bản gọn, xếp 1 cột (card "Tuần này" ở danh sách màn hẹp).
export function PlanSummary({
  plan,
  releaseKeys,
  milestoneTypes,
  flat,
  onOpenOverview,
}: {
  plan: WeeklyPlan;
  releaseKeys: Set<string>;
  milestoneTypes: MilestoneType[];
  flat?: boolean;
  /** Không truyền → không hiện link "Sửa trạng thái ở Tổng quan". */
  onOpenOverview?: () => void;
}) {
  // Giữ chỉ số gốc để đối chiếu dòng timeline đã release (releasedInWeek trả chỉ số gốc).
  const timeline = (plan.timeline ?? [])
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.day.trim() || t.release.trim())
    .sort((a, b) => dayRank(a.t.day) - dayRank(b.t.day));
  // Không cần báo cáo: chỉ lấy phép gán nhánh done ↔ dòng timeline (ngày done bỏ qua).
  const releasedTl = new Set(
    releasedInWeek(plan, [], releaseKeys)
      .filter((r) => r.timelineIdx >= 0)
      .map((r) => r.timelineIdx),
  );
  const allWs = (plan.projects ?? []).flatMap((p) => p.workstreams ?? []);
  const counts = new Map<WorkstreamState, number>();
  for (const w of allWs) counts.set(w.state ?? 'todo', (counts.get(w.state ?? 'todo') ?? 0) + 1);
  // "Đã release K/T": cùng luật tag "Đã release" — nhánh release (isReleaseWs) ở trạng thái Xong.
  const relWs = allWs.filter((w) => isReleaseWs(w, releaseKeys));
  const relTotal = relWs.length;
  const relDone = relWs.filter((w) => w.state === 'done').length;
  // Đếm theo loại nhánh / loại mốc, nhiều trước.
  const tally = (keys: string[]) => {
    const m = new Map<string, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const byCat = tally(allWs.map((w) => w.category));
  const byMs = tally(allWs.flatMap((w) => (w.milestone ? [w.milestone.type] : [])));
  const msCount = byMs.reduce((n, [, c]) => n + c, 0);
  const msTypeLabel = (t: string) => milestoneTypes.find((x) => x.key === t)?.label ?? t;

  return (
    <div className={`plpv-top${flat ? ' is-flat' : ''}`}>
      <section className="plpv-tlc" aria-label="Timeline release">
        <div className="plpv-tlc-h">
          <span className="plpv-tlc-ic" aria-hidden="true">
            <IcTimeline size={18} />
          </span>
          <h4>Timeline release</h4>
          <span className="plpv-grp-n">
            {timeline.length} bản
            {plan.weekStart && plan.weekEnd
              ? ` · ${formatDayMonth(plan.weekStart)} – ${formatDayMonth(plan.weekEnd)}`
              : ''}
          </span>
        </div>
        {timeline.length === 0 ? (
          <p className="plpv-none">Chưa có mốc release</p>
        ) : (
          <ol className="plpv-tlc-l">
            {timeline.map(({ t, i }) => {
              const day = t.day.trim();
              const bad = !day || dayRank(day) === Number.MAX_SAFE_INTEGER;
              const iso = day ? dateOfWeekday(day, plan.weekStart, plan.weekEnd) : '';
              // "Email Client v1.99" → tên "Email Client" + chip "v1.99"; lấy cụm vX CUỐI để tên app
              // có "v2" ("Music v2 v1.67") không bị tách nhầm; không có version → cả chuỗi.
              const vm = [...t.release.matchAll(/v[0-9][\w.]*/gi)].pop();
              const ver = vm ? vm[0].replace(/\.$/, '') : '';
              const name = vm
                ? `${t.release.slice(0, vm.index)}${t.release.slice(vm.index! + vm[0].length)}`.replace(/\s+/g, ' ').trim()
                : t.release.trim();
              const done = releasedTl.has(i);
              return (
                <li key={i} className={`plpv-tlc-i${done ? ' is-done' : ''}`}>
                  <span className={`plpv-tlc-d${bad ? ' is-warn' : ''}`}>
                    <b>{day || 'Chưa chọn thứ'}</b>
                    {iso && <small>{formatDayMonth(iso)}</small>}
                  </span>
                  <span className="plpv-tlc-dot" aria-hidden="true" />
                  <span className="plpv-tlc-c">
                    <b>{name || t.release}</b>
                    {ver && <span className="plpv-tlc-v">{ver}</span>}
                    {done && (
                      <span className="pl-st is-done is-rel">
                        <IcRocket size={14} />
                        Đã release
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section className="plpv-stc" aria-label={`Trạng thái ${allWs.length} nhánh`}>
        <div className="plpv-tlc-h">
          <span className="plpv-tlc-ic plpv-stc-ic" aria-hidden="true">
            <IcList size={18} />
          </span>
          <h4>Trạng thái {allWs.length} nhánh</h4>
          {onOpenOverview && (
            <button type="button" className="plpv-stc-link" onClick={onOpenOverview}>
              Sửa ở Tổng quan
              <IcExternal size={14} />
            </button>
          )}
        </div>
        {allWs.length === 0 ? (
          <p className="plpv-none">Chưa có nhánh</p>
        ) : (
          <>
            <div className="pl-stbar plpv-stc-bar" aria-hidden="true">
              {ST_ORDER.map((s) =>
                counts.get(s) ? (
                  <i key={s} className={ST_CLS[s]} style={{ flexGrow: counts.get(s) }} />
                ) : null,
              )}
            </div>
            <div className="plpv-stt">
              {ST_ORDER.map((s) =>
                counts.get(s) ? (
                  <div key={s} className={`plpv-stt-i ${ST_CLS[s]}`}>
                    <span>
                      {ST_ICON[s]({ size: 14 })}
                      {WORKSTREAM_STATE_META[s].label}
                    </span>
                    <b>{counts.get(s)}</b>
                  </div>
                ) : null,
              )}
              {relTotal > 0 && (
                <div className="plpv-stt-i is-rel">
                  <span>
                    <IcRocket size={14} />
                    Đã release
                  </span>
                  <b>
                    {relDone}
                    <small>/{relTotal}</small>
                  </b>
                </div>
              )}
            </div>
            <div className="plpv-stc-row">
              <span className="plpv-stc-lbl">Theo loại</span>
              {byCat.map(([c, n]) => (
                <span key={c} className={`plpv-catc ${catTone(c)}`}>
                  {catMeta(c).label} <b>{n}</b>
                </span>
              ))}
            </div>
            {msCount > 0 && (
              <div className="plpv-stc-row">
                <span className="plpv-stc-lbl">{msCount} mốc tuần</span>
                {byMs.map(([t, n]) =>
                  releaseKeys.has(t) ? (
                    <span key={t} className="pl-ms-badge is-rel">
                      <IcRocket size={14} />
                      {msTypeLabel(t)} {n}
                    </span>
                  ) : (
                    <span key={t} className={`pl-ms-badge is-mk ${msTone(t, releaseKeys, milestoneTypes)}`}>
                      <IcFlag size={14} />
                      {msTypeLabel(t)} {n}
                    </span>
                  ),
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

interface Props {
  plan: WeeklyPlan;
  apps: AppItem[];
  tasks: TaskItem[];
  milestoneTypes: MilestoneType[];
  releaseKeys: Set<string>;
  /** Chỉ số dự án đang sửa → tô nền thẻ. */
  highlight?: number;
  /** Bỏ dòng tiêu đề (khung chứa đã hiện tiêu đề ở đầu). */
  hideTitle?: boolean;
  /** Khung rộng (danh sách thu gọn thành rail) → thẻ dự án 4 cột. */
  wide?: boolean;
  /** Cắt thân thẻ dài (danh sách plan) + nút "Xem đủ N dòng"; editor / màn hẹp không cắt. */
  clamp?: boolean;
  /** Mở trang Tổng quan (editor tự hỏi lưu nếu còn thay đổi). */
  onOpenOverview: () => void;
}

// Thân thẻ dự án: khi `clamp`, cao tối đa ~8 dòng (CSS), đo tràn thật bằng ResizeObserver
// (dòng dài xuống hàng vẫn tính đúng) — tràn thì mờ dần ở đáy + nút "Xem đủ N dòng".
function CardBody({ clamp, lines, children }: { clamp: boolean; lines: number; children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    // Đang mở đủ thì giữ nguyên `over` để còn nút Thu gọn.
    if (!clamp || open || !box || !inner) return;
    const check = () => setOver(inner.offsetHeight > box.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(box);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [clamp, open]);

  if (!clamp) return <>{children}</>;
  return (
    <>
      <div ref={boxRef} className={`plpv-cb${open ? '' : ' is-clamp'}${over && !open ? ' is-over' : ''}`}>
        <div ref={innerRef}>{children}</div>
      </div>
      {over && (
        <button type="button" className="plpv-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <IcChevronUp size={16} /> : <IcChevronDown size={16} />}
          {open ? 'Thu gọn' : `Xem đủ ${lines} dòng`}
        </button>
      )}
    </>
  );
}

export default function PlanPreviewPane({
  plan,
  apps,
  tasks,
  milestoneTypes,
  releaseKeys,
  highlight,
  hideTitle,
  wide,
  clamp,
  onOpenOverview,
}: Props) {
  // Nhánh trong mỗi dự án: mốc gần nhất lên trên (chỉ hiển thị, không đổi dữ liệu).
  const projects = sortPlanWorkstreamsByDate(plan, tasks, apps, releaseKeys).projects.map((p, i) => ({ p, i }));
  const hasRel = (p: PlanProject) => (p.workstreams ?? []).some((w) => isReleaseWs(w, releaseKeys));
  const relProjects = projects.filter(({ p }) => hasRel(p));
  const otherProjects = projects.filter(({ p }) => !hasRel(p));
  const releasedCount = relProjects.filter(({ p }) =>
    (p.workstreams ?? []).some((w) => isReleaseWs(w, releaseKeys) && w.state === 'done'),
  ).length;

  const appNameOf = (p: PlanProject) =>
    (apps.find((a) => a.id === p.appId)?.name ?? p.name).trim();

  // Chip ngày của milestone release: dòng timeline khớp nhánh (cùng luật chip ở editor).
  const msDay = (p: PlanProject, w: PlanWorkstream) => {
    if (!w.milestone || !releaseKeys.has(w.milestone.type)) return null;
    const appName = appNameOf(p);
    const vers = new Set([msVersion(w.milestone.text)]);
    for (const tid of w.sourceTaskIds ?? []) {
      const v = tasks.find((t) => t.id === tid)?.version;
      if (v) vers.add(v);
    }
    const row = appName
      ? (plan.timeline ?? []).find((x) => [...vers].some((v) => matchTimelineRow(x.release, appName, v)))
      : undefined;
    if (!row) return { warn: true, text: 'Chưa có trên timeline', title: 'Chưa có dòng timeline cho mốc này' };
    if (!row.day.trim()) return { warn: true, text: 'Chưa chọn thứ', title: `Dòng timeline: ${row.release}` };
    return { warn: false, text: dayLabel(row.day, plan), title: `Dòng timeline: ${row.day} · ${row.release}` };
  };

  const card = ({ p, i }: { p: PlanProject; i: number }) => {
    const app = p.appId ? apps.find((a) => a.id === p.appId) : undefined;
    const appLabel = app && app.name.trim().toLowerCase() !== p.name.trim().toLowerCase() ? app.name : '';
    return (
      <div key={i} className={`plpv-card${hasRel(p) ? ' has-rel' : ''}${highlight === i ? ' is-cur' : ''}`} data-pidx={i}>
        <h3>
          <span className="plpv-name">{p.name.trim() || '(chưa đặt tên)'}</span>
          {hasRel(p) && (
            <span className="plpv-rocket" title="Dự án có release trong tuần">
              <IcRocket size={14} />
            </span>
          )}
          {appLabel && (
            <span className="plpv-app">
              <IcLink size={14} />
              {appLabel}
            </span>
          )}
        </h3>
        <CardBody
          clamp={!!clamp}
          lines={(p.workstreams ?? []).reduce((n, w) => n + (w.items ?? []).filter((it) => it.trim()).length, 0)}
        >
        {(p.workstreams ?? []).length === 0 && <p className="plpv-none">Chưa có nhánh</p>}
        {(p.workstreams ?? []).map((w, wi) => {
          const st = w.state ?? 'todo';
          const rel = isReleaseWs(w, releaseKeys);
          const msRel = !!w.milestone && releaseKeys.has(w.milestone.type);
          const msLabel = w.milestone
            ? (milestoneTypes.find((t) => t.key === w.milestone!.type)?.label ?? w.milestone.type)
            : '';
          const day = msDay(p, w);
          const msTxt = w.milestone?.text.trim() ?? '';
          const ms = w.milestone;
          // Chip trên header nhánh (design 02/11): mốc release → badge teal đặc (đã Xong → chip
          // xanh lá "✓ Release"); mốc thường → badge theo màu loại mốc; không mốc → chip loại nhánh.
          const headChip = ms ? (
            msRel ? (
              st === 'done' ? (
                <span className="plpv-catc is-c-done" title="Mốc release · đã release">
                  <IcCheck size={14} />
                  {msLabel}
                </span>
              ) : (
                <span className="pl-ms-badge is-rel" title="Loại milestone">
                  <IcRocket size={14} />
                  {msLabel}
                </span>
              )
            ) : (
              <span className={`pl-ms-badge is-mk ${msTone(ms.type, releaseKeys, milestoneTypes)}`} title="Loại milestone">
                <IcFlag size={14} />
                {msLabel}
              </span>
            )
          ) : (
            <span
              className={`plpv-catc ${rel && st === 'done' ? 'is-c-done' : catTone(w.category)}`}
              title="Loại nhánh"
            >
              {rel && st === 'done' && <IcCheck size={14} />}
              {catMeta(w.category).label}
            </span>
          );
          return (
            <div key={wi} className={`plpv-ws${st === 'done' ? ' is-done' : ''}`}>
              <div className="plpv-ws-h">
                <b>{w.title.trim() || '(chưa đặt tên)'}</b>
                {headChip}
                <span className="kml-spacer" />
                {rel && st === 'done' ? (
                  <span className="pl-st is-done is-rel">
                    <IcRocket size={14} />
                    Đã release
                  </span>
                ) : (
                  <span className={`pl-st ${ST_CLS[st]}`}>
                    {ST_ICON[st]({ size: 14 })}
                    {WORKSTREAM_STATE_META[st].label}
                  </span>
                )}
              </div>
              {ms && (msTxt || day) && (
                <div className={`plpv-ms${msRel ? ' is-rel' : ''}`}>
                  <span className={`plpv-ms-ic ${msTone(ms.type, releaseKeys, milestoneTypes)}`} aria-hidden="true">
                    {msRel ? <IcRocket size={14} /> : <IcFlag size={14} />}
                  </span>
                  {msTxt && <span className="plpv-ms-text">{msTxt}</span>}
                  {day && (
                    <span className={`pl-ms-day${day.warn ? ' is-warn' : ''}`} title={day.title}>
                      <IcCalendar size={14} />
                      {day.text}
                    </span>
                  )}
                  {msRel && st === 'done' && (
                    <span className="plpv-ok" title="Đã release">
                      <IcCheck size={14} />
                    </span>
                  )}
                </div>
              )}
              <ItemLines items={(w.items ?? []).filter((it) => it.trim())} className="pp-items" />
            </div>
          );
        })}
        </CardBody>
      </div>
    );
  };

  return (
    <div className="plpv">
      {!hideTitle && (
        <div className="plpv-title">
          {plan.title.trim() || 'Plan tuần'}
          <span>
            {' '}
            · {formatDayMonth(plan.weekStart)} – {formatDateVi(plan.weekEnd)}
          </span>
        </div>
      )}
      {plan.description.trim() && <p className="plpv-desc">{plan.description}</p>}

      <PlanSummary
        plan={plan}
        releaseKeys={releaseKeys}
        milestoneTypes={milestoneTypes}
        onOpenOverview={onOpenOverview}
      />

      {projects.length === 0 && <p className="plpv-none plpv-empty">Chưa có dự án nào.</p>}
      {relProjects.length > 0 && (
        <>
          <div className="plpv-grp is-rel" role="heading" aria-level={3}>
            <span className="plpv-grp-ic" aria-hidden="true">
              <IcRocket size={18} />
            </span>
            <span className="plpv-grp-t">Có release</span>
            <span className="plpv-grp-n">{relProjects.length} app</span>
            {releasedCount > 0 && (
              <span className="plpv-grp-ok">
                <IcCheck size={14} />
                {releasedCount} đã release
              </span>
            )}
          </div>
          <div className={`plpv-cards${wide ? ' is-wide' : ''}`}>{relProjects.map(card)}</div>
        </>
      )}
      {otherProjects.length > 0 && (
        <>
          <div className="plpv-grp" role="heading" aria-level={3}>
            <span className="plpv-grp-ic" aria-hidden="true">
              <IcList size={18} />
            </span>
            <span className="plpv-grp-t">Không release</span>
            <span className="plpv-grp-n">{otherProjects.length} app</span>
          </div>
          <div className={`plpv-cards${wide ? ' is-wide' : ''}`}>{otherProjects.map(card)}</div>
        </>
      )}
    </div>
  );
}
