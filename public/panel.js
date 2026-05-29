/* =========================================
   ⚙️ MODULE: PANEL CORE & SETTINGS (FRONTEND)
   ========================================= */
const socket = io();
let globalStartTime = null; 
let isServerOnline = false;
let currentDiskUsedMB = 0;
let isStoppingServer = false; 

let settingsCache = null;
let currentServerRamMB = 2048; 

function parseRamToMB(ramStr) {
    if (!ramStr) return 2048;
    let val = parseFloat(ramStr.replace(/[^0-9.]/g, ''));
    let str = ramStr.toUpperCase();
    if (str.includes('G')) return Math.round(val * 1024);
    if (str.includes('M')) return Math.round(val);
    return Math.round(val);
}

function showToast(message, type = 'success') { const container = document.getElementById('toast-container'); if(!container) return; if (container.children.length >= 5) container.removeChild(container.firstChild); const toast = document.createElement('div'); const bgColor = type === 'success' ? 'bg-green-600' : 'bg-red-600'; const icon = type === 'success' ? '✅' : '⚠️'; let cleanMsg = message.replace(/^[✅⚠️❌]\s*/, ''); toast.className = `${bgColor} text-white p-4 rounded-xl flex items-center gap-3 font-bold toast-animate shadow-xl z-[999]`; toast.innerHTML = `<span class="text-xl">${icon}</span> <span class="text-sm">${cleanMsg}</span>`; container.appendChild(toast); setTimeout(() => { toast.classList.add('toast-fade'); setTimeout(() => toast.remove(), 500); }, 3000); }
function copyIp() { const ipEl = document.getElementById('stat-ip-text'); if(!ipEl) return; const ipText = ipEl.innerText; if (!ipText || ipText === 'Memuat...' || ipText === 'Offline') return; if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(ipText).then(() => showToast('📋 IP disalin', 'success')).catch(err => {}); } else { let textArea = document.createElement("textarea"); textArea.value = ipText; textArea.style.position = "fixed"; textArea.style.opacity = "0"; document.body.appendChild(textArea); textArea.focus(); textArea.select(); try { if (document.execCommand('copy')) showToast('📋 IP disalin', 'success'); } catch (err) {} document.body.removeChild(textArea); } }
function toggleMenu(event, menuId) { event.stopPropagation(); closeAllDropdowns(); const menu = document.getElementById(menuId); if (menu) menu.classList.remove('hidden'); } 
function closeAllDropdowns() { document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.add('hidden')); }
function resetStopButton() { isStoppingServer = false; const stopBtn = document.getElementById('stopBtn'); if(stopBtn) { stopBtn.innerText = "Stop"; stopBtn.classList.remove('bg-red-800', 'hover:bg-red-700'); stopBtn.classList.add('bg-red-600', 'hover:bg-red-500'); } }

