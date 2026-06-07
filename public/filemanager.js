/* =========================================
 MODULE: FILE MANAGER (FRONTEND)
 ========================================= */

let currentPath = ''; 
let currentEditFile = '';
let isNewFile = false;
let selectedFiles = new Set();
let activeUploadsCount = 0; 
let editor = null;
let progressInterval = null;
let folderCache = {}; 
let searchCursor = null;
let lastQuery = '';
let currentSearchMark = null;

let moveTargetPath = '';
let currentLangLabel = 'Plain Text';

// 
// LANGUAGE LIST (matches Pterodactyl's list)
// 
const LANGUAGES = [
 { label: 'Plain Text', mode: null },
 { label: 'C', mode: 'text/x-csrc' },
 { label: 'C++', mode: 'text/x-c++src' },
 { label: 'C#', mode: 'text/x-csharp' },
 { label: 'CSS', mode: 'css' },
 { label: 'Diff', mode: 'text/x-diff' },
 { label: 'Dockerfile', mode: 'text/x-dockerfile' },
 { label: 'Golang', mode: 'text/x-go' },
 { label: 'HTML', mode: 'text/html' },
 { label: 'HTTP', mode: 'message/http' },
 { label: 'Java', mode: 'text/x-java' },
 { label: 'JavaScript', mode: 'javascript' },
 { label: 'JSON', mode: 'application/json' },
 { label: 'Lua', mode: 'text/x-lua' },
 { label: 'Markdown', mode: 'text/x-markdown' },
 { label: 'MySQL', mode: 'text/x-mysql' },
 { label: 'Nginx', mode: 'text/x-nginx-conf' },
 { label: 'PHP', mode: 'application/x-httpd-php' },
 { label: 'PostgreSQL', mode: 'text/x-pgsql' },
 { label: 'Properties', mode: 'text/x-properties' },
 { label: 'Python', mode: 'python' },
 { label: 'Ruby', mode: 'text/x-ruby' },
 { label: 'Rust', mode: 'text/x-rustsrc' },
 { label: 'SCSS', mode: 'text/x-scss' },
 { label: 'Shell', mode: 'text/x-sh' },
 { label: 'SQL', mode: 'text/x-sql' },
 { label: 'TOML', mode: 'text/x-toml' },
 { label: 'TypeScript', mode: 'text/typescript' },
 { label: 'XML', mode: 'application/xml' },
 { label: 'YAML', mode: 'text/x-yaml' },
];

// Global language detector 
function detectLanguage(fileName) {
 const base = (fileName || '').split('/').pop().toLowerCase();
 const ext = base.includes('.') ? base.split('.').pop() : '';
 const map = {
 'js':['javascript','JavaScript'],'mjs':['javascript','JavaScript'],'cjs':['javascript','JavaScript'],
 'ts':['text/typescript','TypeScript'],
 'json':['application/json','JSON'],
 'html':['text/html','HTML'],'htm':['text/html','HTML'],
 'css':['css','CSS'],'scss':['text/x-scss','SCSS'],
 'yml':['text/x-yaml','YAML'],'yaml':['text/x-yaml','YAML'],
 'toml':['text/x-toml','TOML'],
 'properties':['text/x-properties','Properties'],'ini':['text/x-properties','Properties'],
 'conf':['text/x-nginx-conf','Nginx'],'nginx':['text/x-nginx-conf','Nginx'],
 'xml':['application/xml','XML'],'svg':['application/xml','XML'],
 'py':['python','Python'],'pyw':['python','Python'],
 'sh':['text/x-sh','Shell'],'bash':['text/x-sh','Shell'],'zsh':['text/x-sh','Shell'],
 'java':['text/x-java','Java'],
 'c':['text/x-csrc','C'],'h':['text/x-csrc','C'],
 'cpp':['text/x-c++src','C++'],'cc':['text/x-c++src','C++'],'hpp':['text/x-c++src','C++'],
 'cs':['text/x-csharp','C#'],
 'go':['text/x-go','Golang'],
 'rb':['text/x-ruby','Ruby'],
 'rs':['text/x-rustsrc','Rust'],
 'php':['application/x-httpd-php','PHP'],
 'lua':['text/x-lua','Lua'],
 'sql':['text/x-sql','SQL'],
 'md':['text/x-markdown','Markdown'],'markdown':['text/x-markdown','Markdown'],
 'txt':[null,'Plain Text'],
 'diff':['text/x-diff','Diff'],'patch':['text/x-diff','Diff'],
 };
 if (base === 'dockerfile') return ['text/x-dockerfile','Dockerfile'];
 return map[ext] || [null,'Plain Text'];
}

function setEditorLanguage(mode, label) {
 currentLangLabel = label || 'Plain Text';
 const langLabelEl = document.getElementById('langLabel');
 if (langLabelEl) langLabelEl.textContent = currentLangLabel;
 if (editor) editor.setOption('mode', mode || null);
}

function openLangSelector() {
 const modal = document.getElementById('langSelectorModal');
 const list = document.getElementById('langList');
 if (!modal || !list) return;
 list.innerHTML = LANGUAGES.map(lang => {
 const isActive = lang.label === currentLangLabel;
 return `<button onclick="selectLanguage(${JSON.stringify(lang.label)},${JSON.stringify(lang.mode)})"
 class="w-full flex items-center justify-between px-5 py-3 text-sm transition hover:bg-slate-700/60 active:bg-slate-700 ${isActive ? 'text-blue-400 font-bold' : 'text-[#abb2bf]'}">
 <span>${lang.label}</span>
 ${isActive ? '<svg class="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>' : ''}
 </button>`;
 }).join('');
 modal.classList.remove('hidden');
 modal.style.animation = 'none';
 requestAnimationFrame(() => {
 const sheet = modal.querySelector('div');
 if (sheet) { sheet.style.transform = 'translateY(100%)'; requestAnimationFrame(() => { sheet.style.transition = 'transform 0.25s cubic-bezier(0.32,0.72,0,1)'; sheet.style.transform = 'translateY(0)'; }); }
 });
}

function closeLangSelector() {
 const modal = document.getElementById('langSelectorModal');
 if (!modal) return;
 const sheet = modal.querySelector('div');
 if (sheet) {
 sheet.style.transform = 'translateY(100%)';
 setTimeout(() => modal.classList.add('hidden'), 250);
 } else { modal.classList.add('hidden'); }
}

function selectLanguage(label, mode) {
 setEditorLanguage(mode, label);
 closeLangSelector();
}

const editorEl = document.getElementById('fileContent');
if(editorEl) {
 editor = CodeMirror(editorEl, {
 value: "",
 theme: "default",
 lineNumbers: true,
 lineWrapping: true,
 mode: null,
 indentUnit: 4,
 styleActiveLine: true,
 matchBrackets: true
 });

 // CUSTOM CSS: Warna Select All ala Pterodactyl (Biru Keputihan) 
 const style = document.createElement('style');
 style.innerHTML = `
 .CodeMirror-selected { background-color: rgba(59, 130, 246, 0.35) !important; }
 .CodeMirror-line::selection, .CodeMirror-line > span::selection, .CodeMirror-line > span > span::selection { background-color: rgba(59, 130, 246, 0.35) !important; }
 .CodeMirror-line::-moz-selection, .CodeMirror-line > span::-moz-selection, .CodeMirror-line > span > span::-moz-selection { background-color: rgba(59, 130, 246, 0.35) !important; }
 `;
 document.head.appendChild(style);
}

