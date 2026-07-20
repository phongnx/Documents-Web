import type { DocItem } from '../types';

// Bỏ ký tự không hợp lệ trong tên file (cấm trên Windows/macOS), gộp khoảng
// trắng và cắt bớt cho gọn. Tiêu đề rỗng thì dùng tên mặc định.
function safeFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 100)
    .trim();
  return cleaned || 'tai-lieu';
}

// Thoát các ký tự đặc biệt khi nhúng tiêu đề vào thẻ <title>.
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c,
  );
}

// Bọc nội dung HTML (loại 'note', vốn chỉ là phần thân) thành một trang HTML
// hoàn chỉnh có charset UTF-8, để file tải về mở được độc lập trên trình duyệt.
function wrapHtml(title: string, body: string): string {
  const safeTitle = escapeHtml(title.trim() || 'Tài liệu');
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

// Tải tài liệu về máy người xem: note → .html (bọc thân thành trang đầy đủ),
// html → .html (xuất nguyên văn, vốn đã là tài liệu đầy đủ), markdown → .md.
// Dùng Blob + thẻ <a download> tạm rồi tự dọn dẹp (cách tải file thuần client).
export function downloadDocument(doc: DocItem): void {
  let ext: string;
  let mime: string;
  let content: string;
  switch (doc.type) {
    case 'markdown':
      ext = 'md';
      mime = 'text/markdown';
      content = doc.content;
      break;
    case 'html':
      // File HTML: giữ nguyên cả document, không bọc lại.
      ext = 'html';
      mime = 'text/html';
      content = doc.content;
      break;
    default: // 'note': nội dung chỉ là phần thân → bọc thành trang HTML đầy đủ.
      ext = 'html';
      mime = 'text/html';
      content = wrapHtml(doc.title, doc.content);
  }

  downloadTextFile(`${safeFileName(doc.title)}.${ext}`, content, mime);
}

// Tải một chuỗi text (HTML/MD/JSON…) về máy dưới tên file cho trước.
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/html',
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
