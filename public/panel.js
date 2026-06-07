/* =========================================
 MODULE: PANEL CORE & SETTINGS (FRONTEND)
 ========================================= */
const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1500, reconnectionDelayMax: 8000 });
let globalStartTime = null; 
let isServerOnline = false;
let currentDiskUsedMB = 0;
let isStoppingServer = false; 

let settingsCache = null;
let currentServerRamMB = 2048;

let _reconnectBanner = null;
let _wasEverConnected = false;

function _getOrCreateReconnectBanner() {
 if (!_reconnectBanner) {
 _reconnectBanner = document.createElement('div');
 _reconnectBanner.id = 'reconnect-banner';
 _reconnectBanner.className = 'fixed top-0 left-0 right-0 z-[99999] bg-red-600 text-white text-center text-sm font-bold py-2 px-4 flex items-center justify-center gap-2 shadow-lg';
 _reconnectBanner.innerHTML = '<div class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></div><span>Koneksi terputus — mencoba menghubungkan kembali...</span>';
 document.body.appendChild(_reconnectBanner);
 }
 return _reconnectBanner;
}

socket.on('connect', () => {
 if (_wasEverConnected) {
 if (_reconnectBanner) { _reconnectBanner.remove(); _reconnectBanner = null; }
 if (typeof showToast === 'function') showToast('Berhasil terhubung kembali!', 'success');
 }
 _wasEverConnected = true;
});

socket.on('disconnect', (reason) => {
 if (reason === 'io server disconnect') { socket.connect(); }
 const banner = _getOrCreateReconnectBanner();
 banner.style.display = 'flex';
});

socket.on('connect_error', () => {
 _getOrCreateReconnectBanner().style.display = 'flex';
});

function parseRamToMB(ramStr) {
 if (!ramStr) return 2048;
 let val = parseFloat(ramStr.replace(/[^0-9.]/g, ''));
 let str = ramStr.toUpperCase();
 if (str.includes('G')) return Math.round(val * 1024);
 if (str.includes('M')) return Math.round(val);
 return Math.round(val);
}

function showToast(message, type = 'success') {
 const container = document.getElementById('toast-container');
 if (!container) return;
 if (container.children.length >= 3) container.removeChild(container.lastChild);
 let cleanMsg = message.replace(/^[^\x20-\x7E\xA0-\uD7FF\uE000-\uFFFD]+\s*/u, '').trim();
 const isSuccess = type === 'success';
 const isWarning = type === 'warning';
 const borderColor = isSuccess ? 'border-green-500/40' : isWarning ? 'border-yellow-500/40' : 'border-red-500/40';
 const iconBg = isSuccess ? 'bg-green-500/20 text-green-400' : isWarning ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400';
 const barColor = isSuccess ? 'bg-green-500' : isWarning ? 'bg-yellow-500' : 'bg-red-500';
 const icon = isSuccess ? '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : isWarning ? '!' : '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>';
 const toast = document.createElement('div');
 toast.className = `relative bg-[#1e293b] border ${borderColor} text-white px-3 py-2.5 rounded-xl flex items-center gap-2.5 shadow-2xl shadow-black/40 backdrop-blur-sm overflow-hidden`;
 toast.style.cssText = 'animation:toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1);';
 toast.innerHTML = `<div class="w-6 h-6 rounded-full ${iconBg} flex items-center justify-center font-black text-sm flex-shrink-0">${icon}</div><span class="text-[12px] font-semibold leading-snug flex-1">${cleanMsg}</span><button onclick="this.closest('.toast-item') ? this.closest('.toast-item').remove() : this.parentElement.remove()" class="text-slate-500 hover:text-white transition text-base leading-none flex-shrink-0 ml-0.5">×</button><div class="absolute bottom-0 left-0 h-[2px] ${barColor} toast-bar rounded-full" style="width:100%;transition:width 4s linear;"></div>`;
 container.insertBefore(toast, container.firstChild);
 requestAnimationFrame(() => { requestAnimationFrame(() => { const bar = toast.querySelector('.toast-bar'); if (bar) bar.style.width = '0%'; }); });
 const autoRemove = setTimeout(() => { toast.style.animation = 'toastOut 0.3s ease-in forwards'; setTimeout(() => toast.remove(), 300); }, 4200);
 toast.querySelector('button').addEventListener('click', () => { clearTimeout(autoRemove); toast.style.animation = 'toastOut 0.3s ease-in forwards'; setTimeout(() => toast.remove(), 300); });
}
function copyIp() { const ipEl = document.getElementById('stat-ip-text'); if(!ipEl) return; const ipText = ipEl.innerText; if (!ipText || ipText === 'Memuat...' || ipText === 'Offline') return; if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(ipText).then(() => showToast(' IP disalin', 'success')).catch(err => {}); } else { let textArea = document.createElement("textarea"); textArea.value = ipText; textArea.style.position = "fixed"; textArea.style.opacity = "0"; document.body.appendChild(textArea); textArea.focus(); textArea.select(); try { if (document.execCommand('copy')) showToast(' IP disalin', 'success'); } catch (err) {} document.body.removeChild(textArea); } }
function toggleMenu(event, menuId) { event.stopPropagation(); closeAllDropdowns(); const menu = document.getElementById(menuId); if (menu) menu.classList.remove('hidden'); } 
function closeAllDropdowns() { document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.add('hidden')); }

const _defaultTermVh = () => (window.innerWidth >= 768) ? 38 : 42;
let termZoomLevel = parseInt(localStorage.getItem('termZoomVh')) || _defaultTermVh();
function termZoom(delta) {
 termZoomLevel = Math.min(90, Math.max(15, termZoomLevel + delta));
 const wrapper = document.getElementById('terminal-wrapper');
 const label = document.getElementById('termZoomLabel');
 if (wrapper) wrapper.style.height = termZoomLevel + 'vh';
 if (label) label.textContent = termZoomLevel + 'vh';
 localStorage.setItem('termZoomVh', termZoomLevel);
}
function initTermZoom() {
 const wrapper = document.getElementById('terminal-wrapper');
 const label = document.getElementById('termZoomLabel');
 if (wrapper) wrapper.style.height = termZoomLevel + 'vh';
 if (label) label.textContent = termZoomLevel + 'vh';
}
function resetStopButton() { isStoppingServer = false; const stopBtn = document.getElementById('stopBtn'); if(stopBtn) { stopBtn.innerText = "Stop"; stopBtn.classList.remove('bg-red-800', 'hover:bg-red-700'); stopBtn.classList.add('bg-red-600', 'hover:bg-red-500'); } }