window.startProgress = function() {
 let bar = document.getElementById('top-progress-bar');
 if (!bar) {
 bar = document.createElement('div');
 bar.id = 'top-progress-bar';
 bar.className = 'fixed top-0 left-0 h-1 bg-blue-500 z-[9999] shadow-[0_0_10px_rgba(59,130,246,0.8)] transition-all ease-out';
 bar.style.width = '0%';
 document.body.appendChild(bar);
 }

 if (bar._running) return;
 bar._running = true;

 clearInterval(progressInterval);
 bar.style.transitionDuration = '0ms';
 bar.style.width = '0%';
 bar.style.opacity = '1';

 setTimeout(() => {
 bar.style.transitionDuration = '300ms';
 bar.style.width = '30%';
 progressInterval = setInterval(() => {
 let w = parseFloat(bar.style.width);
 if (w < 85) bar.style.width = (w + Math.random() * 10) + '%';
 }, 300);
 }, 10);
};

window.finishProgress = function() {
 let bar = document.getElementById('top-progress-bar');
 if (!bar) return;
 bar._running = false;
 clearInterval(progressInterval);
 bar.style.width = '100%';

 setTimeout(() => {
 bar.style.opacity = '0';
 setTimeout(() => {
 bar.style.width = '0%';
 bar.style.transitionDuration = '0ms';
 }, 300);
 }, 400);
};

window.toggleSearchBar = function() {
 const bar = document.getElementById('customSearchBar');
 if (!bar) return;
 if (bar.classList.contains('hidden')) {
 bar.classList.remove('hidden');
 document.getElementById('editorSearchInput').focus();
 } else {
 bar.classList.add('hidden');
 clearAllSearchMarks(); 
 document.getElementById('editorSearchInput').value = '';
 lastQuery = '';
 editor.focus();
 }
};

let allSearchMarks = [];
function clearAllSearchMarks() {
 allSearchMarks.forEach(m => m.clear());
 allSearchMarks = [];
 if (currentSearchMark) currentSearchMark.clear();
 currentSearchMark = null;
}

function highlightAllMatches(query) {
 clearAllSearchMarks();
 if (!query) return;
 let cursor = editor.getSearchCursor(query, CodeMirror.Pos(0, 0), true);
 while (cursor.findNext()) {
 let mark = editor.markText(cursor.from(), cursor.to(), {className: "cm-search-match"});
 allSearchMarks.push(mark);
 }
}

window.performEditorSearch = function(reverse, isTyping = false) {
 if (!editor) return;
 const searchInput = document.getElementById('editorSearchInput');
 if (!searchInput) return;
 
 const query = searchInput.value;
 
 if (query !== lastQuery) {
 lastQuery = query;
 highlightAllMatches(query);
 searchCursor = editor.getSearchCursor(query, CodeMirror.Pos(0, 0), true);
 }

 if (!query) {
 clearAllSearchMarks();
 return;
 }
 if (!searchCursor) return;

 let found = reverse ? searchCursor.findPrevious() : searchCursor.findNext();
 if (!found) {
 searchCursor = editor.getSearchCursor(query, reverse ? CodeMirror.Pos(editor.lastLine(), 99999) : CodeMirror.Pos(0, 0), true);
 found = reverse ? searchCursor.findPrevious() : searchCursor.findNext();
 }

 if (found) {
 if (currentSearchMark) currentSearchMark.clear();
 currentSearchMark = editor.markText(searchCursor.from(), searchCursor.to(), {className: "cm-search-active"});
 
 if (!isTyping) editor.setSelection(searchCursor.from(), searchCursor.to());
 editor.scrollIntoView({from: searchCursor.from(), to: searchCursor.to()}, 150);
 } else if (!isTyping) {
 if(typeof showToast === 'function') showToast('Teks tidak ditemukan', 'error');
 }
};

window.editorSearchNext = () => performEditorSearch(false);
window.editorSearchPrev = () => performEditorSearch(true);

document.addEventListener('DOMContentLoaded', () => {
 const searchInput = document.getElementById('editorSearchInput');
 if (searchInput) {
 searchInput.addEventListener('input', function() { performEditorSearch(false, true); });
 searchInput.addEventListener('keydown', function(e) {
 if (e.key === 'Enter') { e.preventDefault(); performEditorSearch(false); }
 });
 }
});

const fallbackCopyTextToClipboard = (text) => {
 const textArea = document.createElement("textarea");
 textArea.value = text;
 textArea.style.top = "0";
 textArea.style.left = "0";
 textArea.style.position = "fixed";
 document.body.appendChild(textArea);
 textArea.focus();
 textArea.select();
 try {
 const successful = document.execCommand('copy');
 document.body.removeChild(textArea);
 return successful;
 } catch (err) {
 document.body.removeChild(textArea);
 return false;
 }
};

// FUNGSI BARU UNTUK MANGGIL POP-UP PANEL CUSTOM 
function showCustomConfirm(icon, title, msg, onConfirm) {
 if(document.getElementById('genericModalIcon')) document.getElementById('genericModalIcon').innerText = icon;
 if(document.getElementById('genericModalTitle')) document.getElementById('genericModalTitle').innerText = title;
 if(document.getElementById('genericModalMsg')) document.getElementById('genericModalMsg').innerHTML = msg; 
 const gModal = document.getElementById('genericModal');
 if(gModal) gModal.classList.remove('hidden');
 
 const confirmBtn = document.getElementById('genericConfirmBtn');
 if(confirmBtn) {
 // Clone button biar event listener sebelumnya ilang
 const newBtn = confirmBtn.cloneNode(true);
 confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
 newBtn.onclick = () => {
 document.getElementById('genericModal').classList.add('hidden');
 if (onConfirm) onConfirm();
 };
 }
}

window.editorAction = async function(action) {
 if (!editor) return;
 
 const isSecure = window.isSecureContext && navigator.clipboard;

 switch(action) {
 case 'search': toggleSearchBar(); break;
 case 'selectAll': editor.execCommand('selectAll'); editor.focus(); break;
 
 // FITUR KOSONGKAN FILE PAKE MODAL ELEGAN 
 case 'clear':
 showCustomConfirm(
 '', 
 'Kosongkan File', 
 'Yakin mau menghapus <b>SEMUA</b> isi file ini?<br><br><span class="text-red-400 text-xs font-medium">(Teks akan kosong, pastikan kamu belum menekan tombol Simpan jika ini tidak disengaja!)</span>',
 () => {
 editor.setValue("");
 if(typeof showToast === 'function') showToast(' Isi file dikosongkan!');
 }
 );
 break;
 
 case 'copy':
 const copyText = editor.getSelection();
 if (copyText) {
 if (isSecure) {
 try { await navigator.clipboard.writeText(copyText); if(typeof showToast === 'function') showToast(' Teks disalin!'); } 
 catch(err) { if(typeof showToast === 'function') showToast('Gagal menyalin teks', 'error'); }
 } else {
 if(fallbackCopyTextToClipboard(copyText)) {
 if(typeof showToast === 'function') showToast(' Teks disalin (Mode HTTP)!');
 } else {
 if(typeof showToast === 'function') showToast('Gagal menyalin. Gunakan HTTPS.', 'error');
 }
 }
 } else { if(typeof showToast === 'function') showToast('Pilih teks dulu!', 'error'); }
 break;
 
 case 'cut':
 const cutText = editor.getSelection();
 if (cutText) {
 if (isSecure) {
 try { await navigator.clipboard.writeText(cutText); editor.replaceSelection(''); if(typeof showToast === 'function') showToast(' Teks dipotong!'); } 
 catch(err) { if(typeof showToast === 'function') showToast('Gagal memotong teks', 'error'); }
 } else {
 if(fallbackCopyTextToClipboard(cutText)) {
 editor.replaceSelection('');
 if(typeof showToast === 'function') showToast(' Teks dipotong (Mode HTTP)!');
 } else {
 if(typeof showToast === 'function') showToast('Gagal memotong. Gunakan HTTPS.', 'error');
 }
 }
 } else { if(typeof showToast === 'function') showToast('Pilih teks dulu!', 'error'); }
 break;
 
 case 'paste':
 if (isSecure && navigator.clipboard.readText) {
 try { const pasteText = await navigator.clipboard.readText(); editor.replaceSelection(pasteText); if(typeof showToast === 'function') showToast(' Teks ditempel!'); } 
 catch(err) { if(typeof showToast === 'function') showToast('Gagal menempel (Cek izin clipboard browser)', 'error'); }
 } else {
 if(typeof showToast === 'function') showToast(' Tombol Paste butuh HTTPS! Gunakan tahan-layar lalu "Tempel"', 'error');
 }
 break;
 }
};

