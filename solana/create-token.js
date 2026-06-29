/* ============================================================
   Создание тестового токена $CRYSTAL в сети Solana DEVNET.
   Запуск:  node create-token.js
   Опционально: node create-token.js <АДРЕС_ТВОЕГО_PHANTOM_КОШЕЛЬКА>
                — тогда тебе сразу начислят 5000 тестовых $CRYSTAL.

   Результат:
   - создаётся монета $CRYSTAL (9 знаков, как стандарт Solana);
   - создаётся «казна» (treasury) и сохраняется в treasury.json (СЕКРЕТ — не публикуй!);
   - вся начальная эмиссия (100 000 000) минтится в казну;
   - в config.json пишутся MINT и TREASURY — их вставим в игру.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const {
  Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl,
} = require("@solana/web3.js");
const {
  createMint, getOrCreateAssociatedTokenAccount, mintTo,
} = require("@solana/spl-token");

const DECIMALS = 9;
const SUPPLY = 100_000_000;          // максимальная эмиссия
const FAUCET = 5000;                 // сколько начислить указанному кошельку для теста

(async () => {
  const conn = new Connection(clusterApiUrl("devnet"), "confirmed");

  // --- казна (mint authority + хранилище эмиссии) ---
  const tPath = path.join(__dirname, "treasury.json");
  let treasury;
  if (fs.existsSync(tPath)) {
    treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(tPath, "utf8"))));
    console.log("Казна загружена из treasury.json:", treasury.publicKey.toBase58());
  } else {
    treasury = Keypair.generate();
    fs.writeFileSync(tPath, JSON.stringify(Array.from(treasury.secretKey)));
    console.log("Создана новая казна:", treasury.publicKey.toBase58(), "(секрет → treasury.json)");
  }

  // --- девнет-аирдроп SOL казне (на комиссии) ---
  const bal = await conn.getBalance(treasury.publicKey);
  if (bal < 1 * LAMPORTS_PER_SOL) {
    console.log("Запрашиваю devnet-airdrop 2 SOL…");
    try {
      const sig = await conn.requestAirdrop(treasury.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
    } catch (e) {
      console.log("⚠ Airdrop не прошёл (лимит девнета). Пополни вручную: https://faucet.solana.com (адрес казны выше).");
    }
  }

  // --- если токен уже создан (config.json) — переиспользуем ---
  const cPath = path.join(__dirname, "config.json");
  let mintPk;
  if (fs.existsSync(cPath)) {
    const c = JSON.parse(fs.readFileSync(cPath, "utf8"));
    mintPk = new PublicKey(c.mint);
    console.log("Токен уже есть:", c.mint);
  } else {
    console.log("Создаю токен $CRYSTAL…");
    mintPk = await createMint(conn, treasury, treasury.publicKey, treasury.publicKey, DECIMALS);
    // эмиссия в казну
    const tAta = await getOrCreateAssociatedTokenAccount(conn, treasury, mintPk, treasury.publicKey);
    await mintTo(conn, treasury, mintPk, tAta.address, treasury, BigInt(SUPPLY) * BigInt(10 ** DECIMALS));
    fs.writeFileSync(cPath, JSON.stringify({
      symbol: "CRYSTAL", decimals: DECIMALS, mint: mintPk.toBase58(),
      treasury: treasury.publicKey.toBase58(), cluster: "devnet",
    }, null, 2));
    console.log("✓ Токен создан, эмиссия", SUPPLY.toLocaleString(), "→ казна");
  }

  // --- опционально: начислить тестовые токены указанному кошельку ---
  const arg = process.argv[2];
  if (arg) {
    const wallet = new PublicKey(arg);
    const ata = await getOrCreateAssociatedTokenAccount(conn, treasury, mintPk, wallet);
    await mintTo(conn, treasury, mintPk, ata.address, treasury, BigInt(FAUCET) * BigInt(10 ** DECIMALS));
    console.log(`✓ Начислено ${FAUCET} $CRYSTAL на ${arg}`);
  }

  const cfg = JSON.parse(fs.readFileSync(cPath, "utf8"));
  console.log("\n================= ВСТАВЬ ЭТО В ИГРУ =================");
  console.log("MINT     =", cfg.mint);
  console.log("TREASURY =", cfg.treasury);
  console.log("CLUSTER  = devnet");
  console.log("====================================================");
  console.log("Посмотреть токен: https://explorer.solana.com/address/" + cfg.mint + "?cluster=devnet");
})().catch(e => { console.error("ОШИБКА:", e.message || e); process.exit(1); });
