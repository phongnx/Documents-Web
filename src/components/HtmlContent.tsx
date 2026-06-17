// Render nội dung có thể là HTML (note) ở chế độ chỉ đọc.
// ⚠️ Không đặt dangerouslySetInnerHTML cùng children JSX trên cùng một thẻ
// (bản production rút gọn sẽ crash với lỗi React #60) → tách hẳn 2 nhánh return.
export default function HtmlContent({ value }: { value: string }) {
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(value);

  if (looksLikeHtml) {
    return (
      <div
        className="note-content readonly"
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  return (
    <div className="note-content readonly" style={{ whiteSpace: 'pre-wrap' }}>
      {value}
    </div>
  );
}
