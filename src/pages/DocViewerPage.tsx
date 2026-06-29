import { Link, useParams } from 'react-router-dom';
import { useDocuments } from '../context/DocumentsContext';
import DocumentEditor from '../components/DocumentEditor';

export default function DocViewerPage() {
  const { id } = useParams();
  const { documents, folders, loading } = useDocuments();
  const doc = documents.find((d) => d.id === id);

  // Đích quay lại: nếu tài liệu thuộc một folder (và folder còn tồn tại) thì về
  // trang folder đó; ngược lại (đứng riêng / chưa load / folder đã xóa) về gốc.
  const inFolder = !!doc?.folderId && folders.some((f) => f.id === doc.folderId);
  const backTo = inFolder ? `/docs/folder/${doc!.folderId}` : '/docs';
  const backLabel = inFolder ? '← Quay lại thư mục' : '← Quay lại danh sách';

  return (
    <div className="doc-page">
      <div className="back-bar">
        <Link to={backTo}>{backLabel}</Link>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : !doc ? (
        <p className="muted">Không tìm thấy tài liệu này.</p>
      ) : (
        <DocumentEditor key={doc.id} doc={doc} />
      )}
    </div>
  );
}
