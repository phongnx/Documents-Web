import { useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocuments } from '../context/DocumentsContext';
import { useUploadDocuments } from '../hooks/useUploadDocuments';
import { useAuth } from '../auth/useAuth';
import ThemeToggle from '../components/ThemeToggle';
import type { DocItem, DocumentType, Folder } from '../types';

// Biểu tượng hiển thị trên icon tài liệu theo loại.
const GLYPH: Record<DocumentType, string> = { note: '✏️', markdown: '#', html: '🌐' };

export default function DocsAllPage() {
  const { documents, folders, loading, addDocument, addFolder, moveDocument } =
    useDocuments();
  const { uploadFiles } = useUploadDocuments();
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();

  // Folder đang được kéo qua (làm nổi viền ô folder).
  const [dragOver, setDragOver] = useState<string | null>(null);

  const docsOf = (fid: string) => documents.filter((d) => d.folderId === fid);
  const looseDocs = documents.filter((d) => !d.folderId);

  const create = (type: DocumentType) => {
    const created = addDocument(type);
    if (created) navigate(`/docs/view/document/${created.id}`);
  };

  // ----- Kéo-thả (HTML5 native): kéo tài liệu thả vào ô folder -----
  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const allowDrop = (e: DragEvent, key: string) => {
    e.preventDefault();
    // Kéo file từ máy thì là thao tác "copy" (tải lên); kéo tài liệu nội bộ là "move".
    const isFile = Array.from(e.dataTransfer.types).includes('Files');
    e.dataTransfer.dropEffect = isFile ? 'copy' : 'move';
    if (dragOver !== key) setDragOver(key);
  };
  const onDropToFolder = (e: DragEvent, folderId: string) => {
    e.preventDefault();
    setDragOver(null);
    // Kéo file thật từ máy → tải lên thẳng vào folder này.
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files, folderId);
      return;
    }
    // Kéo một tài liệu nội bộ → chuyển nó vào folder.
    const id = e.dataTransfer.getData('text/plain');
    if (id) moveDocument(id, folderId);
  };

  const openFolder = (f: Folder) => navigate(`/docs/folder/${f.id}`);

  // Một ô tài liệu (icon + nhãn), có thể kéo.
  const renderDoc = (d: DocItem) => (
    <Link
      key={d.id}
      to={`/docs/view/document/${d.id}`}
      className="tile"
      draggable
      onDragStart={(e) => onDragStart(e, d.id)}
      title={d.title || '(không tiêu đề)'}
    >
      <span className={`tile-icon icon-${d.type}`}>
        <span className="tile-glyph">{GLYPH[d.type]}</span>
        {d.isShared && (
          <span className="tile-share" title="Đang chia sẻ công khai">🔗</span>
        )}
      </span>
      <span className="tile-label">{d.title || '(không tiêu đề)'}</span>
    </Link>
  );

  return (
    <div className="container">
      <header className="app-header">
        <h1>📄 Tài liệu của tôi</h1>
        <div className="user-box">
          <ThemeToggle />
          <span className="muted">{user?.email}</span>
          <button type="button" onClick={() => signOutUser()}>Đăng xuất</button>
        </div>
      </header>

      <div className="actions">
        <button type="button" className="primary" onClick={() => create('note')}>
          + New note
        </button>
        <button type="button" className="primary" onClick={() => create('markdown')}>
          + New markdown
        </button>
        <button type="button" onClick={() => addFolder()}>+ New folder</button>
        <button type="button" onClick={() => navigate('/docs/upload')}>
          ⬆️ Tải lên hàng loạt
        </button>
      </div>

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : folders.length === 0 && documents.length === 0 ? (
        <p className="muted empty">
          Chưa có gì. Bấm “+ New folder” hoặc “+ New note” để bắt đầu.
        </p>
      ) : (
        <div className="home-grid">
          {/* Ô folder — bấm để mở trang chi tiết */}
          {folders.map((f) => {
            const items = docsOf(f.id);
            return (
              <div
                key={f.id}
                className={`tile folder-tile${dragOver === f.id ? ' drop-over' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => openFolder(f)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openFolder(f);
                }}
                onDragOver={(e) => allowDrop(e, f.id)}
                onDragLeave={() => setDragOver((k) => (k === f.id ? null : k))}
                onDrop={(e) => onDropToFolder(e, f.id)}
                title={f.name}
              >
                <span className="folder-icon-box">
                  <span className="folder-count" title="Số tài liệu trong thư mục">
                    {items.length}
                  </span>
                  {f.isShared && (
                    <span className="tile-share" title="Đang chia sẻ công khai">🔗</span>
                  )}
                  <span className="folder-mini">
                    {items.slice(0, 9).map((d) => (
                      <span key={d.id} className={`mini-doc mini-${d.type}`} />
                    ))}
                  </span>
                </span>
                <span className="tile-label">{f.name}</span>
              </div>
            );
          })}

          {/* Tài liệu không thuộc folder nào — nằm thẳng trên lưới */}
          {looseDocs.map(renderDoc)}
        </div>
      )}
    </div>
  );
}
