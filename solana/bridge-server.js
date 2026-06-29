/* ============================================================
   МОСТ-СЕРВЕР Ruby ↔ $CRYSTAL (Solana DEVNET).
   Держит ключ казны и выполняет операции, которые НЕЛЬЗЯ делать из браузера.
   Запуск:  node bridge-server.js     (после create-token.js)
   Слушает http://localhost:8787

   Эндпоинты:
   GET  /config                      → {mint, treasury, decimals, rate}
   GET  /balance/:wallet             → {amount}  баланс $CRYSTAL кошелька
   POST /withdraw {wallet, ruby}     → минтит ruby*RATE $CRYSTAL на кошелёк (Ruby→$CRYSTAL)
   POST /verify-deposit {sig}        → проверяет перевод $CRYSTAL в казну → {ok, amount}
                                        (игра по этому начисляет Ruby; направление $CRYSTAL→Ruby)

   ⚠ ТЕСТОВЫЙ сервер: доверяет клиенту. Для продакшна — проверять баланс Ruby на бэке
     и подписывать заявки. Сейчас цель — рабочий девнет-прототип.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const {
  Connection, Keypair, PublicKey, clusterApiUrl,
} = require("@solana/web3.js");
const {
  getOrCreateAssociatedTokenAccount, mintTo, getAccount, getAssociatedTokenAddress,
} = require("@solana/spl-token");

const RATE = 1;            // 1 Ruby = 1 $CRYSTAL (тестовый курс)
const PORT = 8787;

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, "treasury.json"), "utf8"))));
const MINT = new PublicKey(cfg.mint);
const DEC = cfg.decimals;
const UNIT = BigInt(10 ** DEC);
const conn = new Connection(clusterApiUrl("devnet"), "confirmed");
const usedSigs = new Set();   // защита от двойного зачёта депозита

const app = express();
app.use(cors());
app.use(express.json());

app.get("/config", (_req, res) => res.json({ mint: cfg.mint, treasury: cfg.treasury, decimals: DEC, rate: RATE, cluster: "devnet" }));

app.get("/balance/:wallet", async (req, res) => {
  try {
    const owner = new PublicKey(req.params.wallet);
    const ata = await getAssociatedTokenAddress(MINT, owner);
    let amount = 0;
    try { const acc = await getAccount(conn, ata); amount = Number(acc.amount) / Number(UNIT); } catch (_) {}
    res.json({ amount });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Ruby → $CRYSTAL : минтим токены игроку
app.post("/withdraw", async (req, res) => {
  try {
    const { wallet, ruby } = req.body;
    const amt = Math.floor(Number(ruby));
    if (!wallet || !amt || amt <= 0) return res.status(400).json({ error: "bad params" });
    const owner = new PublicKey(wallet);
    const ata = await getOrCreateAssociatedTokenAccount(conn, treasury, MINT, owner);
    const sig = await mintTo(conn, treasury, MINT, ata.address, treasury, BigInt(amt * RATE) * UNIT);
    res.json({ ok: true, sig, crystal: amt * RATE });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// $CRYSTAL → Ruby : проверяем, что игрок прислал токены в казну
app.post("/verify-deposit", async (req, res) => {
  try {
    const { sig } = req.body;
    if (!sig) return res.status(400).json({ error: "no sig" });
    if (usedSigs.has(sig)) return res.status(400).json({ error: "already used" });
    const tx = await conn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) return res.status(404).json({ error: "tx not found" });
    const treasuryStr = cfg.treasury;
    const pre = tx.meta.preTokenBalances || [], post = tx.meta.postTokenBalances || [];
    const find = arr => arr.find(b => b.owner === treasuryStr && b.mint === cfg.mint);
    const before = find(pre), after = find(post);
    const delta = (after ? Number(after.uiTokenAmount.uiAmount) : 0) - (before ? Number(before.uiTokenAmount.uiAmount) : 0);
    if (delta <= 0) return res.status(400).json({ error: "no $CRYSTAL received by treasury" });
    usedSigs.add(sig);
    res.json({ ok: true, amount: delta, ruby: Math.floor(delta / RATE) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log("🌉 Мост $CRYSTAL запущен: http://localhost:" + PORT);
  console.log("   mint:", cfg.mint, "| treasury:", cfg.treasury, "| курс 1 Ruby =", RATE, "$CRYSTAL");
});
