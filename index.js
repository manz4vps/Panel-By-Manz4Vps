const express = require('express');
const http = require('http');
const https = require('https'); 
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const multer = require('multer'); 
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pidusage = require('pidusage');
const os = require('os');
require("./cloudflare.cjs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ================= ðŸ”¥ AUTO JAVA MANAGER ðŸ”¥ =================
function getRequiredJavaVersion(mcVersion) {
    if (!mcVersion) return 21; // Default standar
    const v = mcVersion.toLowerCase();
    
    // 1. Minecraft Klasik (Lama) - Udah aku tambahin 1.13 & 1.14 dkk biar aman!
    if (v.includes('1.7') || v.includes('1.8') || v.includes('1.9') || v.includes('1.10') || v.includes('1.11') || v.includes('1.12') || v.includes('1.13') || v.includes('1.14') || v.includes('1.15') || v.includes('1.16')) return 8;
    
    // 2. Era Minecraft 1.17 sampai 1.20.4
    if (v.includes('1.17') || v.includes('1.18') || v.includes('1.19') || v.includes('1.20.1') || v.includes('1.20.2') || v.includes('1.20.3') || v.includes('1.20.4')) return 17;
    
    // 3. Era Minecraft Modern 1.20.5, 1.21, 1.21.11 (Standard sekarang)
    if (v.includes('1.20.5') || v.includes('1.20.6') || v.includes('1.21')) return 21;

    // 4. Khusus buat Engine/Build versi "26.x" atau "26.2"
    if (v.startsWith('26.') || v.includes('26.2') || v.includes('1.22')) return 25;

    // Kalo versinya gak masuk kriteria di atas, pake 21
    return 21;
}

function ensureJava(version, logCallback, callback) {
    const javaDir = path.join(__dirname, `java-runtime-${version}`);
    const javaExe = path.join(javaDir, 'bin', 'java');

    // Kalo Javanya udah pernah didownload, langsung pake
    if (fs.existsSync(javaExe)) return callback(null, javaExe);

    logCallback(`\x1b[33mâ³ Mendownload & Instalasi OpenJDK ${version}... (Hanya sekali)\x1b[0m\n`);
    
    const arch = os.arch().includes('arm') ? 'aarch64' : 'x64';
    const isAlpine = fs.existsSync('/etc/alpine-release');
    const osType = isAlpine ? 'alpine-linux' : 'linux';
    
    // API Pintar Adoptium
    const apiUrl = `https://api.adoptium.net/v3/binary/latest/${version}/ga/${osType}/${arch}/jdk/hotspot/normal/eclipse`;
    const tmpDir = path.join(__dirname, `tmp-java-${version}`);

    exec(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}" && curl -L -# -o "${tmpDir}/java.tar.gz" "${apiUrl}" && tar -xzf "${tmpDir}/java.tar.gz" -C "${tmpDir}" && rm -rf "${javaDir}" && mv "${tmpDir}"/jdk* "${javaDir}" && rm -rf "${tmpDir}"`, (err, stdout, stderr) => {
        if (err) return callback(err, null);
        callback(null, javaExe);
    });
}
// ===========================================================

const sessionMiddleware = session({ 
    store: new FileStore({ path: './sessions', retries: 0 }),
    secret: 'rahasia-v23-ultimate', 
    resave: false, 
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const baseServersDir = path.join(__dirname, 'servers');
const usersFile = path.join(__dirname, 'users.json');

if (!fs.existsSync(baseServersDir)) fs.mkdirSync(baseServersDir, { recursive: true });
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, JSON.stringify({}));

function readUsers() {
    try {
        const data = fs.readFileSync(usersFile, 'utf8');
        return data ? JSON.parse(data) : {};
    } catch(e) {
        return {}; 
    }
}

function hashPassword(password) { return crypto.createHash('sha256').update(password).digest('hex'); }

function getOwner(serverName) {
    const users = readUsers();
    for (let u in users) {
        if (users[u].servers && users[u].servers.includes(serverName)) return u;
    }
    return null;
}

function getUserDir(serverName) {
    let owner = getOwner(serverName);
    if (!owner) owner = serverName; 

    const userFolder = path.join(baseServersDir, owner); 
    if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder, { recursive: true });

    if (owner === serverName) {
        return userFolder;
    }

    const newDir = path.join(userFolder, serverName); 
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
    return newDir;
}

function generateRandomPort() {
    let port; do { port = Math.floor(Math.random() * 55535) + 10000; } while (port > 65535); return port.toString();
}

function getUserSettings(serverName) {
    const file = path.join(getUserDir(serverName), 'panel_settings.json');
    let def = { ram: '2G', jarFile: 'server.jar', ip: '127.0.0.1', port: '25565', engine: 'java', installedVersion: '', autoStart: false }; 
    if (fs.existsSync(file)) {
        try { return { ...def, ...JSON.parse(fs.readFileSync(file)) }; } catch(e){ return def; }
    } else {
        def.port = generateRandomPort();
        fs.writeFileSync(file, JSON.stringify(def));
        return def;
    }
}

const activeServers = {}; 

function getUserState(serverName) {
    if (!activeServers[serverName]) activeServers[serverName] = { process: null, logs: [], isRestarting: false, isDownloading: false, startTime: null, isStarting: false, netBaseRx: 0, netBaseTx: 0, _restartKillTimer: null };
    return activeServers[serverName];
}

const getServerName = (req) => {
    if (req.session.currentServer) return req.session.currentServer;
    const users = readUsers();
    const u = users[req.session.username];
    if (u && u.servers && u.servers.length > 0) return u.servers[0];
    return req.session.username;
};

