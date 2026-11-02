// Chọn app cho 1 dự án của Báo cáo ngày (thay select gốc 24 app): ô tìm, app đã gắn ở
// dự án khác bị khoá kèm số dự án, "Bỏ gắn app" khi dự án đang có app.
// Desktop: menu thả dưới nút; màn hẹp: bottom sheet (KpiDialog sheet).
import { useEffect, useRef, useState } from 'react';
import type { AppItem } from '../../pmTypes';
import { roman } from '../../lib/reportFormat';
import KpiDialog from './KpiDialog';
import { IcCheck, IcLinkOff, IcSearch } from './ksumIcons';

interface Props {
  apps: AppItem[];
  /** appId → chỉ số dự án (0-based) đang gắn app đó, đã loại dự án hiện tại. */
  usedBy: Map<string, number>;
  currentAppId?: string;
  /** Tiêu đề bottom sheet trên màn hẹp. */
  title: string;
  sheet: boolean;
  onPick: (appId: string) => void;
  /** Có → hiện "Bỏ gắn app" (chỉ khi dự án đang gắn app). */
  onUnlink?: () => void;
  onClose: () => void;
}

export default function ReportAppPicker({
  apps,
  usedBy,
  currentAppId,
  title,
  sheet,
  onPick,
  onUnlink,
  onClose,
}: Props) {
  const [q, setQ] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Menu thả (desktop): bấm ra ngoài / Esc để đóng. Bottom sheet đã có sẵn trong KpiDialog.
  useEffect(() => {
    if (sheet) return;
    // Bấm vào nút mở (cùng khung anchor) thì để nút tự bật/tắt, không đóng 2 lần.
    const onDown = (e: MouseEvent) => {
      const anchor = boxRef.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [sheet]);

  const key = q.trim().toLowerCase();
  const list = key
    ? apps.filter((a) => `${a.name} ${a.platform}`.toLowerCase().includes(key))
    : apps;
  const firstFree = list.find((a) => !usedBy.has(a.id));
  const pick = (id: string) => {
    onPick(id);
    onClose();
  };

  const body = (
    <>
      <div className="rpt-pick-search">
        <div className="kml-field rpt-field-lead">
          <span className="rpt-field-lead-ic">
            <IcSearch size={18} />
          </span>
          <input
            className="kml-input"
            value={q}
            autoFocus
            placeholder={`Tìm trong ${apps.length} app`}
            aria-label={`Tìm trong ${apps.length} app`}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Enter = chọn app còn trống đầu tiên khớp từ khoá.
              if (e.key === 'Enter' && firstFree) {
                e.preventDefault();
                pick(firstFree.id);
              }
            }}
          />
        </div>
      </div>
      {onUnlink && currentAppId && !key && (
        <>
          <button
            type="button"
            className="kml-menu-item"
            onClick={() => {
              onUnlink();
              onClose();
            }}
          >
            <IcLinkOff size={18} />
            <span>
              <span>Bỏ gắn app</span>
              <small>Bỏ gắn thì sync Plan tuần nối theo tên dự án</small>
            </span>
          </button>
          <div className="kml-menu-sep" />
        </>
      )}
      {key && (
        <p className="kml-menu-sub">
          {list.length} / {apps.length} app khớp “{q.trim()}”
        </p>
      )}
      <div className="rpt-pick-list" role="listbox" aria-label={title}>
        {list.length === 0 && <p className="rpt-pick-empty">Không có app nào khớp.</p>}
        {list.map((a) => {
          const at = usedBy.get(a.id);
          const taken = at !== undefined;
          const cur = a.id === currentAppId;
          return (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={cur}
              className={`kml-menu-item${cur ? ' is-cur' : ''}`}
              disabled={taken}
              onClick={() => pick(a.id)}
            >
              <span>
                <span>
                  {a.name} · {a.platform}
                </span>
                {taken && <small>Đã gắn ở dự án {roman(at + 1)}</small>}
              </span>
              {cur && (
                <span className="rpt-pick-tick">
                  <IcCheck size={18} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  if (sheet)
    return (
      <KpiDialog title={title} sheet scrollBody onClose={onClose}>
        <div className="rpt-pick is-sheet">{body}</div>
      </KpiDialog>
    );
  return (
    <div ref={boxRef} className="kml-menu rpt-pick" role="dialog" aria-label={title}>
      {body}
    </div>
  );
}