const formatMB = (mb) => { if (!mb || mb === 0) return '0 Bytes'; if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GiB'; return mb.toFixed(2) + ' MiB'; };
window.ramLimitMB = 2048; 

Chart.defaults.color = '#9ca3af'; Chart.defaults.font.family = 'Inter, sans-serif';
const MAX_DATA_POINTS = 32; 
let chartLabels = Array(MAX_DATA_POINTS).fill(''); let cpuData = Array(MAX_DATA_POINTS).fill(0); let ramData = Array(MAX_DATA_POINTS).fill(0); let diskData = Array(MAX_DATA_POINTS).fill(0);

// CONFIG GRAFIK: 120FPS + TEMBUS DINDING + ANGKA KIRI 
const commonChartOptions = { 
 responsive: true, 
 maintainAspectRatio: false, 
 animation: { duration: 1000, easing: 'linear' }, 
 events: [], 
 layout: { padding: { left: 0, right: 0, top: 10, bottom: 0 } }, 
 elements: { 
 point: { radius: 0, hitRadius: 0, hoverRadius: 0 }, 
 line: { tension: 0.4, borderWidth: 2 } 
 }, 
 scales: { 
 x: { display: false, min: 1, max: MAX_DATA_POINTS - 2 }, 
 y: { 
 beginAtZero: true, min: 0, border: { display: false }, 
 grid: { color: 'rgba(255, 255, 255, 0.05)', drawTicks: false }, 
 ticks: { count: 3, color: '#9ca3af', mirror: false, z: 10, padding: 10, font: { size: 11, weight: 'bold' } } 
 } 
 }, 
 plugins: { legend: { display: false }, tooltip: { enabled: false } }, 
 interaction: { mode: 'none' } 
};

let cpuChart, ramChart, diskChart;
const ctxCpu = document.getElementById('cpuChart'); if(ctxCpu) { cpuChart = new Chart(ctxCpu.getContext('2d'), { type: 'line', data: { labels: chartLabels, datasets: [{ data: cpuData, borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.15)', fill: true }] }, options: JSON.parse(JSON.stringify(commonChartOptions)) }); cpuChart.options.scales.y.max = 100; cpuChart.options.scales.y.ticks.callback = function(value) { return parseFloat(value).toFixed(2) + '%'; }; }
const ctxRam = document.getElementById('ramChart'); if(ctxRam) { ramChart = new Chart(ctxRam.getContext('2d'), { type: 'line', data: { labels: chartLabels, datasets: [{ data: ramData, borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.2)', fill: true }] }, options: JSON.parse(JSON.stringify(commonChartOptions)) }); ramChart.options.scales.y.max = currentServerRamMB; ramChart.options.scales.y.ticks.callback = function(value) { return value + 'MiB'; }; }
const ctxDisk = document.getElementById('diskChart'); if(ctxDisk) { diskChart = new Chart(ctxDisk.getContext('2d'), { type: 'line', data: { labels: chartLabels, datasets: [{ data: diskData, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.15)', fill: true }] }, options: JSON.parse(JSON.stringify(commonChartOptions)) }); diskChart.options.scales.y.max = 500; diskChart.options.scales.y.ticks.callback = function(value) { return value + 'MiB'; }; }

function getCleanMax(dataArray, minDefault, step) { let maxVal = Math.max(...dataArray); if (maxVal <= minDefault) return minDefault; return Math.ceil(maxVal / step) * step; }
async function syncDiskAndLimits() { try { const res = await fetch('/api/dashboard-stats?t=' + Date.now()); if (res.ok) { const data = await res.json(); window.ramLimitMB = data.ramTotal / (1024 * 1024); currentDiskUsedMB = data.diskUsed / (1024 * 1024); const diskText = document.getElementById('stat-disk-text'); if(diskText) diskText.innerHTML = `${formatMB(currentDiskUsedMB)}`; if (!isServerOnline && diskChart) { diskChart.options.scales.y.max = getCleanMax(diskData, 500, 500); diskChart.update(); } } } catch(e) {} }
syncDiskAndLimits(); setInterval(syncDiskAndLimits, 10000); 

setInterval(() => { const uptimeEl = document.getElementById('stat-uptime-text'); if(!uptimeEl) return; if (globalStartTime) { const diffMs = Date.now() - globalStartTime; if (diffMs < 5000) { uptimeEl.innerText = 'Starting'; return; } let totalSeconds = Math.floor(diffMs / 1000); let totalDays = Math.floor(totalSeconds / (3600 * 24)); let hours = Math.floor((totalSeconds % (3600 * 24)) / 3600); let minutes = Math.floor((totalSeconds % 3600) / 60); let seconds = totalSeconds % 60; if (totalDays > 0) uptimeEl.innerText = `${totalDays}d ${hours}h ${minutes}m`; else uptimeEl.innerText = `${hours}h ${minutes}m ${seconds}s`; } else { uptimeEl.innerText = 'Offline'; } }, 1000);

let lastStatsTick = Date.now();
let latestStats = { cpu: 0, ram: 0, netIn: 0, netOut: 0 };
let isTabActive = true;

document.addEventListener("visibilitychange", () => { isTabActive = !document.hidden; });

function formatNetBytes(bytes) {
 if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
 if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB';
 if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
 return bytes + ' B';
}

socket.on('stats', (data) => {
 lastStatsTick = Date.now(); 
 const ipText = document.getElementById('stat-ip-text'); if(ipText) { ipText.innerText = data.address; ipText.title = data.address; }
 globalStartTime = data.startTime; 
 const currentlyOnline = data.startTime !== null;

 if (currentlyOnline) {
 latestStats.cpu = parseFloat(data.cpu) || 0; latestStats.ram = parseFloat(data.ramMB) || 0;
 latestStats.netIn = parseFloat(data.netIn) || 0; latestStats.netOut = parseFloat(data.netOut) || 0;
 isServerOnline = true;
 } else {
 latestStats.cpu = 0; latestStats.ram = 0; latestStats.netIn = 0; latestStats.netOut = 0;
 resetStopButton();
 if (isServerOnline) {
 const terminal = document.getElementById('terminal');
 if (terminal) {
 const offlineWrapper = document.createElement('span');
 offlineWrapper.className = 'animate-log';
 offlineWrapper.innerHTML = `<span style="color: #eab308; font-weight: 900;">container@manz4vps~</span> <span style="color: #cbd5e1;">Server marked as offline...</span><br>`;
 terminal.appendChild(offlineWrapper);
 if (typeof smoothScrollToBottom === 'function') smoothScrollToBottom(true);
 }
 }
 isServerOnline = false;
 }
});

// ENGINE PENGGERAK UTAMA (BIAR TETEP MULUS & SINKRON) 
setInterval(() => {
 if (!isTabActive) return;

 const cpuText = document.getElementById('stat-cpu-text'); 
 const ramText = document.getElementById('stat-ram-text');
 const netInText = document.getElementById('stat-netin-text');
 const netOutText = document.getElementById('stat-netout-text');

 if (Date.now() - lastStatsTick > 10000 || !isServerOnline) {
 latestStats.cpu = 0; latestStats.ram = 0; latestStats.netIn = 0; latestStats.netOut = 0;
 if(cpuText) cpuText.innerHTML = `<span class="text-slate-400">Offline</span>`; 
 if(ramText) ramText.innerHTML = `<span class="text-slate-400">Offline</span>`;
 if(netInText) netInText.innerHTML = `<span class="text-slate-400">Offline</span>`;
 if(netOutText) netOutText.innerHTML = `<span class="text-slate-400">Offline</span>`;
 } else {
 if(cpuText) cpuText.innerHTML = `${latestStats.cpu.toFixed(2)}%`; 
 if(ramText) ramText.innerHTML = `${formatMB(latestStats.ram)}`;
 if(netInText) netInText.innerHTML = formatNetBytes(latestStats.netIn);
 if(netOutText) netOutText.innerHTML = formatNetBytes(latestStats.netOut);
 }

 cpuData.shift(); cpuData.push(latestStats.cpu); 
 ramData.shift(); ramData.push(latestStats.ram); 
 diskData.shift(); diskData.push(currentDiskUsedMB); 
 
 // FIX FINAL: Paksa durasi 1000ms biar jalannya ngalir mulus tanpa henti 
 if(cpuChart) { cpuChart.options.scales.y.max = getCleanMax(cpuData, 100, 50); cpuChart.update({duration: 1000, easing: 'linear'}); }
 if(ramChart) {
 let maxRamInChart = Math.max(...ramData);
 if (maxRamInChart > currentServerRamMB) { ramChart.options.scales.y.max = Math.ceil(maxRamInChart + 100); } 
 else { ramChart.options.scales.y.max = currentServerRamMB; }
 ramChart.update({duration: 1000, easing: 'linear'});
 }
 if(diskChart) { diskChart.options.scales.y.max = getCleanMax(diskData, 500, 500); diskChart.update({duration: 1000, easing: 'linear'}); }
}, 1000);

async function fetchVersions() { 
 if (window.startProgress) window.startProgress();
 const softEl = document.getElementById('vm-software'); if(!softEl) return; 
 const software = softEl.value; const versionSelect = document.getElementById('vm-version'); 
 if(versionSelect) versionSelect.innerHTML = '<option value=""> Memuat...</option>'; 
 try { 
 if (software === 'paper' || software === 'velocity' || software === 'waterfall') { 
 const res = await fetch(`https://fill.papermc.io/v3/projects/${software}?t=${Date.now()}`); 
 const data = await res.json(); 
 let versions = [];
 if (Array.isArray(data.versions)) { versions = data.versions; } else if (typeof data.versions === 'object' && data.versions !== null) { versions = Object.values(data.versions).flat(); }
 if (software === 'velocity') { versions = versions.filter(v => !v.toLowerCase().includes('snapshot') && !v.toLowerCase().includes('beta')); }
 versions.sort((a, b) => {
 const pa = a.replace(/[^0-9.]/g, '').split('.').map(Number); const pb = b.replace(/[^0-9.]/g, '').split('.').map(Number);
 for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const na = pa[i] || 0; const nb = pb[i] || 0; if (na !== nb) return nb - na; }
 return a.length - b.length;
 });
 if(versionSelect) versionSelect.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join(''); 
 } 
 else if (software === 'purpur') { 
 const res = await fetch(`https://api.purpurmc.org/v2/purpur?t=${Date.now()}`); 
 const data = await res.json(); 
 let versions = data.versions || [];
 versions.sort((a, b) => {
 const pa = a.replace(/[^0-9.]/g, '').split('.').map(Number); const pb = b.replace(/[^0-9.]/g, '').split('.').map(Number);
 for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const na = pa[i] || 0; const nb = pb[i] || 0; if (na !== nb) return nb - na; }
 return a.length - b.length;
 });
 if(versionSelect) versionSelect.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join(''); 
 } 
 else if (software === 'geyser') { if(versionSelect) versionSelect.innerHTML = '<option value="latest">Latest Release (Geyser)</option>'; } 
 } catch(e) { if(versionSelect) versionSelect.innerHTML = '<option value=""> Gagal memuat API.</option>'; } finally { if (window.finishProgress) window.finishProgress(); }
}

const tabVisited = new Set();


let pendingInstallConfig = null;
async function prepareInstall() { const cat = document.getElementById('vm-category').value; const software = document.getElementById('vm-software').value; if (cat === 'bot') { document.getElementById('set-engine').value = software; document.getElementById('set-jar').value = software === 'node' ? 'index.js' : 'main.py'; await saveSettings(); showToast(`Environment diubah!`); showTab('startup'); return; } const version = document.getElementById('vm-version').value; if (!version) return showToast('Pilih versi dulu!', 'error'); pendingInstallConfig = { software, version }; if(document.getElementById('installVersionName')) document.getElementById('installVersionName').innerText = `${software.toUpperCase()} ${version}`; document.getElementById('installConfirmModal').classList.remove('hidden'); }

async function executeInstall(type) { 
 document.getElementById('installConfirmModal').classList.add('hidden'); if (!pendingInstallConfig) return; 
 const { software, version } = pendingInstallConfig; const btn = document.getElementById('vm-install-btn'); if(btn) btn.disabled = true; const startBtn = document.getElementById('startBtn'); if(startBtn) startBtn.disabled = true; let downloadUrl = ''; let versionName = `${software.toUpperCase()} ${version}`; showToast(`Mencari link build terbaru...`); 
 if (window.startProgress) window.startProgress();
 try { 
 if (software === 'paper' || software === 'velocity' || software === 'waterfall') { 
 const res = await fetch(`https://fill.papermc.io/v3/projects/${software}/versions/${version}/builds?t=${Date.now()}`); 
 const buildsData = await res.json(); 
 const builds = Array.isArray(buildsData) ? buildsData : buildsData.builds;
 const latestBuild = builds.reduce((prev, curr) => (curr.build > prev.build) ? curr : prev, builds[0]);
 let dlKey = latestBuild.downloads['server:default'] ? 'server:default' : Object.keys(latestBuild.downloads)[0];
 downloadUrl = latestBuild.downloads[dlKey].url; 
 } 
 else if (software === 'purpur') { downloadUrl = `https://api.purpurmc.org/v2/purpur/${version}/latest/download`; } 
 else if (software === 'geyser') { downloadUrl = `https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/standalone`; } 
 socket.emit('download_jar', downloadUrl, versionName, type === 'clean'); 
 if(document.getElementById('set-jar')) document.getElementById('set-jar').value = 'server.jar'; 
 if(document.getElementById('set-engine')) document.getElementById('set-engine').value = 'java'; 
 await saveSettings(); 
 } catch(e) { showToast('Gagal memproses URL.', 'error'); if(btn) btn.disabled = false; if(startBtn) startBtn.disabled = false; } finally { if (window.finishProgress) window.finishProgress(); }
}

async function loadSettings(forceRefresh = false) { 
 if (window.startProgress) window.startProgress();
 try { 
 if (!settingsCache || forceRefresh) { const res = await fetch('/api/settings'); if (res.status === 401) return window.location.href = "/"; settingsCache = await res.json(); }
 const data = settingsCache;
 if(data.ram && document.getElementById('set-ram')) {
 document.getElementById('set-ram').value = data.ram; currentServerRamMB = parseRamToMB(data.ram);
 if (ramChart) { let maxRamInChart = Math.max(...ramData); if (maxRamInChart > currentServerRamMB) { ramChart.options.scales.y.max = Math.ceil(maxRamInChart + 100); } else { ramChart.options.scales.y.max = currentServerRamMB; } ramChart.update({duration: 1000, easing: 'linear'}); }
 }
 if(data.jarFile && document.getElementById('set-jar')) document.getElementById('set-jar').value = data.jarFile; 
 const activeJarEl = document.getElementById('current-active-jar'); if(activeJarEl) { activeJarEl.innerText = data.installedVersion || data.jarFile || 'Unknown'; } 
 if(data.ip && document.getElementById('set-ip')) document.getElementById('set-ip').value = data.ip; 
 if(data.port && document.getElementById('set-port')) document.getElementById('set-port').value = data.port; 
 if(data.engine) { 
 if(document.getElementById('set-engine')) document.getElementById('set-engine').value = data.engine; 
 const activeEngEl = document.getElementById('current-active-engine'); if(activeEngEl) activeEngEl.innerText = data.engine.toUpperCase(); 
 const catEl = document.getElementById('vm-category'); const softEl = document.getElementById('vm-software'); 
 if(catEl && softEl) { if(data.engine === 'node' || data.engine === 'python') { catEl.value = 'bot'; updateSubCategory(); softEl.value = data.engine; } else { catEl.value = 'mc-java'; updateSubCategory(); } } 
 }
 if(document.getElementById('set-java-version')) {
 const jv = data.javaVersion || 'auto';
 document.getElementById('set-java-version').value = jv;
 }
 setAutoStartUI(data.autoStart === true);
 updateCommandPreview(); 
 } catch(e) {} finally { if (window.finishProgress) window.finishProgress(); }
}

let _autoStartValue = false;
function setAutoStartUI(enabled) {
 _autoStartValue = enabled;
 const btn = document.getElementById('autoStartToggle');
 const knob = document.getElementById('autoStartKnob');
 if (!btn || !knob) return;
 if (enabled) {
 btn.classList.replace('bg-slate-600', 'bg-blue-600');
 knob.classList.replace('translate-x-1', 'translate-x-8');
 btn.setAttribute('aria-pressed', 'true');
 } else {
 btn.classList.replace('bg-blue-600', 'bg-slate-600');
 knob.classList.replace('translate-x-8', 'translate-x-1');
 btn.setAttribute('aria-pressed', 'false');
 }
}
function toggleAutoStart() {
 setAutoStartUI(!_autoStartValue);
}

async function saveSettings() { 
 if (window.startProgress) window.startProgress();
 try { 
 const ramInput = document.getElementById('set-ram') ? document.getElementById('set-ram').value : (settingsCache ? settingsCache.ram : '2G'); const newEngine = document.getElementById('set-engine') ? document.getElementById('set-engine').value : (settingsCache ? settingsCache.engine : 'java'); const newJar = document.getElementById('set-jar') ? document.getElementById('set-jar').value : (settingsCache ? settingsCache.jarFile : 'server.jar'); const newIp = document.getElementById('set-ip') ? document.getElementById('set-ip').value : (settingsCache ? settingsCache.ip : ''); const newPort = document.getElementById('set-port') ? document.getElementById('set-port').value : (settingsCache ? settingsCache.port : '25565'); const newJavaVer = document.getElementById('set-java-version') ? document.getElementById('set-java-version').value : (settingsCache ? (settingsCache.javaVersion || 'auto') : 'auto');
 await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: newEngine, ram: ramInput, jarFile: newJar, ip: newIp, port: newPort, autoStart: _autoStartValue, javaVersion: newJavaVer }) }); 
 settingsCache = { engine: newEngine, ram: ramInput, jarFile: newJar, ip: newIp, port: newPort, autoStart: _autoStartValue, javaVersion: newJavaVer, installedVersion: settingsCache ? settingsCache.installedVersion : '' };
 currentServerRamMB = parseRamToMB(ramInput);
 if (ramChart) { let maxRamInChart = Math.max(...ramData); if (maxRamInChart > currentServerRamMB) { ramChart.options.scales.y.max = Math.ceil(maxRamInChart + 100); } else { ramChart.options.scales.y.max = currentServerRamMB; } ramChart.update({duration: 1000, easing: 'linear'}); }
 showToast('Tersimpan!'); updateCommandPreview(); 
 } catch(e) {} finally { if (window.finishProgress) window.finishProgress(); }
}

function showTab(tab, addToHistory = true, forceRefresh = false) {
 if (window.startProgress) window.startProgress(); 
 
 ['console', 'files', 'versions', 'plugins', 'network', 'startup', 'settings', 'edit'].forEach(t => { 
 const view = document.getElementById(t === 'edit' ? 'fileEditor' : `${t}-view`); const tabBtns = document.querySelectorAll(`.tab-btn-${t}`); 
 if(view) { if (t === tab) { view.style.display = 'block'; } else { view.style.display = 'none'; } } 
 tabBtns.forEach(btn => {
 if (t === tab || (tab === 'edit' && t === 'files')) {
 btn.className = `tab-btn-${t} w-full text-left px-5 py-4 rounded-xl bg-blue-600 text-white font-bold flex items-center gap-4 transition-colors duration-200 shadow-lg shadow-blue-500/20 text-lg`;
 const svg = btn.querySelector('svg'); if (svg) svg.classList.replace('opacity-70', 'opacity-100');
 } else {
 btn.className = `tab-btn-${t} w-full text-left px-5 py-4 rounded-xl text-slate-400 font-bold hover:bg-slate-800 hover:text-white flex items-center gap-4 transition-colors duration-200 text-lg`;
 const svg = btn.querySelector('svg'); if (svg) svg.classList.replace('opacity-100', 'opacity-70');
 }
 });
 });
 const isFirstVisit = !tabVisited.has(tab) || forceRefresh;
 if (tab !== 'edit') tabVisited.add(tab);
 if (tab !== 'files' && tab !== 'edit') { const bar = document.getElementById('pteroFloatingBar'); if(bar) { bar.classList.add('translate-y-20', 'opacity-0'); setTimeout(() => { if(bar) bar.classList.add('hidden'); }, 300); } } else if (tab === 'files' && typeof loadFiles === 'function') { if (!window._skipFileReset) { if (typeof currentPath !== 'undefined') currentPath = ''; if (typeof folderCache !== 'undefined') { Object.keys(folderCache).forEach(k => delete folderCache[k]); } loadFiles('', true); } window._skipFileReset = false; }
 if((tab === 'startup' || tab === 'network' || tab === 'settings') && isFirstVisit) loadSettings();
 if(tab === 'plugins' && isFirstVisit) { pmInitMcVersions(); pmFetchPlugins(1); }
 if(tab === 'versions') { const vmCat = document.getElementById('vm-category'); if(document.getElementById('vm-software') && document.getElementById('vm-software').options.length === 0) updateSubCategory(); }
 if (addToHistory && tab !== 'files' && tab !== 'edit' && window.location.hash !== '#' + tab) history.pushState({ tab: tab }, '', '#' + tab);
 if (tab === 'edit' && typeof editor !== 'undefined' && editor) setTimeout(() => { editor.refresh(); }, 150);
 if (tab === 'console' && typeof smoothScrollToBottom === 'function') setTimeout(() => smoothScrollToBottom(true), 80);
 setTimeout(() => { if (window.finishProgress) window.finishProgress(); }, 150);
}

window.addEventListener('popstate', (event) => { let hash = window.location.hash.replace('#', ''); if (hash.startsWith('edit/') || hash.startsWith('files')) { return; } else if (['console', 'versions', 'plugins', 'network', 'startup', 'settings'].includes(hash)) { showTab(hash, false); } else if (hash === '') { showTab('console', false); } });
window.onload = async () => {
 let hashFull = window.location.hash.replace('#', ''); let initialTab = 'console';
 let restoredFilesPath = '';
 if (hashFull.startsWith('files')) { initialTab = 'files'; let path = hashFull.replace('files', ''); if (path.startsWith('/')) path = path.substring(1); restoredFilesPath = path; if(typeof currentPath !== 'undefined') currentPath = path; }
 else if (hashFull.startsWith('edit/')) { initialTab = 'edit'; } else if (['versions', 'plugins', 'network', 'startup', 'settings'].includes(hashFull)) { initialTab = hashFull; } else { initialTab = 'console'; }
 history.replaceState(null, '', '#' + (hashFull || initialTab));
 if (initialTab === 'files') window._skipFileReset = true;
 showTab(initialTab, false);
 if (initialTab === 'files' && typeof currentPath !== 'undefined') currentPath = restoredFilesPath;
 initTermZoom();
 // Hide loader immediately — don't wait for API calls
 const loader = document.getElementById('page-loader');
 if (loader) { loader.style.transition = 'opacity 0.15s'; loader.style.opacity = '0'; setTimeout(() => loader.classList.add('hidden'), 150); }
 // Load settings in background after UI is visible
 try {
 await loadSettings();
 if (initialTab === 'files' && typeof loadFiles === 'function') loadFiles(typeof currentPath !== 'undefined' ? currentPath : '', false);
 if (initialTab === 'edit' && typeof openFile === 'function') { let filePath = hashFull.replace('edit/', ''); if(typeof currentPath !== 'undefined') currentPath = filePath.substring(0, filePath.lastIndexOf('/')) || ''; openFile(filePath, filePath.split('/').pop(), false); }
 } catch(e) {}
};

function updateCommandPreview() { const engineEl = document.getElementById('set-engine'); const ramEl = document.getElementById('set-ram'); const jarEl = document.getElementById('set-jar'); const previewEl = document.getElementById('cmd-preview'); if(!engineEl || !previewEl) return; const engine = engineEl.value || 'java'; const ram = ramEl ? (ramEl.value || '2G') : '2G'; const jar = jarEl ? (jarEl.value || 'server.jar') : 'server.jar'; let cmd = ''; if (engine === 'node') cmd = `node ${jar}`; else if (engine === 'python') cmd = `python3 ${jar}`; else cmd = `java -Xmx${ram} -Xms128M -jar ${jar} nogui`; previewEl.innerText = cmd; }
const softwareData = { 'mc-java': [ {id: 'paper', name: 'PaperMC (Ringan)'}, {id: 'purpur', name: 'Purpur'} ], 'proxy': [ {id: 'velocity', name: 'Velocity'}, {id: 'waterfall', name: 'Waterfall'} ], 'bedrock': [ {id: 'geyser', name: 'GeyserMC'} ], 'bot': [ {id: 'node', name: 'Node.js'}, {id: 'python', name: 'Python 3'} ] };
function updateSubCategory() { if (window.startProgress) window.startProgress(); const cat = document.getElementById('vm-category').value; const softSelect = document.getElementById('vm-software'); if(softSelect) softSelect.innerHTML = softwareData[cat].map(s => `<option value="${s.id}">${s.name}</option>`).join(''); const javaSection = document.getElementById('java-version-section'); if (cat === 'bot') { if(document.getElementById('vm-version-container')) document.getElementById('vm-version-container').classList.add('hidden'); if(document.getElementById('vm-install-btn')) document.getElementById('vm-install-btn').innerText = ' SETUP ENVIRONMENT INI'; if(javaSection) javaSection.classList.add('hidden'); if (window.finishProgress) window.finishProgress(); } else { if(document.getElementById('vm-version-container')) document.getElementById('vm-version-container').classList.remove('hidden'); if(document.getElementById('vm-install-btn')) document.getElementById('vm-install-btn').innerText = ' INSTALL VERSI INI'; if(javaSection) javaSection.classList.remove('hidden'); fetchVersions(); } }

/* =========================================
 PLUGIN MANAGER (Pterodactyl-style)
 ========================================= */
let _pmSearchTimeout;
let _pmCurrentPage = 1;
let _pmInstallMeta = null;
let _pmInstallVersions = [];
let _pmShowingInstalled = false;

function pmDebounceSearch() { clearTimeout(_pmSearchTimeout); _pmSearchTimeout = setTimeout(() => pmFetchPlugins(1), 500); }
function pmOnFilterChange() { pmFetchPlugins(1); }

async function pmInitMcVersions() {
 const sel = document.getElementById('pm-mcversion');
 if (!sel || sel.options.length > 1) return;
 try {
  const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
  const tags = await res.json();
  const releaseVersions = tags.filter(t => t.version_type === 'release' && /^\d+\.\d+/.test(t.version));
  releaseVersions.forEach(t => {
   const opt = document.createElement('option');
   opt.value = t.version; opt.textContent = t.version;
   sel.appendChild(opt);
  });
 } catch(e) {}
}

async function pmFetchPlugins(page) {
 const provider = document.getElementById('pm-provider')?.value || 'modrinth';
 if (provider === 'curseforge' || provider === 'polymart') {
  const res = document.getElementById('pm-results');
  const pag = document.getElementById('pm-pagination');
  if(res) res.innerHTML = `<div class="text-center py-16"><p class="text-slate-300 font-bold text-base mb-2">${provider === 'curseforge' ? 'CurseForge' : 'Polymart'} membutuhkan API Key</p><p class="text-slate-500 text-sm">Provider ini tidak memiliki akses publik gratis.<br>Gunakan <span class="text-green-400 font-bold">Modrinth</span>, <span class="text-blue-400 font-bold">SpigotMC</span>, atau <span class="text-orange-400 font-bold">Hangar</span>.</p></div>`;
  if(pag) pag.innerHTML = '';
  return;
 }
 _pmCurrentPage = page || 1;
 const pageSize = parseInt(document.getElementById('pm-pagesize')?.value || '50');
 const loader = document.getElementById('pm-loader')?.value || '';
 const mcVersion = document.getElementById('pm-mcversion')?.value || '';
 const query = document.getElementById('pm-search')?.value.trim() || '';
 const offset = (_pmCurrentPage - 1) * pageSize;
 const resultsDiv = document.getElementById('pm-results');
 const paginationDiv = document.getElementById('pm-pagination');
 if (resultsDiv) resultsDiv.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm animate-pulse">Memuat plugin...</div>';
 if (paginationDiv) paginationDiv.innerHTML = '';
 if (window.startProgress) window.startProgress();
 try {
  if (provider === 'modrinth') {
   let facets = [['project_type:plugin']];
   if (loader) facets.push([`categories:${loader}`]);
   if (mcVersion) facets.push([`versions:${mcVersion}`]);
   const facetsStr = encodeURIComponent(JSON.stringify(facets));
   const index = query ? 'relevance' : 'downloads';
   const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${facetsStr}&index=${index}&limit=${pageSize}&offset=${offset}`;
   const res = await fetch(url);
   const data = await res.json();
   const normalized = (data.hits || []).map(p => ({ project_id: p.project_id, title: p.title, description: p.description, icon_url: p.icon_url, ext_url: `https://modrinth.com/plugin/${p.slug || p.project_id}`, _provider: 'modrinth' }));
   pmRenderList(normalized, data.total_hits || 0, _pmCurrentPage, pageSize);
  } else if (provider === 'spigotmc') {
   const pageNum = _pmCurrentPage - 1;
   let url;
   if (query) {
    url = `https://api.spiget.org/v2/search/resources/${encodeURIComponent(query)}?size=${pageSize}&page=${pageNum}&sort=-downloads&fields=id,name,tag,author,icon,file,premium`;
   } else {
    url = `https://api.spiget.org/v2/resources/free?size=${pageSize}&page=${pageNum}&sort=-downloads&fields=id,name,tag,author,icon,file,premium`;
   }
   const res = await fetch(url, { headers: { 'User-Agent': 'Manz4VPS-Panel' } });
   const data = await res.json();
   const list = Array.isArray(data) ? data : (data.resources || []);
   const totalRes = await fetch(`https://api.spiget.org/v2/${query ? `search/resources/${encodeURIComponent(query)}/` : 'resources/free/'}count`, { headers: { 'User-Agent': 'Manz4VPS-Panel' } }).then(r => r.json()).catch(() => list.length);
   const total = typeof totalRes === 'number' ? totalRes : list.length;
   const normalized = list.map(p => ({ project_id: String(p.id), title: p.name, description: p.tag || '', icon_url: p.icon && p.icon.url ? (p.icon.url.startsWith('http') ? p.icon.url : `https://www.spigotmc.org/${p.icon.url}`) : '', ext_url: `https://www.spigotmc.org/resources/${p.id}`, _provider: 'spigotmc', _premium: p.premium }));
   pmRenderList(normalized, total, _pmCurrentPage, pageSize);
  } else if (provider === 'hangar') {
   const url = `https://hangar.papermc.io/api/v1/projects?q=${encodeURIComponent(query)}&limit=${pageSize}&offset=${offset}`;
   const res = await fetch(url, { headers: { 'User-Agent': 'Manz4VPS-Panel' } });
   const data = await res.json();
   const normalized = (data.result || []).map(p => ({ project_id: `${p.namespace.owner}/${p.namespace.slug}`, title: p.name, description: p.description, icon_url: p.iconUrl || '', ext_url: `https://hangar.papermc.io/${p.namespace.owner}/${p.namespace.slug}`, _provider: 'hangar' }));
   pmRenderList(normalized, data.pagination?.count || normalized.length, _pmCurrentPage, pageSize);
  }
 } catch(e) {
  if(resultsDiv) resultsDiv.innerHTML = `<div class="text-center py-10 text-red-400 font-bold">Gagal mengambil data. Coba lagi.</div>`;
 } finally {
  if (window.finishProgress) window.finishProgress();
 }
}

function pmRenderList(hits, total, page, pageSize) {
 const resultsDiv = document.getElementById('pm-results');
 const paginationDiv = document.getElementById('pm-pagination');
 if (!resultsDiv) return;
 if (hits.length === 0) {
  resultsDiv.innerHTML = '<div class="text-center py-16 text-slate-500 font-bold">Plugin tidak ditemukan. Coba kata kunci atau filter lain.</div>';
  if(paginationDiv) paginationDiv.innerHTML = '';
  return;
 }
 resultsDiv.innerHTML = hits.map(p => {
  const icon = p.icon_url ? `<img src="${p.icon_url}" class="w-9 h-9 rounded-lg object-cover bg-slate-900 border border-slate-700 shrink-0" onerror="this.style.display='none'">` : `<div class="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center text-slate-500"></div>`;
  const safeTitle = p.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const safeId = p.project_id.replace(/'/g, "\\'");
  const premium = p._premium ? `<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 uppercase tracking-widest shrink-0">PREMIUM</span>` : '';
  return `<div class="flex items-center gap-3 bg-[#1e293b] border border-slate-700/60 hover:border-slate-600 px-4 py-3 rounded-xl transition">
   ${icon}
   <div class="flex-1 min-w-0">
    <div class="flex items-center gap-1.5 flex-wrap">
     <span class="font-bold text-white text-sm truncate">${p.title}</span>${premium}
     <a href="${p.ext_url}" target="_blank" class="text-slate-500 hover:text-blue-400 transition shrink-0"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>
    </div>
    <p class="text-xs text-slate-400 truncate mt-0.5">${p.description || ''}</p>
   </div>
   <button onclick="pmOpenInstallModal('${safeId}','${safeTitle}')" class="shrink-0 text-slate-400 hover:text-blue-400 transition p-1.5 rounded-lg hover:bg-slate-700/50 active:scale-90" title="Install">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
   </button>
  </div>`;
 }).join('');
 if (paginationDiv) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { paginationDiv.innerHTML = ''; return; }
  const maxVisible = 6;
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, startPage + maxVisible - 1);
  let pages = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);
  const btnClass = p => p === page ? 'w-9 h-9 rounded-lg font-black text-sm bg-blue-600 text-white shadow' : 'w-9 h-9 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 transition active:scale-95';
  paginationDiv.innerHTML =
   (page > 1 ? `<button onclick="pmFetchPlugins(${page-1})" class="w-9 h-9 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 transition active:scale-95">&lt;</button>` : '') +
   pages.map(p => `<button onclick="pmFetchPlugins(${p})" class="${btnClass(p)}">${p}</button>`).join('') +
   (page < totalPages ? `<button onclick="pmFetchPlugins(${page+1})" class="w-9 h-9 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 transition active:scale-95">&gt;</button>` : '');
 }
}

async function pmOpenInstallModal(projectId, title) {
 const provider = document.getElementById('pm-provider')?.value || 'modrinth';
 _pmInstallMeta = { project_id: projectId, title, provider };
 _pmInstallVersions = [];
 const modal = document.getElementById('pluginInstallModal');
 const nameEl = document.getElementById('pim-name');
 const sel = document.getElementById('pim-version-select');
 const loadingEl = document.getElementById('pim-loading');
 if (!modal || !sel) return;
 if (nameEl) nameEl.textContent = title;
 const providerSpan = document.getElementById('pim-provider');
 if (providerSpan) providerSpan.textContent = provider;
 sel.innerHTML = '';
 sel.disabled = true;
 if (loadingEl) { loadingEl.style.display = 'flex'; sel.style.display = 'none'; }
 modal.classList.remove('hidden');
 try {
  if (provider === 'modrinth') {
   const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
   const versions = await res.json();
   const modLoaders = ['fabric','neoforge','forge','quilt'];
   const filtered = versions.filter(v => { const ls = (v.loaders||[]).map(l=>l.toLowerCase()); return !ls.every(l=>modLoaders.includes(l)); });
   const list = filtered.length > 0 ? filtered : versions;
   _pmInstallVersions = list.map(v => { const f = _pmGetBestFile(v.files); return f ? { label: v.version_number, url: f.url, filename: f.filename } : null; }).filter(Boolean);
  } else if (provider === 'spigotmc') {
   const res = await fetch(`https://api.spiget.org/v2/resources/${projectId}/versions?size=20&page=0&sort=-name`, { headers: { 'User-Agent': 'Manz4VPS-Panel' } });
   const versions = await res.json();
   const safeName = title.replace(/[^a-zA-Z0-9\-_.]/g, '_').substring(0, 40);
   _pmInstallVersions = (Array.isArray(versions) ? versions : []).map(v => ({ label: v.name || String(v.id), url: `https://api.spiget.org/v2/resources/${projectId}/versions/${v.id}/download`, filename: `${safeName}-${(v.name||v.id).replace(/[^a-zA-Z0-9\-_.]/g,'_')}.jar` }));
   if (_pmInstallVersions.length === 0) {
    _pmInstallVersions = [{ label: 'Latest', url: `https://api.spiget.org/v2/resources/${projectId}/download`, filename: `${safeName}-latest.jar` }];
   }
  } else if (provider === 'hangar') {
   const [owner, slug] = projectId.split('/');
   const res = await fetch(`https://hangar.papermc.io/api/v1/projects/${owner}/${slug}/versions?limit=20&offset=0`, { headers: { 'User-Agent': 'Manz4VPS-Panel' } });
   const data = await res.json();
   const versions = data.result || [];
   _pmInstallVersions = versions.map(v => {
    const platform = v.downloads && (v.downloads.PAPER || v.downloads.VELOCITY || v.downloads.WATERFALL);
    const dlUrl = platform?.downloadUrl || `https://hangar.papermc.io/api/v1/projects/${owner}/${slug}/versions/${encodeURIComponent(v.name)}/PAPER/download`;
    const filename = (platform?.fileInfo?.name) || `${slug}-${v.name.replace(/[^a-zA-Z0-9\-_.]/g,'_')}.jar`;
    return { label: v.name, url: dlUrl, filename };
   });
  }
  if (_pmInstallVersions.length === 0) {
   sel.innerHTML = '<option disabled>Tidak ada versi tersedia</option>';
  } else {
   sel.innerHTML = _pmInstallVersions.map((v, i) => `<option value="${i}">${v.label}</option>`).join('');
  }
 } catch(e) {
  sel.innerHTML = '<option disabled>Gagal memuat versi</option>';
 } finally {
  sel.disabled = false;
  if (loadingEl) { loadingEl.style.display = 'none'; sel.style.display = ''; }
 }
}

async function pmInstallSelected() {
 const sel = document.getElementById('pim-version-select');
 if (!sel || !_pmInstallVersions.length) return;
 const idx = parseInt(sel.value) || 0;
 const version = _pmInstallVersions[idx];
 if (!version) return;
 document.getElementById('pluginInstallModal').classList.add('hidden');
 showToast(`Memproses ${version.filename}...`);
 socket.emit('download_plugin', version.url, version.filename);
 if (_pmInstallMeta) {
  try {
   await fetch('/api/plugin-meta', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ filename: version.filename, meta: { source: _pmInstallMeta.provider, project_id: _pmInstallMeta.project_id, title: _pmInstallMeta.title } }) });
  } catch(e) {}
  _pmInstallMeta = null;
 }
}

function _pmGetBestFile(files) {
 if (!files || files.length === 0) return null;
 const n = f => f.filename.toLowerCase();
 const primary = files.find(f => !n(f).includes('fabric') && !n(f).includes('neoforge') && !n(f).includes('-forge') && f.primary);
 if (primary) return primary;
 const any = files.find(f => !n(f).includes('fabric') && !n(f).includes('neoforge') && !n(f).includes('-forge'));
 return any || files.find(f => f.primary) || files[0];
}

function pmToggleInstalled() {
 _pmShowingInstalled = !_pmShowingInstalled;
 const res = document.getElementById('pm-results');
 const pag = document.getElementById('pm-pagination');
 const ins = document.getElementById('pm-installed-results');
 const btn = document.getElementById('pm-installed-btn');
 if (_pmShowingInstalled) {
  if(res) res.classList.add('hidden');
  if(pag) pag.classList.add('hidden');
  if(ins) ins.classList.remove('hidden');
  if(btn) btn.className = 'bg-slate-600 hover:bg-slate-500 px-5 py-2 rounded-lg font-black text-sm text-white shadow transition active:scale-95';
  pmLoadInstalled();
 } else {
  if(res) res.classList.remove('hidden');
  if(pag) pag.classList.remove('hidden');
  if(ins) ins.classList.add('hidden');
  if(btn) btn.className = 'bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded-lg font-black text-sm text-white shadow transition active:scale-95';
 }
}

async function pmLoadInstalled() {
 const ins = document.getElementById('pm-installed-results');
 if (!ins) return;
 ins.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm animate-pulse">Membaca folder plugins/ ...</div>';
 await fetch('/api/folder', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: 'plugins' }) }).catch(()=>{});
 try {
  const res = await fetch('/api/files?path=plugins');
  const files = await res.json();
  const jars = files.filter(f => !f.isDirectory && f.name.endsWith('.jar'));
  if (jars.length === 0) { ins.innerHTML = '<div class="text-center py-16 text-slate-500 font-bold">Belum ada plugin yang terpasang.</div>'; return; }
  ins.innerHTML = jars.map(jar => `<div class="flex items-center gap-3 bg-[#1e293b] border border-slate-700/60 px-4 py-3 rounded-xl">
   <div class="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center text-slate-500 text-lg"></div>
   <div class="flex-1 min-w-0">
    <p class="font-bold text-white text-sm truncate">${jar.name}</p>
    <p class="text-xs text-slate-500 mt-0.5">${jar.size}</p>
   </div>
  </div>`).join('');
 } catch(e) {
  ins.innerHTML = '<div class="text-center py-10 text-red-400 font-bold">Gagal membaca folder plugins.</div>';
 }
}
socket.on('download_lock_state', (isDownloading) => { const startBtn = document.getElementById('startBtn'); const vmBtn = document.getElementById('vm-install-btn'); if (isDownloading) { if(startBtn) { startBtn.disabled = true; startBtn.innerText = "..."; } if(vmBtn) { vmBtn.disabled = true; vmBtn.innerText = "..."; } } else { if(startBtn) { startBtn.disabled = false; startBtn.innerText = "Start"; } if(vmBtn) { vmBtn.disabled = false; vmBtn.innerText = " INSTALL VERSI INI"; } } });
socket.on('download_success_toast', () => { showToast('Berhasil Mengunduh!'); }); 
socket.on('plugin_success_toast', (name) => { showToast(`Plugin ${name} terinstall!`); });
function deleteAccount() { document.getElementById('genericModalTitle').innerText = 'Hapus Akun Permanen?'; document.getElementById('genericModalMsg').innerHTML = 'Semua server, file, dan akun kamu akan <b>Dihapus Tanpa Sisa</b>. Yakin?'; const modal = document.getElementById('genericModal'); modal.classList.remove('hidden'); document.getElementById('genericConfirmBtn').onclick = async () => { modal.classList.add('hidden'); showToast('Sedang menghapus akun...', 'error'); try { const res = await fetch('/api/delete-account', { method: 'POST' }); if(res.ok) { window.location.href = '/'; } else { showToast('Gagal menghapus', 'error'); } } catch(e) { showToast('Koneksi Error', 'error'); } }; }
document.addEventListener('DOMContentLoaded', () => { const cmdInput = document.getElementById('cmdInput'); if (cmdInput) { cmdInput.addEventListener('focus', function() { setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }, 300); }); } });
