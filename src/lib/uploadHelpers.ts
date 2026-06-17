import type { DocumentType } from '../types';

// Một tài liệu sắp được tạo từ file: nội dung đã đọc xong, sẵn sàng ghi.
export interface UploadItem {
  type: DocumentType;
  title: string;
  content: string;
}

// Phần mở rộng file (đã hạ chữ thường) → suy ra loại tài liệu.
// .html/.htm là tài liệu HTML đầy đủ ⇒ 'html' (giữ nguyên cả document, xem bằng
// iframe sandbox); còn lại coi như văn bản/Markdown thuần.
export function detectType(name: string): DocumentType {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return ext === 'html' || ext === 'htm' ? 'html' : 'markdown';
}

// Bỏ phần mở rộng để làm tiêu đề mặc định ("ghi-chu.md" → "ghi-chu").
export function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

// Nếu file là một trang HTML đầy đủ (<html>/<body>) thì chỉ lấy phần thân,
// để khi render bằng dangerouslySetInnerHTML không dính thẻ head/title lạc lõng.
export function extractHtmlBody(raw: string): string {
  if (/<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw)) {
    try {
      const parsed = new DOMParser().parseFromString(raw, 'text/html');
      return parsed.body?.innerHTML ?? raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

// Đọc nội dung text của các file rồi dựng thành UploadItem (chưa ghi vào DB).
// Không lưu file gốc — chỉ lấy nội dung văn bản bên trong.
export async function filesToItems(
  files: File[],
): Promise<UploadItem[]> {
  const contents = await Promise.all(files.map((f) => f.text()));
  return files.map((f, i) => {
    const type = detectType(f.name);
    return {
      type,
      title: stripExt(f.name),
      content: type === 'note' ? extractHtmlBody(contents[i]) : contents[i],
    };
  });
}
