import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ref, onValue, update } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/useAuth';
import type { DocItem, DocumentType, Folder } from '../types';
import DocsSyncBanner from '../components/DocsSyncBanner';

type DocUpdates = Partial<Pick<DocItem, 'title' | 'content' | 'type'>>;

/**
 * Trả về folder nếu folderId đó tồn tại VÀ đang được chia sẻ công khai;
 * ngược lại trả về undefined. Dùng để biết có cần đồng bộ bản sao
 * shared/f/{id}/documents/{docId} hay không.
 */
function findSharedFolder(
  folders: Folder[],
  folderId?: string,
): Folder | undefined {
  if (!folderId) return undefined;
  const f = folders.find((x) => x.id === folderId);
  return f?.isShared ? f : undefined;
}

interface DocumentsState {
  documents: DocItem[];
  folders: Folder[];
  loading: boolean;
  addDocument: (type: DocumentType, title?: string, folderId?: string) => DocItem | null;
  /** Tạo nhiều tài liệu cùng lúc (dùng cho tải lên hàng loạt) trong một lần ghi. */
  addDocuments: (
    items: { type: DocumentType; title: string; content: string }[],
    folderId?: string,
  ) => DocItem[];
  updateDocument: (id: string, updates: DocUpdates) => void;
  deleteDocument: (id: string) => void;
  /** Trả true khi server ĐÃ xác nhận lưu (link share dùng được), false nếu bị từ chối. */
  toggleShareDocument: (id: string) => Promise<boolean>;
  /** parentId có giá trị ⇒ tạo sub-folder (chỉ 1 cấp; parent phải là folder gốc) */
  addFolder: (name?: string, parentId?: string) => Folder | null;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  toggleShareFolder: (id: string) => void;
  /** folderId = undefined ⇒ đưa tài liệu ra ngoài (không folder) */
  moveDocument: (id: string, folderId: string | undefined) => void;
  /** Đang có kết nối tới Realtime Database (theo `.info/connected`). */
  connected: boolean;
  /** Số lệnh ghi đã gửi nhưng server CHƯA xác nhận. */
  pendingWrites: number;
  /** Lỗi của lệnh ghi bị server từ chối gần nhất (null = không có). */
  writeError: string | null;
  clearWriteError: () => void;
}

