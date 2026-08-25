// Làm sạch HTML trước khi nhét thẳng vào DOM của app (chống XSS).
//
// Phạm vi: chỉ áp cho nội dung type 'note' — thứ DUY NHẤT được render thẳng
// bằng dangerouslySetInnerHTML (HtmlContent) và innerHTML (NoteEditor), tức là
// chạy trong cùng document/origin với app. Script ở đây sẽ đọc được token
// đăng nhập trong IndexedDB nên bắt buộc phải lọc.
//
// Tài liệu type 'html' KHÔNG đi qua đây: chúng render trong <iframe sandbox>
// (HtmlFrame) vốn không có allow-same-origin ⇒ đã cô lập sẵn, và còn cần chạy
// JS để hiển thị đúng (dashboard…). Đừng "tiện tay" sanitize chúng.
import DOMPurify from 'dompurify';

/** HTML đã lọc bỏ script/handler/URI nguy hiểm, giữ nguyên thẻ định dạng. */
export function sanitizeHtml(html: string): string {
  // ADD_ATTR target: giữ link mở tab mới (trình duyệt hiện đại tự áp noopener).
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}
