const enc = new TextEncoder();
const START_CHIPS = 500000000;   // chip awal pemain baru (samakan dengan DEFAULTS.balance di game)
const MAX_SEND = 1e12;
const DAILY_REWARD = [10000000, 20000000, 30000000, 40000000, 60000000, 80000000, 150000000];
const dayKey = (ms) => new Date(ms + 7 * 36e5).toISOString().slice(0, 10);   // tanggal WIB
const NAME_RE = /^[A-Za-z0-9_]{3,12}$/;
const TRANSFER_MIN = 1000000000, TAX_PCT = 5;   // samakan dengan index.html (kirim chip min 1B, pajak 5%)
const PBKDF2_ITER = 10000;       // kalau muncul error CPU (1102) di Worker gratis, turunkan angka ini

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return atob(s); };
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const secInt = (n) => { const a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n; do { crypto.getRandomValues(a); } while (a[0] >= lim); return a[0] % n; };
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = secInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const JP_LIST = ["MINI", "MINOR", "MAJOR", "GRAND"];
/* urutan 12 kartu jackpot: kocok acak, tier yang PERTAMA lengkap 3 kartu = tier hadiah. len = jumlah kartu yang harus dibuka. */
function jpDeck(tier) {
const base = []; JP_LIST.forEach((t) => { for (let k = 0; k < 3; k++) base.push(t); });
for (let tries = 0; tries < 500; tries++) {
const d = shuffle(base), c = {};
for (let i = 0; i < d.length; i++) { c[d[i]] = (c[d[i]] || 0) + 1; if (c[d[i]] === 3) { if (d[i] === tier) return { deck: d, len: i + 1 }; break; } }
}
return { deck: [tier, tier, tier].concat(shuffle(base.filter((x) => x !== tier))), len: 3 };
}
/* selesaikan jackpot yang menunggu: catat ke feed global (hanya dipanggil saat kartu terakhir terbuka / ditinggal) */
const BIG_WIN = 1e10;   // menang >10B -> notif terbang ke semua pemain
let feedReady = false;
async function feedEnsure(env) {
if (feedReady) return;
await env.DB.prepare("CREATE TABLE IF NOT EXISTS jp_feed (seq INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, name TEXT, tier TEXT, amt REAL, at INTEGER)").run();
try { await env.DB.prepare("ALTER TABLE jp_pending ADD COLUMN fr INTEGER DEFAULT 0").run(); } catch (e) {}   // tanda: jackpot didapat di scatter mode
feedReady = true;
}
async function feedAdd(env, uid, name, tier, amt) {
await feedEnsure(env);
await env.DB.prepare("INSERT INTO jp_feed (uid,name,tier,amt,at) VALUES (?1,?2,?3,?4,?5)").bind(uid, name, tier, amt, Date.now()).run();
await env.DB.prepare("DELETE FROM jp_feed WHERE rowid <= (SELECT MAX(rowid) FROM jp_feed) - 200").run();   // simpan 200 terakhir (nomor urut tidak pernah mundur)
}
async function jpFinish(env, id, row) {
const del = await env.DB.prepare("DELETE FROM jp_pending WHERE id=?").bind(id).run();
if (!del.meta.changes) return;
const u = await env.DB.prepare("SELECT username FROM accounts WHERE id=?").bind(id).first();
await feedAdd(env, id, u ? u.username : "?", row.tier + "||" + (row.fr ? 1 : 0), row.amt);
}
const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;

async function hmac(secret, data) {
const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
async function signTok(env, payload) {
const p = b64u(enc.encode(JSON.stringify(payload)));
return p + "." + (await hmac(env.TOKEN_SECRET, p));
}
async function verifyTok(env, tok) {
if (!tok) return null;
const [p, s] = tok.split(".");
if (!p || !s) return null;
if (!safeEq(await hmac(env.TOKEN_SECRET, p), s)) return null;
let d; try { d = JSON.parse(unb64u(p)); } catch { return null; }
return d && d.exp > Date.now() ? d : null;
}
async function hashPw(pass, saltHex) {
const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: PBKDF2_ITER }, key, 256));
}
function genLuck() { return 1;
const r = rand();
if (r < 0.05) return +(0.25 + rand() * 0.3).toFixed(2);
if (r < 0.65) return +(0.7 + rand() * 0.9).toFixed(2);
if (r < 0.90) return +(2 + rand() * 6).toFixed(2);
return +(10 + rand() * 15).toFixed(2);
}
const genGv = () => +(0.6 + rand()).toFixed(2);

/* ===== ATURAN SPIN (sama dengan di game; server yang mengundi hasil) ===== */
const BET_MIN = 1000000, BET_MAX = 2000000000;
const ANIMAL_W = [22, 19, 16, 13, 11, 8, 6, 5];
const FULL_MULT = [60, 80, 110, 150, 200, 280, 380, 500];
const JP_MULT = { MINI: 40, MINOR: 100, MAJOR: 250, GRAND: 1000 };
const JP_CHANCE = { MINI: 0.0008, MINOR: 0.0002, MAJOR: 0.00006, GRAND: 0.00001 };
const GACOR_FULL = 40, GACOR_JP = 40, GACOR_CAP = 0.5;
const MODES = {
normal: { rows3: 0.002, rows2: 0.010, rows1: 0.052, scatter: 0.012, full: 0.0007, diag: 0.08, mult: 1 },
scatter: { rows3: 0.006, rows2: 0.030, rows1: 0.150, scatter: 0.030, full: 0.0015, diag: 0.18, mult: 2 },
};
const PRIZE_RANGE = { 3: [20, 40], 2: [8, 16], 1: [2, 6] };
const DIAG_PRIZE = { 3: [0.5, 1.0], 4: [0.9, 1.5], 5: [1.3, 1.9] };
const HORIZ_PRIZE = { 3: [0.4, 0.8], 4: [0.7, 1.2], 5: [1.0, 1.6] };
const DIAG_LEN_W = [[3, 70], [4, 22], [5, 8]];
const SCATTER_COUNT_W = [[3, 70], [4, 22], [5, 8]];
const SPINS_ENTER = { 3: 6, 4: 10, 5: 15 }, SPINS_RETRIGGER = { 3: 3, 4: 5, 5: 8 };
const rnd = (r) => r[0] + rand() * (r[1] - r[0]);
function wpick(list) { let x = rand() * list.reduce((a, b) => a + b[1], 0); for (const [v, w] of list) { x -= w; if (x < 0) return v; } return list[0][0]; }
function animalIdx() { let x = rand() * ANIMAL_W.reduce((a, b) => a + b, 0); for (let i = 0; i < ANIMAL_W.length; i++) { x -= ANIMAL_W[i]; if (x < 0) return i; } return 0; }