function toggleSelect(filePath) { if (selectedFiles.has(filePath)) selectedFiles.delete(filePath); else selectedFiles.add(filePath); updateDeleteButton(); }
function toggleSelectAll() { const checkboxes = document.querySelectorAll('.file-checkbox'); const selectAll = document.getElementById('selectAll'); if(!selectAll) return; const isChecked = selectAll.checked; selectedFiles.clear(); checkboxes.forEach(cb => { cb.checked = isChecked; if (isChecked) selectedFiles.add(cb.value); }); updateDeleteButton(); }

function updateDeleteButton() { 
 const bar = document.getElementById('pteroFloatingBar'); if(!bar) return; 
 const count = selectedFiles.size; 
 if (count > 0) { 
 bar.classList.remove('hidden'); 
 setTimeout(() => { bar.classList.remove('opacity-0', 'scale-90', '-translate-y-4'); bar.classList.add('opacity-100', 'scale-100', 'translate-y-0'); }, 10); 
 } else { 
 bar.classList.remove('opacity-100', 'scale-100', 'translate-y-0'); bar.classList.add('opacity-0', 'scale-90', '-translate-y-4'); 
 setTimeout(() => { bar.classList.add('hidden'); }, 300); 
 const selectAll = document.getElementById('selectAll'); if(selectAll) selectAll.checked = false; 
 } 
}

function showDeleteModal(itemsArray, msg) { 
 if(document.getElementById('genericModalIcon')) document.getElementById('genericModalIcon').innerText = ''; 
 if(document.getElementById('genericModalTitle')) document.getElementById('genericModalTitle').innerText = 'Delete Files'; 
 if(document.getElementById('genericModalMsg')) document.getElementById('genericModalMsg').innerText = msg; 
 const gModal = document.getElementById('genericModal'); if(gModal) gModal.classList.remove('hidden'); 
 const confirmBtn = document.getElementById('genericConfirmBtn'); 
 if(confirmBtn) { 
 const newBtn = confirmBtn.cloneNode(true); confirmBtn.parentNode.replaceChild(newBtn, confirmBtn); 
 newBtn.onclick = async () => { 
 document.getElementById('genericModal').classList.add('hidden'); 
 startProgress();
 try { 
 const res = await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: itemsArray }) }); 
 if (res.ok) { 
 delete folderCache[currentPath]; 
 selectedFiles.clear(); updateDeleteButton(); await loadFiles(currentPath); 
 if(typeof showToast === 'function') showToast('File berhasil dihapus!');
 } 
 } catch(e) { } finally { finishProgress(); }
 }; 
 } 
}
function deleteSelectedMulti() { showDeleteModal(Array.from(selectedFiles), `Are you sure you want to delete ${selectedFiles.size} items?`); } 
function deleteSingle(filePath, fileName) { showDeleteModal([filePath], `Delete ${fileName}?`); }
function openRenameModal(filePath, currentName) { if(document.getElementById('renameOldPath')) document.getElementById('renameOldPath').value = filePath; if(document.getElementById('renameInput')) document.getElementById('renameInput').value = currentName; const rModal = document.getElementById('renameModal'); if(rModal) rModal.classList.remove('hidden'); const rInput = document.getElementById('renameInput'); if(rInput) rInput.focus(); }

