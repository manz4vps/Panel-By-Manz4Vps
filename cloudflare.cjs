const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const dotenv = require("dotenv");

// Use built-in fetch in Node 18+ (no node-fetch required)
const fetch = global.fetch;

dotenv.config();

const token = process.env.CLOUDFLARE_TOKEN;
if (!token) {
  process.exit(1);
}

const platformMap = { linux: "linux", darwin: "darwin", win32: "windows" };
const archMap = { x64: "amd64", arm64: "arm64" };
const platform = platformMap[os.platform()] || "linux";
const arch = archMap[os.arch()] || "amd64";
const binaryName = `cloudflared-${platform}-${arch}${platform === "windows" ? ".exe" : ""}`;
const binaryPath = path.join(process.cwd(), binaryName);

const urls = {
  "linux-amd64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
  "linux-arm64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64",
  "darwin-amd64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64",
  "darwin-arm64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64",
  "windows-amd64": "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe",
};

const key = `${platform}-${arch}`;
const url = urls[key];

if (!url) {
  process.exit(1);
}

async function downloadBinary() {
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download`);

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(binaryPath, buffer);
  fs.chmodSync(binaryPath, 0o755);

  return binaryPath;
}

async function startTunnel() {
  const bin = await downloadBinary();

  const tunnel = spawn(bin, ["tunnel", "run"], {
    env: { ...process.env, TUNNEL_TOKEN: token },
  });

  // 🔥 Matikan output log biasa (stdout)
  tunnel.stdout.on("data", () => {});

  // 🔥 Matikan output log spam (stderr) dari Cloudflared
  tunnel.stderr.on("data", () => {});

  // Auto restart diem-diem kalo tunnel putus
  tunnel.on("close", () => {
    setTimeout(startTunnel, 5000);
  });

  process.on("SIGINT", () => {
    tunnel.kill();
    process.exit(0);
  });
}

// Jalankan tunnel tanpa munculin error di console
startTunnel().catch(() => {});