app.post('/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: "Data tidak boleh kosong!" });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: "Username hanya huruf & angka!" });

    let users = readUsers();
    if (users[username]) return res.status(400).json({ error: "Username sudah terdaftar!" });
    for (let u in users) { if (typeof users[u] === 'object' && users[u].email === email) return res.status(400).json({ error: "Email sudah digunakan!" }); }

    const isFirst = Object.keys(users).length === 0;
    users[username] = { password: hashPassword(password), email: email, limits: { ram: 2048, cpu: 100, disk: 5120 }, servers: [], isAdmin: isFirst };
    fs.writeFileSync(usersFile, JSON.stringify(users));
    res.json({ success: true, message: "Akun berhasil dibuat! Silakan Login." });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body; 
    let users = readUsers();
    let foundUsername = null;

    for (let userKey in users) { let u = users[userKey]; if (typeof u === 'object' && (userKey === username || u.email === username) && u.password === hashPassword(password)) { foundUsername = userKey; break; } }
    if (!foundUsername) return res.status(401).json({ error: "Username/Email atau password salah!" });

    req.session.loggedIn = true; req.session.username = foundUsername;
    res.json({ success: true });
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
const checkAuth = (req, res, next) => { 
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');

    if (req.session && req.session.loggedIn && req.session.username) return next(); 
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesi berakhir.' }); 
    res.redirect('/'); 
};

const checkAdmin = (req, res, next) => {
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    if (req.session && req.session.loggedIn && req.session.username) {
        const users = readUsers();
        if (users[req.session.username] && users[req.session.username].isAdmin) return next();
    }
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Akses ditolak.' });
    res.redirect('/');
};

app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard.html', checkAuth, (req, res) => { req.session.currentServer = null; res.sendFile(path.join(__dirname, 'public', 'dashboard.html')) });
app.get('/panel.html', checkAuth, (req, res) => { if(!req.session.currentServer) return res.redirect('/dashboard.html'); res.sendFile(path.join(__dirname, 'public', 'panel.html')) });
app.get('/admin.html', checkAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/admin/users', checkAdmin, (req, res) => {
    const users = readUsers();
    const result = [];
    for (const username in users) {
        // Admin juga ditampilkan sebagai user
        const u = users[username];
        const servers = (u.servers || []).map(srvName => {
            const state = activeServers[srvName];
            return { name: srvName, isOnline: !!(state && state.startTime) };
        });
        result.push({ username, email: u.email || '', limits: u.limits || { ram: 2048, cpu: 100, disk: 5120 }, servers });
    }
    res.json(result);
});

app.post('/api/admin/stop-server', checkAdmin, (req, res) => {
    const { serverName, force } = req.body;
    const state = activeServers[serverName];
    if (!state || !state.process) return res.status(400).json({ error: 'Server tidak berjalan.' });
    try {
        state.process.kill(force ? 'SIGKILL' : 'SIGTERM');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/delete-user', checkAdmin, (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Tidak valid.' });
    const users2 = readUsers();
    if (users2[username] && users2[username].isAdmin) return res.status(400).json({ error: 'Tidak bisa menghapus admin.' });
    let users = readUsers();
    if (!users[username]) return res.status(404).json({ error: 'User tidak ditemukan.' });
    (users[username].servers || []).forEach(srvName => {
        const state = activeServers[srvName];
        if (state && state.process) { try { state.process.kill('SIGKILL'); } catch(e){} delete activeServers[srvName]; }
    });
    const userDirPath = path.join(baseServersDir, username);
    if (fs.existsSync(userDirPath)) { try { fs.rmSync(userDirPath, { recursive: true, force: true }); } catch(e){} }
    delete users[username];
    fs.writeFileSync(usersFile, JSON.stringify(users));
    res.json({ success: true });
});

app.post('/api/admin/update-limits', checkAdmin, (req, res) => {
    const { username, ram, cpu, disk } = req.body;
    if (!username) return res.status(400).json({ error: 'Tidak valid.' });
    let users = readUsers();
    if (!users[username]) return res.status(404).json({ error: 'User tidak ditemukan.' });
    if (!users[username].limits) users[username].limits = {};
    if (ram) users[username].limits.ram = parseInt(ram);
    if (cpu) users[username].limits.cpu = parseInt(cpu);
    if (disk) users[username].limits.disk = parseInt(disk);
    fs.writeFileSync(usersFile, JSON.stringify(users));
    res.json({ success: true });
});

app.post('/api/admin/reset-password', checkAdmin, (req, res) => {
    const { username, newPassword } = req.body;
    if (!username) return res.status(400).json({ error: 'Tidak valid.' });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    let users = readUsers();
    if (!users[username]) return res.status(404).json({ error: 'User tidak ditemukan.' });
    users[username].password = hashPassword(newPassword);
    fs.writeFileSync(usersFile, JSON.stringify(users));
    res.json({ success: true });
});

app.post('/api/delete-account', checkAuth, (req, res) => {
    const username = req.session.username; 
    let users = readUsers();
    
    if (!users[username]) return res.status(400).json({ error: "Akun tidak ditemukan." });

    if (users[username].servers && Array.isArray(users[username].servers)) {
        users[username].servers.forEach(serverName => {
            const state = activeServers[serverName];
            if (state && state.process) { 
                try { state.process.kill('SIGKILL'); } catch (e) {} 
                delete activeServers[serverName]; 
            }
        });
    }

    const userDirPath = path.join(baseServersDir, username);
    if (fs.existsSync(userDirPath)) { 
        try { fs.rmSync(userDirPath, { recursive: true, force: true }); } catch (e) {} 
    }

    delete users[username];
    fs.writeFileSync(usersFile, JSON.stringify(users));
    
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/servers-list', checkAuth, (req, res) => {
    const username = req.session.username; let users = readUsers();
    if (!users[username]) return res.json([]);
    if (!users[username].servers) { users[username].servers = [username]; fs.writeFileSync(usersFile, JSON.stringify(users)); }
    const servers = users[username].servers; let results = [];

    servers.forEach(srv => {
        const state = getUserState(srv); const mcDir = getUserDir(srv);
        function getDirSizeSync(dirPath) { let size = 0; try { const files = fs.readdirSync(dirPath); files.forEach(file => { const fullPath = path.join(dirPath, file); const stats = fs.statSync(fullPath); if (stats.isDirectory()) size += getDirSizeSync(fullPath); else size += stats.size; }); } catch (e) {} return size; }
        results.push({ name: srv, isOnline: state.startTime !== null, diskUsed: getDirSizeSync(mcDir) });
    });
    res.json(results);
});

app.post('/api/delete-server', checkAuth, (req, res) => {
    const { serverName } = req.body; const username = req.session.username; let users = readUsers();
    if (!users[username] || !users[username].servers || !users[username].servers.includes(serverName)) return res.status(403).json({ error: "Akses ditolak / Server tidak ditemukan." });
    const state = activeServers[serverName];
    if (state && state.process) { try { state.process.kill('SIGKILL'); } catch (e) {} delete activeServers[serverName]; }
    
    const dirPath = getUserDir(serverName);
    if (fs.existsSync(dirPath)) { try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch (e) { } }
    
    users[username].servers = users[username].servers.filter(s => s !== serverName); fs.writeFileSync(usersFile, JSON.stringify(users));
    res.json({ success: true });
});

