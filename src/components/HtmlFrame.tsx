// Hiển thị nội dung HTML "đúng chuẩn": render trong <iframe sandbox> để tài liệu
// có document context riêng (giữ nguyên <head>/<style>/CSS), cô lập hoàn toàn khỏi
// CSS của app, đồng thời chặn <script> để an toàn (không XSS cho cả người xem công khai).
//
// sandbox: KHÔNG có allow-scripts ⇒ script bị chặn; allow-popups + escape ⇒ link
// trong nội dung mở được ra tab mới (kèm <base target="_blank"> bên dưới).

// Dựng chuỗi srcdoc: bọc fragment thành tài liệu tối thiểu và chèn
// <base target="_blank"> để link mở tab mới, không điều hướng phá SPA.
function buildSrcDoc(html: string): string {
  // Đã là tài liệu đầy đủ (<html>): chèn <base> vào <head> (tạo <head> nếu thiếu).
  if (/<html[\s>]/i.test(html)) {
    if (/<head[\s>]/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, '<head$1><base target="_blank">');
    }
    return html.replace(
      /<html([^>]*)>/i,
      '<html$1><head><base target="_blank"></head>',
    );
  }
  // Fragment HTML rời: bọc tối thiểu để render đúng.
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<base target="_blank"></head><body>' +
    html +
    '</body></html>'
  );
}

export default function HtmlFrame({ value }: { value: string }) {
  return (
    <iframe
      className="html-frame"
      title="Nội dung HTML"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={buildSrcDoc(value)}
    />
  );
}