async function executeRename() { 
 const oldPath = document.getElementById('renameOldPath').value; const newName = document.getElementById('renameInput').value; if(!newName) return; 
 document.getElementById('renameModal').classList.add('hidden'); 
 startProgress();
 try { 
 const res = await fetch('/api/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath, newName }) }); 
 if (res.ok) { 
 delete folderCache[currentPath]; 
 await loadFiles(currentPath); 
 if(typeof showToast === 'function') showToast('Nama file diubah!');
 } 
 } catch(e) {} finally { finishProgress(); }
}

function showCreateModal(type) {
 if (type === 'file') {
 isNewFile = true;
 currentEditFile = '';
 const editNameEl = document.getElementById('editingFileName');
 if (editNameEl) editNameEl.innerText = 'File Baru (belum disimpan)';

 if (typeof showTab === 'function') showTab('edit', false);
 history.pushState({ tab: 'edit', file: 'new' }, '', '#edit/new');

 // Tampilkan spinner sebentar saat persiapan editor
 const fileContentParent = document.getElementById('fileContent') && document.getElementById('fileContent').parentElement;
 let editorSpinner = document.getElementById('editor-spinner');
 if (fileContentParent && !editorSpinner) {
 editorSpinner = document.createElement('div');
 editorSpinner.id = 'editor-spinner';
 editorSpinner.className = 'absolute inset-0 bg-[#1a1d23] z-[60] flex flex-col items-center justify-center gap-3';
 editorSpinner.innerHTML = `
 <div class="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
 <span class="text-slate-400 font-bold text-sm tracking-wide">Menyiapkan editor...</span>
 `;
 fileContentParent.appendChild(editorSpinner);
 }
 if (editorSpinner) editorSpinner.classList.remove('hidden');

 setTimeout(() => {
 if (editor) { editor.setValue(""); editor.clearHistory(); }
 setEditorLanguage(null, 'Plain Text');
 if (editorSpinner) editorSpinner.classList.add('hidden');
 if (editor) editor.focus();
 }, 350);
 return;
 }
 if(document.getElementById('createType')) document.getElementById('createType').value = type; 
 if(document.getElementById('createModalTitle')) document.getElementById('createModalTitle').innerText = 'Create Directory'; 
 const cInput = document.getElementById('createInput'); if(cInput) cInput.value = ''; 
 const cModal = document.getElementById('createModal'); if(cModal) cModal.classList.remove('hidden'); 
 if(cInput) cInput.focus(); 
}

async function executeCreate() { 
 const type = document.getElementById('createType').value; const name = document.getElementById('createInput').value.trim(); if (!name) return; 
 const targetPath = currentPath === '' ? name : `${currentPath}/${name}`; document.getElementById('createModal').classList.add('hidden'); 
 startProgress();
 try { 
 let res;
 if (type === 'file') { res = await fetch('/api/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: targetPath, content: '' }) }); } 
 else { res = await fetch('/api/folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: targetPath }) }); } 
 if (res && res.ok) {
 delete folderCache[currentPath]; 
 await loadFiles(currentPath);
 if(typeof showToast === 'function') showToast(`${type === 'file' ? 'File' : 'Folder'} berhasil dibuat!`);
 }
 } catch (e) {} finally { finishProgress(); }
}

function formatLocalTime(isoString) { if (!isoString || isoString === '-') return '-'; const date = new Date(isoString); return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }

window.downloadFile = function(filePath, fileName) {
 if(typeof closeAllDropdowns === 'function') closeAllDropdowns();
 if(typeof showToast === 'function') showToast('Mendownload: ' + fileName);
 
 const link = document.createElement('a');
 link.href = `/api/download?path=${encodeURIComponent(filePath)}`;
 link.download = fileName;
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
}

window.executeSingleAction = function(filePath, action) { 
 if(typeof closeAllDropdowns === 'function') closeAllDropdowns(); 
 selectedFiles.clear(); selectedFiles.add(filePath); 
 const checkboxes = document.querySelectorAll('.file-checkbox'); checkboxes.forEach(cb => cb.checked = false); 
 const cb = document.querySelector(`input[value="${filePath}"]`); if (cb) cb.checked = true; updateDeleteButton(); 
 if (action === 'move') showMoveModal(); 
 if (action === 'archive') showArchiveModal(); 
}

function getFileIcon(name, isDirectory) {
 const ic = (bg, textColor, svgPath) =>
  `<div class="w-8 h-8 rounded-lg ${bg} flex items-center justify-center shrink-0">
    <svg class="w-4 h-4 ${textColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>
   </div>`;

 if (isDirectory) return ic('bg-amber-500/20', 'text-amber-400',
  '<path d="M3 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>');

 const n = name.toLowerCase();
 const ext = n.includes('.') ? n.split('.').pop() : '';

 // JAR
 if (ext === 'jar') return ic('bg-orange-500/20', 'text-orange-400',
  '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>');

 // Shell scripts
 if (ext === 'sh' || ext === 'bash' || ext === 'zsh' || ext === 'fish') return ic('bg-green-500/20', 'text-green-400',
  '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>');

 // Config / properties
 if (ext === 'properties' || ext === 'cfg' || ext === 'conf' || ext === 'ini' || ext === 'env') return ic('bg-slate-500/30', 'text-slate-300',
  '<circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>');

 // YAML
 if (ext === 'yml' || ext === 'yaml') return ic('bg-purple-500/20', 'text-purple-400',
  '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>');

 // JSON
 if (ext === 'json' || ext === 'jsonc') return ic('bg-yellow-500/20', 'text-yellow-400',
  '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/>');

 // XML / HTML
 if (ext === 'xml' || ext === 'html' || ext === 'htm') return ic('bg-blue-500/20', 'text-blue-400',
  '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');

 // TOML
 if (ext === 'toml') return ic('bg-teal-500/20', 'text-teal-400',
  '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>');

 // Archives / ZIP
 if (ext === 'zip' || ext === 'tar' || ext === 'gz' || ext === 'tgz' || ext === 'rar' || ext === '7z' || ext === 'bz2') return ic('bg-violet-500/20', 'text-violet-400',
  '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>');

 // Images
 if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg' || ext === 'ico' || ext === 'bmp') return ic('bg-pink-500/20', 'text-pink-400',
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>');

 // Logs
 if (ext === 'log') return ic('bg-slate-500/20', 'text-slate-400',
  '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>');

 // Text / Markdown
 if (ext === 'txt' || ext === 'md') return ic('bg-slate-500/20', 'text-slate-300',
  '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>');

 // Database
 if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') return ic('bg-cyan-500/20', 'text-cyan-400',
  '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>');

 // JS / TS
 if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx') return ic('bg-yellow-500/20', 'text-yellow-300',
  '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');

 // Python
 if (ext === 'py') return ic('bg-blue-500/20', 'text-blue-300',
  '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');

 // Default
 return ic('bg-sky-500/20', 'text-sky-400',
  '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>');
}

function renderFileListHTML(files, dir, listElement) {
 if(!listElement) return;
 let htmlBuffer = ""; 
 
 if (dir !== '') { 
 const parentPath = dir.split('/').slice(0, -1).join('/'); 
 htmlBuffer += `
 <li onclick="loadFiles('${parentPath}')" class="bg-[#1e293b] hover:bg-slate-800 rounded-xl p-4 md:p-5 cursor-pointer flex items-center gap-4 transition shadow-sm border border-slate-700/50 group">
 <svg class="w-6 h-6 md:w-7 md:h-7 text-blue-400 group-hover:-translate-x-1 transition-transform shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
 <span class="font-bold text-slate-300 text-base md:text-lg">Go Back</span>
 </li>`; 
 } 
 
 files.forEach((file, index) => { 
 const iconSvg = getFileIcon(file.name, file.isDirectory);
 
 const action = file.isDirectory ? `loadFiles('${file.path}')` : `openFile('${file.path}', '${file.name}')`; 
 const menuId = `menu-${index}`; 
 const displayDate = formatLocalTime(file.date); 
 
 let unarchiveBtn = ''; 
 const lname = file.name.toLowerCase(); 
 if (!file.isDirectory && (lname.endsWith('.zip') || lname.endsWith('.tar.gz') || lname.endsWith('.tgz'))) { 
 unarchiveBtn = `
 <div onclick="event.stopPropagation(); executeExtract('${file.path}')" class="px-4 py-2.5 hover:bg-slate-700/80 text-slate-300 font-medium text-sm cursor-pointer flex items-center gap-3 transition">
 <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
 Extract / Unarchive
 </div>`; 
 } 
 
 let downloadBtn = '';
 if (!file.isDirectory) {
 downloadBtn = `
 <div onclick="event.stopPropagation(); downloadFile('${file.path}', '${file.name}')" class="px-4 py-2.5 hover:bg-slate-700/80 text-slate-300 font-medium text-sm cursor-pointer flex items-center gap-3 transition">
 <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
 Download
 </div>`;
 }

 htmlBuffer += `
 <li onclick="${action}" class="bg-[#1e293b] hover:bg-slate-800 rounded-xl p-4 md:p-5 flex items-center gap-2 md:gap-4 transition shadow-sm border border-slate-700/50 cursor-pointer text-base group relative">
 <input type="checkbox" value="${file.path}" class="file-checkbox w-5 h-5 md:w-6 md:h-6 rounded cursor-pointer accent-blue-500 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" onclick="event.stopPropagation(); toggleSelect(this.value)">
 
 <div class="flex-grow flex items-center gap-3 md:gap-4 overflow-hidden">
 ${iconSvg}
 <span class="font-bold text-slate-200 truncate text-base md:text-lg">${file.name}</span>
 </div>
 
 <div class="flex flex-col items-end justify-center shrink-0 ml-1">
 <span class="text-slate-400 font-mono text-[10px] md:text-sm">${displayDate}</span>
 <span class="text-slate-500 font-mono text-[10px] md:text-sm">${file.size || ''}</span>
 </div>

 <div class="relative shrink-0">
 <button onclick="toggleMenu(event, '${menuId}')" class="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition">
 <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"></path></svg>
 </button>
 <div id="${menuId}" class="dropdown-menu hidden absolute right-0 top-full mt-1 w-48 bg-[#1e293b] border border-slate-600 rounded-lg shadow-2xl z-50 py-1.5 origin-top-right">
 ${unarchiveBtn}
 ${downloadBtn}
 <div onclick="event.stopPropagation(); openRenameModal('${file.path}', '${file.name}')" class="px-4 py-2.5 hover:bg-slate-700/80 text-slate-300 font-medium text-sm cursor-pointer flex items-center gap-3 transition">
 <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
 Rename
 </div>
 <div onclick="event.stopPropagation(); executeSingleAction('${file.path}', 'move')" class="px-4 py-2.5 hover:bg-slate-700/80 text-slate-300 font-medium text-sm cursor-pointer flex items-center gap-3 transition">
 <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
 Move
 </div>
 <div onclick="event.stopPropagation(); executeSingleAction('${file.path}', 'archive')" class="px-4 py-2.5 hover:bg-slate-700/80 text-slate-300 font-medium text-sm cursor-pointer flex items-center gap-3 transition">
 <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
 Archive
 </div>
 <div class="h-px bg-slate-600/50 my-1.5"></div>
 <div onclick="event.stopPropagation(); deleteSingle('${file.path}', '${file.name}')" class="px-4 py-2.5 hover:bg-red-900/30 text-red-400 font-bold text-sm cursor-pointer flex items-center gap-3 transition">
 <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
 Delete
 </div>
 </div>
 </div>
 </li>`; 
 });
 
 listElement.innerHTML = htmlBuffer;
}

async function loadFiles(dir = '', addToHistory = true) { 
 startProgress(); 
 currentPath = dir; 
 
 const pathEl = document.getElementById('currentDirPath');
 if(pathEl) {
 let breadcrumbHTML = `
 <span class="text-slate-500 cursor-not-allowed select-none">/ home</span>
 <span class="text-slate-600 mx-1.5">/</span>
 <span onclick="loadFiles('')" class="cursor-pointer hover:text-blue-400 transition text-slate-300 font-bold">container</span>
 `;
 if (currentPath !== '') {
 const parts = currentPath.split('/');
 let buildPath = '';
 parts.forEach((part, idx) => {
 buildPath += (idx === 0 ? part : '/' + part);
 breadcrumbHTML += `<span class="text-slate-600 mx-1.5">/</span>`;
 if (idx === parts.length - 1) {
 breadcrumbHTML += `<span class="font-black text-slate-100">${part}</span>`;
 } else {
 breadcrumbHTML += `<span onclick="loadFiles('${buildPath}')" class="cursor-pointer hover:text-blue-400 transition text-slate-300">${part}</span>`;
 }
 });
 }
 pathEl.innerHTML = breadcrumbHTML;
 }
 
 selectedFiles.clear(); 
 updateDeleteButton(); 
 
 const list = document.getElementById('fileList'); 
 if (addToHistory) { 
 const newHash = dir === '' ? '#files' : `#files/${dir}`; 
 if (window.location.hash !== newHash) history.pushState({ tab: 'files', path: dir }, '', newHash); 
 } 

 if (folderCache[currentPath]) {
 setTimeout(() => { renderFileListHTML(folderCache[currentPath], currentPath, list); finishProgress(); }, 10);
 return; 
 }
 
 if(list) {
 list.innerHTML = `
 <li class="p-8 bg-[#1e293b] rounded-xl text-center text-slate-400 font-bold flex flex-col items-center justify-center gap-3 w-full h-full min-h-[200px] border border-slate-700/50 shadow-sm">
 <div class="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
 <span class="text-sm tracking-wide">Memuat folder...</span>
 </li>
 `;
 }
 
 try { 
 const res = await fetch(`/api/files?path=${encodeURIComponent(currentPath)}`); 
 if (res.status === 401) return window.location.href = "/"; 
 const files = await res.json(); 
 folderCache[currentPath] = files;
 renderFileListHTML(files, currentPath, list);
 } catch(e) {} finally { finishProgress(); }
}

async function openFile(filePath, fileName, addToHistory = true) {
 isNewFile = false;
 startProgress(); 
 currentEditFile = filePath; 
 if(!fileName) fileName = filePath.split('/').pop();
 const editNameEl = document.getElementById('editingFileName');
 if(editNameEl) editNameEl.innerText = "Edit: " + fileName; 

 lastQuery = '';
 searchCursor = null;
 clearAllSearchMarks();
 
 const searchInput = document.getElementById('editorSearchInput');
 if(searchInput) searchInput.value = '';
 
 const searchBar = document.getElementById('customSearchBar');
 if(searchBar) searchBar.classList.add('hidden');

 const [mode, langLabel] = detectLanguage(filePath);

 const fileContentParent = document.getElementById('fileContent').parentElement;
 let editorSpinner = document.getElementById('editor-spinner');
 if (!editorSpinner) {
 editorSpinner = document.createElement('div');
 editorSpinner.id = 'editor-spinner';
 editorSpinner.className = 'absolute inset-0 bg-[#1d1f21] z-[60] flex flex-col items-center justify-center gap-3';
 editorSpinner.innerHTML = `
 <div class="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin"></div>
 <span class="text-slate-400 font-bold text-sm tracking-wide">Memuat teks...</span>
 `;
 fileContentParent.appendChild(editorSpinner);
 }
 editorSpinner.classList.remove('hidden');

 setEditorLanguage(null, 'Plain Text');
 if (editor) editor.setValue("");

 if(typeof showTab === 'function') showTab('edit', false);
 if (addToHistory) history.pushState({ tab: 'edit', file: filePath }, '', '#edit/' + filePath);

 try {
 const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`); 
 if (res.status === 401) return window.location.href = "/"; 
 const content = await res.text(); 
 if (editor) { editor.setValue(content); editor.clearHistory(); }
 setEditorLanguage(mode, langLabel);
 } catch(e) {
 if (editor) editor.setValue("// Gagal memuat isi file. Coba lagi.");
 setEditorLanguage(null, 'Plain Text');
 } finally { 
 finishProgress(); 
 if (editorSpinner) editorSpinner.classList.add('hidden'); 
 }
}

function closeEditor() {
 const savedPath = currentPath;
 window._skipFileReset = true;
 if(typeof showTab === 'function') showTab('files', false);
 currentPath = savedPath;
 const newHash = savedPath === '' ? '#files' : `#files/${savedPath}`;
 history.pushState({ tab: 'files', path: savedPath }, '', newHash);
 delete folderCache[savedPath];
 loadFiles(savedPath, false);
}

async function saveFile() { 
 if (!editor) return;
 if (isNewFile || !currentEditFile) {
 const modal = document.getElementById('saveAsModal');
 if (modal) {
 document.getElementById('saveAsInput').value = '';
 modal.classList.remove('hidden');
 setTimeout(() => document.getElementById('saveAsInput').focus(), 100);
 }
 return;
 }
 startProgress(); 
 try { 
 const res = await fetch('/api/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: currentEditFile, content: editor.getValue() }) }); 
 if(res.ok && typeof showToast === 'function') showToast('File Tersimpan!'); 
 } catch(e) {} finally { finishProgress(); }
}

async function executeSaveAs() {
 const nameInput = document.getElementById('saveAsInput');
 const name = nameInput ? nameInput.value.trim() : '';
 if (!name) { if (typeof showToast === 'function') showToast('Nama file wajib diisi!', 'error'); return; }
 const targetPath = currentPath === '' ? name : `${currentPath}/${name}`;
 document.getElementById('saveAsModal').classList.add('hidden');
 startProgress();
 try {
 const res = await fetch('/api/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: targetPath, content: editor.getValue() }) });
 if (res.ok) {
 isNewFile = false;
 currentEditFile = targetPath;
 const editNameEl = document.getElementById('editingFileName');
 if (editNameEl) editNameEl.innerText = name;
 history.replaceState({ tab: 'edit', file: targetPath }, '', '#edit/' + targetPath);
 delete folderCache[currentPath];
 const [detectedMode, detectedLabel] = detectLanguage(name);
 setEditorLanguage(detectedMode, detectedLabel);
 if (typeof showToast === 'function') showToast('File berhasil disimpan!');
 } else {
 if (typeof showToast === 'function') showToast('Gagal menyimpan file', 'error');
 }
 } catch(e) { if (typeof showToast === 'function') showToast('Error jaringan', 'error'); } 
 finally { finishProgress(); }
}

// === UPLOAD MANUAL 100% REALTIME VIA SERVER SOCKET + TOLERANSI 5 DETIK ===
function getOrCreateUnifiedBox() { let box = document.getElementById('unified-upload-box'); if (!box) { box = document.createElement('div'); box.id = 'unified-upload-box'; box.className = 'fixed bottom-6 right-6 w-[320px] bg-[#1e293b] border border-slate-600 rounded-2xl shadow-2xl z-[999] flex flex-col max-h-[50vh] transition-all duration-300'; box.innerHTML = `<div class="p-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center rounded-t-2xl shrink-0"><h4 class="text-sm font-black text-blue-400 flex items-center gap-2"><svg class="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg><span id="unified-upload-title">Memproses tugas...</span></h4><button onclick="window.minimizeUpload()" class="bg-slate-700 hover:bg-slate-600 p-1.5 rounded transition text-white" title="Minimize"><svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7"></path></svg></button></div><div id="unified-upload-list" class="p-4 flex flex-col gap-4 overflow-y-auto ptero-scrollbar"></div>`; document.body.appendChild(box); } return box; }
function getOrCreateMiniIndicator() { let mini = document.getElementById('miniUploadIndicator'); if (!mini) { mini = document.createElement('div'); mini.id = 'miniUploadIndicator'; mini.onclick = window.maximizeUpload; mini.className = 'hidden fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-full shadow-xl z-[200] cursor-pointer flex items-center gap-2 transition-all active:scale-95 border border-blue-400/50'; mini.title = 'Klik untuk memperbesar'; mini.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span class="text-xs font-black tracking-wider" id="miniUploadText">Memproses file...</span>`; document.body.appendChild(mini); } return mini; }
function updateUploadState() { const titleSpan = document.getElementById('unified-upload-title'); if (titleSpan) { titleSpan.innerText = activeUploadsCount > 0 ? `Memproses ${activeUploadsCount} tugas...` : 'Selesai'; } const miniText = document.getElementById('miniUploadText'); if (miniText) { miniText.innerText = `Memproses ${activeUploadsCount} tugas...`; } if (activeUploadsCount <= 0) { const mini = document.getElementById('miniUploadIndicator'); if (mini) mini.classList.add('hidden'); setTimeout(() => { if (activeUploadsCount <= 0) { const box = document.getElementById('unified-upload-box'); if (box) box.classList.add('hidden'); const list = document.getElementById('unified-upload-list'); if (list) list.innerHTML = ''; } }, 3000); } }
window.minimizeUpload = function() { const box = document.getElementById('unified-upload-box'); if (box) box.classList.add('hidden'); if (activeUploadsCount > 0) { const mini = getOrCreateMiniIndicator(); mini.classList.remove('hidden'); } }
window.maximizeUpload = function() { const box = getOrCreateUnifiedBox(); box.classList.remove('hidden'); const mini = document.getElementById('miniUploadIndicator'); if (mini) mini.classList.add('hidden'); }

function formatDynamicSize(bytes) {
 if (bytes === 0) return '0.00 B';
 const k = 1024;
 const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
 const i = Math.floor(Math.log(bytes) / Math.log(k));
 return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

async function uploadFile() { 
 const fileInput = document.getElementById('fileUploader'); 
 if (!fileInput || fileInput.files.length === 0) return; 
 
 const box = getOrCreateUnifiedBox(); box.classList.remove('hidden'); 
 const mini = document.getElementById('miniUploadIndicator'); if (mini) mini.classList.add('hidden'); 
 const list = document.getElementById('unified-upload-list'); 
 const files = fileInput.files; 
 
 for (let i = 0; i < files.length; i++) { 
 const file = files[i]; 
 const uploadId = 'up_' + Date.now() + '_' + i; 
 activeUploadsCount++; 
 updateUploadState(); 
 
 const fileItem = document.createElement('div'); 
 fileItem.id = uploadId; 
 fileItem.className = 'flex flex-col gap-1.5 transition-all duration-300 opacity-100 border-b border-slate-700/50 pb-3 last:border-0 last:pb-0'; 
 
 const totalSizeStr = formatDynamicSize(file.size);

 fileItem.innerHTML = `
 <div class="flex justify-between items-center">
 <span class="text-xs text-white font-bold truncate w-4/5" title="${file.name}"> ${file.name}</span>
 <button id="cancel_${uploadId}" class="text-slate-500 hover:text-red-400 font-black text-sm transition active:scale-95" title="Batal"></button>
 </div>
 <div class="w-full bg-slate-900 rounded-full h-2 shadow-inner overflow-hidden border border-slate-700">
 <div id="bar_${uploadId}" class="bg-gradient-to-r from-blue-600 to-blue-400 h-2 rounded-full transition-all duration-100 ease-linear" style="width: 0%"></div>
 </div>
 <div class="flex justify-between items-center text-[10px] font-mono font-bold text-slate-400 mt-0.5">
 <div class="flex items-center gap-2">
 <span id="mb_text_${uploadId}">0.00 B / ${totalSizeStr}</span>
 <span id="speed_${uploadId}" class="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded animate-pulse">Menghitung...</span>
 </div>
 <span id="percent_${uploadId}" class="text-blue-400">0.0%</span>
 </div>
 `; 
 list.appendChild(fileItem); 

 const xhr = new XMLHttpRequest();
 let isCancelled = false;

 document.getElementById(`cancel_${uploadId}`).onclick = function() { 
 isCancelled = true;
 xhr.abort(); 
 fileItem.style.opacity = '0'; 
 setTimeout(() => fileItem.remove(), 300); 
 if(typeof showToast === 'function') showToast(' Dibatalkan: ' + file.name, 'error'); 
 activeUploadsCount--; updateUploadState();
 }; 

 let lastLoaded = 0;
 let lastLoadedForSpeed = 0;
 let smoothedSpeed = 0;
 let zeroSpeedCounter = 0; 

 const speedMonitor = setInterval(() => {
 if (isCancelled) { clearInterval(speedMonitor); return; }
 
 let rawSpeed = lastLoaded - lastLoadedForSpeed; 
 lastLoadedForSpeed = lastLoaded;

 if (rawSpeed > 0) {
 zeroSpeedCounter = 0; 
 if (smoothedSpeed === 0) smoothedSpeed = rawSpeed;
 else smoothedSpeed = (rawSpeed * 0.2) + (smoothedSpeed * 0.8);

 const speedEl = document.getElementById(`speed_${uploadId}`);
 if (speedEl) {
 speedEl.innerText = formatDynamicSize(smoothedSpeed) + '/s';
 speedEl.className = 'text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded';
 }
 } else {
 zeroSpeedCounter++;
 smoothedSpeed = smoothedSpeed * 0.5; 
 
 const speedEl = document.getElementById(`speed_${uploadId}`);
 if (speedEl) {
 if (zeroSpeedCounter >= 5) { 
 speedEl.innerText = '0 B/s (Sinyal Lelet...)';
 speedEl.className = 'text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded animate-pulse';
 } else { 
 speedEl.innerText = formatDynamicSize(smoothedSpeed) + '/s';
 }
 }
 }
 }, 1000);

 const progressHandler = (data) => {
 if (data.uploadId === uploadId) {
 lastLoaded = data.loaded;

 let percentComplete = (data.loaded / file.size) * 100;
 if (percentComplete > 100) percentComplete = 100;

 const bar = document.getElementById(`bar_${uploadId}`);
 const mbTextEl = document.getElementById(`mb_text_${uploadId}`);
 const percentEl = document.getElementById(`percent_${uploadId}`);

 if (bar) bar.style.width = percentComplete + '%';
 if (mbTextEl) mbTextEl.innerText = `${formatDynamicSize(data.loaded)} / ${totalSizeStr}`;
 if (percentEl) percentEl.innerText = percentComplete.toFixed(1) + '%';
 }
 };

 socket.on('manual_upload_progress', progressHandler);

 xhr.onload = function() {
 if (isCancelled) return;
 clearInterval(speedMonitor);
 socket.off('manual_upload_progress', progressHandler);

 if (xhr.status >= 200 && xhr.status < 300) {
 activeUploadsCount--; updateUploadState(); 
 
 const speedEl = document.getElementById(`speed_${uploadId}`);
 if (speedEl) speedEl.remove(); 
 
 if(typeof showToast === 'function') showToast(' Selesai: ' + file.name); 
 const bar = document.getElementById(`bar_${uploadId}`); 
 const mbTextEl = document.getElementById(`mb_text_${uploadId}`);
 const percent = document.getElementById(`percent_${uploadId}`);
 
 if (bar) { bar.classList.remove('from-blue-600', 'to-blue-400'); bar.classList.add('from-green-600', 'to-green-400'); bar.style.width = '100%'; } 
 if (mbTextEl) { mbTextEl.innerText = `${totalSizeStr} / ${totalSizeStr}`; }
 if (percent) { percent.innerText = 'Selesai'; percent.className = 'text-green-400'; }
 
 setTimeout(() => { fileItem.style.opacity = '0'; setTimeout(() => fileItem.remove(), 300); }, 3000); 
 delete folderCache[currentPath]; loadFiles(currentPath); 
 } else {
 handleError();
 }
 };

 xhr.onerror = handleError;
 xhr.onabort = () => { clearInterval(speedMonitor); socket.off('manual_upload_progress', progressHandler); };

 function handleError() {
 if (isCancelled) return;
 clearInterval(speedMonitor);
 socket.off('manual_upload_progress', progressHandler);
 if(typeof showToast === 'function') showToast(' Gagal upload: Server Error', 'error'); 
 fileItem.innerHTML = `<p class="text-red-400 text-xs font-bold text-center py-2"> Upload Gagal</p>`; 
 setTimeout(() => fileItem.remove(), 4000); 
 activeUploadsCount--; updateUploadState();
 }

 xhr.open("POST", `/api/upload?uploadId=${uploadId}`, true);
 const formData = new FormData();
 formData.append("path", currentPath);
 formData.append("filename", file.name);
 formData.append("file", file); 
 xhr.send(formData);
 } 
 fileInput.value = ''; 
}

window.showRemoteDownloadModal = function() {
 document.getElementById('rdlUrlInput').value = '';
 document.getElementById('rdlNameInput').value = '';
 document.getElementById('remoteDlModal').classList.remove('hidden');
 document.getElementById('rdlUrlInput').focus();
}

window.executeRemoteDownload = async function() {
 const url = document.getElementById('rdlUrlInput').value.trim();
 const filename = document.getElementById('rdlNameInput').value.trim();
 
 if (!url || !filename) {
 if(typeof showToast === 'function') showToast('URL dan Nama File wajib diisi!', 'error');
 return;
 }

 document.getElementById('remoteDlModal').classList.add('hidden');
 
 const box = getOrCreateUnifiedBox(); box.classList.remove('hidden'); 
 const mini = document.getElementById('miniUploadIndicator'); if (mini) mini.classList.add('hidden'); 
 const list = document.getElementById('unified-upload-list'); 

 activeUploadsCount++; 
 updateUploadState();

 const dlId = 'dl_' + Date.now(); 
 const fileItem = document.createElement('div'); 
 fileItem.id = dlId; 
 fileItem.className = 'flex flex-col gap-1.5 transition-all duration-300 opacity-100 border-b border-slate-700/50 pb-3 last:border-0 last:pb-0'; 

 fileItem.innerHTML = `
 <div class="flex justify-between items-center">
 <span class="text-xs text-white font-bold truncate w-full pr-2" title="${filename}"> Menarik: ${filename}</span>
 </div>
 <div class="w-full bg-slate-900 rounded-full h-2 shadow-inner overflow-hidden border border-slate-700">
 <div id="bar_${dlId}" class="bg-gradient-to-r from-purple-600 to-blue-500 h-2 rounded-full w-full animate-pulse"></div>
 </div>
 <div class="flex justify-between items-center text-[10px] font-mono font-bold text-slate-400 mt-0.5">
 <div class="flex items-center gap-2">
 <span id="mb_text_${dlId}">0.00 B Disedot</span>
 <span id="speed_${dlId}" class="text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded animate-pulse">Menghitung...</span>
 </div>
 </div>
 `; 
 list.appendChild(fileItem);

 let lastLoaded = 0;
 let lastTime = Date.now();
 let smoothedSpeed = 0;

 const progressHandler = (data) => {
 if (data.filename === filename) {
 const now = Date.now();
 const timeDiff = (now - lastTime) / 1000;
 
 if (timeDiff >= 0.5) {
 let rawSpeed = (data.loaded - lastLoaded) / timeDiff;
 if (smoothedSpeed === 0) smoothedSpeed = rawSpeed;
 else smoothedSpeed = (rawSpeed * 0.2) + (smoothedSpeed * 0.8); 

 const speedEl = document.getElementById(`speed_${dlId}`);
 if (speedEl && smoothedSpeed > 0) {
 speedEl.classList.remove('animate-pulse');
 speedEl.innerText = formatDynamicSize(smoothedSpeed) + '/s';
 }
 lastLoaded = data.loaded;
 lastTime = now;
 }

 const mbTextEl = document.getElementById(`mb_text_${dlId}`);
 if (mbTextEl) mbTextEl.innerText = formatDynamicSize(data.loaded) + ' Disedot';
 }
 };

 const successHandler = (doneFilename) => {
 if (doneFilename === filename) {
 cleanup();
 const speedEl = document.getElementById(`speed_${dlId}`);
 if (speedEl) speedEl.remove();

 const bar = document.getElementById(`bar_${dlId}`);
 const mbTextEl = document.getElementById(`mb_text_${dlId}`);

 if (bar) { bar.classList.remove('from-purple-600', 'to-blue-500', 'animate-pulse'); bar.classList.add('from-green-600', 'to-green-400'); }
 if (mbTextEl) mbTextEl.innerText = 'Selesai didownload!';

 activeUploadsCount--; updateUploadState();
 setTimeout(() => { fileItem.style.opacity = '0'; setTimeout(() => fileItem.remove(), 300); }, 3000);
 delete folderCache[currentPath]; loadFiles(currentPath);
 }
 };

 const errorHandler = (failData) => {
 if (failData.filename === filename) {
 cleanup();
 fileItem.innerHTML = `<p class="text-red-400 text-xs font-bold text-center py-2"> Gagal (Error ${failData.code})</p>`;
 setTimeout(() => fileItem.remove(), 4000);
 activeUploadsCount--; updateUploadState();
 }
 };

 socket.on('remote_dl_progress', progressHandler);
 socket.on('remote_dl_done', successHandler);
 socket.on('remote_dl_error', errorHandler);

 function cleanup() {
 socket.off('remote_dl_progress', progressHandler);
 socket.off('remote_dl_done', successHandler);
 socket.off('remote_dl_error', errorHandler);
 }

 try {
 const res = await fetch('/api/remote-download', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ url: url, filename: filename, path: currentPath })
 });
 const data = await res.json();
 if (!res.ok || !data.success) throw new Error('Failed');
 } catch(e) {
 cleanup();
 fileItem.innerHTML = `<p class="text-red-400 text-xs font-bold text-center py-2"> Koneksi Server Error</p>`;
 setTimeout(() => fileItem.remove(), 4000);
 activeUploadsCount--; updateUploadState();
 }
}

async function executeExtract(filePath) { 
 if(typeof closeAllDropdowns === 'function') closeAllDropdowns(); 
 startProgress(); 
 try { 
 const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: filePath, destination: currentPath }) }); 
 if(res.ok) {
 delete folderCache[currentPath];
 await loadFiles(currentPath); 
 if(typeof showToast === 'function') showToast('Ekstrak berhasil!');
 } else {
 if(typeof showToast === 'function') showToast('Gagal mengekstrak', 'error');
 }
 } catch(e) {} finally { finishProgress(); }
}

function showArchiveModal() { const aInput = document.getElementById('archiveInput'); if(aInput) aInput.value = ''; const aModal = document.getElementById('archiveModal'); if(aModal) aModal.classList.remove('hidden'); if(aInput) aInput.focus(); }

async function executeArchive() { 
 const name = document.getElementById('archiveInput').value.trim(); if(!name) return; 
 document.getElementById('archiveModal').classList.add('hidden'); 
 startProgress(); 
 try { 
 const res = await fetch('/api/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: Array.from(selectedFiles), archiveName: name, currentPath: currentPath }) }); 
 if(res.ok) {
 delete folderCache[currentPath];
 selectedFiles.clear(); updateDeleteButton(); await loadFiles(currentPath); 
 if(typeof showToast === 'function') showToast('Arsip berhasil dibuat!');
 }
 } catch(e) {} finally { finishProgress(); }
}

window.showMoveModal = function() { 
 moveTargetPath = currentPath; 
 const mModal = document.getElementById('moveModal'); 
 if(mModal) mModal.classList.remove('hidden'); 
 
 const mInput = document.getElementById('moveNewDirInput'); 
 if(mInput) mInput.value = ''; 
 
 loadMoveFolders(moveTargetPath); 
}

window.loadMoveFolders = async function(targetDir) {
 moveTargetPath = targetDir;
 const listEl = document.getElementById('moveFolderList');
 const pathText = document.getElementById('moveCurrentPathText');
 
 if(pathText) { pathText.innerText = targetDir === '' ? '/home/container/' : `/home/container/${targetDir}/`; }
 if(listEl) { listEl.innerHTML = '<div class="flex justify-center py-6"><div class="w-6 h-6 border-4 border-slate-600 border-t-yellow-500 rounded-full animate-spin"></div></div>'; }
 
 try {
 const res = await fetch(`/api/files?path=${encodeURIComponent(targetDir)}`);
 if (!res.ok) throw new Error('Failed');
 const files = await res.json();
 
 let htmlBuffer = '';
 
 if (targetDir !== '') {
 const parentPath = targetDir.split('/').slice(0, -1).join('/');
 htmlBuffer += `
 <button onclick="loadMoveFolders('${parentPath}')" class="w-full bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 p-3 rounded-xl flex items-center justify-center gap-2 text-slate-300 font-bold transition active:scale-95 shadow-sm mb-1">
 <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
 Go back
 </button>
 `;
 }
 
 const dirs = files.filter(f => f.isDirectory);
 if (dirs.length === 0) {
 htmlBuffer += '<p class="text-center text-slate-500 py-6 text-xs font-bold">Tidak ada sub-folder di sini.</p>';
 } else {
 dirs.forEach(dir => {
 htmlBuffer += `
 <div onclick="loadMoveFolders('${dir.path}')" class="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700/80 p-3.5 rounded-xl flex items-center gap-3 text-slate-200 font-bold transition cursor-pointer active:scale-95 shadow-sm group">
 <span class="text-yellow-400 text-lg group-hover:scale-110 transition-transform"></span>
 <span class="truncate">${dir.name}</span>
 </div>
 `;
 });
 }
 
 if(listEl) listEl.innerHTML = htmlBuffer;
 } catch (e) {
 if(listEl) listEl.innerHTML = '<p class="text-center text-red-400 py-4 text-xs font-bold">Gagal memuat direktori.</p>';
 }
}

window.createDirInMove = async function() {
 const input = document.getElementById('moveNewDirInput');
 if (!input) return;
 const name = input.value.trim();
 if (!name) return;
 
 const targetPath = moveTargetPath === '' ? name : `${moveTargetPath}/${name}`;
 input.disabled = true;
 
 try {
 const res = await fetch('/api/folder', { 
 method: 'POST', 
 headers: { 'Content-Type': 'application/json' }, 
 body: JSON.stringify({ path: targetPath }) 
 });
 
 if (res.ok) {
 input.value = '';
 delete folderCache[moveTargetPath]; 
 await loadMoveFolders(moveTargetPath); 
 if(typeof showToast === 'function') showToast('Folder ' + name + ' berhasil dibuat!');
 } else {
 if(typeof showToast === 'function') showToast('Nama sudah ada / gagal dibuat', 'error');
 }
 } catch(e) {
 if(typeof showToast === 'function') showToast('Error jaringan', 'error');
 } finally {
 input.disabled = false;
 input.focus();
 }
}

window.executeInteractiveMove = async function() { 
 document.getElementById('moveModal').classList.add('hidden'); 
 startProgress(); 
 try { 
 const res = await fetch('/api/move', { 
 method: 'POST', 
 headers: { 'Content-Type': 'application/json' }, 
 body: JSON.stringify({ items: Array.from(selectedFiles), destination: moveTargetPath }) 
 }); 
 
 if(res.ok) {
 delete folderCache[currentPath]; 
 delete folderCache[moveTargetPath]; 
 selectedFiles.clear(); 
 updateDeleteButton(); 
 await loadFiles(currentPath); 
 if(typeof showToast === 'function') showToast('File berhasil dipindah!');
 } else {
 if(typeof showToast === 'function') showToast('Gagal memindah file', 'error');
 }
 } catch(e) {
 if(typeof showToast === 'function') showToast('Error jaringan', 'error');
 } finally { 
 finishProgress(); 
 }
}

window.addEventListener('popstate', function(event) {
 const hash = window.location.hash;
 if (hash === '#files' || hash.startsWith('#files/')) {
 if(typeof showTab === 'function') showTab('files', false);
 let dir = hash.replace('#files', '');
 if (dir.startsWith('/')) dir = dir.substring(1);
 loadFiles(dir, false); 
 } 
 else if (hash.startsWith('#edit/')) {
 if(typeof showTab === 'function') showTab('edit', false);
 let file = hash.replace('#edit/', '');
 openFile(file, '', false);
 }
});
