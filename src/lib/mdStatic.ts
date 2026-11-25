// Chuyển Markdown → HTML tĩnh cho file export (dashboard Manager): cùng bộ react-markdown +
// remark-gfm với MarkdownPreview nên hiển thị giống trên web. react-markdown mặc định KHÔNG
// render HTML thô trong nội dung (không có rehype-raw) → an toàn khi nhúng vào file.
// Chỉ import động lúc bấm export (kéo theo react-dom/server) để không làm nặng bundle chính.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function mdToHtml(md: string): string {
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, md));
}
