import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useDocuments } from '../context/DocumentsContext';
import { useUploadDocuments } from '../hooks/useUploadDocuments';
import { detectType, extractHtmlBody, stripExt } from '../lib/uploadHelpers';
import ThemeToggle from '../components/ThemeToggle';
import type { DocumentType } from '../types';

// Một file đã chọn, chờ tạo thành tài liệu. Người dùng có thể sửa tiêu đề/loại
// hoặc bỏ ra trước khi bấm tạo.
interface PickedItem {
  key: string; // id tạm cho React, không phải id tài liệu
  file: File;
  title: string;
  type: DocumentType;
}

export default function BatchUploadPage() {
  const { folders } = useDocuments();
  const { commitItems } = useUploadDocuments();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Folder đích: lấy từ query (?folder=...) nếu mở từ trong một folder.
  const initialFolder = searchParams.get('folder') ?? '';
  const [folderId, setFolderId] = useState<string>(
    folders.some((f) => f.id === initialFolder) ? initialFolder : '',
  );
  const [items, setItems] = useState<PickedItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const next: PickedItem[] = Array.from(fileList).map((file) => ({
      key: uuidv4(),
      file,
      title: stripExt(file.name),
      type: detectType(file.name),
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    // Reset để chọn lại đúng file vừa rồi vẫn kích hoạt onChange.
    e.target.value = '';
  };

  // ----- Kéo-thả nhiều file vào vùng thả -----
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragOver) setDragOver(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((it) => it.key !== key));
  const updateItem = (key: string, patch: Partial<PickedItem>) =>
    setItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    );

  const onSubmit = async () => {
    if (items.length === 0 || uploading) return;
    setUploading(true);
    try {
      // Đọc nội dung text của từng file (không lưu file gốc, chỉ lưu nội dung).
      const contents = await Promise.all(items.map((it) => it.file.text()));
      const payload = items.map((it, i) => ({
        type: it.type,
        title: it.title,
        content:
          it.type === 'note' ? extractHtmlBody(contents[i]) : contents[i],
      }));
      // commitItems lo việc hỏi thay thế khi trùng tên rồi tạo/ghi đè.
      const res = commitItems(payload, folderId || undefined);
      if (res.created + res.replaced > 0) {
        navigate(folderId ? `/docs/folder/${folderId}` : '/docs');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container">
      <div className="back-bar">
        <Link to="/docs">← Quay lại danh sách</Link>
      </div>

      <header className="app-header">
        <h1>⬆️ Tải lên hàng loạt</h1>
        <div className="user-box">
          <ThemeToggle />
        </div>
      </header>

      <p className="muted">
        Kéo-thả hoặc chọn nhiều file văn bản. Nội dung từng file sẽ được đọc và tạo
        thành một tài liệu tương ứng (file gốc không được lưu lại). File{' '}
        <code>.html</code>/<code>.htm</code> tạo tài liệu HTML (xem trung thực bằng
        khung cô lập); <code>.md</code>, <code>.txt</code>… tạo tài liệu Markdown.
      </p>

      <div className="upload-toolbar">
        <label className="folder-pick">
          Thư mục đích:
          <select
            className="folder-select"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          >
            <option value="">Không thuộc folder nào</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <span className="drop-icon">📂</span>
        <span>
          <strong>Kéo-thả file vào đây</strong> hoặc bấm để chọn
        </span>
        <span className="muted">Có thể chọn nhiều file cùng lúc</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".md,.markdown,.mdown,.txt,.html,.htm,.text,text/*"
          hidden
          onChange={onPick}
        />
      </div>

      {items.length > 0 && (
        <>
          <div className="upload-summary">
            <span>
              Đã chọn <strong>{items.length}</strong> file
            </span>
            <button type="button" onClick={() => setItems([])}>
              Xóa hết
            </button>
          </div>

          <ul className="upload-list">
            {items.map((it) => (
              <li key={it.key} className="upload-row">
                <span className={`badge badge-${it.type}`}>{it.type}</span>
                <input
                  className="upload-title"
                  value={it.title}
                  onChange={(e) => updateItem(it.key, { title: e.target.value })}
                  placeholder="(không tiêu đề)"
                />
                <select
                  className="type-select"
                  value={it.type}
                  onChange={(e) =>
                    updateItem(it.key, {
                      type: e.target.value as DocumentType,
                    })
                  }
                >
                  <option value="markdown">markdown</option>
                  <option value="note">note</option>
                  <option value="html">html</option>
                </select>
                <span className="upload-filename muted" title={it.file.name}>
                  {it.file.name}
                </span>
                <button
                  type="button"
                  className="doc-remove"
                  title="Bỏ file này khỏi danh sách"
                  onClick={() => removeItem(it.key)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={uploading}
              onClick={onSubmit}
            >
              {uploading ? 'Đang tạo…' : `Tạo ${items.length} tài liệu`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