const formatMB = (mb) => { if (!mb || mb === 0) return '0 Bytes'; if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GiB'; return mb.toFixed(2) + ' MiB'; };
window.ramLimitMB = 2048; 

Chart.defaults.color = '#9ca3af'; Chart.defaults.font.family = 'Inter, sans-serif';
const MAX_DATA_POINTS = 32; 
let chartLabels = Array(MAX_DATA_POINTS).fill(''); let cpuData = Array(MAX_DATA_POINTS).fill(0); let ramData = Array(MAX_DATA_POINTS).fill(0); let diskData = Array(MAX_DATA_POINTS).fill(0);

// 🔥 CONFIG GRAFIK: 120FPS + TEMBUS DINDING + ANGKA KIRI 🔥
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

// 🔥 ENGINE PENGGERAK UTAMA (BIAR TETEP MULUS & SINKRON) 🔥
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
        if(netInText) netInText.innerHTML = `0 B`;
        if(netOutText) netOutText.innerHTML = `0 B`;
    } else {
        if(cpuText) cpuText.innerHTML = `${latestStats.cpu.toFixed(2)}%`; 
        if(ramText) ramText.innerHTML = `${formatMB(latestStats.ram)}`;
        if(netInText) netInText.innerHTML = formatNetBytes(latestStats.netIn);
        if(netOutText) netOutText.innerHTML = formatNetBytes(latestStats.netOut);
    }

    cpuData.shift(); cpuData.push(latestStats.cpu); 
    ramData.shift(); ramData.push(latestStats.ram); 
    diskData.shift(); diskData.push(currentDiskUsedMB); 
    
    // 🔥 FIX FINAL: Paksa durasi 1000ms biar jalannya ngalir mulus tanpa henti 🔥
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
    if(versionSelect) versionSelect.innerHTML = '<option value="">⏳ Memuat...</option>'; 
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
    } catch(e) { if(versionSelect) versionSelect.innerHTML = '<option value="">❌ Gagal memuat API.</option>'; } finally { if (window.finishProgress) window.finishProgress(); }
}

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
        const ramInput = document.getElementById('set-ram') ? document.getElementById('set-ram').value : (settingsCache ? settingsCache.ram : '2G'); const newEngine = document.getElementById('set-engine') ? document.getElementById('set-engine').value : (settingsCache ? settingsCache.engine : 'java'); const newJar = document.getElementById('set-jar') ? document.getElementById('set-jar').value : (settingsCache ? settingsCache.jarFile : 'server.jar'); const newIp = document.getElementById('set-ip') ? document.getElementById('set-ip').value : (settingsCache ? settingsCache.ip : ''); const newPort = document.getElementById('set-port') ? document.getElementById('set-port').value : (settingsCache ? settingsCache.port : '25565');
        await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: newEngine, ram: ramInput, jarFile: newJar, ip: newIp, port: newPort, autoStart: _autoStartValue }) }); 
        settingsCache = { engine: newEngine, ram: ramInput, jarFile: newJar, ip: newIp, port: newPort, autoStart: _autoStartValue, installedVersion: settingsCache ? settingsCache.installedVersion : '' };
        currentServerRamMB = parseRamToMB(ramInput);
        if (ramChart) { let maxRamInChart = Math.max(...ramData); if (maxRamInChart > currentServerRamMB) { ramChart.options.scales.y.max = Math.ceil(maxRamInChart + 100); } else { ramChart.options.scales.y.max = currentServerRamMB; } ramChart.update({duration: 1000, easing: 'linear'}); }
        showToast('Tersimpan!'); updateCommandPreview(); 
    } catch(e) {} finally { if (window.finishProgress) window.finishProgress(); }
}

function showTab(tab, addToHistory = true) {
    if (window.startProgress) window.startProgress(); 
    if (tab !== 'edit') localStorage.setItem('activeTab', tab); 
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
    if (tab !== 'files' && tab !== 'edit') { const bar = document.getElementById('pteroFloatingBar'); if(bar) { bar.classList.add('translate-y-20', 'opacity-0'); setTimeout(() => { if(bar) bar.classList.add('hidden'); }, 300); } } else if (tab === 'files' && typeof loadFiles === 'function') { if (addToHistory) loadFiles(typeof currentPath !== 'undefined' ? currentPath : '', true); }
    if(tab === 'startup' || tab === 'network' || tab === 'settings') loadSettings();
    if(tab === 'plugins' && typeof loadDefaultPlugins === 'function') { switchPluginTab('search'); }
    if(tab === 'versions') { const vmCat = document.getElementById('vm-category'); if(document.getElementById('vm-software') && document.getElementById('vm-software').options.length === 0) updateSubCategory(); }
    if (addToHistory && tab !== 'files' && tab !== 'edit' && window.location.hash !== '#' + tab) history.pushState({ tab: tab }, '', '#' + tab);
    if (tab === 'edit' && typeof editor !== 'undefined' && editor) setTimeout(() => { editor.refresh(); }, 150);
    setTimeout(() => { if (window.finishProgress) window.finishProgress(); }, 150);
}

