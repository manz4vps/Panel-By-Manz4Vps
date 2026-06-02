/* =========================================
 MODULE: CONSOLE MANAGER (FRONTEND)
 ========================================= */

const terminal = document.getElementById('terminal');
const ansi_up = new AnsiUp();
let isAutoScroll = true;
let _userScrolling = false;
let _userScrollTimer;

if(terminal) {
 terminal.addEventListener('scroll', () => {
 const isAtBottom = terminal.scrollHeight - terminal.scrollTop <= terminal.clientHeight + 60;
 const btn = document.getElementById('btnAutoScroll');
 if (!isAtBottom) {
 _userScrolling = true;
 clearTimeout(_userScrollTimer);
 if (isAutoScroll) {
 isAutoScroll = false;
 if(btn) btn.classList.replace('bg-blue-600/90', 'bg-slate-700/90');
 }
 } else {
 _userScrolling = false;
 if (!isAutoScroll) {
 isAutoScroll = true;
 if(btn) btn.classList.replace('bg-slate-700/90', 'bg-blue-600/90');
 }
 }
 });
}

function toggleAutoScroll() {
 isAutoScroll = !isAutoScroll;
 _userScrolling = !isAutoScroll;
 const btn = document.getElementById('btnAutoScroll');
 if (isAutoScroll) {
 if(btn) btn.classList.replace('bg-slate-700/90', 'bg-blue-600/90');
 smoothScrollToBottom(true);
 } else {
 if(btn) btn.classList.replace('bg-blue-600/90', 'bg-slate-700/90');
 }
}

function smoothScrollToBottom(force = false) { 
 if (!terminal || (!isAutoScroll && !force)) return;
 terminal.scrollTop = terminal.scrollHeight;
}

function clearTerminal() {
 socket.emit('clear_logs'); 
 let statusMsg = "Server marked as offline...";
 if (typeof isServerOnline !== 'undefined' && isServerOnline) {
 if (typeof globalStartTime !== 'undefined' && globalStartTime && (Date.now() - globalStartTime < 5000)) {
 statusMsg = "Server marked as starting...";
 } else {
 statusMsg = "Server is running...";
 }
 }
 if(terminal) terminal.innerHTML = `<span style="color: #eab308; font-weight: 900;">container@manz4vps~</span> <span style="color: #cbd5e1;">${statusMsg}</span><br>`;
}

// FIX: Hapus setTimeout biar nggak telat nangkep log dari backend
if(terminal) {
 socket.on('log_history', (history) => { 
 if (!history && typeof isServerOnline !== 'undefined' && !isServerOnline) {
 terminal.innerHTML = `<span style="color: #eab308; font-weight: 900;">container@manz4vps~</span> <span style="color: #cbd5e1;">Server marked as offline...</span><br>`;
 } else {
 terminal.innerHTML = ansi_up.ansi_to_html(history); 
 smoothScrollToBottom(true); 
 }
 });
 
 socket.on('log', (msg) => { 
 const logWrapper = document.createElement('span'); 
 logWrapper.innerHTML = ansi_up.ansi_to_html(msg); 
 terminal.appendChild(logWrapper); 
 smoothScrollToBottom(); 
 if (msg.includes("You need to agree to the EULA")) { 
 const eulaModal = document.getElementById('eulaModal'); 
 if(eulaModal) eulaModal.classList.remove('hidden'); 
 } 
 });
}

if(document.getElementById('startBtn')) { document.getElementById('startBtn').addEventListener('click', () => { socket.emit('start'); if(typeof resetStopButton === 'function') resetStopButton(); }); }
if(document.getElementById('restartBtn')) { document.getElementById('restartBtn').addEventListener('click', () => { socket.emit('restart'); if(typeof resetStopButton === 'function') resetStopButton(); }); }
if(document.getElementById('stopBtn')) {
 document.getElementById('stopBtn').addEventListener('click', () => { 
 if (typeof isStoppingServer !== 'undefined' && !isStoppingServer) { 
 socket.emit('stop_aman'); 
 isStoppingServer = true; 
 const stopBtn = document.getElementById('stopBtn'); 
 stopBtn.innerText = "Kill"; stopBtn.classList.remove('bg-red-600', 'hover:bg-red-500'); stopBtn.classList.add('bg-red-800', 'hover:bg-red-700'); 
 } else { confirmKill(); } 
 });
}

function confirmKill() { 
 if(document.getElementById('genericModalIcon')) document.getElementById('genericModalIcon').innerText = ''; 
 if(document.getElementById('genericModalTitle')) document.getElementById('genericModalTitle').innerText = 'Matikan Paksa'; 
 if(document.getElementById('genericModalMsg')) document.getElementById('genericModalMsg').innerText = 'Yakin mematikan paksa?'; 
 const gModal = document.getElementById('genericModal'); if(gModal) gModal.classList.remove('hidden'); 
 const confirmBtn = document.getElementById('genericConfirmBtn'); 
 if(confirmBtn) { 
 const newBtn = confirmBtn.cloneNode(true); confirmBtn.parentNode.replaceChild(newBtn, confirmBtn); 
 newBtn.onclick = () => { socket.emit('kill_paksa'); document.getElementById('genericModal').classList.add('hidden'); if(typeof resetStopButton === 'function') resetStopButton(); }; 
 } 
}

function acceptEula() { const eModal = document.getElementById('eulaModal'); if(eModal) eModal.classList.add('hidden'); socket.emit('accept_eula'); if(typeof showToast === 'function') showToast('Menyetujui EULA...', 'success'); }

function sendCommand() { 
 const cmdInput = document.getElementById('cmdInput'); 
 if(!cmdInput) return; 
 let rawCmd = cmdInput.value.trim(); 
 if (rawCmd !== "") { 
 socket.emit('command', rawCmd); 
 cmdInput.value = ""; 
 
 isAutoScroll = true;
 const btn = document.getElementById('btnAutoScroll');
 if(btn) btn.classList.replace('bg-slate-700/90', 'bg-blue-600/90');
 smoothScrollToBottom(true);
 } 
}

if(document.getElementById('cmdInput')) { document.getElementById('cmdInput').addEventListener("keypress", (e) => { if (e.key === "Enter") sendCommand(); }); }
