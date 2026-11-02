// Ô nội dung 1 dự án của Báo cáo ngày: textarea trong suốt phủ lên lớp tô màu (mirror).
// Mirror nằm trong luồng nên quyết định chiều cao → ô tự cao theo nội dung, không cuộn
// trong ô. Hai lớp phải cùng font / padding / cách xuống dòng thì con trỏ mới khớp chữ.
// Dòng gõ nhầm marker (=>, –, •…) được gạch sóng + gợi ý sửa tại chỗ.
// Có chip sync Plan tuần → lớp tô màu nổi lên trên textarea (pointer-events: none) để chip
// bấm được; textarea vẫn nhận mọi click còn lại.
import { forwardRef, useId } from 'react';
import { classifyRawLine, markerTypo } from '../../lib/reportFormat';
import { IcWarn } from './ksumIcons';
import ReportSyncChip, { type SyncChipView } from './ReportSyncChip';

const KIND_CLS: Record<string, string> = {
  section: 'l-sec',
  arrow: 'l-a',
  bullet: 'l-b',
  sub: 'l-s',
  text: 'l-t',
  empty: '',
};

interface Props {
  value: string;
  placeholder: string;
  ariaLabel: string;
  onChange: (v: string) => void;
  /** Chip sync trên dòng '#' (khoá = chỉ số dòng thô). */
  lineChips?: Map<number, SyncChipView>;
  /** Dòng '->' dùng làm mốc → gạch chân nhẹ. */
  goalLines?: Set<number>;
  /** Tóm tắt sync cho trình đọc màn hình (chip trong lớp tô màu bị aria-hidden). */
  syncDesc?: string;
}

const ReportBodyEditor = forwardRef<HTMLTextAreaElement, Props>(function ReportBodyEditor(
  { value, placeholder, ariaLabel, onChange, lineChips, goalLines, syncDesc },
  ref,
) {
  const descId = useId();
  const rawLines = value.split('\n');
  const showPh = value === '';
  const lines = showPh ? placeholder.split('\n') : rawLines;

  // Dòng gõ nhầm marker đầu tiên → hộp gợi ý sửa (sửa xong dòng kế tiếp mới hiện).
  const typos = showPh
    ? []
    : rawLines
        .map((l, i) => ({ i, t: markerTypo(l) }))
        .filter((x): x is { i: number; t: { wrong: string; fix: string } } => !!x.t);
  const first = typos[0];
  const fixFirst = () => {
    if (!first) return;
    const next = [...rawLines];
    const raw = next[first.i];
    const ws = raw.slice(0, raw.length - raw.trimStart().length);
    next[first.i] = ws + first.t.fix + raw.trimStart().slice(first.t.wrong.length);
    onChange(next.join('\n'));
  };
  const badSet = new Set(typos.map((x) => x.i));

  return (
    <>
      <div className={`rpt-ed${!showPh && lineChips?.size ? ' has-sync' : ''}`}>
        <div className="rpt-ed-mirror" aria-hidden="true">
          {lines.map((raw, i) => {
            const c = classifyRawLine(raw);
            const cls = showPh ? 'l-ph' : `${KIND_CLS[c.kind]}${badSet.has(i) ? ' l-bad' : ''}`;
            const chip = showPh ? undefined : lineChips?.get(i);
            // Gạch chân phần chữ của dòng mốc, chừa khoảng trắng sau marker.
            const goal = !showPh && goalLines?.has(i) && c.rest.trim();
            const gap = goal ? c.rest.slice(0, c.rest.length - c.rest.trimStart().length) : '';
            return (
              <div key={i} className={`rpt-ml ${cls}`}>
                {c.lead && <span className="rpt-mk">{c.lead}</span>}
                {goal ? (
                  <>
                    {gap}
                    <span className="rpt-ms">{c.rest.trimStart()}</span>
                  </>
                ) : (
                  c.rest
                )}
                {/* Dòng trống vẫn giữ chiều cao 1 dòng như textarea */}
                {!c.lead && !c.rest && '​'}
                {chip && <ReportSyncChip view={chip} inMirror />}
              </div>
            );
          })}
        </div>
        <textarea
          ref={ref}
          className="rpt-ed-ta"
          value={value}
          spellCheck={false}
          aria-label={ariaLabel}
          aria-describedby={syncDesc ? descId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {syncDesc && (
          <span id={descId} className="rpt-sr">
            {syncDesc}
          </span>
        )}
      </div>
      {first && (
        <div className="rpt-ed-help" role="status">
          <IcWarn size={16} />
          <span>
            Dòng {first.i + 1} bắt đầu bằng <code>{first.t.wrong}</code> nên sẽ copy thành text
            thường. Ý bạn là <code>{first.t.fix}</code>?
            {typos.length > 1 && ` (còn ${typos.length - 1} dòng tương tự)`}
          </span>
          <button type="button" className="kml-btn kml-btn-text" onClick={fixFirst}>
            Sửa thành {first.t.fix}
          </button>
        </div>
      )}
    </>
  );
});

export default ReportBodyEditor;
