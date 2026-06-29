import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DocItem, DocumentType } from '../types';
import { useDocuments } from '../context/DocumentsContext';
import NoteEditor from './NoteEditor';
import MarkdownPreview from './MarkdownPreview';
import HtmlFrame from './HtmlFrame';
import FullscreenViewer from './FullscreenViewer';

type DocUpdates = Partial<Pick<DocItem, 'title' | 'content' | 'type'>>;

export default function DocumentEditor({ doc }: { doc: DocItem }) {
  const {
    updateDocument,
    deleteDocument,
    toggleShareDocument,
    folders,
    moveDocument,
  } = useDocuments();
  const navigate = useNavigate();

  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [type, setType] = useState<DocumentType>(doc.type);
  // Mặc định mở ở Preview khi tài liệu đã có nội dung; rỗng (vừa tạo) thì mở Edit.
  const [tab, setTab] = useState<'edit' | 'preview'>(
    doc.content.trim() ? 'preview' : 'edit',
  );
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/share/d/${doc.id}`;

  const onCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  // Đồng bộ state cục bộ từ props CHỈ khi đổi tài liệu (doc.id), không đồng bộ
  // khi content dội về từ Firebase (tránh nhảy con trỏ khi đang gõ).
  useEffect(() => {
    setTitle(doc.title);
    setContent(doc.content);
    setType(doc.type);
    setTab(doc.content.trim() ? 'preview' : 'edit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // Auto-save có debounce ~600ms.
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<DocUpdates | null>(null);

  const flush = () => {
    if (pending.current) {
      updateDocument(doc.id, pending.current);
      pending.current = null;
    }
  };

  const debounceSave = (updates: DocUpdates) => {
    pending.current = { ...(pending.current ?? {}), ...updates };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  };

  // Lưu nốt thay đổi còn treo khi rời tài liệu.
  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTitle = (v: string) => {
    setTitle(v);
    debounceSave({ title: v });
  };

  const onContent = (v: string) => {
    setContent(v);
    debounceSave({ content: v });
  };

  const onChangeType = (v: DocumentType) => {
    setType(v);
    updateDocument(doc.id, { type: v });
  };

  const onDelete = () => {
    if (!window.confirm('Xóa tài liệu này? Hành động không thể hoàn tác.')) return;
    deleteDocument(doc.id);
    // Xóa xong quay về đúng ngữ cảnh: folder chứa tài liệu (nếu còn tồn tại),
    // ngược lại về danh sách gốc.
    const inFolder = !!doc.folderId && folders.some((f) => f.id === doc.folderId);
    navigate(inFolder ? `/docs/folder/${doc.folderId}` : '/docs');
  };

  return (
    <div className="doc-editor">
      <div className="doc-editor-bar">
        <input
          className="title-input"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Tiêu đề tài liệu"
        />
        <select
          className="type-select"
          value={type}
          onChange={(e) => onChangeType(e.target.value as DocumentType)}
        >
          <option value="note">Note (rich-text)</option>
          <option value="markdown">Markdown</option>
          <option value="html">HTML (file)</option>
        </select>
        <select
          className="folder-select"
          value={doc.folderId ?? ''}
          onChange={(e) => moveDocument(doc.id, e.target.value || undefined)}
          title="Chọn folder cho tài liệu"
        >
          <option value="">📁 Không có folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              📁 {f.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={doc.isShared ? 'primary' : ''}
          onClick={() => toggleShareDocument(doc.id)}
          title="Bật/tắt chia sẻ công khai"
        >
          {doc.isShared ? '🔗 Đang chia sẻ' : 'Chia sẻ'}
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          Xóa
        </button>
      </div>

      {doc.isShared && (
        <div className="share-bar">
          <span className="muted">Link công khai (ai có link đều xem được):</span>
          <input className="share-url" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={onCopyShare}>
            {copied ? 'Đã copy ✓' : 'Copy'}
          </button>
          <a href={shareUrl} target="_blank" rel="noreferrer">Mở</a>
        </div>
      )}

      {type === 'note' ? (
        <NoteEditor value={content} onChange={onContent} />
      ) : (
        <div className="md-editor">
          <div className="tabs">
            <button
              type="button"
              className={tab === 'edit' ? 'active' : ''}
              onClick={() => setTab('edit')}
            >
              Edit
            </button>
            <button
              type="button"
              className={tab === 'preview' ? 'active' : ''}
              onClick={() => setTab('preview')}
            >
              Preview
            </button>
          </div>
          {tab === 'edit' ? (
            <textarea
              className="md-textarea"
              value={content}
              onChange={(e) => onContent(e.target.value)}
              placeholder={
                type === 'html'
                  ? '<!DOCTYPE html>&#10;<html>… dán mã HTML ở đây…'
                  : '# Tiêu đề&#10;&#10;Viết Markdown ở đây…'
              }
            />
          ) : (
            <FullscreenViewer>
              {type === 'html' ? (
                <HtmlFrame value={content} />
              ) : (
                <MarkdownPreview content={content} />
              )}
            </FullscreenViewer>
          )}
        </div>
      )}
    </div>
  );
}
