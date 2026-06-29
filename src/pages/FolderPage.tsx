import { useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDocuments } from '../context/DocumentsContext';
import { useUploadDocuments } from '../hooks/useUploadDocuments';
import { useMultiSelect } from '../hooks/useMultiSelect';
import ThemeToggle from '../components/ThemeToggle';
import MoveToFolderDialog from '../components/MoveToFolderDialog';
import type { DocItem, DocumentType } from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function FolderPage() {
  const { folderId } = useParams();
  const {
    documents,
    folders,
    loading,
    addDocument,
    addFolder,
    renameFolder,
    deleteFolder,
    deleteDocument,
    updateDocument,
    toggleShareFolder,
    moveDocument,
  } = useDocuments();
  const { uploadFiles } = useUploadDocuments();
  const sel = useMultiSelect();
  const navigate = useNavigate();

  const folder = folders.find((f) => f.id === folderId);
  const docs = documents.filter((d) => d.folderId === folderId);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [copied, setCopied] = useState(false);
  // Đang kéo file từ máy qua trang (để làm nổi vùng thả).
  const [fileDragOver, setFileDragOver] = useState(false);
  // Tài liệu đang mở dialog "Di chuyển tới…" (null = không mở).
  const [moveDoc, setMoveDoc] = useState<DocItem | null>(null);

  const backBar = (
    <div className="back-bar">
      <Link to="/docs">← Quay lại danh sách</Link>
    </div>
  );

  if (loading) {
    return (
      <div className="container">
        {backBar}
        <p className="muted">Đang tải…</p>
      </div>
    );
  }
  if (!folder) {
    return (
      <div className="container">
        {backBar}
        <p className="muted">Không tìm thấy folder này.</p>
      </div>
    );
  }

  // Phân cấp: folder hiện tại là sub-folder hay folder gốc?
  const isSub = !!folder.parentId;
  const subFolders = folders.filter((f) => f.parentId === folder.id);
  const parentFolder = folder.parentId
    ? folders.find((f) => f.id === folder.parentId)
    : undefined;
  const backTo = parentFolder ? `/docs/folder/${parentFolder.id}` : '/docs';
  const backLabel = parentFolder
    ? '← Quay lại thư mục cha'
    : '← Quay lại danh sách';

  const create = (type: DocumentType) => {
    const created = addDocument(type, undefined, folder.id);
    if (created) navigate(`/docs/view/document/${created.id}`);
  };

  // Tạo thư mục con (chỉ dùng ở folder gốc).
  const createSubFolder = () => addFolder(undefined, folder.id);

  // Đổi tên nhanh một tài liệu (qua hộp nhập của trình duyệt).
  const onRenameDoc = (id: string, current: string) => {
    const name = window.prompt('Tên tài liệu mới:', current);
    if (name === null) return; // bấm Cancel
    const trimmed = name.trim();
    if (!trimmed || trimmed === current) return;
    updateDocument(id, { title: trimmed });
  };

  // Xóa nhanh một tài liệu (có confirm).
  const onDeleteDoc = (id: string, title: string) => {
    if (
      window.confirm(
        `Xóa tài liệu "${title || '(không tiêu đề)'}"? Hành động không thể hoàn tác.`,
      )
    )
      deleteDocument(id);
  };

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

  const startRename = () => {
    setEditName(folder.name);
    setEditing(true);
  };
  const commitRename = () => {
    const name = editName.trim();
    if (name && name !== folder.name) renameFolder(folder.id, name);
    setEditing(false);
  };

  const onDelete = () => {
    // Đếm cả tài liệu lồng trong các sub-folder để cảnh báo cho đúng.
    const subIds = subFolders.map((f) => f.id);
    const nDocs = documents.filter(
      (d) => d.folderId === folder.id || (!!d.folderId && subIds.includes(d.folderId)),
    ).length;
    const parts: string[] = [];
    if (subFolders.length > 0) parts.push(`${subFolders.length} thư mục con`);
    if (nDocs > 0) parts.push(`${nDocs} tài liệu`);
    const msg =
      parts.length > 0
        ? `Xóa folder "${folder.name}" và ${parts.join(' + ')} bên trong? Thao tác không thể hoàn tác.`
        : `Xóa folder "${folder.name}"?`;
    if (window.confirm(msg)) {
      deleteFolder(folder.id);
      // Xóa sub-folder → về folder cha; xóa folder gốc → về danh sách.
      navigate(backTo);
    }
  };

  // ----- Kéo-thả file từ máy vào trang → tải lên thẳng folder này -----
  const onPageDragOver = (e: DragEvent) => {
    // Chỉ phản ứng với file thật từ máy, không phải kéo phần tử trong trang.
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!fileDragOver) setFileDragOver(true);
  };
  const onPageDragLeave = (e: DragEvent) => {
    // Chỉ tắt khi con trỏ rời hẳn vùng container (tránh nhấp nháy khi qua phần tử con).
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFileDragOver(false);
    }
  };
  const onPageDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    setFileDragOver(false);
    void uploadFiles(e.dataTransfer.files, folder.id);
  };

  const shareUrl = `${window.location.origin}/share/f/${folder.id}`;
  const onCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={`container${fileDragOver ? ' file-drag-over' : ''}`}
      onDragOver={onPageDragOver}
      onDragLeave={onPageDragLeave}
      onDrop={onPageDrop}
    >
      {fileDragOver && (
        <div className="file-drop-banner">
          📂 Thả để tải lên vào folder “{folder.name}”
        </div>
      )}

      <div className="back-bar">
        <Link to={backTo}>{backLabel}</Link>
      </div>

      <header className="app-header">
        <h1 className="folder-title">
          <span>📁</span>
          {editing ? (
            <input
              className="folder-name-edit"
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <span onDoubleClick={startRename} title="Bấm đúp để đổi tên">
              {folder.name}
            </span>
          )}
        </h1>
        <div className="user-box">
          <ThemeToggle />
          <button
            type="button"
            className={folder.isShared ? 'primary' : ''}
            onClick={() => toggleShareFolder(folder.id)}
            title="Bật/tắt chia sẻ công khai cả folder"
          >
            {folder.isShared ? '🔗 Đang chia sẻ' : 'Chia sẻ folder'}
          </button>
          <button type="button" onClick={startRename}>✏️ Đổi tên</button>
          <button type="button" className="danger" onClick={onDelete}>🗑️ Xóa folder</button>
        </div>
      </header>

      {folder.isShared && (
        <div className="share-bar">
          <span className="muted">
            Link công khai (ai có link đều xem được cả folder):
          </span>
          <input
            className="share-url"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
          />
          <button type="button" onClick={onCopyShare}>
            {copied ? 'Đã copy ✓' : 'Copy'}
          </button>
          <a href={shareUrl} target="_blank" rel="noreferrer">Mở</a>
        </div>
      )}

      <div className="actions">
        <button type="button" className="primary" onClick={() => create('note')}>
          + New note
        </button>
        <button type="button" className="primary" onClick={() => create('markdown')}>
          + New markdown
        </button>
        <button
          type="button"
          onClick={() => navigate(`/docs/upload?folder=${folder.id}`)}
        >
          ⬆️ Tải lên hàng loạt
        </button>
        {!isSub && (
          <button type="button" onClick={createSubFolder}>
            ＋ Thư mục con
          </button>
        )}
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

      {/* Lưới thư mục con (chỉ ở folder gốc) */}
      {!isSub && subFolders.length > 0 && (
        <div className="home-grid subfolder-grid">
          {subFolders.map((sf) => {
            const items = documents.filter((d) => d.folderId === sf.id);
            const selected = sel.selectMode && sel.folders.has(sf.id);
            return (
              <div
                key={sf.id}
                className={`tile folder-tile${selected ? ' selected' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() =>
                  sel.selectMode
                    ? sel.toggleFolder(sf.id)
                    : navigate(`/docs/folder/${sf.id}`)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ')
                    sel.selectMode
                      ? sel.toggleFolder(sf.id)
                      : navigate(`/docs/folder/${sf.id}`);
                }}
                title={sf.name}
              >
                <span className="folder-icon-box">
                  {sel.selectMode ? (
                    <span className={`sel-check${selected ? ' on' : ''}`} />
                  ) : (
                    <span className="folder-count" title="Số tài liệu trong thư mục">
                      {items.length}
                    </span>
                  )}
                  {sf.isShared && (
                    <span className="tile-share" title="Đang chia sẻ công khai">🔗</span>
                  )}
                  <span className="folder-mini">
                    {items.slice(0, 9).map((d) => (
                      <span key={d.id} className={`mini-doc mini-${d.type}`} />
                    ))}
                  </span>
                </span>
                <span className="tile-label">{sf.name}</span>
              </div>
            );
          })}
        </div>
      )}

      {docs.length === 0 ? (
        <p className="muted empty">
          Chưa có tài liệu trong thư mục này. Bấm nút phía trên để tạo, hoặc kéo
          tài liệu vào từ trang chủ.
        </p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => {
            const selected = sel.selectMode && sel.docs.has(d.id);
            return (
              <li key={d.id} className={`doc-line${selected ? ' selected' : ''}`}>
                <Link
                  to={`/docs/view/document/${d.id}`}
                  className="doc-item"
                  onClick={(e) => {
                    if (sel.selectMode) {
                      e.preventDefault();
                      sel.toggleDoc(d.id);
                    }
                  }}
                >
                  {sel.selectMode && (
                    <span
                      className={`sel-check sel-check-inline${selected ? ' on' : ''}`}
                    />
                  )}
                  <span className={`badge badge-${d.type}`}>{d.type}</span>
                  <span className="doc-title">{d.title || '(không tiêu đề)'}</span>
                  {d.isShared && (
                    <span className="share-flag" title="Đang chia sẻ công khai">🔗</span>
                  )}
                  <span className="doc-dates muted">
                    <span className="doc-date" title="Thời gian cập nhật gần nhất">
                      Sửa: {formatDate(d.updatedAt)}
                    </span>
                    <span className="doc-date" title="Thời gian tạo">
                      Tạo: {formatDate(d.createdAt)}
                    </span>
                  </span>
                </Link>
                {!sel.selectMode && (
                  <div className="doc-line-actions">
                    <button
                      type="button"
                      className="doc-action"
                      title="Di chuyển tới folder khác"
                      onClick={() => setMoveDoc(d)}
                    >
                      📁
                    </button>
                    <button
                      type="button"
                      className="doc-action"
                      title="Đổi tên tài liệu"
                      onClick={() => onRenameDoc(d.id, d.title)}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="doc-action danger"
                      title="Xóa tài liệu"
                      onClick={() => onDeleteDoc(d.id, d.title)}
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {moveDoc && (
        <MoveToFolderDialog
          doc={moveDoc}
          folders={folders}
          onPick={(folderId) => {
            moveDocument(moveDoc.id, folderId);
            setMoveDoc(null);
          }}
          onClose={() => setMoveDoc(null)}
        />
      )}
    </div>
  );
}