window.addEventListener('popstate', (event) => { let hash = window.location.hash.replace('#', ''); if (hash.startsWith('edit/') || hash.startsWith('files')) { return; } else if (['console', 'versions', 'plugins', 'network', 'startup', 'settings'].includes(hash)) { showTab(hash, false); } else if (hash === '') { showTab('console', false); } });
window.onload = async () => { 
    let hashFull = window.location.hash.replace('#', ''); let initialTab = 'console';
    if (hashFull.startsWith('files')) { initialTab = 'files'; let path = hashFull.replace('files', ''); if (path.startsWith('/')) path = path.substring(1); if(typeof currentPath !== 'undefined') currentPath = path; } 
    else if (hashFull.startsWith('edit/')) { initialTab = 'edit'; } else if (['versions', 'plugins', 'network', 'startup', 'settings'].includes(hashFull)) { initialTab = hashFull; } else { initialTab = localStorage.getItem('activeTab') || 'console'; }
    history.replaceState(null, '', '#' + (hashFull || initialTab));
    try { await loadSettings(); if (initialTab === 'files' && typeof loadFiles === 'function') loadFiles(typeof currentPath !== 'undefined' ? currentPath : '', false); if (initialTab === 'edit' && typeof openFile === 'function') { let filePath = hashFull.replace('edit/', ''); if(typeof currentPath !== 'undefined') currentPath = filePath.substring(0, filePath.lastIndexOf('/')) || ''; openFile(filePath, filePath.split('/').pop(), false); } } catch(e) {}
    showTab(initialTab, false);
    const loader = document.getElementById('page-loader'); if (loader) { loader.classList.add('opacity-0'); setTimeout(() => { loader.classList.add('hidden'); }, 300); }
};

function updateCommandPreview() { const engineEl = document.getElementById('set-engine'); const ramEl = document.getElementById('set-ram'); const jarEl = document.getElementById('set-jar'); const previewEl = document.getElementById('cmd-preview'); if(!engineEl || !previewEl) return; const engine = engineEl.value || 'java'; const ram = ramEl ? (ramEl.value || '2G') : '2G'; const jar = jarEl ? (jarEl.value || 'server.jar') : 'server.jar'; let cmd = ''; if (engine === 'node') cmd = `node ${jar}`; else if (engine === 'python') cmd = `python3 ${jar}`; else cmd = `java -Xmx${ram} -Xms128M -jar ${jar} nogui`; previewEl.innerText = cmd; }
const softwareData = { 'mc-java': [ {id: 'paper', name: 'PaperMC (Ringan)'}, {id: 'purpur', name: 'Purpur'} ], 'proxy': [ {id: 'velocity', name: 'Velocity'}, {id: 'waterfall', name: 'Waterfall'} ], 'bedrock': [ {id: 'geyser', name: 'GeyserMC'} ], 'bot': [ {id: 'node', name: 'Node.js'}, {id: 'python', name: 'Python 3'} ] };
function updateSubCategory() { if (window.startProgress) window.startProgress(); const cat = document.getElementById('vm-category').value; const softSelect = document.getElementById('vm-software'); if(softSelect) softSelect.innerHTML = softwareData[cat].map(s => `<option value="${s.id}">${s.name}</option>`).join(''); if (cat === 'bot') { if(document.getElementById('vm-version-container')) document.getElementById('vm-version-container').classList.add('hidden'); if(document.getElementById('vm-install-btn')) document.getElementById('vm-install-btn').innerText = '🚀 SETUP ENVIRONMENT INI'; if (window.finishProgress) window.finishProgress(); } else { if(document.getElementById('vm-version-container')) document.getElementById('vm-version-container').classList.remove('hidden'); if(document.getElementById('vm-install-btn')) document.getElementById('vm-install-btn').innerText = '📥 INSTALL VERSI INI'; fetchVersions(); } }

/* =========================================
   🔥 ULTIMATE PLUGIN MANAGER PRO 🔥
   ========================================= */
