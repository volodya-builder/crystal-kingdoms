/* ============================================================
   $CRYSTAL v2 — Solana DEVNET.
   Жёсткая эмиссия: 1 000 000 000 монет, после чего право чеканки
   УНИЧТОЖАЕТСЯ (mint authority -> null). Больше выпустить НЕЛЬЗЯ
   физически — это гарантирует протокол Solana, а не обещание.
   Freeze authority не задаётся вовсе (никто не может замораживать счета).
   Запуск: node create-token-v2.js [АДРЕС_ИГРОКА_ДЛЯ_ПЕРЕНОСА_БАЛАНСА]
   Результат: config.json перезаписывается новым MINT.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, getMint, transfer } = require("@solana/spl-token");

const DECIMALS = 9;
const SUPPLY = 1_000_000_000n;                 // ровно один миллиард
const UNIT = 10n ** BigInt(DECIMALS);
const PLAYER = process.argv[2] || null;        // кому перенести игровой баланс (старые 25000)
const PLAYER_GRANT = 25_000n;

(async () => {
  const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, "treasury.json"), "utf8"))));
  const conn = new Connection(process.env.RPC_URL || "https://api.devnet.solana.com", "confirmed");
  const bal = await conn.getBalance(treasury.publicKey);
  console.log("Казна:", treasury.publicKey.toBase58(), "| SOL:", (bal / LAMPORTS_PER_SOL).toFixed(3));
  if (bal < 0.05 * LAMPORTS_PER_SOL) { console.log("⚠ Мало SOL на казне"); process.exit(1); }

  console.log("1) Создаю монету (freeze authority = НЕТ изначально)…");
  const mint = await createMint(conn, treasury, treasury.publicKey, /*freeze*/ null, DECIMALS);
  console.log("   MINT:", mint.toBase58());

  console.log("2) Чеканю ровно", SUPPLY.toLocaleString("ru-RU"), "в казну…");
  const tAta = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, treasury.publicKey);
  await mintTo(conn, treasury, mint, tAta.address, treasury, SUPPLY * UNIT);

  console.log("3) УНИЧТОЖАЮ право чеканки (mint authority → null)…");
  await setAuthority(conn, treasury, mint, treasury, AuthorityType.MintTokens, null);

  console.log("4) Проверка на блокчейне…");
  const info = await getMint(conn, mint);
  const okAuth = info.mintAuthority === null;
  const okSupply = info.supply === SUPPLY * UNIT;
  const okFreeze = info.freezeAuthority === null;
  console.log("   mintAuthority:", info.mintAuthority ? info.mintAuthority.toBase58() : "null (сожжено)", okAuth ? "✓" : "✗!");
  console.log("   supply:", (info.supply / UNIT).toLocaleString("ru-RU"), okSupply ? "✓" : "✗!");
  console.log("   freezeAuthority:", info.freezeAuthority ? "ЕСТЬ (плохо)" : "null ✓");
  if (!okAuth || !okSupply) { console.log("ПРОВЕРКА НЕ ПРОШЛА"); process.exit(1); }

  if (PLAYER) {
    console.log("5) Переношу игроку", PLAYER_GRANT.toLocaleString("ru-RU"), "монет…");
    const pAta = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, new PublicKey(PLAYER));
    await transfer(conn, treasury, tAta.address, pAta.address, treasury, PLAYER_GRANT * UNIT);
    console.log("   ✓ на", PLAYER);
  }

  fs.writeFileSync(path.join(__dirname, "config.json"), JSON.stringify({
    symbol: "CRYSTAL", decimals: DECIMALS, mint: mint.toBase58(),
    treasury: treasury.publicKey.toBase58(), cluster: "devnet",
    supply: SUPPLY.toString(), hardCap: true, mintAuthorityRevoked: true,
  }, null, 2));
  console.log("\n================= НОВАЯ МОНЕТА =================");
  console.log("MINT     =", mint.toBase58());
  console.log("SUPPLY   = 1 000 000 000 (жёсткий предел, чеканка сожжена)");
  console.log("Explorer: https://explorer.solana.com/address/" + mint.toBase58() + "?cluster=devnet");
})().catch(e => { console.error("ОШИБКА:", e.message || e); process.exit(1); });
