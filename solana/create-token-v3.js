/* ============================================================
   $CRYSTAL v3 — Solana DEVNET. Финальный выпуск:
   1) монета (freeze authority = нет),
   2) он-чейн метаданные Metaplex (имя/символ/логотип — видно в Phantom),
   3) эмиссия ровно 1 000 000 000,
   4) СОЖЖЕНИЕ права чеканки (mint authority → null) — предел 1B
      гарантирован протоколом, больше выпустить нельзя никогда.
   Запуск: node create-token-v3.js [АДРЕС_ИГРОКА]
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, getMint, transfer } = require("@solana/spl-token");
const { PROGRAM_ID: MPL_ID, createCreateMetadataAccountV3Instruction } = require("@metaplex-foundation/mpl-token-metadata");

const DECIMALS = 9;
const SUPPLY = 1_000_000_000n;
const UNIT = 10n ** BigInt(DECIMALS);
const PLAYER = process.argv[2] || null;
const PLAYER_GRANT = 25_000n;
const META = {
  name: "Crystal Kingdoms",
  symbol: "CRYSTAL",
  uri: "https://volodya-builder.github.io/crystal-kingdoms/assets/token.json",
};

(async () => {
  const treasury = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, "treasury.json"), "utf8"))));
  const conn = new Connection(process.env.RPC_URL || "https://api.devnet.solana.com", "confirmed");
  const bal = await conn.getBalance(treasury.publicKey);
  console.log("Казна:", treasury.publicKey.toBase58(), "| SOL:", (bal / LAMPORTS_PER_SOL).toFixed(3));

  console.log("1) Монета…");
  const mint = await createMint(conn, treasury, treasury.publicKey, null, DECIMALS);
  console.log("   MINT:", mint.toBase58());

  console.log("2) Он-чейн метаданные (имя+логотип)…");
  const [mdPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), MPL_ID.toBuffer(), mint.toBuffer()], MPL_ID);
  const ix = createCreateMetadataAccountV3Instruction(
    { metadata: mdPda, mint, mintAuthority: treasury.publicKey, payer: treasury.publicKey, updateAuthority: treasury.publicKey },
    { createMetadataAccountArgsV3: { data: { name: META.name, symbol: META.symbol, uri: META.uri,
        sellerFeeBasisPoints: 0, creators: null, collection: null, uses: null },
        isMutable: true, collectionDetails: null } });
  await sendAndConfirmTransaction(conn, new Transaction().add(ix), [treasury]);
  console.log("   ✓ metadata PDA:", mdPda.toBase58());

  console.log("3) Эмиссия 1 000 000 000…");
  const tAta = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, treasury.publicKey);
  await mintTo(conn, treasury, mint, tAta.address, treasury, SUPPLY * UNIT);

  console.log("4) СЖИГАЮ право чеканки…");
  await setAuthority(conn, treasury, mint, treasury, AuthorityType.MintTokens, null);

  console.log("5) Проверка на блокчейне…");
  const info = await getMint(conn, mint);
  console.log("   mintAuthority:", info.mintAuthority ? "ЕСТЬ (ОШИБКА!)" : "null — сожжено ✓");
  console.log("   supply:", (info.supply / UNIT).toLocaleString("ru-RU"), info.supply === SUPPLY * UNIT ? "✓" : "✗");
  console.log("   freezeAuthority:", info.freezeAuthority ? "ЕСТЬ (ОШИБКА!)" : "null ✓");
  if (info.mintAuthority !== null || info.supply !== SUPPLY * UNIT) process.exit(1);

  if (PLAYER) {
    console.log("6) Игроку", PLAYER_GRANT.toLocaleString("ru-RU"), "монет…");
    const pAta = await getOrCreateAssociatedTokenAccount(conn, treasury, mint, new PublicKey(PLAYER));
    await transfer(conn, treasury, tAta.address, pAta.address, treasury, PLAYER_GRANT * UNIT);
    console.log("   ✓");
  }

  fs.writeFileSync(path.join(__dirname, "config.json"), JSON.stringify({
    symbol: "CRYSTAL", decimals: DECIMALS, mint: mint.toBase58(),
    treasury: treasury.publicKey.toBase58(), cluster: "devnet",
    supply: SUPPLY.toString(), hardCap: true, mintAuthorityRevoked: true, metadata: mdPda.toBase58(),
  }, null, 2));
  console.log("\n================= ФИНАЛЬНАЯ МОНЕТА =================");
  console.log("MINT =", mint.toBase58());
  console.log("Explorer: https://explorer.solana.com/address/" + mint.toBase58() + "?cluster=devnet");
})().catch(e => { console.error("ОШИБКА:", e.message || e); process.exit(1); });