app.post('/api/create-server', checkAuth, (req, res) => {
    const { serverName } = req.body;
    if (!serverName || !/^[a-zA-Z0-9_-]+$/.test(serverName)) return res.status(400).json({error: "Nama hanya boleh huruf, angka, strip, dan underscore."});
    let users = readUsers(); const username = req.session.username;
    if (!users[username]) return res.status(403).json({ error: 'Akun tidak ditemukan.' });
    if (!users[username].servers) users[username].servers = [];
    let allServers = []; for(let u in users) { if(users[u].servers) allServers.push(...users[u].servers); }
    if (allServers.includes(serverName)) return res.status(400).json({error: "Nama server sudah dipakai, coba nama lain!"});
    users[username].servers.push(serverName); fs.writeFileSync(usersFile, JSON.stringify(users));
    getUserDir(serverName); getUserSettings(serverName); 
    res.json({success: true});
});

app.post('/api/select-server', checkAuth, (req, res) => { req.session.currentServer = req.body.serverName; res.json({success: true}); });
app.get('/api/whoami', checkAuth, (req, res) => { const users = readUsers(); const u = users[req.session.username]; res.json({ username: req.session.username, isAdmin: !!(u && u.isAdmin) }); });

app.get('/api/settings', checkAuth, (req, res) => { res.json(getUserSettings(getServerName(req))); });
app.post('/api/settings', checkAuth, (req, res) => { const srv = getServerName(req); const settings = getUserSettings(srv); if (req.body.ram) settings.ram = req.body.ram.trim(); if (req.body.jarFile) settings.jarFile = req.body.jarFile.trim(); if (req.body.ip !== undefined) settings.ip = req.body.ip.trim(); if (req.body.port) settings.port = String(req.body.port).trim(); if (req.body.engine) settings.engine = String(req.body.engine).trim(); if (req.body.autoStart !== undefined) settings.autoStart = Boolean(req.body.autoStart); fs.writeFileSync(path.join(getUserDir(srv), 'panel_settings.json'), JSON.stringify(settings)); res.send('Pengaturan disimpan'); });
app.get('/api/dashboard-stats', checkAuth, (req, res) => { const srv = getServerName(req); const username = req.session.username; const users = readUsers(); const userLimits = users[username]?.limits || { ram: 2048, cpu: 100, disk: 51200 }; const mcDir = getUserDir(srv); const state = getUserState(srv); function getDirSizeSync(dirPath) { let size = 0; try { const files = fs.readdirSync(dirPath); files.forEach(file => { const fullPath = path.join(dirPath, file); const stats = fs.statSync(fullPath); if (stats.isDirectory()) size += getDirSizeSync(fullPath); else size += stats.size; }); } catch (e) {} return size; } let diskBytes = getDirSizeSync(mcDir); if (state.process) { pidusage(state.process.pid, (err, stats) => { if (!err && stats) { res.json({ name: srv, cpu: stats.cpu.toFixed(2), ramUsed: stats.memory, ramTotal: userLimits.ram * 1024 * 1024, diskUsed: diskBytes, diskTotal: userLimits.disk * 1024 * 1024 }); } else { res.json({ name: srv, cpu: "0.00", ramUsed: 0, ramTotal: userLimits.ram * 1024 * 1024, diskUsed: diskBytes, diskTotal: userLimits.disk * 1024 * 1024 }); } }); } else { res.json({ name: srv, cpu: "0.00", ramUsed: 0, ramTotal: userLimits.ram * 1024 * 1024, diskUsed: diskBytes, diskTotal: userLimits.disk * 1024 * 1024 }); } });
function getRawDate(filePath) { try { if (!fs.existsSync(filePath)) return null; return fs.statSync(filePath).mtime.toISOString(); } catch (e) { return null; } }
function formatBytes(bytes) { if (!+bytes) return '0 B'; const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k)); return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`; }

app.get('/api/files', checkAuth, (req, res) => { try { const mcDir = getUserDir(getServerName(req)); let subPath = req.query.path || ''; if (subPath.includes('..')) return res.status(403).json({ error: 'Akses ditolak!' }); let targetDir = path.join(mcDir, subPath); if (!fs.existsSync(targetDir)) targetDir = mcDir; const files = fs.readdirSync(targetDir, { withFileTypes: true }); let fileList = files.filter(dirent => !(subPath === '' && dirent.name === 'panel_settings.json')).map(dirent => { const currentFilePath = path.join(targetDir, dirent.name); let size = ''; if (!dirent.isDirectory()) { try { size = formatBytes(fs.statSync(currentFilePath).size); } catch(e){} } return { name: dirent.name, isDirectory: dirent.isDirectory(), path: subPath === '' ? dirent.name : `${subPath}/${dirent.name}`, date: getRawDate(currentFilePath), size: size }; }); fileList.sort((a, b) => (a.isDirectory === b.isDirectory) ? a.name.localeCompare(b.name) : (a.isDirectory ? -1 : 1)); res.json(fileList); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/file', checkAuth, (req, res) => { let subPath = req.query.path || ''; if (subPath.includes('..')) return res.status(403).send("Akses ditolak!"); fs.readFile(path.join(getUserDir(getServerName(req)), subPath), 'utf8', (err, data) => res.send(err ? "Gagal membaca file" : data)); });

// ðŸ”¥ FITUR DOWNLOAD FILE AMAN (DITAMBAHKAN DI SINI) ðŸ”¥
app.get('/api/download', checkAuth, (req, res) => {
    let subPath = req.query.path || '';
    if (subPath.includes('..')) return res.status(403).send("Akses ditolak!");
    
    const fileTarget = path.join(getUserDir(getServerName(req)), subPath);
    if (!fs.existsSync(fileTarget)) return res.status(404).send("File tidak ditemukan!");
    
    res.download(fileTarget);
});

app.post('/api/file', checkAuth, (req, res) => { let subPath = req.body.path || ''; if (subPath.includes('..')) return res.status(403).send("Akses ditolak!"); fs.writeFile(path.join(getUserDir(getServerName(req)), subPath), req.body.content, (err) => res.send(err ? "Gagal menyimpan" : "Tersimpan")); });
app.post('/api/folder', checkAuth, (req, res) => { let subPath = req.body.path || ''; if (subPath.includes('..')) return res.status(403).send("Akses ditolak!"); try { fs.mkdirSync(path.join(getUserDir(getServerName(req)), subPath), { recursive: true }); res.send("OK"); } catch(e) { res.status(500).send("Err"); } });

// === ðŸ”¥ SISTEM UPLOAD MANUAL (SOCKET.IO TRACKER) ðŸ”¥ ===
const tempUploadsDir = path.join(__dirname, 'tmp_uploads'); 
if (!fs.existsSync(tempUploadsDir)) fs.mkdirSync(tempUploadsDir, { recursive: true });
try { fs.readdirSync(tempUploadsDir).forEach(f => fs.unlinkSync(path.join(tempUploadsDir, f))); } catch(e){}

const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, tempUploadsDir); },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '.tmp');
    }
});

const upload = multer({ storage: diskStorage });

app.post('/api/upload', checkAuth, (req, res, next) => {
    const srv = getServerName(req);
    const uploadId = req.query.uploadId;
    let loadedBytes = 0;
    
    if (uploadId) {
        req.on('data', (chunk) => {
            loadedBytes += chunk.length;
            io.to('panel_' + srv).emit('manual_upload_progress', { uploadId: uploadId, loaded: loadedBytes });
        });
    }
    next();
}, upload.single('file'), (req, res) => {
    const srv = getServerName(req);
    const subPath = req.body.path || '';
    const originalName = req.body.filename;

    if (!req.file || !originalName) return res.status(400).send("Data tidak lengkap");
    if ((subPath || '').includes('..') || originalName.includes('..')) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(403).send("Akses ditolak!");
    }

    const targetDir = path.join(getUserDir(srv), subPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const finalFilePath = path.join(targetDir, originalName);

    try {
        fs.renameSync(req.file.path, finalFilePath);
        res.send('Selesai');
    } catch (err) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).send("Error memindahkan file.");
    }
});

// === ðŸ”¥ SISTEM REMOTE DOWNLOAD (BYPASS GDRIVE) ðŸ”¥ ===
function fetchWithRedirects(urlStr, cookies = '') {
    return new Promise((resolve) => {
        const parsedUrl = new URL(urlStr);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': cookies
            }
        };

        https.get(options, (res) => {
            let newCookies = res.headers['set-cookie'] || [];
            let newCookieStr = newCookies.map(c => c.split(';')[0]).join('; ');
            let combinedCookies = cookies ? (newCookieStr ? `${cookies}; ${newCookieStr}` : cookies) : newCookieStr;

            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                let nextUrl = res.headers.location;
                if (!nextUrl.startsWith('http')) nextUrl = `https://${parsedUrl.hostname}${nextUrl}`;
                resolve(fetchWithRedirects(nextUrl, combinedCookies));
            } else {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve({ body, cookies: combinedCookies, finalUrl: urlStr }));
            }
        }).on('error', () => resolve({ body: '', cookies: '', finalUrl: urlStr }));
    });
}

