import { useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocuments } from '../context/DocumentsContext';
import { useUploadDocuments } from '../hooks/useUploadDocuments';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { useAuth } from '../auth/useAuth';
import ThemeToggle from '../components/ThemeToggle';
import type { DocItem, DocumentType, Folder } from '../types';

// Biểu tượng hiển thị trên icon tài liệu theo loại.
const GLYPH: Record<DocumentType, string> = { note: '✏️', markdown: '#', html: '🌐' };

export default function DocsAllPage() {
  const {
    documents,
    folders,
    loading,
    addDocument,
    addFolder,
    moveDocument,
    deleteDocument,
    deleteFolder,
  } = useDocuments();
  const { uploadFiles } = useUploadDocuments();
  const sel = useMultiSelect();
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();

  // Folder đang được kéo qua (làm nổi viền ô folder).
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Xóa hàng loạt các mục đang chọn (có confirm tóm tắt).
  const handleBulkDelete = () => {
    if (sel.count === 0) return;
    const parts: string[] = [];
    if (sel.docs.size > 0) parts.push(`${sel.docs.size} tài liệu`);
    if (sel.folders.size > 0)
      parts.push(`${sel.folders.size} thư mục (gồm toàn bộ nội dung bên trong)`);
    const msg = `Xóa ${parts.join(' và ')}? Hành động không thể hoàn tác.`;
    if (!window.confirm(msg)) return;
    sel.docs.forEach((id) => deleteDocument(id));
    sel.folders.forEach((id) => deleteFolder(id));
    sel.exit();
  };

  // Tài liệu trong cả cây folder gốc: docs trực tiếp + docs trong các sub-folder.
  const treeDocsOf = (fid: string) => {
    const subIds = folders.filter((f) => f.parentId === fid).map((f) => f.id);
    return documents.filter(
      (d) => d.folderId === fid || (!!d.folderId && subIds.includes(d.folderId)),
    );
  };
  // Trang chủ chỉ hiển thị folder gốc (sub-folder nằm bên trong folder cha).
  const topFolders = folders.filter((f) => !f.parentId);
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

  // Một ô tài liệu (icon + nhãn), có thể kéo. Ở select mode: click để chọn.
  const renderDoc = (d: DocItem) => {
    const selected = sel.selectMode && sel.docs.has(d.id);
    return (
      <Link
        key={d.id}
        to={`/docs/view/document/${d.id}`}
        className={`tile${selected ? ' selected' : ''}`}
        draggable={!sel.selectMode}
        onDragStart={(e) => onDragStart(e, d.id)}
        onClick={(e) => {
          if (sel.selectMode) {
            e.preventDefault();
            sel.toggleDoc(d.id);
          }
        }}
        title={d.title || '(không tiêu đề)'}
      >
        <span className={`tile-icon icon-${d.type}`}>
          {sel.selectMode && (
            <span className={`sel-check${selected ? ' on' : ''}`} />
          )}
          <span className="tile-glyph">{GLYPH[d.type]}</span>
          {d.isShared && (
            <span className="tile-share" title="Đang chia sẻ công khai">🔗</span>
          )}
        </span>
        <span className="tile-label">{d.title || '(không tiêu đề)'}</span>
      </Link>
    );
  };

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
        <button
          type="button"
          className={sel.selectMode ? 'primary' : ''}
          onClick={sel.toggleMode}
        >
          {sel.selectMode ? '✖ Xong' : '☑️ Chọn'}
        </button>
      </div>

      {sel.selectMode && (
        <div className="select-bar">
          <span>Đã chọn {sel.count}</span>
          <button
            type="button"
            className="danger"
            disabled={sel.count === 0}
            onClick={handleBulkDelete}
          >
            🗑️ Xóa mục đã chọn
          </button>
        </div>
      )}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : folders.length === 0 && documents.length === 0 ? (
        <p className="muted empty">
          Chưa có gì. Bấm “+ New folder” hoặc “+ New note” để bắt đầu.
        </p>
      ) : (
        <div className="home-grid">
          {/* Ô folder — bấm để mở trang chi tiết */}
          {topFolders.map((f) => {
            const items = treeDocsOf(f.id);
            const selected = sel.selectMode && sel.folders.has(f.id);
            return (
              <div
                key={f.id}
                className={`tile folder-tile${dragOver === f.id ? ' drop-over' : ''}${
                  selected ? ' selected' : ''
                }`}
                role="button"
                tabIndex={0}
                onClick={() =>
                  sel.selectMode ? sel.toggleFolder(f.id) : openFolder(f)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    sel.selectMode ? sel.toggleFolder(f.id) : openFolder(f);
                }}
                onDragOver={(e) => allowDrop(e, f.id)}
                onDragLeave={() => setDragOver((k) => (k === f.id ? null : k))}
                onDrop={(e) => onDropToFolder(e, f.id)}
                title={f.name}
              >
                <span className="folder-icon-box">
                  {sel.selectMode ? (
                    <span className={`sel-check${selected ? ' on' : ''}`} />
                  ) : (
                    <span className="folder-count" title="Số tài liệu trong thư mục">
                      {items.length}
                    </span>
                  )}
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