const DocumentsContext = createContext<DocumentsState | null>(null);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  // loading chỉ tắt khi CẢ documents lẫn folders đã về: trước đây chỉ theo dõi
  // documents nên có cửa sổ loading=false mà folders còn rỗng — đủ để export plan
  // tuần tạo folder trùng tên.
  const [docsReady, setDocsReady] = useState(false);
  const [foldersReady, setFoldersReady] = useState(false);
  const loading = !docsReady || !foldersReady;

  // Luôn giữ bản state mới nhất để các mutator đọc từ đây (KHÔNG đọc closure),
  // tránh lỗi "tạo hàng loạt chỉ lưu được item cuối".
  const stateRef = useRef<{ documents: DocItem[]; folders: Folder[] }>({
    documents: [],
    folders: [],
  });
  stateRef.current.documents = documents;
  stateRef.current.folders = folders;

  // Trạng thái đồng bộ lên server. Firebase hiện thay đổi trên UI NGAY (trước khi
  // server xác nhận) nên nếu mất kết nối / bị từ chối mà không theo dõi thì người
  // dùng tưởng đã lưu — đúng lỗi link share "không tồn tại" dù app báo đang chia sẻ.
  const [connected, setConnected] = useState(true);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [writeError, setWriteError] = useState<string | null>(null);
  const clearWriteError = useCallback(() => setWriteError(null), []);

  useEffect(() => {
    if (!db) return;
    return onValue(ref(db, '.info/connected'), (snap) => {
      setConnected(snap.val() === true);
    });
  }, []);

  // Còn lệnh ghi chưa lên server mà đóng tab / F5 ⇒ mất thay đổi → hỏi lại.
  useEffect(() => {
    if (pendingWrites === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingWrites]);

  // Mọi lệnh ghi đi qua đây: multi-path update từ gốc, đếm lệnh đang chờ và bắt
  // lỗi. Trả true khi server đã xác nhận, false khi bị từ chối (Firebase tự hoàn
  // tác thay đổi trên UI, lỗi được đưa lên banner).
  const commit = useCallback((writes: Record<string, unknown>): Promise<boolean> => {
    if (!db) return Promise.resolve(false);
    setPendingWrites((n) => n + 1);
    return update(ref(db), writes)
      .then(() => true)
      .catch((e: unknown) => {
        setWriteError(e instanceof Error ? e.message : String(e));
        return false;
      })
      .finally(() => setPendingWrites((n) => n - 1));
  }, []);

  useEffect(() => {
    if (!db || !uid) {
      setDocuments([]);
      setFolders([]);
      // Không có gì để chờ — đánh dấu xong để UI không kẹt ở trạng thái "đang tải".
      setDocsReady(true);
      setFoldersReady(true);
      return;
    }
    setDocsReady(false);
    setFoldersReady(false);

    const docsRef = ref(db, `users/${uid}/documents`);
    const unsubDocs = onValue(docsRef, (snap) => {
      const val = snap.val() as Record<string, DocItem> | null;
      const list = val ? Object.values(val) : [];
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setDocuments(list);
      setDocsReady(true);
    });

    const foldersRef = ref(db, `users/${uid}/folders`);
    const unsubFolders = onValue(foldersRef, (snap) => {
      const val = snap.val() as Record<string, Folder> | null;
      const list = val ? Object.values(val) : [];
      list.sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      setFolders(list);
      setFoldersReady(true);
    });

    return () => {
      unsubDocs();
      unsubFolders();
    };
  }, [uid]);

  const addDocument = useCallback(
    (type: DocumentType, title?: string, folderId?: string): DocItem | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.documents;
      // order tính trong phạm vi cùng folder (General = không folder).
      const scope = cur.filter((d) => (d.folderId ?? '') === (folderId ?? ''));
      const now = new Date().toISOString();
      const created: DocItem = {
        id: uuidv4(),
        type,
        title: title ?? (type === 'note' ? 'New note' : 'New document'),
        content: '',
        createdAt: now,
        updatedAt: now,
        order: scope.length,
        ...(folderId ? { folderId } : {}),
      };
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${created.id}`]: created,
      };
      // Tạo trong folder đang chia sẻ ⇒ thêm luôn vào bản công khai của folder.
      if (findSharedFolder(stateRef.current.folders, folderId)) {
        writes[`shared/f/${folderId}/documents/${created.id}`] = created;
      }
      void commit(writes);
      return created;
    },
    [uid, commit],
  );

  const addDocuments = useCallback(
    (
      items: { type: DocumentType; title: string; content: string }[],
      folderId?: string,
    ): DocItem[] => {
      if (!db || !uid || items.length === 0) return [];
      const cur = stateRef.current.documents;
      // order tính trong phạm vi cùng folder; mỗi item nối tiếp nhau từ cuối.
      const scope = cur.filter((d) => (d.folderId ?? '') === (folderId ?? ''));
      const sharedFolder = findSharedFolder(stateRef.current.folders, folderId);
      const now = new Date().toISOString();
      const created: DocItem[] = [];
      // Gom toàn bộ đường dẫn rồi ghi MỘT lần (multi-path update, nguyên tử).
      const writes: Record<string, unknown> = {};
      items.forEach((it, i) => {
        const doc: DocItem = {
          id: uuidv4(),
          type: it.type,
          title:
            it.title.trim() || (it.type === 'note' ? 'New note' : 'New document'),
          content: it.content,
          createdAt: now,
          updatedAt: now,
          order: scope.length + i,
          ...(folderId ? { folderId } : {}),
        };
        created.push(doc);
        writes[`users/${uid}/documents/${doc.id}`] = doc;
        // Nếu tạo trong folder đang chia sẻ ⇒ thêm luôn vào bản công khai của folder.
        if (sharedFolder) {
          writes[`shared/f/${folderId}/documents/${doc.id}`] = doc;
        }
      });
      void commit(writes);
      return created;
    },
    [uid, commit],
  );

  const updateDocument = useCallback(
    (id: string, updates: DocUpdates) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      const now = new Date().toISOString();
      // Ghi nhiều đường dẫn cùng lúc (multi-path update) từ gốc cây dữ liệu.
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}/updatedAt`]: now,
      };
      for (const [k, v] of Object.entries(updates)) {
        writes[`users/${uid}/documents/${id}/${k}`] = v;
      }
      // Nếu tài liệu đang chia sẻ công khai, cập nhật luôn bản sao shared/d/{id}.
      if (cur?.isShared) {
        const merged: DocItem = { ...cur, ...updates, updatedAt: now };
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      }
      // Nếu tài liệu nằm trong folder đang chia sẻ, cập nhật bản trong folder công khai.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        const merged: DocItem = { ...cur, ...updates, updatedAt: now };
        writes[`shared/f/${cur.folderId}/documents/${id}`] = merged;
      }
      void commit(writes);
    },
    [uid, commit],
  );

  const deleteDocument = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}`]: null,
      };
      // Xóa luôn bản công khai nếu đang chia sẻ.
      if (cur?.isShared) writes[`shared/d/${id}`] = null;
      // Gỡ khỏi bản công khai của folder nếu folder đang chia sẻ.
      if (cur && findSharedFolder(stateRef.current.folders, cur.folderId)) {
        writes[`shared/f/${cur.folderId}/documents/${id}`] = null;
      }
      void commit(writes);
    },
    [uid, commit],
  );

  const toggleShareDocument = useCallback(
    (id: string): Promise<boolean> => {
      if (!db || !uid) return Promise.resolve(false);
      const cur = stateRef.current.documents.find((d) => d.id === id);
      if (!cur) return Promise.resolve(false);
      const enabling = !cur.isShared;
      const writes: Record<string, unknown> = {
        [`users/${uid}/documents/${id}/isShared`]: enabling,
      };
      if (enabling) {
        const merged: DocItem = { ...cur, isShared: true };
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      } else {
        // Tắt chia sẻ → xóa bản công khai.
        writes[`shared/d/${id}`] = null;
      }
      // Trả promise để nút Chia sẻ chỉ đưa ra link khi server đã lưu thật.
      return commit(writes);
    },
    [uid, commit],
  );

  const addFolder = useCallback(
    (name?: string, parentId?: string): Folder | null => {
      if (!db || !uid) return null;
      const cur = stateRef.current.folders;
      // Giữ đúng 1 cấp: chỉ cho tạo sub-folder bên trong folder GỐC.
      // Parent đã là sub-folder ⇒ hạ về cấp gốc. KHÔNG hạ cấp khi chỉ vì không tìm
      // thấy parent trong state: folder cha vừa được tạo trong cùng tick chưa kịp
      // dội về qua onValue — hạ cấp lúc đó khiến sub-folder rơi ra gốc (đúng lỗi
      // đã sinh ra folder "Tester" mồ côi khi export plan tuần).
      let pid = parentId;
      if (pid) {
        const parent = cur.find((f) => f.id === pid);
        if (parent?.parentId) pid = undefined;
      }
      const now = new Date().toISOString();
      // order tính trong phạm vi cùng cấp cha (cùng parentId, gốc = rỗng).
      const scope = cur.filter((f) => (f.parentId ?? '') === (pid ?? ''));
      const created: Folder = {
        id: uuidv4(),
        name: name ?? 'Folder mới',
        order: scope.length,
        createdAt: now,
        ...(pid ? { parentId: pid } : {}),
      };
      void commit({ [`users/${uid}/folders/${created.id}`]: created });
      return created;
    },
    [uid, commit],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      if (!db || !uid) return;
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}/name`]: name,
      };
      // Nếu folder đang chia sẻ, đổi tên luôn trong bản công khai.
      if (findSharedFolder(stateRef.current.folders, id)) {
        writes[`shared/f/${id}/folder/name`] = name;
      }
      void commit(writes);
    },
    [uid, commit],
  );

  const deleteFolder = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const allFolders = stateRef.current.folders;
      const docs = stateRef.current.documents;
      const target = allFolders.find((f) => f.id === id);
      if (!target) return;
      // Tập folder cần xóa: chính nó + (nếu là folder gốc) tất cả sub-folder của nó.
      const subFolders = allFolders.filter((f) => f.parentId === id);
      const folderIds = new Set<string>([id, ...subFolders.map((f) => f.id)]);
      const writes: Record<string, unknown> = {};
      for (const fid of folderIds) {
        writes[`users/${uid}/folders/${fid}`] = null;
        // Nếu folder/sub-folder đang chia sẻ công khai, xóa luôn cả cụm shared/f/{fid}.
        const f = allFolders.find((x) => x.id === fid);
        if (f?.isShared) writes[`shared/f/${fid}`] = null;
      }
      // Xóa TẤT CẢ tài liệu nằm trong các folder đó (gồm cả sub-folder).
      for (const d of docs) {
        if (d.folderId && folderIds.has(d.folderId)) {
          writes[`users/${uid}/documents/${d.id}`] = null;
          // Xóa luôn bản công khai lẻ nếu tài liệu đang chia sẻ.
          if (d.isShared) writes[`shared/d/${d.id}`] = null;
        }
      }
      void commit(writes);
    },
    [uid, commit],
  );

  const toggleShareFolder = useCallback(
    (id: string) => {
      if (!db || !uid) return;
      const folder = stateRef.current.folders.find((f) => f.id === id);
      if (!folder) return;
      const enabling = !folder.isShared;
      const writes: Record<string, unknown> = {
        [`users/${uid}/folders/${id}/isShared`]: enabling,
      };
      if (enabling) {
        // Gom toàn bộ tài liệu trong folder thành bản sao công khai.
        const docsMap: Record<string, DocItem> = {};
        for (const d of stateRef.current.documents) {
          if (d.folderId === id) docsMap[d.id] = d;
        }
        writes[`shared/f/${id}`] = {
          folder: { ...folder, isShared: true },
          ownerId: uid,
          documents: docsMap,
        };
      } else {
        // Tắt chia sẻ → xóa cả cụm công khai.
        writes[`shared/f/${id}`] = null;
      }
      void commit(writes);
    },
    [uid, commit],
  );

  const moveDocument = useCallback(
    (id: string, folderId: string | undefined) => {
      if (!db || !uid) return;
      const cur = stateRef.current.documents.find((d) => d.id === id);
      if (!cur) return;
      if ((cur.folderId ?? '') === (folderId ?? '')) return; // đã ở đúng chỗ
      const now = new Date().toISOString();
      // order = về cuối phạm vi folder đích.
      const scope = stateRef.current.documents.filter(
        (d) => d.id !== id && (d.folderId ?? '') === (folderId ?? ''),
      );
      const writes: Record<string, unknown> = {
        // folderId = null để gỡ trường khi đưa ra ngoài (không folder).
        [`users/${uid}/documents/${id}/folderId`]: folderId ?? null,
        [`users/${uid}/documents/${id}/order`]: scope.length,
        [`users/${uid}/documents/${id}/updatedAt`]: now,
      };
      // Đồng bộ bản chia sẻ nếu tài liệu đang công khai.
      if (cur.isShared) {
        const merged: DocItem = { ...cur, updatedAt: now };
        if (folderId) merged.folderId = folderId;
        else delete merged.folderId;
        writes[`shared/d/${id}`] = { document: merged, ownerId: uid };
      }
      // Gỡ khỏi folder cũ nếu folder cũ đang chia sẻ.
      if (findSharedFolder(stateRef.current.folders, cur.folderId)) {
        writes[`shared/f/${cur.folderId}/documents/${id}`] = null;
      }
      // Thêm vào folder mới nếu folder mới đang chia sẻ.
      if (findSharedFolder(stateRef.current.folders, folderId)) {
        const moved: DocItem = {
          ...cur,
          folderId,
          order: scope.length,
          updatedAt: now,
        };
        writes[`shared/f/${folderId}/documents/${id}`] = moved;
      }
      void commit(writes);
    },
    [uid, commit],
  );

  return (
    <DocumentsContext.Provider
      value={{
        documents,
        folders,
        loading,
        addDocument,
        addDocuments,
        updateDocument,
        deleteDocument,
        toggleShareDocument,
        addFolder,
        renameFolder,
        deleteFolder,
        toggleShareFolder,
        moveDocument,
        connected,
        pendingWrites,
        writeError,
        clearWriteError,
      }}
    >
      {children}
      {/* Banner trạng thái lưu — gắn ở provider để hiện ở mọi nơi có dùng tài liệu */}
      <DocsSyncBanner />
    </DocumentsContext.Provider>
  );
}

export function useDocuments() {
  const ctx = useContext(DocumentsContext);
  if (!ctx) throw new Error('useDocuments must be used within DocumentsProvider');
  return ctx;
}