function makePlan(luck, gv, canFull, canJp, free) {
const M = MODES[free ? "scatter" : "normal"], k = M.mult;
const L = 1, GV = gv > 0 ? gv : 1;   // luck diabaikan: pemain biasa murni acak (RTP tetap). gv hanya dipakai akun gacor
const gF = canFull ? GACOR_FULL * GV : 1, gJ = canJp ? GACOR_JP * GV : 1;   // gacor = hanya akun yang diberi izin admin
const plan = { special: null, rows: 0, line: null, mult: 0, scatter: 0 };
if (rand() < Math.min(GACOR_CAP, M.full * gF)) plan.special = { kind: "full", animal: animalIdx() };
else {
let hit = null;
for (const t of ["MINI", "MINOR", "MAJOR", "GRAND"]) if (rand() < Math.min(GACOR_CAP, JP_CHANCE[t] * gJ)) hit = t;
if (hit) plan.special = { kind: "jp", tier: hit };
}
if (plan.special) return plan;          // spin hadiah khusus: tidak ada baris/scatter
const gacor = canFull || canJp, W = Math.min(6, Math.max(0.5, Math.pow(L, 0.6)));
let rows = 0;
if (gacor) { const q = rand(); rows = q < 0.5 ? 1 : q < 0.64 ? 2 : q < 0.7 ? 3 : 0; }
else { const r3 = M.rows3 * W, r2 = M.rows2 * W, r1 = M.rows1 * W, roll = rand(); if (roll < r3) rows = 3; else if (roll < r3 + r2) rows = 2; else if (roll < r3 + r2 + r1) rows = 1; }
if (rows) { plan.an = animalIdx(); plan.rows = rows; plan.mult = Math.round(rnd(PRIZE_RANGE[rows]) * k * 10) / 10; }
else if (gacor || rand() < Math.min(0.6, M.diag * W)) {
const len = wpick(DIAG_LEN_W), kind = rand() < 0.4 ? "H" : "D";
plan.line = { kind, L: len }; plan.an = animalIdx();
plan.mult = Math.round(rnd((kind === "H" ? HORIZ_PRIZE : DIAG_PRIZE)[len]) * k * 100) / 100;
}
if (rand() < M.scatter) plan.scatter = wpick(SCATTER_COUNT_W);
return plan;
}

/* ===== BANDAR QQ (domino Merah vs Biru): kartu dikocok & hasil dihitung di SERVER ===== */
const QQ_ZONES = ["m", "b", "t", "q", "s", "qm", "qb", "tm", "tb"];
// pengali TOTAL (taruhan ikut kembali). m/b: seri = taruhan kembali (x1). q = Qiu Qiu (1:88 -> RTP ~91,7%). Samakan dengan Bandar_QQ.html
const QQ_PAY = { m: 2, b: 2, t: 9, q: 89, s: 501, qm: 9, qb: 9, tm: 16, tb: 16 };
const QQ_MIN = 500, QQ_MAX_TOTAL = 5e10;   // minimal per zona, maksimal total taruhan per ronde
const qqVal = (h) => (h[0][0] + h[0][1] + h[1][0] + h[1][1]) % 10;
const qqTwin = (h) => h[0][0] === h[0][1] && h[1][0] === h[1][1];
function qqDeal() {
const d = []; for (let i = 0; i <= 6; i++) for (let j = i; j <= 6; j++) d.push([i, j]);
const s = shuffle(d);   // 28 kartu domino, kocok aman (crypto)
return { r: [s[0], s[1]], b: [s[2], s[3]] };
}
function qqRes(H) {
const vr = qqVal(H.r), vb = qqVal(H.b), tm = qqTwin(H.r), tb = qqTwin(H.b), w = vr > vb ? "m" : vb > vr ? "b" : "t";
const res = { m: w === "m" ? QQ_PAY.m : w === "t" ? 1 : 0, b: w === "b" ? QQ_PAY.b : w === "t" ? 1 : 0, t: w === "t" ? QQ_PAY.t : 0, q: vr === 9 && vb === 9 ? QQ_PAY.q : 0, s: tm && tb ? QQ_PAY.s : 0, qm: vr === 9 ? QQ_PAY.qm : 0, qb: vb === 9 ? QQ_PAY.qb : 0, tm: tm ? QQ_PAY.tm : 0, tb: tb ? QQ_PAY.tb : 0 };
return res;
}
function qqPayout(bets, H) {
const res = qqRes(H);
let back = 0; for (const k in bets) back += bets[k] * res[k];
return back;
}
/* notif global Bandar QQ: urutan prioritas; menang di zona yang dipasang (rugi bersih tidak peduli), kemenangan zona >= BIG_WIN */
const QQ_PRIO = ["s", "q", "tm", "tb", "qm", "qb", "t", "m", "b"];
const QQ_KIND = { s: "SIX", q: "QQ", tm: "TWM", tb: "TWB", qm: "QQM", qb: "QQB", t: "SERI", m: "MERAH", b: "BIRU" };
const QQ_TXT = { s: "SIX TWINS", q: "QIU QIU", tm: "TWIN KIRI", tb: "TWIN KANAN", qm: "QIU KIRI", qb: "QIU KANAN", t: "SERI", m: "MERAH", b: "BIRU" };
let qqReady = false;
async function qqEnsure(env) {
if (qqReady) return;
await env.DB.prepare("CREATE TABLE IF NOT EXISTS qq_last (id TEXT PRIMARY KEY, rid TEXT, res TEXT)").run();   // hasil ronde terakhir: kalau koneksi putus & klien kirim ulang (rid sama), tidak dipotong dua kali
qqReady = true;
}

/* ===== BANDAR QQ MABAR (ronde bersama, chat global, notif) ===== */
/* Ronde dihitung dari jam server: 30 dtk taruhan + 15 dtk hasil = 45 dtk. Semua pemain di room yang sama
   melihat ronde & kartu yang SAMA. Kartu baru dikocok saat taruhan sudah tutup (tidak bisa ditebak). */
