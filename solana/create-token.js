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

const RPCS = [
  process.env.RPC_URL,
  "https://api.devnet.solana.com",
].filter(Boolean);

(async () => {
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

  // --- выбираем RPC, на котором у казны ВИДНЫ деньги (обходим перегруженные узлы) ---
  let conn = null, bal = 0;
  for (const url of RPCS) {
    try {
      const c = new Connection(url, "confirmed");
      const b = await c.getBalance(treasury.publicKey);
      console.log("  RPC", url, "→ баланс казны:", (b / LAMPORTS_PER_SOL).toFixed(3), "SOL");
      if (b > bal) { bal = b; conn = c; }
    } catch (e) { console.log("  RPC", url, "недоступен:", e.message); }
  }
  if (!conn) conn = new Connection(RPCS[0], "confirmed");  // если балансов нет — берём первый RPC (RPC_URL приоритетно)
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let attempt = 1; attempt <= 4 && bal < 0.05 * LAMPORTS_PER_SOL; attempt++) {
    try {
      console.log("Airdrop попытка " + attempt + " (2 SOL через RPC)…");
      await conn.requestAirdrop(treasury.publicKey, 2 * LAMPORTS_PER_SOL);
      for (let i = 0; i < 20 && bal < 0.05 * LAMPORTS_PER_SOL; i++) { await sleep(2000); bal = await conn.getBalance(treasury.publicKey); }
    } catch (e) { console.log("  airdrop не прошёл:", (e.message || e).slice(0, 80)); await sleep(3000); }
  }
  if (bal < 0.05 * LAMPORTS_PER_SOL) {
    console.log("\n⚠ Не удалось получить SOL автоматически. Пополни казну вручную (любой способ) и запусти снова:");
    console.log("   адрес казны:", treasury.publicKey.toBase58());
    console.log("   фосеты: https://faucet.solana.com  |  https://faucet.quicknode.com/solana/devnet  (сеть Devnet)");
    process.exit(0);
  }
  console.log("✓ Использую RPC с балансом казны", (bal / LAMPORTS_PER_SOL).toFixed(3), "SOL");

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
