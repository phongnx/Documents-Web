// Render nội dung item của 1 nhánh plan / task theo đúng cấp bậc marker — dùng chung cho
// preview plan, lịch tuần và dialog mốc release ở KPI Log, để web và file HTML export
// nhìn giống hệt nhau (cùng luật trong planItems.ts).
import { groupItemNodes } from '../../lib/planItems';

export default function ItemLines({
  items,
  className,
}: {
  items: string[];
  /** Class của thẻ <ul> danh sách đầu việc (giữ style sẵn có của từng trang). */
  className?: string;
}) {
  const blocks = groupItemNodes(items ?? []);
  if (blocks.length === 0) return null;
  return (
    <div className="item-lines">
      {blocks.map((b, i) => {
        if (b.kind === 'head')
          return (
            <p key={i} className="item-head">
              {b.text}
            </p>
          );
        if (b.kind === 'arrow')
          return (
            <p key={i} className="item-arrow">
              → {b.text}
            </p>
          );
        return (
          <ul key={i} className={className}>
            {b.bullets.map((it, j) => (
              <li key={j}>
                {it.text}
                {it.conts.map((c, k) => (
                  <div key={k} className="item-cont">
                    {c}
                  </div>
                ))}
                {it.subs.length > 0 && (
                  <ul className="item-sub">
                    {it.subs.map((s, k) => (
                      <li key={k}>{s}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
