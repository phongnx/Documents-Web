// Render nội dung có thể là HTML (note) ở chế độ chỉ đọc.
// ⚠️ Không đặt dangerouslySetInnerHTML cùng children JSX trên cùng một thẻ
// (bản production rút gọn sẽ crash với lỗi React #60) → tách hẳn 2 nhánh return.
// Nội dung LUÔN đi qua sanitizeHtml trước khi vào DOM của app (chống XSS).
import { useMemo } from 'react';
import { sanitizeHtml } from '../lib/sanitizeHtml';

export default function HtmlContent({ value }: { value: string }) {
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(value);
  // Lọc 1 lần cho mỗi giá trị, không chạy lại mỗi lần render.
  const clean = useMemo(
    () => (looksLikeHtml ? sanitizeHtml(value) : ''),
    [looksLikeHtml, value],
  );

  if (looksLikeHtml) {
    return (
      <div
        className="note-content readonly"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  return (
    <div className="note-content readonly" style={{ whiteSpace: 'pre-wrap' }}>
      {value}
    </div>
  );
}
