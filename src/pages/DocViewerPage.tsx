import { Link, useParams } from 'react-router-dom';
import { useDocuments } from '../context/DocumentsContext';
import DocumentEditor from '../components/DocumentEditor';

export default function DocViewerPage() {
  const { id } = useParams();
  const { documents, loading } = useDocuments();
  const doc = documents.find((d) => d.id === id);

  return (
    <div className="doc-page">
      <div className="back-bar">
        <Link to="/docs">← Quay lại danh sách</Link>
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