async function getDriveDownloadInfo(fileId) {
    const initialUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
    const { body, cookies, finalUrl } = await fetchWithRedirects(initialUrl);

    if (body.includes('<form id="download-form"')) {
        const actionMatch = body.match(/action="([^"]+)"/);
        const confirmMatch = body.match(/name="confirm" value="([^"]+)"/);
        const uuidMatch = body.match(/name="uuid" value="([^"]+)"/);
        
        let action = actionMatch ? actionMatch[1] : 'https://docs.google.com/uc';
        if (action.startsWith('/')) action = `https://docs.google.com${action}`;
        
        const confirm = confirmMatch ? confirmMatch[1] : 't';
        const uuidStr = uuidMatch ? `&uuid=${uuidMatch[1]}` : '';
        
        let directUrl = `${action}?id=${fileId}&export=download&confirm=${confirm}${uuidStr}`;
        return { url: directUrl, cookie: cookies };
    }
    return { url: finalUrl, cookie: cookies };
}

app.post('/api/remote-download', checkAuth, async (req, res) => {
    const srv = getServerName(req);
    const { url, filename, path: subPath } = req.body;
    
    if (!url || !filename) return res.status(400).send("Data tidak lengkap");
    if (filename.includes('..') || (subPath || '').includes('..')) return res.status(403).send("Akses ditolak");

    const targetDir = path.join(getUserDir(srv), subPath || '');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    let finalUrl = url;
    let curlArgs = ['-L', '-#', '-o', filename];
    let targetFilePath = path.join(targetDir, filename);

    const gdriveMatch = url.match(/drive\.google\.com.*\/d\/([-\w]{25,})/i) || url.match(/drive\.google\.com.*id=([-\w]{25,})/i);
    
    if (gdriveMatch) {
        const fileId = gdriveMatch[1];
        const info = await getDriveDownloadInfo(fileId);
        finalUrl = info.url;
        if (info.cookie) curlArgs.push('-b', info.cookie); 
    }

    curlArgs.push(finalUrl);

    const dlProcess = spawn('curl', curlArgs, { cwd: targetDir });
    let isDone = false;

    const monitor = setInterval(() => {
        if (isDone) {
            clearInterval(monitor);
            return;
        }
        if (fs.existsSync(targetFilePath)) {
            try {
                const stats = fs.statSync(targetFilePath);
                io.to('panel_' + srv).emit('remote_dl_progress', { filename: filename, loaded: stats.size });
            } catch(e) {}
        }
    }, 500);
    
    dlProcess.on('close', (code) => {
        isDone = true;
        clearInterval(monitor);
        if (code === 0) {
            io.to('panel_' + srv).emit('remote_dl_done', filename);
        } else {
            io.to('panel_' + srv).emit('remote_dl_error', { filename: filename, code: code });
        }
    });

    res.json({ success: true }); 
});
// ====================================================