const QQ_BET_MS = 30000, QQ_CYC = 45000, QQ_ROOM_MIN = [500, 200000, 5000000, 20000000];   // min per zona tiap room (samakan dengan ROOMS di Bandar_QQ.html)
const qqN = (t) => Math.floor(t / QQ_CYC);
let qqLiveReady = false;
async function qqLiveEnsure(env) {
  if (qqLiveReady) return;
  const T = [   // dibuat satu per satu; kalau gagal, pesan error muncul jelas di layar game
    "CREATE TABLE IF NOT EXISTS qq_round (room INTEGER, n INTEGER, hands TEXT, PRIMARY KEY(room,n))",
    "CREATE TABLE IF NOT EXISTS qq_bets (room INTEGER, n INTEGER, uid TEXT, bets TEXT, total REAL, settled INTEGER DEFAULT 0, win REAL DEFAULT 0, PRIMARY KEY(room,n,uid))",
    "CREATE TABLE IF NOT EXISTS qq_presence (uid TEXT PRIMARY KEY, room INTEGER, seen INTEGER)",
    "CREATE TABLE IF NOT EXISTS qq_chat (seq INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, name TEXT, msg TEXT, at INTEGER)",
  ];
  for (const q of T) await env.DB.prepare(q).run();
  await feedEnsure(env);
  qqLiveReady = true;
}
async function qqHands(env, room, n) {
  let r = await env.DB.prepare("SELECT hands FROM qq_round WHERE room=?1 AND n=?2").bind(room, n).first();
  if (!r) {
    await env.DB.prepare("INSERT OR IGNORE INTO qq_round (room,n,hands) VALUES (?1,?2,?3)").bind(room, n, JSON.stringify(qqDeal())).run();
    r = await env.DB.prepare("SELECT hands FROM qq_round WHERE room=?1 AND n=?2").bind(room, n).first();
  }
  return JSON.parse(r.hands);
}
/* bayar semua taruhan ronde yang sudah tutup (milik room ini + milik pemain ini di room mana pun). Aman dipanggil berulang. */
async function qqSettle(env, room, uid, closedN) {
  const rows = (await env.DB.prepare("SELECT room,n,uid,bets FROM qq_bets WHERE settled=0 AND n<=?1 AND (room=?2 OR uid=?3) LIMIT 100").bind(closedN, room, uid).all()).results;
  const cache = {};
  for (const x of rows) {
    const key = x.room + ":" + x.n;
    const H = cache[key] || (cache[key] = await qqHands(env, x.room, x.n));
    const bt = JSON.parse(x.bets); let tot = 0; for (const k in bt) tot += bt[k];
    const back = qqPayout(bt, H);
    const rs = await env.DB.batch([   // atomik: saldo bertambah hanya kalau baris masih settled=0
      env.DB.prepare("UPDATE accounts SET balance=balance+?1 WHERE id=?2 AND EXISTS (SELECT 1 FROM qq_bets WHERE room=?3 AND n=?4 AND uid=?2 AND settled=0)").bind(back, x.uid, x.room, x.n),
      env.DB.prepare("UPDATE qq_bets SET settled=1,win=?1 WHERE room=?2 AND n=?3 AND uid=?4 AND settled=0").bind(back, x.room, x.n, x.uid),
    ]);
    if (rs[1].meta.changes) {   // notif global: zona yang dipasang & kena (res>1), kemenangan zona >= BIG_WIN, rugi bersih tidak dihitung
      const R = qqRes(H);
      for (const k of QQ_PRIO) {
        const wz = bt[k] > 0 && R[k] > 1 ? bt[k] * (R[k] - 1) : 0;
        if (wz < BIG_WIN) continue;
        try {
          const u = await env.DB.prepare("SELECT username FROM accounts WHERE id=?").bind(x.uid).first(), nm = u ? u.username : "?";
          await feedAdd(env, x.uid, nm, QQ_KIND[k] + "|8|Q", wz);   // "Q" = asal Bandar QQ (dibaca gParse di index.html)
          await env.DB.prepare("INSERT INTO qq_chat (uid,name,msg,at) VALUES ('SYS','📢',?1,?2)").bind(nm + " menang " + QQ_TXT[k] + " +" + qqFmt(wz), Date.now()).run();
        } catch (e) {}
        break;
      }
    }
  }
}
/* ===== DAF PETS: simpan state kandang per akun + sinkron saldo chip (chip Pets = chip game lain) ===== */
const PETS_BURST = 2e12, PETS_RATE = 5e8, PETS_MAX_STATE = 400000;   // batas kenaikan chip per sinkron: PETS_BURST + detik_sejak_sinkron_terakhir * PETS_RATE (atur sesuai ekonomi)
let petsReady = false;
async function petsEnsure(env) {
  if (petsReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS pets_state (id TEXT PRIMARY KEY, state TEXT, at INTEGER)").run();
  petsReady = true;
}
let roomReady = false;   // Mabar room slot (pengganti Firestore rooms)
async function roomEnsure(env) {
  if (roomReady) return;
  for (const q of [
    "CREATE TABLE IF NOT EXISTS room_meta (code TEXT PRIMARY KEY, meta TEXT, at INTEGER)",
    "CREATE TABLE IF NOT EXISTS room_players (code TEXT, uid TEXT, d TEXT, seen INTEGER, PRIMARY KEY(code,uid))",
    "CREATE TABLE IF NOT EXISTS room_feed (seq INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, d TEXT, at INTEGER)",
  ]) await env.DB.prepare(q).run();
  roomReady = true;
}
const qqFmt = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1e3) + "K";


const cors = (env) => ({
"Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
"Access-Control-Allow-Headers": "Authorization, Content-Type",
"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
});
const json = (env, data, status = 200) =>
new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...cors(env) } });
const bad = (env, msg, status = 400) => json(env, { error: msg }, status);

export default {
async fetch(req, env) {
if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });
try { return await route(req, env); }
catch (e) { return bad(env, "server: " + (e && e.message || e), 500); }
},
};

const ACC_SQL = "SELECT a.id,a.username,a.balance,a.luck,a.gv,a.free_spins,a.streak,a.last_daily,a.spins,a.created_at,COALESCE(p.can_send,0) s,COALESCE(p.can_full,0) f,COALESCE(p.can_jp,0) j,COALESCE(p.gacor_until,0) gu,(SELECT COUNT(*) FROM inbox i WHERE i.to_id=a.id AND i.claimed=0) ib FROM accounts a LEFT JOIN perms p ON p.id=a.id";
const gActive = (a, now = Date.now()) => (a.f || a.j) && (!a.gu || a.gu > now);   // gacor aktif bila izin ON dan belum kedaluwarsa
const shape = (a, adm = false) => ({ id: a.id, name: a.username, balance: a.balance, freeSpins: a.free_spins | 0, inbox: a.ib | 0, streak: a.streak | 0, lastDaily: a.last_daily || "", spins: a.spins | 0, created: a.created_at, today: dayKey(Date.now()), yesterday: dayKey(Date.now() - 864e5), perms: adm ? { send: !!a.s, full: !!a.f && gActive(a), jp: !!a.j && gActive(a) } : { send: !!a.s, full: false, jp: false }, ...(adm ? { gacorUntil: a.gu | 0 } : {}) });   // pemain TIDAK pernah menerima info gacor/luck

