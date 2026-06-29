const fs=require("fs");const{Keypair}=require("@solana/web3.js");
const kp=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("treasury.json","utf8"))));
console.log(kp.publicKey.toBase58());