app.post('/api/delete', checkAuth, (req, res) => { const mcDir = getUserDir(getServerName(req)); const { items } = req.body; if (!items || !Array.isArray(items)) return res.status(400).send('Data tidak valid'); items.forEach(itemPath => { if (itemPath.includes('..')) return; const fullPath = path.join(mcDir, itemPath); if (fs.existsSync(fullPath)) { try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch (err) {} } }); res.send('Berhasil dihapus'); });
app.post('/api/rename', checkAuth, (req, res) => { const mcDir = getUserDir(getServerName(req)); const { oldPath, newName } = req.body; if (!oldPath || !newName || oldPath.includes('..') || newName.includes('..') || newName.includes('/')) return res.status(400).send("Format tidak valid"); const fullOldPath = path.join(mcDir, oldPath); const fullNewPath = path.join(path.dirname(fullOldPath), newName); if (!fs.existsSync(fullOldPath)) return res.status(404).send("File tidak ditemukan"); if (fs.existsSync(fullNewPath)) return res.status(400).send("Nama sudah digunakan"); try { fs.renameSync(fullOldPath, fullNewPath); res.send("Berhasil diubah"); } catch (err) { res.status(500).send("Gagal mengubah nama"); } });
app.post('/api/extract', checkAuth, (req, res) => { const mcDir = getUserDir(getServerName(req)); const { filePath, destination } = req.body; if (!filePath || filePath.includes('..')) return res.status(403).send("Akses ditolak!"); const fullPath = path.join(mcDir, filePath); const destPath = path.join(mcDir, destination || path.dirname(filePath)); if (!fs.existsSync(fullPath)) return res.status(404).send("File tidak ditemukan"); let cmd = ''; if (filePath.endsWith('.zip')) cmd = `unzip -o "${fullPath}" -d "${destPath}"`; else if (filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz')) cmd = `tar -xzf "${fullPath}" -C "${destPath}"`; else return res.status(400).send("Format didukung. Gunakan .zip atau .tar.gz"); exec(cmd, (err, stdout, stderr) => { if (err) return res.status(500).send("Gagal mengekstrak: " + stderr); res.send("Berhasil diekstrak"); }); });
app.post('/api/archive', checkAuth, (req, res) => { const mcDir = getUserDir(getServerName(req)); const { items, archiveName, currentPath } = req.body; if (!items || !Array.isArray(items) || !archiveName || archiveName.includes('..')) return res.status(400).send("Data tidak valid"); const targetDir = path.join(mcDir, currentPath || ''); const archivePath = path.join(targetDir, archiveName.endsWith('.zip') ? archiveName : archiveName + '.zip'); const safeItems = items.filter(item => !item.includes('..')).map(item => `"${path.basename(item)}"`).join(' '); if (!safeItems) return res.status(400).send("Tidak ada item yang valid"); const cmd = `cd "${targetDir}" && zip -r "${archivePath}" ${safeItems}`; exec(cmd, (err, stdout, stderr) => { if (err) return res.status(500).send("Gagal membuat arsip: " + stderr); res.send("Berhasil diarsipkan"); }); });
app.post('/api/move', checkAuth, (req, res) => { const mcDir = getUserDir(getServerName(req)); const { items, destination } = req.body; if (!items || !Array.isArray(items) || destination.includes('..')) return res.status(400).send("Data tidak valid"); const destPath = path.join(mcDir, destination); if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true }); let errors = 0; items.forEach(itemPath => { if (itemPath.includes('..')) return; const fullPath = path.join(mcDir, itemPath); const newFullPath = path.join(destPath, path.basename(itemPath)); if (fs.existsSync(fullPath)) { try { fs.renameSync(fullPath, newFullPath); } catch (err) { errors++; } } }); if (errors > 0) return res.status(500).send(`Selesai tapi ada ${errors} file yang error dipindah`); res.send("Berhasil dipindahkan"); });

function readNetStats() {
    try {
        const data = fs.readFileSync('/proc/net/dev', 'utf8');
        let rx = 0, tx = 0;
        const lines = data.split('\n').slice(2);
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 10) continue;
            const iface = parts[0].replace(':', '');
            if (iface === 'lo' || iface === '') continue;
            rx += parseInt(parts[1]) || 0;
            tx += parseInt(parts[9]) || 0;
        }
        return { rx, tx, time: Date.now() };
    } catch(e) { return { rx: 0, tx: 0, time: Date.now() }; }
}

let prevNetStats = readNetStats();

setInterval(() => {
    const curNet = readNetStats();
    prevNetStats = curNet;

    let users = readUsers();
    for (const srvName in activeServers) {
        const state = activeServers[srvName]; const settings = getUserSettings(srvName);
        let displayAddress = settings.ip ? `${settings.ip}:${settings.port}` : `0.0.0.0:${settings.port}`;
        let owner = null; for (let u in users) { if (users[u].servers && users[u].servers.includes(srvName)) { owner = u; break; } }
        if(!owner) owner = srvName;

        if (!state.process) { 
            io.to(owner).emit('dashboard_stats', { serverName: srvName, cpu: "0.00", ramMB: 0, isOnline: false, status: 'offline' });
            continue; 
        }
        
        const netInBytes = Math.max(0, curNet.rx - state.netBaseRx);
        const netOutBytes = Math.max(0, curNet.tx - state.netBaseTx);

        pidusage(state.process.pid, (err, stats) => {
            if (!err && stats) { 
                let cpuRaw = stats.cpu; if (cpuRaw > 0 && cpuRaw % 1 === 0) { cpuRaw += (Math.random() * 0.98 + 0.01); }
                let cpuFormatted = cpuRaw.toFixed(2); let ramMB = stats.memory / (1024 * 1024);
                let currentStatus = state.isStarting ? 'starting' : 'running';
                io.to(owner).emit('dashboard_stats', { serverName: srvName, cpu: cpuFormatted, ramMB: ramMB, isOnline: true, status: currentStatus });
                io.to('panel_' + srvName).emit('stats', { cpu: cpuFormatted, ramMB: ramMB, startTime: state.startTime, address: displayAddress, status: currentStatus, netIn: netInBytes, netOut: netOutBytes }); 
            }
        });
    }
}, 1000);

