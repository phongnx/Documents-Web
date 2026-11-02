// Dialog sắp xếp dự án của Báo cáo ngày. Desktop: kéo thả theo tay nắm + nút lên/xuống;
// màn hẹp: bottom sheet chỉ có nút lên/xuống (kéo thả cảm ứng dễ nhầm với cuộn).
// Thứ tự chỉ áp vào form khi bấm Xong; số La Mã trong bản copy đổi theo.
import { useState } from 'react';
import { roman } from '../../lib/reportFormat';
import KpiDialog from './KpiDialog';
import { IcChevronDown, IcChevronUp, IcGrip, IcSort } from './ksumIcons';

export interface SortItem {
  key: string;
  name: string;
  /** Dòng phụ: app đã gắn / "không gắn app". */
  sub: string;
}

interface Props {
  items: SortItem[];
  narrow: boolean;
  onApply: (keys: string[]) => void;
  onClose: () => void;
}

export default function ReportSortDialog({ items, narrow, onApply, onClose }: Props) {
  const [order, setOrder] = useState(items);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setOrder(next);
  };

  return (
    <KpiDialog
      title="Sắp xếp dự án"
      subtitle="Số La Mã trong bản copy đổi theo thứ tự này."
      icon={<IcSort size={20} />}
      sheet={narrow}
      scrollBody
      onClose={onClose}
      actions={
        <>
          <button type="button" className="kml-btn kml-btn-text" onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className="kml-btn kml-btn-filled"
            onClick={() => {
              onApply(order.map((x) => x.key));
              onClose();
            }}
          >
            Xong
          </button>
        </>
      }
    >
      <ul className="rpt-sort">
        {order.map((it, i) => (
          <li
            key={it.key}
            className={`rpt-sort-row${dragKey === it.key ? ' is-drag' : ''}`}
            draggable={!narrow}
            onDragStart={(e) => {
              setDragKey(it.key);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setDragKey(null)}
            onDragOver={(e) => {
              if (!dragKey || dragKey === it.key) return;
              e.preventDefault();
              // Đổi chỗ ngay khi rê qua để thấy vị trí mới trước khi thả.
              move(
                order.findIndex((x) => x.key === dragKey),
                i,
              );
            }}
          >
            {!narrow && (
              <span className="rpt-sort-grip" aria-hidden="true">
                <IcGrip size={18} />
              </span>
            )}
            <span className="rpt-sort-num">{roman(i + 1)}</span>
            <span className="rpt-sort-name">
              {it.name || '(chưa đặt tên)'}
              <small>{it.sub}</small>
            </span>
            <button
              type="button"
              className="kml-iconbtn"
              aria-label={`Lên 1 bậc: ${it.name}`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              <IcChevronUp size={18} />
            </button>
            <button
              type="button"
              className="kml-iconbtn"
              aria-label={`Xuống 1 bậc: ${it.name}`}
              disabled={i === order.length - 1}
              onClick={() => move(i, i + 1)}
            >
              <IcChevronDown size={18} />
            </button>
          </li>
        ))}
      </ul>
    </KpiDialog>
  );
}