async function route(req, env) {
const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "") || "/";
const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
const auth = await verifyTok(env, (req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
const now = Date.now();

if (path === "/") return json(env, { ok: true, service: "daf-api", v: 12, room: true, pets: true });

if (path === "/register" && req.method === "POST") {
const name = String(body.name || "").trim(), pass = String(body.pass || "");
if (!/^[A-Za-z0-9_]{3,12}$/.test(name) || /^\d{8}$/.test(name)) return bad(env, "Username 3–12 karakter: huruf, angka, atau _ (bukan 8 digit angka)");
if (name.toLowerCase() === "admin" || name.toLowerCase() === String(env.ADMIN_USER || "\0").toLowerCase()) return bad(env, "Username sudah dipakai");
if (pass.length < 4 || pass.length > 72) return bad(env, "Kata sandi 4–72 karakter");
if (await env.DB.prepare("SELECT 1 FROM accounts WHERE username=? COLLATE NOCASE").bind(name).first()) return bad(env, "Username sudah dipakai", 409);
const salt = hex(crypto.getRandomValues(new Uint8Array(16))), ph = await hashPw(pass, salt);
const luck = genLuck(), gv = genGv();
let id = null;
for (let i = 0; i < 6 && !id; i++) {
const c = String(Math.floor(20000000 + rand() * 80000000));
try {
await env.DB.prepare("INSERT INTO accounts (id,name,username,pw_salt,pw_hash,balance,luck,gv,created_at) VALUES (?1,?2,?2,?3,?4,?5,?6,?7,?8)").bind(c, name, salt, ph, START_CHIPS, luck, gv, now).run();
id = c;
} catch (e) { if (!/UNIQUE|constraint/i.test(String(e && e.message))) throw e; if (await env.DB.prepare("SELECT 1 FROM accounts WHERE username=? COLLATE NOCASE").bind(name).first()) return bad(env, "Username sudah dipakai", 409); }
}
if (!id) return bad(env, "Coba lagi", 500);
const a = await env.DB.prepare(ACC_SQL + " WHERE a.id=?").bind(id).first();
return json(env, { token: await signTok(env, { id, exp: now + 400 * 864e5 }), account: shape(a) });
}

if (path === "/login" && req.method === "POST") {
const q = String(body.user || "").trim(), pass = String(body.pass || "");
if (!q || !pass) return bad(env, "Isi username dan kata sandi");
const key = q.toLowerCase();
const f = await env.DB.prepare("SELECT n,until FROM login_fails WHERE k=?").bind(key).first();
if (f && f.until > now) return bad(env, "Terlalu banyak salah. Coba lagi " + Math.ceil((f.until - now) / 1000) + " detik", 429);
const row = await env.DB.prepare("SELECT id,pw_salt,pw_hash FROM accounts WHERE " + (/^\d{8}$/.test(q) ? "id=?" : "username=? COLLATE NOCASE")).bind(q).first();
const ok = !!row && !!row.pw_hash && safeEq(await hashPw(pass, row.pw_salt), row.pw_hash);
if (!ok) {
const n = (f ? f.n : 0) + 1, until = n >= 5 ? now + 30000 : 0;
await env.DB.prepare("INSERT INTO login_fails (k,n,until) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET n=?2,until=?3").bind(key, n >= 5 ? 0 : n, until).run();
return bad(env, "Username/ID atau kata sandi salah", 401);
}
if (f) await env.DB.prepare("DELETE FROM login_fails WHERE k=?").bind(key).run();
const a = await env.DB.prepare(ACC_SQL + " WHERE a.id=?").bind(row.id).first();
return json(env, { token: await signTok(env, { id: row.id, exp: now + 400 * 864e5 }), account: shape(a) });
}

if (path === "/admin/login" && req.method === "POST") {
const ok = safeEq(String(body.user || ""), String(env.ADMIN_USER || "\0")) && safeEq(String(body.pass || ""), String(env.ADMIN_PASS || "\0"));
if (!ok) return bad(env, "Username atau password salah", 401);
return json(env, { token: await signTok(env, { id: "ADMIN", adm: true, exp: now + 12 * 36e5 }) });
}

if (path === "/leaderboard") {
const r = await env.DB.prepare("SELECT username,balance FROM accounts ORDER BY balance DESC LIMIT 20").all();
return json(env, { top: r.results.map((x) => ({ name: x.username, balance: x.balance })) });
}

if (!auth) return bad(env, "Belum login", 401);

if (path === "/me") {
if (auth.adm) return json(env, { id: "ADMIN", admin: true, perms: { send: true, full: true, jp: true } });
const a = await env.DB.prepare(ACC_SQL + " WHERE a.id=?").bind(auth.id).first();
if (!a) return bad(env, "Akun tidak ditemukan", 404);
return json(env, shape(a));
}

if (path === "/spin" && req.method === "POST") {
if (auth.adm) return bad(env, "Admin tidak memakai spin server");
{ const old = await env.DB.prepare("SELECT tier,amt,fr FROM jp_pending WHERE id=?").bind(auth.id).first(); if (old) await jpFinish(env, auth.id, old); }   // jackpot sebelumnya ditinggal: selesaikan
const bet = Math.floor(Number(body.bet));
if (!Number.isFinite(bet) || bet < BET_MIN || bet > BET_MAX) return bad(env, "Taruhan tidak valid");
for (let t = 0; t < 4; t++) {
const row = await env.DB.prepare("SELECT a.balance,a.luck,a.gv,a.free_spins,COALESCE(p.can_full,0) f,COALESCE(p.can_jp,0) j,COALESCE(p.gacor_until,0) gu FROM accounts a LEFT JOIN perms p ON p.id=a.id WHERE a.id=?").bind(auth.id).first();
if (!row) return bad(env, "Akun tidak ditemukan", 404);
const free = row.free_spins > 0;
if (!free && row.balance < bet) return json(env, { error: "Chip tidak cukup", balance: row.balance }, 400);
const gOn = gActive(row, now), plan = makePlan(row.luck, row.gv, !!row.f && gOn, !!row.j && gOn, free), k = free ? 2 : 1;
let win = 0;
if (plan.special) win = plan.special.kind === "full" ? bet * FULL_MULT[plan.special.animal] * k : bet * JP_MULT[plan.special.tier];
else win = bet * plan.mult;
const fsMid = free ? row.free_spins - 1 : row.free_spins;
const extra = plan.scatter >= 3 ? (free ? SPINS_RETRIGGER : SPINS_ENTER)[plan.scatter] : 0;
const fsEnd = fsMid + extra, newBal = row.balance - (free ? 0 : bet) + win;
const r = await env.DB.prepare("UPDATE accounts SET balance=?1,free_spins=?2,spins=spins+1 WHERE id=?3 AND balance=?4 AND free_spins=?5").bind(newBal, fsEnd, auth.id, row.balance, row.free_spins).run();
if (r.meta.changes) {
if (plan.special && plan.special.kind === "jp") {
await feedEnsure(env);
// JACKPOT: chip sudah masuk saldo, tapi tier & jumlah DISEMBUNYIKAN dari respons sampai kartu dibuka (lewat /jp/open)
const { deck, len } = jpDeck(plan.special.tier), cnt = {}; deck.slice(0, len).forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
const rest = []; JP_LIST.forEach((t) => { for (let k = cnt[t] || 0; k < 3; k++) rest.push(t); });
const full = deck.slice(0, len).concat(shuffle(rest));
await env.DB.prepare("INSERT OR REPLACE INTO jp_pending (id,tier,amt,deck,len,idx,at,fr) VALUES (?1,?2,?3,?4,?5,0,?6,?7)").bind(auth.id, plan.special.tier, win, JSON.stringify(full), len, now, free ? 1 : 0).run();
return json(env, { plan: { special: { kind: "jp" }, rows: 0, line: null, mult: 0, scatter: 0, free, win: 0, balance: newBal - win, fsMid, fsEnd } });
}
{   // catat ke feed global: FULL GAMBAR selalu, kemenangan >=10B (SUPER/MEGA/BIG/pola) ; jackpot dicatat saat kartu selesai
let ft = null;
if (plan.special && plan.special.kind === "full") ft = "FULL|" + plan.special.animal;
else if (!plan.special && win >= BIG_WIN) ft = (plan.rows ? ["", "BIG", "MEGA", "SUPER"][plan.rows] : "LINE") + "|" + (plan.an | 0);
if (ft) { try { const u = await env.DB.prepare("SELECT username FROM accounts WHERE id=?").bind(auth.id).first(); await feedAdd(env, auth.id, u ? u.username : "?", ft + "|" + (free ? 1 : 0), win); } catch (e) {} }
}
return json(env, { plan: { ...plan, free, win, balance: newBal, fsMid, fsEnd } });
}
}
return bad(env, "Server sibuk, coba lagi", 409);
}

if (path === "/qq/round" && req.method === "POST") {
if (auth.adm) return bad(env, "Admin tidak memakai server");
const raw = body.bets && typeof body.bets === "object" ? body.bets : {}, bets = {};
let total = 0;
for (const k of QQ_ZONES) {
if (raw[k] === undefined || raw[k] === null || Number(raw[k]) === 0) continue;
const v = Math.floor(Number(raw[k]));
if (!Number.isFinite(v) || v < QQ_MIN) return bad(env, "Taruhan tidak valid");
bets[k] = v; total += v;
}
if (!total || total > QQ_MAX_TOTAL) return bad(env, "Taruhan tidak valid");
const rid = String(body.rid || "").slice(0, 40);
await qqEnsure(env);
for (let t = 0; t < 4; t++) {
if (rid) { const last = await env.DB.prepare("SELECT rid,res FROM qq_last WHERE id=?").bind(auth.id).first(); if (last && last.rid === rid) return json(env, JSON.parse(last.res)); }
const row = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first();
if (!row) return bad(env, "Akun tidak ditemukan", 404);
if (row.balance < total) return json(env, { error: "Chip tidak cukup", balance: row.balance }, 400);
const H = qqDeal(), back = qqPayout(bets, H), newBal = row.balance - total + back;
const r = await env.DB.prepare("UPDATE accounts SET balance=?1 WHERE id=?2 AND balance=?3").bind(newBal, auth.id, row.balance).run();
if (r.meta.changes) {
const out = { hands: H, bet: total, win: back, balance: newBal };
if (rid) { try { await env.DB.prepare("INSERT OR REPLACE INTO qq_last (id,rid,res) VALUES (?1,?2,?3)").bind(auth.id, rid, JSON.stringify(out)).run(); } catch (e) {} }
return json(env, out);
}
}
return bad(env, "Server sibuk, coba lagi", 409);
}

/* ===== BANDAR QQ MABAR: route ===== */

if (path === "/qq/state" && req.method === "POST") {
  if (auth.adm) return bad(env, "Admin tidak memakai server");
  await qqLiveEnsure(env);
  const room = Math.floor(Number(body.room));
  if (!(room >= 0 && room < QQ_ROOM_MIN.length)) return bad(env, "Room tidak valid");
  const n = qqN(now), open = now < n * QQ_CYC + QQ_BET_MS, since = Math.floor(Number(body.since)) || 0;
  if (body.hb) await env.DB.prepare("INSERT OR REPLACE INTO qq_presence (uid,room,seen) VALUES (?1,?2,?3)").bind(auth.id, room, now).run();
  await qqSettle(env, room, auth.id, open ? n - 1 : n);
  const chatQ = since > 0
    ? env.DB.prepare("SELECT seq,name,msg,at FROM qq_chat WHERE seq>?1 ORDER BY seq ASC LIMIT 30").bind(since)
    : env.DB.prepare("SELECT * FROM (SELECT seq,name,msg,at FROM qq_chat ORDER BY seq DESC LIMIT 30) ORDER BY seq ASC");
  const [me, mr, pr, sr, rr, cr, cm, fm] = await Promise.all([
    env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first(),
    env.DB.prepare("SELECT bets,win FROM qq_bets WHERE room=?1 AND n=?2 AND uid=?3").bind(room, n, auth.id).first(),
    env.DB.prepare("SELECT bets FROM qq_bets WHERE room=?1 AND n=?2 LIMIT 300").bind(room, n).all(),
    env.DB.prepare("SELECT a.username name,a.balance bal FROM qq_presence p JOIN accounts a ON a.id=p.uid WHERE p.room=?1 AND p.seen>?2 AND p.uid<>?3 ORDER BY a.balance DESC LIMIT 5").bind(room, now - 30000, auth.id).all(),
    env.DB.prepare("SELECT room,COUNT(*) c FROM qq_presence WHERE seen>? GROUP BY room").bind(now - 30000).all(),
    chatQ.all(),
    env.DB.prepare("SELECT COALESCE(MAX(seq),0) m FROM qq_chat").first(),
    env.DB.prepare("SELECT COALESCE(MAX(rowid),0) m FROM jp_feed").first(),
  ]);
  const pot = {};
  for (const x of pr.results) { const b = JSON.parse(x.bets); for (const k in b) pot[k] = (pot[k] || 0) + b[k]; }
  const rooms = QQ_ROOM_MIN.map(() => 0); rr.results.forEach((x) => { if (rooms[x.room] !== undefined) rooms[x.room] = x.c; });
  const items = cr.results, cmax = cm ? cm.m : 0;
  const out = { t: now, n, room, balance: me ? me.balance : 0, mine: mr ? JSON.parse(mr.bets) : {}, pot, seats: sr.results, onl: Math.max(1, rooms[room]), rooms, chat: items, clast: items.length ? items[items.length - 1].seq : Math.min(since, cmax) };
  const fs = Number(body.fs), flast = fm ? fm.m | 0 : 0;   // notif global: sama dengan /feed (panggilan pertama hanya menandai posisi)
  out.feed = { last: flast, items: [] };
  if (Number.isFinite(fs) && fs >= 0 && fs < flast) {
    const fr = (await env.DB.prepare("SELECT rowid AS seq,uid,name,tier,amt FROM jp_feed WHERE rowid>? ORDER BY rowid ASC LIMIT 10").bind(fs).all()).results;
    out.feed = { last: fr.length ? fr[fr.length - 1].seq : flast, items: fr };
  }
  if (!open) {
    out.hands = await qqHands(env, room, n);
    out.win = mr ? mr.win : 0;
    const top = await env.DB.prepare("SELECT a.username name,(b.win-b.total) net FROM qq_bets b JOIN accounts a ON a.id=b.uid WHERE b.room=?1 AND b.n=?2 AND b.settled=1 ORDER BY (b.win-b.total) DESC LIMIT 1").bind(room, n).first();
    if (top && top.net > 0) out.top = top;
  }
  if (body.h) out.hist = (await env.DB.prepare("SELECT hands FROM qq_round WHERE room=?1 AND n<?2 ORDER BY n DESC LIMIT 14").bind(room, n).all()).results.map((x) => JSON.parse(x.hands)).reverse();
  if (rand() < 0.02) {   // bersih-bersih data lama
    await env.DB.batch([
      env.DB.prepare("DELETE FROM qq_round WHERE n<?").bind(n - 300),
      env.DB.prepare("DELETE FROM qq_bets WHERE settled=1 AND n<?").bind(n - 20),
      env.DB.prepare("DELETE FROM qq_presence WHERE seen<?").bind(now - 600000),
      env.DB.prepare("DELETE FROM qq_chat WHERE seq <= (SELECT MAX(seq) FROM qq_chat) - 200"),
    ]);
  }
  return json(env, out);
}

if (path === "/qq/bet" && req.method === "POST") {   // kirim SELURUH taruhanmu untuk ronde ini (bukan selisih); server menghitung selisih saldo
  if (auth.adm) return bad(env, "Admin tidak memakai server");
  await qqLiveEnsure(env);
  const room = Math.floor(Number(body.room));
  if (!(room >= 0 && room < QQ_ROOM_MIN.length)) return bad(env, "Room tidak valid");
  const n = qqN(now), closeAt = n * QQ_CYC + QQ_BET_MS, min = Math.max(QQ_MIN, QQ_ROOM_MIN[room]);
  const raw = body.bets && typeof body.bets === "object" ? body.bets : {}, bets = {};
  let total = 0;
  for (const k of QQ_ZONES) {
    if (raw[k] === undefined || raw[k] === null || Number(raw[k]) === 0) continue;
    const v = Math.floor(Number(raw[k]));
    if (!Number.isFinite(v) || v < min) return bad(env, "Minimal taruhan room ini " + min.toLocaleString("id-ID") + " per zona");
    bets[k] = v; total += v;
  }
  if (total > QQ_MAX_TOTAL) return bad(env, "Taruhan terlalu besar");
  for (let t = 0; t < 4; t++) {
    const cur = await env.DB.prepare("SELECT bets,total FROM qq_bets WHERE room=?1 AND n=?2 AND uid=?3").bind(room, n, auth.id).first();
    const acc = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first();
    if (!acc) return bad(env, "Akun tidak ditemukan", 404);
    const mine = cur ? JSON.parse(cur.bets) : {};
    if (Date.now() >= closeAt || Math.floor(Number(body.n)) !== n) return json(env, { error: "Taruhan sudah ditutup", mine, balance: acc.balance }, 409);
    const before = cur ? cur.total : 0, d = total - before;
    if (d === 0 && cur) return json(env, { ok: true, balance: acc.balance, mine });
    if (d > acc.balance) return json(env, { error: "Chip tidak cukup", mine, balance: acc.balance }, 400);
    if (!cur && total === 0) return json(env, { ok: true, balance: acc.balance, mine: {} });
    let ok;
    if (cur) ok = (await env.DB.prepare("UPDATE qq_bets SET bets=?1,total=?2 WHERE room=?3 AND n=?4 AND uid=?5 AND total=?6 AND settled=0").bind(JSON.stringify(bets), total, room, n, auth.id, before).run()).meta.changes;
    else { try { await env.DB.prepare("INSERT INTO qq_bets (room,n,uid,bets,total) VALUES (?1,?2,?3,?4,?5)").bind(room, n, auth.id, JSON.stringify(bets), total).run(); ok = 1; } catch (e) { ok = 0; } }
    if (!ok) continue;   // permintaan lain menyela: ulangi dengan data terbaru
    const r = await env.DB.prepare("UPDATE accounts SET balance=balance-?1 WHERE id=?2 AND balance-?1>=0").bind(d, auth.id).run();
    if (!r.meta.changes) {   // saldo tidak cukup: kembalikan taruhan seperti semula
      await env.DB.prepare("UPDATE qq_bets SET bets=?1,total=?2 WHERE room=?3 AND n=?4 AND uid=?5").bind(cur ? cur.bets : "{}", before, room, n, auth.id).run();
      return json(env, { error: "Chip tidak cukup", mine, balance: acc.balance }, 400);
    }
    const nb = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first();
    return json(env, { ok: true, balance: nb.balance, mine: bets });
  }
  return bad(env, "Server sibuk, coba lagi", 409);
}

if (path === "/qq/chat" && req.method === "POST") {   // chat global
  if (auth.adm) return bad(env, "Admin tidak memakai chat");
  await qqLiveEnsure(env);
  const msg = String(body.msg || "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!msg) return bad(env, "Pesan kosong");
  const last = await env.DB.prepare("SELECT at FROM qq_chat WHERE uid=? ORDER BY seq DESC LIMIT 1").bind(auth.id).first();
  if (last && now - last.at < 2000) return bad(env, "Pelan-pelan, tunggu sebentar", 429);
  const u = await env.DB.prepare("SELECT username FROM accounts WHERE id=?").bind(auth.id).first();
  await env.DB.prepare("INSERT INTO qq_chat (uid,name,msg,at) VALUES (?1,?2,?3,?4)").bind(auth.id, u ? u.username : "?", msg, now).run();
  return json(env, { ok: true });
}

if (path === "/jp/open" && req.method === "POST") {
if (auth.adm) return bad(env, "Admin tidak memakai jackpot server");
for (let t = 0; t < 4; t++) {
const row = await env.DB.prepare("SELECT tier,amt,deck,len,idx,fr FROM jp_pending WHERE id=?").bind(auth.id).first();
if (!row) return bad(env, "Tidak ada jackpot yang menunggu", 404);
const deck = JSON.parse(row.deck);
if (row.idx >= row.len) { await jpFinish(env, auth.id, row); return bad(env, "Jackpot sudah selesai", 409); }
const up = await env.DB.prepare("UPDATE jp_pending SET idx=idx+1 WHERE id=?1 AND idx=?2").bind(auth.id, row.idx).run();
if (!up.meta.changes) continue;
const card = deck[row.idx], done = row.idx + 1 >= row.len;
if (!done) return json(env, { t: card, done: false });
await jpFinish(env, auth.id, row);
const me = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first();
return json(env, { t: card, done: true, tier: row.tier, amt: row.amt, rest: deck.slice(row.len), balance: me ? me.balance : null });
}
return bad(env, "Server sibuk, coba lagi", 409);
}

if (path.startsWith("/room/") && req.method === "POST") {   // Mabar room slot: meta / pemain / feed di D1
  await roomEnsure(env);
  const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5), uid = auth.adm ? "ADMIN" : auth.id, op = path.slice(6);
  if (code.length !== 5) return bad(env, "Kode room tidak valid");
  const players = async () => (await env.DB.prepare("SELECT uid,d,seen FROM room_players WHERE code=?1 AND seen>?2 LIMIT 20").bind(code, now - 100000).all()).results.map((x) => Object.assign(JSON.parse(x.d), { id: x.uid, seen: x.seen }));
  const who = async () => { if (auth.adm) return "ADMIN"; const u = await env.DB.prepare("SELECT username FROM accounts WHERE id=?").bind(uid).first(); return u ? u.username : "?"; };
  if (op === "get") { const m = await env.DB.prepare("SELECT meta FROM room_meta WHERE code=?").bind(code).first(); return json(env, { meta: m ? JSON.parse(m.meta) : null, players: await players() }); }
  if (op === "create") {
    const meta = { game: "daf", host: uid, hostName: await who(), max: 6, created: now };
    const r = await env.DB.prepare("INSERT OR IGNORE INTO room_meta (code,meta,at) VALUES (?1,?2,?3)").bind(code, JSON.stringify(meta), now).run();
    return json(env, { created: !!r.meta.changes });
  }
  if (op === "put") {
    const nm = await who();
    if (body.drop) await env.DB.prepare("DELETE FROM room_players WHERE code=?1 AND uid=?2").bind(code, uid).run();
    else if (body.d && typeof body.d === "object") {
      const old = await env.DB.prepare("SELECT d FROM room_players WHERE code=?1 AND uid=?2").bind(code, uid).first();
      const s = JSON.stringify(Object.assign(old ? JSON.parse(old.d) : {}, body.d, { name: nm }));
      if (s.length > 3000) return bad(env, "Data terlalu besar");
      await env.DB.prepare("INSERT OR REPLACE INTO room_players (code,uid,d,seen) VALUES (?1,?2,?3,?4)").bind(code, uid, s, now).run();
    }
    if (body.ev && typeof body.ev === "object") {
      const s = JSON.stringify(Object.assign({}, body.ev, { uid, name: nm, ts: now }));
      if (s.length <= 600) await env.DB.batch([
        env.DB.prepare("INSERT INTO room_feed (code,d,at) VALUES (?1,?2,?3)").bind(code, s, now),
        env.DB.prepare("DELETE FROM room_feed WHERE code=?1 AND seq <= (SELECT MAX(seq) FROM room_feed WHERE code=?1) - 60").bind(code),
      ]);
    }
    if (rand() < 0.02) await env.DB.batch([
      env.DB.prepare("DELETE FROM room_players WHERE seen<?").bind(now - 600000),
      env.DB.prepare("DELETE FROM room_feed WHERE at<?").bind(now - 864e5),
      env.DB.prepare("DELETE FROM room_meta WHERE at<? AND code NOT IN (SELECT code FROM room_players)").bind(now - 864e5),
    ]);
    return json(env, { ok: true });
  }
  if (op === "poll") {
    const ev = (await env.DB.prepare("SELECT seq,d FROM room_feed WHERE code=?1 ORDER BY seq DESC LIMIT 30").bind(code).all()).results.map((x) => Object.assign(JSON.parse(x.d), { seq: x.seq }));
    return json(env, { players: await players(), events: ev });
  }
  return bad(env, "Tidak ditemukan", 404);
}

if (path === "/feed" && req.method === "GET") {
await feedEnsure(env);
const since = Number(url.searchParams.get("since"));
const last = (await env.DB.prepare("SELECT COALESCE(MAX(rowid),0) m FROM jp_feed").first()).m | 0;
if (!Number.isFinite(since) || since < 0) return json(env, { last, items: [] });   // panggilan pertama: hanya tandai posisi
if (since > last) return json(env, { last, items: [] });   // nomor klien lebih besar dari server (tabel di-reset): sinkronkan ulang
const r = await env.DB.prepare("SELECT rowid AS seq,uid,name,tier,amt,at FROM jp_feed WHERE rowid>? ORDER BY rowid ASC LIMIT 20").bind(since).all();
return json(env, { last: r.results.length ? r.results[r.results.length - 1].seq : last, items: r.results });
}

if (path === "/pets/load" || path === "/pets/sync") {
if (auth.adm) return bad(env, "Admin tidak memakai Pets");
await petsEnsure(env);
const acc = await env.DB.prepare("SELECT balance,username FROM accounts WHERE id=?").bind(auth.id).first();
if (!acc) return bad(env, "Akun tidak ditemukan", 404);
const prev = await env.DB.prepare("SELECT state,at FROM pets_state WHERE id=?").bind(auth.id).first();
if (path === "/pets/load") {
let st = null; try { st = prev ? JSON.parse(prev.state) : null; } catch (e) {}
return json(env, { balance: acc.balance, name: acc.username, state: st });
}
if (req.method !== "POST") return bad(env, "Metode salah", 405);
let d = Math.trunc(Number(body.d) || 0);
if (!Number.isFinite(d)) return bad(env, "Jumlah tidak valid");
const st = body.state;
let js = null;
if (st && typeof st === "object" && Array.isArray(st.pets)) { js = JSON.stringify(st); if (js.length > PETS_MAX_STATE) return bad(env, "State Pets terlalu besar", 413); }
let capped = false;
const maxGain = PETS_BURST + Math.min(86400, Math.max(0, (now - ((prev && prev.at) || now)) / 1000)) * PETS_RATE;
if (d > maxGain) { d = Math.floor(maxGain); capped = true; }
if (d < 0 && acc.balance + d < 0) return json(env, { error: "Chip tidak cukup", balance: acc.balance }, 400);
if (d !== 0) {
const r = await env.DB.prepare("UPDATE accounts SET balance=balance+?1 WHERE id=?2 AND balance+?1>=0").bind(d, auth.id).run();
if (!r.meta.changes) { const cur = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first(); return json(env, { error: "Chip tidak cukup", balance: cur ? cur.balance : 0 }, 400); }
}
if (js) await env.DB.prepare("INSERT OR REPLACE INTO pets_state (id,state,at) VALUES (?1,?2,?3)").bind(auth.id, js, now).run();
else if (prev) await env.DB.prepare("UPDATE pets_state SET at=?1 WHERE id=?2").bind(now, auth.id).run();
const me = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first();
return json(env, { ok: true, balance: me.balance, capped });
}

if (path === "/daily" && req.method === "POST") {
if (auth.adm) return bad(env, "Admin tidak punya hadiah harian");
const a = await env.DB.prepare("SELECT streak,last_daily FROM accounts WHERE id=?").bind(auth.id).first();
if (!a) return bad(env, "Akun tidak ditemukan", 404);
const today = dayKey(now), yest = dayKey(now - 864e5);
if (a.last_daily === today) return bad(env, "Hadiah hari ini sudah diklaim", 409);
const streak = a.last_daily === yest ? (a.streak | 0) + 1 : 1, idx = (streak - 1) % 7, reward = DAILY_REWARD[idx];
const r = await env.DB.prepare("UPDATE accounts SET balance=balance+?1,streak=?2,last_daily=?3 WHERE id=?4 AND COALESCE(last_daily,'')<>?3").bind(reward, streak, today, auth.id).run();
if (!r.meta.changes) return bad(env, "Hadiah hari ini sudah diklaim", 409);
const me = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first();
return json(env, { ok: true, balance: me.balance, streak, idx, reward, today });
}

if (path === "/passwd" && req.method === "POST") {
if (auth.adm) return bad(env, "Khusus akun pemain");
const oldp = String(body.old || ""), nw = String(body.pass || "");
if (nw.length < 4 || nw.length > 72) return bad(env, "Kata sandi baru 4–72 karakter");
const row = await env.DB.prepare("SELECT pw_salt,pw_hash FROM accounts WHERE id=?").bind(auth.id).first();
if (!row || !safeEq(await hashPw(oldp, row.pw_salt), row.pw_hash)) return bad(env, "Kata sandi lama salah", 403);
const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
await env.DB.prepare("UPDATE accounts SET pw_salt=?1,pw_hash=?2 WHERE id=?3").bind(salt, await hashPw(nw, salt), auth.id).run();
return json(env, { ok: true });
}

if (path === "/rename" && req.method === "POST") {
if (auth.adm) return bad(env, "Khusus akun pemain");
const name = String(body.name || "").trim();
if (!NAME_RE.test(name) || /^\d{8}$/.test(name)) return bad(env, "Username 3–12 karakter: huruf, angka, atau _ (bukan 8 digit angka)");
if (name.toLowerCase() === "admin" || name.toLowerCase() === String(env.ADMIN_USER || "\0").toLowerCase()) return bad(env, "Username sudah dipakai", 409);
try { await env.DB.prepare("UPDATE accounts SET name=?1,username=?1 WHERE id=?2").bind(name, auth.id).run(); }
catch (e) { if (/UNIQUE|constraint/i.test(String(e && e.message))) return bad(env, "Username sudah dipakai", 409); throw e; }
return json(env, { ok: true, name });
}

if (path === "/inbox" && req.method === "GET") {
if (auth.adm) return json(env, { pending: [], history: [] });
const p = await env.DB.prepare("SELECT id,from_name,amount,tax,net,at FROM inbox WHERE to_id=? AND claimed=0 ORDER BY at DESC LIMIT 100").bind(auth.id).all();
const h = await env.DB.prepare("SELECT from_id,from_name,to_name,amount,tax,net,at,claimed FROM inbox WHERE from_id=?1 OR (to_id=?1 AND claimed=1) ORDER BY at DESC LIMIT 50").bind(auth.id).all();
return json(env, {
pending: p.results.map((x) => ({ id: x.id, from: x.from_name, amount: x.amount, tax: x.tax, net: x.net, at: x.at })),
history: h.results.map((x) => { const out = x.from_id === auth.id; return { dir: out ? "out" : "in", peer: out ? x.to_name : x.from_name, amount: x.amount, tax: x.tax, net: x.net, at: x.at, claimed: !!x.claimed }; }),
});
}

if (path === "/inbox/claim" && req.method === "POST") {
if (auth.adm) return bad(env, "Admin tidak punya inbox");
await env.DB.batch([
env.DB.prepare("UPDATE accounts SET balance=balance+(SELECT COALESCE(SUM(net),0) FROM inbox WHERE to_id=?1 AND claimed=0) WHERE id=?1").bind(auth.id),
env.DB.prepare("UPDATE inbox SET claimed=1,claimed_at=?2 WHERE to_id=?1 AND claimed=0").bind(auth.id, now),
]);
const t = await env.DB.prepare("SELECT COALESCE(SUM(net),0) total,COUNT(*) n FROM inbox WHERE to_id=?1 AND claimed_at=?2").bind(auth.id, now).first();
const me = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first();
return json(env, { ok: true, balance: me.balance, total: t.total, count: t.n });
}

if (path === "/send" && req.method === "POST") {
if (auth.adm) return bad(env, "Admin pakai /admin/chips");
const amount = Math.floor(Number(body.amount)), to = String(body.to || "");
if (!Number.isFinite(amount) || amount < TRANSFER_MIN || amount > MAX_SEND) return bad(env, "Minimal kirim 1.000.000.000 chip");
if (to === auth.id) return bad(env, "Tidak bisa kirim ke diri sendiri");
const p = await env.DB.prepare("SELECT can_send FROM perms WHERE id=?").bind(auth.id).first();
if (!p || !p.can_send) return bad(env, "Tidak punya izin kirim chip", 403);
const rcp = await env.DB.prepare("SELECT id,username FROM accounts WHERE id=?").bind(to).first();
if (!rcp) return bad(env, "Akun tujuan tidak ada", 404);
const tax = Math.floor(amount * TAX_PCT / 100), net = amount - tax;
const d = await env.DB.prepare("UPDATE accounts SET balance=balance-?1 WHERE id=?2 AND balance>=?1").bind(amount, auth.id).run();
if (!d.meta.changes) return bad(env, "Chip tidak cukup");
// chip masuk INBOX penerima dulu (belum menambah saldo); penerima harus mengambilnya
try {
const sn = await env.DB.prepare("SELECT username FROM accounts WHERE id=?").bind(auth.id).first();
await env.DB.prepare("INSERT INTO inbox (from_id,from_name,to_id,to_name,amount,tax,net,at,claimed) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0)").bind(auth.id, sn ? sn.username : "?", to, rcp.username, amount, tax, net, now).run();
} catch (e) {
await env.DB.prepare("UPDATE accounts SET balance=balance+? WHERE id=?").bind(amount, auth.id).run();   // gagal -> chip dikembalikan
return bad(env, "Gagal mengirim, chip dikembalikan", 500);
}
const me = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(auth.id).first();
return json(env, { ok: true, balance: me.balance, tax, net });
}

if (path === "/lookup" && req.method === "POST") {
const q = String(body.q || "").trim().replace(/^#/, "");
if (!q) return bad(env, "Isi ID atau username", 400);
const a = await env.DB.prepare("SELECT id,username FROM accounts WHERE " + (/^\d{8}$/.test(q) ? "id=?" : "username=? COLLATE NOCASE")).bind(q).first();
if (!a) return bad(env, "Penerima tidak ditemukan", 404);
return json(env, { id: a.id, name: a.username });
}

if (path.startsWith("/admin/")) {
if (!auth.adm) return bad(env, "Hanya admin", 403);

if (path === "/admin/accounts") {
const r = await env.DB.prepare(ACC_SQL + " ORDER BY a.created_at DESC LIMIT 200").all();
return json(env, { accounts: r.results.map((x) => shape(x, true)) });
}
if (path === "/admin/perms" && req.method === "POST") {
const id = String(body.id || "");
if (!(await env.DB.prepare("SELECT id FROM accounts WHERE id=?").bind(id).first())) return bad(env, "Akun tidak ada", 404);
const s = body.send ? 1 : 0, f = body.full ? 1 : 0, j = body.jp ? 1 : 0;
const mins = Math.max(0, Math.min(Math.floor(Number(body.mins)) || 0, 525600)), until = (f || j) && mins > 0 ? now + mins * 60000 : 0;   // 0 = tanpa batas waktu
await env.DB.prepare("INSERT INTO perms (id,can_send,can_full,can_jp,updated_at,gacor_until) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET can_send=?2,can_full=?3,can_jp=?4,updated_at=?5,gacor_until=?6").bind(id, s, f, j, now, until).run();
return json(env, { ok: true, perms: { send: !!s, full: !!f, jp: !!j }, gacorUntil: until });
}
if (path === "/admin/resetpw" && req.method === "POST") {
const id = String(body.id || ""), pass = String(body.pass || "");
if (pass.length < 4 || pass.length > 72) return bad(env, "Sandi baru 4–72 karakter");
const a = await env.DB.prepare("SELECT username FROM accounts WHERE id=?").bind(id).first();
if (!a) return bad(env, "Akun tidak ada", 404);
const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
await env.DB.prepare("UPDATE accounts SET pw_salt=?1,pw_hash=?2 WHERE id=?3").bind(salt, await hashPw(pass, salt), id).run();
await env.DB.prepare("DELETE FROM login_fails WHERE k=?").bind(String(a.username).toLowerCase()).run();
return json(env, { ok: true });
}
if (path === "/admin/send" && req.method === "POST") {
const id = String(body.id || ""), amount = Math.floor(Number(body.amount));
if (!Number.isFinite(amount) || amount < TRANSFER_MIN || amount > MAX_SEND) return bad(env, "Jumlah tidak valid");
const rcp = await env.DB.prepare("SELECT id,username FROM accounts WHERE id=?").bind(id).first();
if (!rcp) return bad(env, "Akun tidak ada", 404);
const tax = Math.floor(amount * TAX_PCT / 100), net = amount - tax;
await env.DB.prepare("INSERT INTO inbox (from_id,from_name,to_id,to_name,amount,tax,net,at,claimed) VALUES ('ADMIN','ADMIN',?1,?2,?3,?4,?5,?6,0)").bind(id, rcp.username, amount, tax, net, now).run();
return json(env, { ok: true, tax, net });
}
if (path === "/admin/chips" && req.method === "POST") {
const id = String(body.id || ""), amount = Math.trunc(Number(body.amount));
if (!Number.isFinite(amount) || Math.abs(amount) > 1e12) return bad(env, "Jumlah tidak valid");
const r = await env.DB.prepare("UPDATE accounts SET balance=MAX(0,balance+?) WHERE id=?").bind(amount, id).run();
if (!r.meta.changes) return bad(env, "Akun tidak ada", 404);
const a = await env.DB.prepare("SELECT balance FROM accounts WHERE id=?").bind(id).first();
return json(env, { ok: true, balance: a.balance });
}
}
return bad(env, "Tidak ditemukan", 404);
}