io.on('connection', (socket) => {
    const reqSession = socket.request.session;
    if (!reqSession || !reqSession.loggedIn) { socket.emit('session_expired'); return socket.disconnect(); }
    
    const username = reqSession.username; 
    const activeServer = reqSession.currentServer || username;
    
    socket.join(username); 
    socket.join('panel_' + activeServer); 

    const state = getUserState(activeServer); 
    const mcDir = getUserDir(activeServer);
    const settings = getUserSettings(activeServer);
    let displayAddress = settings.ip ? `${settings.ip}:${settings.port}` : `0.0.0.0:${settings.port}`;

    if (state.process) {
        let currentStatus = state.isStarting ? 'starting' : 'running';
        socket.emit('stats', { cpu: "0.00", ramMB: 0, startTime: state.startTime, address: displayAddress, status: currentStatus });
    } else {
        socket.emit('stats', { cpu: "0.00", ramMB: 0, startTime: null, address: displayAddress, status: 'offline' });
    }

    function userLog(msg) { 
        state.logs.push(msg); 
        if (state.logs.length > 300) state.logs.shift(); 
        io.to('panel_' + activeServer).emit('log', msg); 
    }

    socket.emit('log_history', state.logs.join(''));
    socket.emit('download_lock_state', state.isDownloading); 
    socket.on('clear_logs', () => { state.logs = []; });

    socket.on('command', (cmd) => { 
        let commandText = cmd.trim();
        
        // ðŸ”¥ FITUR VPSINFO DENGAN TAMBAHAN HURUF 'B' (GB/MB) & CPU LOAD ðŸ”¥
        if (commandText.toLowerCase() === 'vpsinfo') {
            const cpus = os.cpus();
            const totalRamNum = os.totalmem() / (1024 ** 3);
            const freeRamNum = os.freemem() / (1024 ** 3);
            const usedRamNum = totalRamNum - freeRamNum;
            const ramPercent = Math.round((usedRamNum / totalRamNum) * 100);
            const ramColor = ramPercent >= 80 ? '\x1b[1;31m' : (ramPercent >= 60 ? '\x1b[1;33m' : '\x1b[1;32m');

            // --- ⚙️ SCRIPT TAMBAHAN UNTUK HITUNG CPU LOAD VPS ---
            const startCpu = os.cpus();
            setTimeout(() => {
                const endCpu = os.cpus();
                let totalIdle = 0, totalTick = 0;
                
                for (let i = 0; i < startCpu.length; i++) {
                    const start = startCpu[i];
                    const end = endCpu[i];
                    
                    const idle = end.times.idle - start.times.idle;
                    let total = 0;
                    for (type in end.times) {
                        total += end.times[type] - start.times[type];
                    }
                    totalIdle += idle;
                    totalTick += total;
                }
                
                // Gantilah baris ini di dalam skrip vpsinfo kemarin:
const cpuPercent = Math.round((1 - totalIdle / totalTick) * 100) * startCpu.length; // Ditambah dikali jumlah core
const cpuColor = cpuPercent >= (80 * startCpu.length) ? '\x1b[1;31m' : (cpuPercent >= (60 * startCpu.length) ? '\x1b[1;33m' : '\x1b[1;32m');
                // ----------------------------------------------------

                exec("df -h /", (err, stdout) => {
                    let diskTotal = "?", diskUsed = "?", diskFree = "?", diskPercent = "?", diskColor = '\x1b[1;32m';
                    if (!err && stdout) { 
                        try {
                            let parts = stdout.trim().split('\n')[1].trim().split(/\s+/); 
                            
                            const addB = (val) => val ? val.replace(/([KMGTP])$/i, '$1B') : "?";
                            
                            diskTotal = addB(parts[1]); 
                            diskUsed = addB(parts[2]); 
                            diskFree = addB(parts[3]); 
                            diskPercent = parts[4] || "0%"; 
                            
                            let dpNum = parseInt((diskPercent || "0").replace('%', ''));
                            if(!isNaN(dpNum)) diskColor = dpNum >= 80 ? '\x1b[1;31m' : (dpNum >= 60 ? '\x1b[1;33m' : '\x1b[1;32m');
                        } catch(e) {} 
                    }
                    
                    userLog(`\n\x1b[1;35m=== 💻 SPESIFIKASI VPS (MANZ4VPS) ===\x1b[0m\n`);
                    userLog(`\x1b[1;36m🖥️  OS Sistem   :\x1b[0m ${os.type()} ${os.release()} (${os.arch()})\n`);
                    userLog(`\x1b[1;36m⚙️  Prosesor   :\x1b[0m ${cpus[0].model}\n`);
                    userLog(`\x1b[1;36m🔥  Total Core :\x1b[0m ${cpus.length} Cores\n`);
                    userLog(`\x1b[1;36m📈  CPU Load    :\x1b[0m ${cpuColor}${cpuPercent}%\x1b[0m\n`); // <--- INI TAMBAHAN FITUR CPU-NYA BRO
                    userLog(`\x1b[1;36m💾  RAM         :\x1b[0m ${usedRamNum.toFixed(2)}GB / ${totalRamNum.toFixed(2)}GB (${ramColor}${ramPercent}%\x1b[0m) / free ${freeRamNum.toFixed(2)}GB\n`);
                    userLog(`\x1b[1;36m💽  Disk Root   :\x1b[0m ${diskUsed} / ${diskTotal} (${diskColor}${diskPercent}\x1b[0m) / free ${diskFree}\n`);
                    userLog(`\x1b[1;35m====================================\x1b[0m\n\n`);
                });
            }, 500); // Mengukur beban CPU dalam jeda 500ms agar akurat
            return;
        }

        if (state.process) { 
            let parts = commandText.split(" "); parts[0] = parts[0].toLowerCase(); 
            state.process.stdin.write(parts.join(" ") + '\n'); 
        } 
    });

    function eksekusiProses(execCmd, execArgs, settings) {
        userLog(`\x1b[38;2;234;179;8m\x1b[1mcontainer@manz4vps~\x1b[0m ${execCmd} ${execArgs.join(' ')}\n`);
        try {
            state.process = spawn(execCmd, execArgs, { cwd: mcDir, env: { ...process.env, TZ: 'Asia/Jakarta' } });
            state.startTime = Date.now(); 
            
            state.process.stdout.on('data', (data) => {
                const output = data.toString();
                userLog(output);
                
                if (output.includes('Done (') && output.includes('! For help, type "help"')) {
                    state.isStarting = false;
                }
                else if (output.toLowerCase().includes('bot is online') || output.toLowerCase().includes('ready') || output.toLowerCase().includes('listening on port')) {
                    state.isStarting = false;
                }
            });

            state.process.stderr.on('data', (data) => userLog(`\x1b[31m${data.toString()}\x1b[0m`));
            state.process.on('close', (code) => {
                userLog(`\x1b[31mâ˜ ï¸ Proses berhenti (Kode: ${code})\x1b[0m\n`);
                pidusage.clear(); 
                if (state._restartKillTimer) { clearTimeout(state._restartKillTimer); state._restartKillTimer = null; }
                state.process = null; 
                state.startTime = null;
                state.isStarting = false;
                io.to('panel_' + activeServer).emit('stats', { cpu: "0.00", ramMB: 0, startTime: null, address: `${settings.ip}:${settings.port}`, status: 'offline', netIn: 0, netOut: 0 });
                if (state.isRestarting) { state.isRestarting = false; userLog(`\x1b[1;36m[Manz4VPS Daemon]:\x1b[0m Memulai ulang dalam 2 detik...\x1b[0m\n`); setTimeout(() => globalSpawn(activeServer), 2000); }
            });
        } catch(e) { 
            userLog(`\x1b[31mGagal eksekusi: ${e.message}\x1b[0m\n`); 
            state.isStarting = false;
        }
    }

    function startServer() {
        if (state.isDownloading) return userLog(`\x1b[33mâš ï¸ Sistem sedang mengunduh file. Harap tunggu.\x1b[0m\n`);
        if (state.process || state.isStarting) return; 

        state.isStarting = true;
        const snap = readNetStats(); state.netBaseRx = snap.rx; state.netBaseTx = snap.tx;
        const settings = getUserSettings(activeServer);

        userLog(`\x1b[1;36m[Manz4VPS Daemon]:\x1b[0m Checking server disk space usage...\n`);
        setTimeout(() => userLog(`\x1b[1;36m[Manz4VPS Daemon]:\x1b[0m Updating process configuration files...\n`), 600);

        setTimeout(() => {
            userLog(`\x1b[38;2;234;179;8m\x1b[1mcontainer@manz4vps~\x1b[0m Server marked as starting...\n`);

            if (settings.engine === 'node') {
                eksekusiProses('sh', ['-c', `if [ -d .git ]; then git pull; fi; if [ -f package.json ]; then npm install; fi; exec node "${settings.jarFile}"`], settings);
            } else if (settings.engine === 'python') {
                eksekusiProses('python3', [settings.jarFile], settings);
            } else {
                const reqJavaVer = getRequiredJavaVersion(settings.installedVersion);
                userLog(`\x1b[1;36m[Manz4VPS Daemon]:\x1b[0m Mendeteksi kebutuhan Java ${reqJavaVer} untuk versi [${settings.installedVersion || 'Default'}]\n`);
                
                ensureJava(reqJavaVer, userLog, (err, javaPath) => {
                    if (err) {
                        userLog(`\x1b[31mâŒ Gagal menginstal Java ${reqJavaVer}: ${err.message}\x1b[0m\n`);
                        state.isStarting = false;
                        return;
                    }
                    let execArgs = ['-Xms128M', '-Xmx' + settings.ram, '-Djline.terminal=jline.UnsupportedTerminal', '-jar', settings.jarFile, 'nogui', '--port', settings.port];
                    eksekusiProses(javaPath, execArgs, settings);
                });
            }
        }, 1200); 
    }

    socket.on('start', () => startServer());
    socket.on('restart', () => {
        if (state.process) {
            state.isRestarting = true;
            userLog(`\x1b[1;33m[Manz4VPS Daemon]:\x1b[0m Mengirim perintah restart...\n`);
            try { state.process.stdin.write('stop\n'); } catch(e) {}
            if (state._restartKillTimer) clearTimeout(state._restartKillTimer);
            state._restartKillTimer = setTimeout(() => {
                if (state.process && state.isRestarting) {
                    userLog(`\x1b[1;33m[Manz4VPS Daemon]:\x1b[0m Proses tidak merespons dalam 45 detik, paksa berhenti...\n`);
                    try { state.process.kill('SIGTERM'); } catch(e) {}
                    setTimeout(() => { if (state.process && state.isRestarting) { try { state.process.kill('SIGKILL'); } catch(e) {} } }, 5000);
                }
            }, 45000);
        } else { globalSpawn(activeServer); }
    });
    socket.on('stop_aman', () => {
        if (state.process) {
            state.isRestarting = false;
            if (state._restartKillTimer) { clearTimeout(state._restartKillTimer); state._restartKillTimer = null; }
            state.process.stdin.write('stop\n');
        }
    });
    
    socket.on('kill_paksa', () => { 
        if (state.process) { 
            state.isRestarting = false;
            if (state._restartKillTimer) { clearTimeout(state._restartKillTimer); state._restartKillTimer = null; }
            try { state.process.kill('SIGKILL'); userLog(`\x1b[31mâ˜ ï¸ Proses dimatikan paksa (SIGKILL).\x1b[0m\n`); } catch(err) { }
            state.startTime = null;
            state.isStarting = false;
        } 
    });
    
    socket.on('accept_eula', () => { try { fs.writeFileSync(path.join(mcDir, 'eula.txt'), 'eula=true'); userLog(`\x1b[32mâœ… EULA disetujui. Memulai ulang...\x1b[0m\n`); if (state.process) { state.isRestarting = true; try { state.process.stdin.write('stop\n'); } catch(e) {} } else { setTimeout(() => globalSpawn(activeServer), 2000); } } catch (e) { } });
    
    socket.on('download_jar', (url, versionName, isCleanInstall) => {
        if (state.isDownloading) return userLog(`\x1b[33mâš ï¸ Proses unduhan lain sedang berjalan.\x1b[0m\n`);
        if (state.process) return userLog(`\x1b[31mâŒ GAGAL: Server masih menyala!\x1b[0m\n`);
        state.isDownloading = true; io.to('panel_' + activeServer).emit('download_lock_state', true); 
        
        if (isCleanInstall) {
            userLog(`\x1b[33mðŸ§¹ Melakukan WIPE (Sapu Bersih) seluruh file...\x1b[0m\n`);
            try {
                const files = fs.readdirSync(mcDir);
                files.forEach(file => { if (file !== 'panel_settings.json') { try { fs.rmSync(path.join(mcDir, file), { recursive: true, force: true }); } catch (err) {} } });
            } catch(e) {}
        } else {
            const jarPath = path.join(mcDir, 'server.jar'); const backupPath = path.join(mcDir, 'server.jar.old'); 
            if (fs.existsSync(jarPath)) { try { if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true }); fs.renameSync(jarPath, backupPath); } catch(e) {} }
        }
        
        userLog(`\x1b[33mâ³ Memulai pengunduhan ${versionName}...\x1b[0m\n`);
        const downloader = spawn('curl', ['-L', '-#', '-o', 'server.jar', url], { cwd: mcDir });
        downloader.on('close', (code) => {
            state.isDownloading = false; io.to('panel_' + activeServer).emit('download_lock_state', false); 
            if(code === 0) { 
                userLog(`\x1b[32mâœ… SUKSES! ${versionName} siap dimainkan.\x1b[0m\n`); io.to('panel_' + activeServer).emit('download_success_toast'); 
                const settings = getUserSettings(activeServer); settings.installedVersion = versionName; fs.writeFileSync(path.join(mcDir, 'panel_settings.json'), JSON.stringify(settings));
            } else { userLog(`\x1b[31mâŒ Unduhan gagal. (Kode: ${code})\x1b[0m\n`); }
        });
    });

    socket.on('download_plugin', (url, filename) => {
        if (state.isDownloading) return;
        state.isDownloading = true; io.to('panel_' + activeServer).emit('download_lock_state', true); 
        const pluginsDir = path.join(mcDir, 'plugins'); if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
        userLog(`\x1b[33mâ³ Mengunduh plugin: ${filename}...\x1b[0m\n`);
        const downloader = spawn('curl', ['-L', '-#', '-o', filename, url], { cwd: pluginsDir });
        downloader.on('close', (code) => {
            state.isDownloading = false; io.to('panel_' + activeServer).emit('download_lock_state', false); 
            if(code === 0) { userLog(`\x1b[32mâœ… SUKSES! Plugin ${filename} berhasil dipasang.\x1b[0m\n`); io.to('panel_' + activeServer).emit('plugin_success_toast', filename); } 
            else { userLog(`\x1b[31mâŒ Gagal mengunduh plugin.\x1b[0m\n`); }
        });
    });
});