let pluginSearchTimeout;
function debouncePluginSearch() { clearTimeout(pluginSearchTimeout); pluginSearchTimeout = setTimeout(() => { searchPlugins(); }, 500); }
function switchPluginTab(tab) {
    const searchControl = document.getElementById('pcontrol-search'); const installedControl = document.getElementById('pcontrol-installed'); const searchResults = document.getElementById('pluginSearchResults'); const installedResults = document.getElementById('pluginInstalledResults'); const btnSearch = document.getElementById('ptab-search'); const btnInstalled = document.getElementById('ptab-installed');
    if (!searchControl || !installedControl) return;
    if (tab === 'search') { searchControl.style.display = 'block'; installedControl.style.display = 'none'; searchResults.style.display = 'grid'; installedResults.style.display = 'none'; btnSearch.className = "flex-1 sm:flex-none px-4 py-2 rounded-md font-bold text-sm transition-colors bg-blue-600 text-white shadow"; btnInstalled.className = "flex-1 sm:flex-none px-4 py-2 rounded-md font-bold text-sm transition-colors text-slate-400 hover:text-white hover:bg-slate-800"; if(searchResults.innerHTML === '') loadDefaultPlugins(); } else { searchControl.style.display = 'none'; installedControl.style.display = 'block'; searchResults.style.display = 'none'; installedResults.style.display = 'grid'; btnInstalled.className = "flex-1 sm:flex-none px-4 py-2 rounded-md font-bold text-sm transition-colors bg-blue-600 text-white shadow"; btnSearch.className = "flex-1 sm:flex-none px-4 py-2 rounded-md font-bold text-sm transition-colors text-slate-400 hover:text-white hover:bg-slate-800"; loadInstalledPlugins(); }
}
function renderPlugins(hits) { const resultsDiv = document.getElementById('pluginSearchResults'); if (hits.length === 0) { if(resultsDiv) resultsDiv.innerHTML = '<p class="text-slate-400 col-span-full text-center py-10">❌ Plugin tidak ditemukan. Coba kata kunci lain.</p>'; return; } if(resultsDiv) resultsDiv.innerHTML = hits.map(plugin => `<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col justify-between hover:border-blue-500 transition shadow-lg relative overflow-hidden group"><div class="flex items-start gap-3 mb-4"><img src="${plugin.icon_url || 'https://via.placeholder.com/50'}" class="w-12 h-12 rounded-lg object-cover bg-slate-900 border border-slate-600"><div class="overflow-hidden"><h3 class="font-black text-blue-400 text-base truncate" title="${plugin.title}">${plugin.title}</h3><p class="text-xs text-slate-400 truncate mt-0.5">By ${plugin.author || 'Unknown'}</p></div></div><button onclick="openPluginVersionModal('${plugin.project_id}', '${plugin.title.replace(/'/g, "\\'")}', '${plugin.icon_url || ''}')" class="w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg font-black text-xs text-white shadow transition active:scale-95 flex items-center justify-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> PILIH VERSI</button></div>`).join(''); }
async function loadDefaultPlugins() { if (window.startProgress) window.startProgress(); const resultsDiv = document.getElementById('pluginSearchResults'); if(resultsDiv) resultsDiv.innerHTML = '<p class="text-slate-400 col-span-full text-center py-10 animate-pulse">Memuat daftar plugin populer...</p>'; try { const res = await fetch(`https://api.modrinth.com/v2/search?facets=[["project_type:plugin"]]&index=downloads&limit=12`); const data = await res.json(); renderPlugins(data.hits); } catch(e) { if(resultsDiv) resultsDiv.innerHTML = '<p class="text-red-400 col-span-full text-center py-10">Gagal mengambil data dari Modrinth.</p>'; } finally { if (window.finishProgress) window.finishProgress(); } }
async function searchPlugins() { const queryEl = document.getElementById('pluginSearchQuery'); if(!queryEl) return; const input = queryEl.value.trim(); if (!input) { loadDefaultPlugins(); return; } if (window.startProgress) window.startProgress(); const resultsDiv = document.getElementById('pluginSearchResults'); if(resultsDiv) resultsDiv.innerHTML = '<p class="text-slate-400 col-span-full text-center py-10 animate-pulse">Mencari plugin...</p>'; try { const res = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(input)}&facets=[["project_type:plugin"]]&limit=15`); const data = await res.json(); if (input.toLowerCase().includes('vault')) { data.hits.unshift({ project_id: 'vault-original-bypass', title: 'Vault (Original by MilkBowl)', icon_url: 'https://cdn-icons-png.flaticon.com/512/2621/2621062.png', author: 'MilkBowl' }); } renderPlugins(data.hits); } catch(e) { if(resultsDiv) resultsDiv.innerHTML = '<p class="text-red-400 col-span-full text-center py-10">Pencarian gagal.</p>'; } finally { if (window.finishProgress) window.finishProgress(); } }
async function loadInstalledPlugins() { const resultsDiv = document.getElementById('pluginInstalledResults'); resultsDiv.innerHTML = '<p class="text-slate-400 col-span-full text-center py-10 animate-pulse">Membaca folder plugins/ ...</p>'; await fetch('/api/folder', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: 'plugins' }) }); try { const res = await fetch('/api/files?path=plugins'); const files = await res.json(); const jars = files.filter(f => !f.isDirectory && f.name.endsWith('.jar')); if (jars.length === 0) { resultsDiv.innerHTML = '<p class="text-slate-500 col-span-full text-center py-10 font-bold">📂 Belum ada plugin yang terpasang.</p>'; return; } resultsDiv.innerHTML = jars.map(jar => `<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col justify-between shadow-lg relative overflow-hidden"><div class="flex items-start gap-3 mb-4"><div class="w-10 h-10 rounded-lg bg-slate-900 border border-slate-600 flex items-center justify-center text-xl shrink-0">🧩</div><div class="overflow-hidden w-full"><h3 class="font-black text-slate-200 text-sm truncate" title="${jar.name}">${jar.name}</h3><p class="text-xs text-slate-500 truncate mt-0.5">${jar.size}</p></div></div><div id="update-status-${jar.name.replace(/[^a-zA-Z0-9]/g, '')}"><button onclick="checkSingleUpdate('${jar.name}')" class="w-full bg-slate-700 hover:bg-slate-600 py-2.5 rounded-lg font-bold text-xs text-slate-300 shadow transition active:scale-95 flex items-center justify-center gap-2">🔄 CEK UPDATE</button></div></div>`).join(''); checkInstalledUpdates(); } catch (e) { resultsDiv.innerHTML = '<p class="text-red-400 col-span-full text-center py-10 font-bold">❌ Gagal membaca isi folder plugins.</p>'; } }
async function checkSingleUpdate(filename) { const safeId = filename.replace(/[^a-zA-Z0-9]/g, ''); const statusDiv = document.getElementById(`update-status-${safeId}`); if(!statusDiv) return; statusDiv.innerHTML = `<button disabled class="w-full bg-slate-800 py-2.5 rounded-lg font-bold text-xs text-slate-400 flex items-center justify-center gap-2 cursor-not-allowed animate-pulse border border-slate-700">⏳ MENGECEK...</button>`; try { let cleanName = filename.replace(/-?\d+(\.\d+)*(-.*)?\.jar/i, '').trim(); if(cleanName === '') cleanName = filename.replace('.jar', ''); const searchRes = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(cleanName)}&facets=[["project_type:plugin"]]&limit=1`); const searchData = await searchRes.json(); if (searchData.hits.length === 0) { statusDiv.innerHTML = `<button disabled class="w-full bg-slate-800 py-2.5 rounded-lg font-bold text-xs text-slate-500 border border-slate-700 cursor-not-allowed">❔ TIDAK KETEMU DI MODRINTH</button>`; return; } const projectId = searchData.hits[0].project_id; const loaders = encodeURIComponent('["paper","spigot","purpur","bukkit","folia","velocity","waterfall"]'); const verRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version?loaders=${loaders}`); const versions = await verRes.json(); if (!versions || versions.length === 0) { statusDiv.innerHTML = `<button disabled class="w-full bg-slate-800 py-2.5 rounded-lg font-bold text-xs text-slate-500 border border-slate-700 cursor-not-allowed">✅ UP TO DATE</button>`; return; } const latestVersion = versions[0]; const latestFile = latestVersion.files.find(f => f.primary) || latestVersion.files[0]; if (latestFile.filename === filename) { statusDiv.innerHTML = `<button disabled class="w-full bg-green-500/10 py-2.5 rounded-lg font-bold text-xs text-green-500 border border-green-500/20 cursor-not-allowed">✅ UP TO DATE</button>`; } else { statusDiv.innerHTML = `<button onclick="executePluginUpdate('${filename}', '${latestFile.url}', '${latestFile.filename}')" class="w-full bg-blue-600 hover:bg-blue-500 py-2.5 rounded-lg font-black text-xs text-white shadow transition active:scale-95 flex items-center justify-center gap-2">🚀 PERBARUI (V.${latestVersion.version_number})</button>`; } } catch (e) { statusDiv.innerHTML = `<button onclick="checkSingleUpdate('${filename}')" class="w-full bg-red-500/20 hover:bg-red-500/30 py-2.5 rounded-lg font-bold text-xs text-red-400 border border-red-500/30 transition active:scale-95">⚠️ GAGAL CEK (COBA LAGI)</button>`; } }
async function checkInstalledUpdates(manual = false) { if(manual) showToast('Mengecek update plugin...', 'success'); const resultsDiv = document.getElementById('pluginInstalledResults'); const buttons = resultsDiv.querySelectorAll('button[onclick^="checkSingleUpdate"]'); for (let btn of buttons) { btn.click(); await new Promise(r => setTimeout(r, 500)); } }
async function executePluginUpdate(oldFilename, newUrl, newFilename) { const safeId = oldFilename.replace(/[^a-zA-Z0-9]/g, ''); const statusDiv = document.getElementById(`update-status-${safeId}`); if(statusDiv) statusDiv.innerHTML = `<button disabled class="w-full bg-blue-800 py-2.5 rounded-lg font-bold text-xs text-blue-300 flex items-center justify-center gap-2 cursor-not-allowed animate-pulse">⏳ MENGUNDUH...</button>`; try { await fetch('/api/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ items: [`plugins/${oldFilename}`] }) }); socket.emit('download_plugin', newUrl, newFilename); setTimeout(() => { loadInstalledPlugins(); }, 2500); } catch (e) { showToast('Gagal memperbarui', 'error'); } }
let currentPluginData = [];
async function openPluginVersionModal(projectId, title, iconUrl) { if (projectId === 'vault-original-bypass') { const vaultLink = 'https://github.com/MilkBowl/Vault/releases/download/1.7.3/Vault.jar'; socket.emit('download_plugin', vaultLink, 'Vault.jar'); return; } const modal = document.getElementById('pluginVersionModal'); const titleEl = document.getElementById('pv-title'); const iconEl = document.getElementById('pv-icon'); const listEl = document.getElementById('pv-list'); if(!modal || !listEl) return; titleEl.innerText = title; if (iconUrl) { iconEl.src = iconUrl; iconEl.classList.remove('hidden'); } else { iconEl.classList.add('hidden'); } listEl.innerHTML = '<div class="flex flex-col items-center justify-center py-12 gap-3"><div class="w-8 h-8 border-4 border-slate-600 border-t-blue-500 rounded-full animate-spin"></div><p class="text-slate-400 font-bold text-sm animate-pulse">Mencari versi untuk server Java...</p></div>'; modal.classList.remove('hidden'); filterPluginVersions('all', true); try { const loaders = encodeURIComponent('["paper","spigot","purpur","bukkit","folia","velocity","waterfall"]'); const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version?loaders=${loaders}`); currentPluginData = await res.json(); if (!currentPluginData || currentPluginData.length === 0) { listEl.innerHTML = '<p class="text-center text-red-400 py-10 font-bold">❌ Plugin ini tidak memiliki versi untuk Spigot/Paper.</p>'; return; } renderVersionList(currentPluginData); } catch(e) { listEl.innerHTML = '<p class="text-center text-red-400 py-10 font-bold">❌ Gagal mengambil daftar versi.</p>'; } }
function renderVersionList(versionsArray) { const listEl = document.getElementById('pv-list'); if(!listEl) return; if (versionsArray.length === 0) { listEl.innerHTML = '<p class="text-center text-slate-500 py-10 font-bold">Tidak ada versi yang cocok dengan filter.</p>'; return; } listEl.innerHTML = versionsArray.map(v => { const isRelease = v.version_type === 'release'; const badgeColor = isRelease ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'; const file = v.files.find(f => f.primary) || v.files[0]; let gameVersions = 'Unspecified'; if (v.game_versions && v.game_versions.length > 0) { if (v.game_versions.length > 3) gameVersions = `${v.game_versions[0]} - ${v.game_versions[v.game_versions.length - 1]}`; else gameVersions = v.game_versions.join(', '); } return `<div class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 hover:border-slate-500 transition"><div class="flex-1 overflow-hidden"><div class="flex items-center gap-2 mb-1.5"><span class="font-black text-white text-base truncate">${v.version_number}</span><span class="text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${badgeColor}">${v.version_type}</span></div><p class="text-xs text-slate-400 mb-1 truncate">${v.name}</p><p class="text-xs text-slate-500 font-mono"><b>MC:</b> ${gameVersions}</p></div><button onclick="downloadSpecificPlugin('${file.url}', '${file.filename}')" class="w-full sm:w-auto bg-green-600 hover:bg-green-500 px-6 py-2.5 rounded-lg font-black text-white text-sm shadow transition active:scale-95 whitespace-nowrap shrink-0 flex items-center justify-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> INSTALL</button></div>`; }).join(''); }
function filterPluginVersions(type, justUpdateUI = false) { document.querySelectorAll('.pv-filter-btn').forEach(btn => { btn.classList.remove('bg-blue-600', 'text-white'); btn.classList.add('bg-slate-700', 'text-slate-300'); }); const activeBtn = document.getElementById(`pv-btn-${type}`); if (activeBtn) { activeBtn.classList.remove('bg-slate-700', 'text-slate-300'); activeBtn.classList.add('bg-blue-600', 'text-white'); } if (justUpdateUI) return; let filtered = []; if (type === 'all') filtered = currentPluginData; else if (type === 'release') filtered = currentPluginData.filter(v => v.version_type === 'release'); else if (type === 'beta') filtered = currentPluginData.filter(v => v.version_type === 'beta' || v.version_type === 'alpha'); renderVersionList(filtered); }
function downloadSpecificPlugin(url, filename) { document.getElementById('pluginVersionModal').classList.add('hidden'); showToast(`Memproses ${filename}...`); socket.emit('download_plugin', url, filename); }
socket.on('download_lock_state', (isDownloading) => { const startBtn = document.getElementById('startBtn'); const vmBtn = document.getElementById('vm-install-btn'); if (isDownloading) { if(startBtn) { startBtn.disabled = true; startBtn.innerText = "⏳..."; } if(vmBtn) { vmBtn.disabled = true; vmBtn.innerText = "⏳..."; } } else { if(startBtn) { startBtn.disabled = false; startBtn.innerText = "Start"; } if(vmBtn) { vmBtn.disabled = false; vmBtn.innerText = "📥 INSTALL VERSI INI"; } } });
socket.on('download_success_toast', () => { showToast('Berhasil Mengunduh!'); }); 
socket.on('plugin_success_toast', (name) => { showToast(`Plugin ${name} terinstall!`); });
function deleteAccount() { document.getElementById('genericModalTitle').innerText = 'Hapus Akun Permanen?'; document.getElementById('genericModalMsg').innerHTML = 'Semua server, file, dan akun kamu akan <b>Dihapus Tanpa Sisa</b>. Yakin?'; const modal = document.getElementById('genericModal'); modal.classList.remove('hidden'); document.getElementById('genericConfirmBtn').onclick = async () => { modal.classList.add('hidden'); showToast('Sedang menghapus akun...', 'error'); try { const res = await fetch('/api/delete-account', { method: 'POST' }); if(res.ok) { window.location.href = '/'; } else { showToast('Gagal menghapus', 'error'); } } catch(e) { showToast('Koneksi Error', 'error'); } }; }
document.addEventListener('DOMContentLoaded', () => { const cmdInput = document.getElementById('cmdInput'); if (cmdInput) { cmdInput.addEventListener('focus', function() { setTimeout(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }, 300); }); } });
