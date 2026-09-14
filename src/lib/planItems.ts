// Cấp bậc của các dòng "item" trong nhánh plan / mô tả task — nguồn sự thật DUY NHẤT
// cho cả HTML export lẫn các chỗ render trên web (preview plan, lịch tuần, dialog mốc
// release ở KPI Log). Trước đây mọi dòng bị strip marker rồi đổ ra <li> ngang hàng nên
// file export không phân biệt được đâu là tiêu đề, đâu là nội dung của 1 đầu việc.
//
// Hệ marker DÙNG CHUNG với Báo cáo ngày (xem parseBody ở reportFormat.ts) — một luật
// cho cả app, không phát minh cú pháp riêng cho plan:
//   '# X'   tiêu đề mục        '- X'  đầu việc
//   '+ X'   ý con của đầu việc  '-> X' mốc/kết quả
//   '  - X' (thụt lề) = ý con   text trần = dòng nối tiếp của đầu việc ngay trên

export type ItemKind = 'head' | 'bullet' | 'sub' | 'arrow' | 'cont';

export interface ItemNode {
  kind: ItemKind;
  text: string;
}

/** Escape HTML — dùng chung cho planExport (giữ 1 bản, tránh 2 định nghĩa lệch nhau). */
export function escHtml(s: string): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/** Bỏ marker đầu dòng — cho những chỗ chỉ cần text trần (so trùng, báo cáo, tổng hợp). */
export function plainText(line: string): string {
  return (line ?? '').replace(/^\s*(#+|->|\+|[-*]+)\s*/, '').trim();
}

/** Dòng có marker cấp bậc chưa? (dùng khi xuất text để không ép thêm '- ' vào dòng đã có marker) */
export function hasMarker(line: string): boolean {
  return /^\s*(#+|->|\+|[-*])/.test(line ?? '');
}

/** Phân loại các dòng item thành cây phẳng có cấp bậc. Dòng rỗng / chỉ có marker bị bỏ. */
export function parseItemLines(items: string[]): ItemNode[] {
  const out: ItemNode[] = [];
  const lines = (items ?? []).flatMap((item) => String(item ?? '').split('\n'));
  // Dòng trần là "phần tiếp của đầu việc trên" hay "đầu việc riêng"? Quyết định theo
  // DÒNG LIỀN TRƯỚC, không theo cả khối:
  //   · đứng đầu khối, hoặc ngay sau một dòng trần khác → đầu việc riêng. Đây là dạng
  //     của plan cũ (items đã bị strip marker) và mô tả gõ liền không gạch đầu dòng.
  //   · ngay sau một dòng CÓ marker (hoặc sau một dòng nối tiếp) → phần tiếp của nó.
  //     Đo trên 333 task thật: đây đúng là các dòng mô tả/URL bổ nghĩa cho '- ' ở trên.
  let prevPlain = false;
  let started = false;
  for (const raw of lines) {
    const s = raw.trim();
    if (!s) continue;
    const indented = /^(\s{2,}|\t)/.test(raw);
    let node: ItemNode;
    if (/^#/.test(s)) node = { kind: 'head', text: s.replace(/^#+\s*/, '').trim() };
    else if (/^->/.test(s)) node = { kind: 'arrow', text: s.replace(/^->\s*/, '').trim() };
    else if (/^\+/.test(s)) node = { kind: 'sub', text: s.replace(/^\+\s*/, '').trim() };
    else if (/^[-*]/.test(s))
      node = {
        kind: indented ? 'sub' : 'bullet',
        text: s.replace(/^[-*]+\s*/, '').trim(),
      };
    else node = { kind: started && !prevPlain ? 'cont' : 'bullet', text: s };
    // '---', '-', '#' trơ trọi → không còn nội dung, bỏ luôn (tránh bullet rỗng).
    if (!node.text) continue;
    // Chỉ dòng trần được xếp thành đầu việc mới "mở chuỗi trần"; mọi dòng có marker
    // (và cả dòng nối tiếp) đều tắt cờ để dòng trần kế sau còn bám được vào nó.
    prevPlain = !hasMarker(raw) && node.kind === 'bullet';
    started = true;
    out.push(node);
  }
  return out;
}

/** Chuẩn hóa 1 dòng mô tả về đúng marker của hệ trên (dùng khi sinh items từ task). */
export function normalizeItemLine(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const indented = /^(\s{2,}|\t)/.test(raw ?? '');
  if (/^#/.test(s)) {
    const text = s.replace(/^#+\s*/, '').trim();
    return text ? `# ${text}` : '';
  }
  if (/^->/.test(s)) {
    const text = s.replace(/^->\s*/, '').trim();
    return text ? `-> ${text}` : '';
  }
  if (/^\+/.test(s)) {
    const text = s.replace(/^\+\s*/, '').trim();
    return text ? `+ ${text}` : '';
  }
  if (/^[-*]/.test(s)) {
    const text = s.replace(/^[-*]+\s*/, '').trim();
    if (!text) return '';
    // Gạch đầu dòng THỤT LỀ = ý con → đổi về marker '+' cho thống nhất.
    return indented ? `+ ${text}` : `- ${text}`;
  }
  // Dòng trần giữ nguyên — parseItemLines quyết định nó là nối tiếp hay đầu việc.
  return s;
}

/** 1 đầu việc cùng các ý con và dòng nối tiếp của nó. */
export interface ItemBullet {
  text: string;
  subs: string[];
  conts: string[];
}

/** Khối nội dung để render: tiêu đề / mốc đứng riêng, hoặc 1 danh sách đầu việc. */
export type ItemBlock =
  | { kind: 'head'; text: string }
  | { kind: 'arrow'; text: string }
  | { kind: 'list'; bullets: ItemBullet[] };

/** Gom các node phẳng thành khối — cho phía React render JSX (HTML export dùng renderItemsHtml). */
export function groupItemNodes(items: string[]): ItemBlock[] {
  const blocks: ItemBlock[] = [];
  let bullets: ItemBullet[] | null = null;
  for (const n of parseItemLines(items)) {
    if (n.kind === 'head' || n.kind === 'arrow') {
      bullets = null;
      blocks.push({ kind: n.kind, text: n.text });
      continue;
    }
    if (!bullets) {
      bullets = [];
      blocks.push({ kind: 'list', bullets });
    }
    const last = bullets.length > 0 ? bullets[bullets.length - 1] : null;
    if (n.kind === 'bullet') bullets.push({ text: n.text, subs: [], conts: [] });
    else if (n.kind === 'sub') {
      // Ý con mồ côi → tự thành đầu việc rỗng làm cha (giữ đúng cấp, không mất dòng).
      if (last) last.subs.push(n.text);
      else bullets.push({ text: '', subs: [n.text], conts: [] });
    } else if (last) last.conts.push(n.text);
    else bullets.push({ text: n.text, subs: [], conts: [] });
  }
  return blocks;
}

/** Sinh HTML có cấp bậc cho 1 nhánh. `pad` là thụt lề để HTML export vẫn dễ đọc. */
export function renderItemsHtml(items: string[], pad = ''): string {
  const nodes = parseItemLines(items);
  if (nodes.length === 0) return '';
  const out: string[] = [];
  let ulOpen = false;
  let liOpen = false;
  let subOpen = false;
  const closeSub = () => {
    if (subOpen) {
      out.push(`${pad}    </ul>`);
      subOpen = false;
    }
  };
  const closeLi = () => {
    closeSub();
    if (liOpen) {
      out.push(`${pad}  </li>`);
      liOpen = false;
    }
  };
  const closeUl = () => {
    closeLi();
    if (ulOpen) {
      out.push(`${pad}</ul>`);
      ulOpen = false;
    }
  };
  const openUl = () => {
    if (!ulOpen) {
      out.push(`${pad}<ul>`);
      ulOpen = true;
    }
  };
  for (const n of nodes) {
    switch (n.kind) {
      case 'head':
        closeUl();
        out.push(`${pad}<p class="item-head">${escHtml(n.text)}</p>`);
        break;
      case 'arrow':
        closeUl();
        out.push(`${pad}<p class="item-arrow">→ ${escHtml(n.text)}</p>`);
        break;
      case 'bullet':
        closeLi();
        openUl();
        out.push(`${pad}  <li>${escHtml(n.text)}`);
        liOpen = true;
        break;
      case 'sub':
        // Ý con mồ côi (chưa có đầu việc nào ở trên) → tự mở 1 <li> rỗng làm cha,
        // để HTML vẫn hợp lệ thay vì <ul> lơ lửng ngoài <li>.
        if (!liOpen) {
          openUl();
          out.push(`${pad}  <li>`);
          liOpen = true;
        }
        if (!subOpen) {
          out.push(`${pad}    <ul class="item-sub">`);
          subOpen = true;
        }
        out.push(`${pad}      <li>${escHtml(n.text)}</li>`);
        break;
      default:
        // Dòng nối tiếp thuộc về đầu việc cha, không phải ý con → đóng nhánh con trước.
        closeSub();
        if (!liOpen) {
          openUl();
          out.push(`${pad}  <li>${escHtml(n.text)}`);
          liOpen = true;
        } else {
          out.push(`${pad}    <div class="item-cont">${escHtml(n.text)}</div>`);
        }
    }
  }
  closeUl();
  return out.join('\n');
}