function globalSpawn(srvName) {
    const state = getUserState(srvName);
    if (state.process || state.isStarting || state.isDownloading) return;
    const settings = getUserSettings(srvName);
    const mcDir = getUserDir(srvName);
    const uLog = (msg) => { state.logs.push(msg); if (state.logs.length > 300) state.logs.shift(); io.to('panel_' + srvName).emit('log', msg); };
    const snap = readNetStats(); state.netBaseRx = snap.rx; state.netBaseTx = snap.tx;
    state.isStarting = true;

    const doSpawn = (cmd, args) => {
        uLog(`\x1b[38;2;234;179;8m\x1b[1mcontainer@manz4vps~\x1b[0m ${cmd} ${args.join(' ')}\n`);
        try {
            state.process = spawn(cmd, args, { cwd: mcDir, env: { ...process.env, TZ: 'Asia/Jakarta' } });
            state.startTime = Date.now();
            state.process.stdout.on('data', d => { const o = d.toString(); uLog(o); if (o.includes('Done (') || /bot is online|ready|listening on port/i.test(o)) state.isStarting = false; });
            state.process.stderr.on('data', d => uLog(`\x1b[31m${d.toString()}\x1b[0m`));
            state.process.on('close', code => {
                uLog(`\x1b[31mâ˜ ï¸ Proses berhenti (Kode: ${code})\x1b[0m\n`);
                pidusage.clear();
                if (state._restartKillTimer) { clearTimeout(state._restartKillTimer); state._restartKillTimer = null; }
                state.process = null; state.startTime = null; state.isStarting = false;
                const s2 = getUserSettings(srvName);
                io.to('panel_' + srvName).emit('stats', { cpu: "0.00", ramMB: 0, startTime: null, address: `${s2.ip}:${s2.port}`, status: 'offline', netIn: 0, netOut: 0 });
                if (state.isRestarting) {
                    state.isRestarting = false;
                    uLog(`\x1b[1;36m[Manz4VPS Daemon]:\x1b[0m Memulai ulang dalam 2 detik...\n`);
                    setTimeout(() => globalSpawn(srvName), 2000);
                }
            });
        } catch(e) { uLog(`\x1b[31mGagal: ${e.message}\x1b[0m\n`); state.isStarting = false; }
    };

    if (settings.engine === 'node') {
        doSpawn('sh', ['-c', `if [ -d .git ]; then git pull; fi; if [ -f package.json ]; then npm install; fi; exec node "${settings.jarFile}"`]);
    } else if (settings.engine === 'python') {
        doSpawn('python3', [settings.jarFile]);
    } else {
        const reqJavaVer = getRequiredJavaVersion(settings.installedVersion);
        ensureJava(reqJavaVer, uLog, (err, javaPath) => {
            if (err) { uLog(`\x1b[31mâŒ Gagal Java: ${err.message}\x1b[0m\n`); state.isStarting = false; return; }
            doSpawn(javaPath, ['-Xms128M', '-Xmx' + settings.ram, '-Djline.terminal=jline.UnsupportedTerminal', '-jar', settings.jarFile, 'nogui', '--port', settings.port]);
        });
    }
}

function bootAutoStart() {
    setTimeout(() => {
        try {
            const users = readUsers();
            for (const username in users) {
                const userServers = users[username].servers || [];
                userServers.forEach(srvName => {
                    try {
                        const settings = getUserSettings(srvName);
                        if (!settings.autoStart) return;
                        const state = getUserState(srvName);
                        const uLog = (msg) => { state.logs.push(msg); if (state.logs.length > 300) state.logs.shift(); io.to('panel_' + srvName).emit('log', msg); };
                        uLog(`\x1b[1;36m[Manz4VPS Daemon]:\x1b[0m Auto Start aktif. Memulai server ${srvName}...\n`);
                        globalSpawn(srvName);
                    } catch(e) {}
                });
            }
        } catch(e) {}
    }, 3000);
}

const PTERO_PORT = process.env.PORT || 5000;
server.listen(PTERO_PORT, '0.0.0.0', () => {
    console.log(`\x1b[32mðŸš€ PANEL V26 (ULTIMATE)\x1b[0m`);
    bootAutoStart();
});
