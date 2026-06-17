import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="muted">Chưa có nội dung. Gõ Markdown ở tab Edit.</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
