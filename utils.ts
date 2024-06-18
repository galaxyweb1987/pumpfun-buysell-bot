import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import axios from "axios";
import { SOL_BUY_MAX, SOL_BUY_MIN } from "./constants";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import {
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";

export type WalletInfoType = {
  privateKey: string;
  publicKey: string;
};

export async function getWalletBalance(
  connection: Connection,
  publicKey: string
): Promise<number> {
  try {
    // Get the SOL balance of the wallet
    const balance = await connection.getBalance(new PublicKey(publicKey));

    // Convert lamports to sol and show only 2 decimals
    return balance / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error("Error in getting wallet balance: ", err);
    return 0;
  }
}

export async function getTokenBalance(
  connection: Connection,
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey
) {
  try {
    return 0;
  } catch (err) {
    console.error("Error fetching token balance:", err);
    throw err;
  }
}

export async function getSolPrice() {
  try {
    // Fetch the current price of SOL from CoinGecko API
    const { data } = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    return data.solana.usd;
  } catch (err) {
    console.error("Error fetching SOL price:", err);
    throw err;
  }
}

export function generateSolanaKeypair() {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKey = bs58.encode(keypair.secretKey);

  return { publicKey, privateKey };
}

export async function getWalletsFromFile() {
  try {
    const walletsFile = path.join(__dirname, "wallets.json");
    const wallets = fs.readFileSync(walletsFile, "utf8");
    return JSON.parse(wallets);
  } catch (err) {
    console.error('Error in reading from file: ', err);
    return {};
  }
}

export async function storeWalletsToFile(wallets: WalletInfoType[]) {
  try {
    const walletsFile = path.join(__dirname, "wallets.json");
    fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 2));

    console.log(`Wallets generated and saved to ${walletsFile}`);
  } catch (err) {
    console.error('Error in writing to file: ', err);
  }
}

export function generateRandomAmounts(numberOfWallets: number) {
  const amounts = [];
  for (let index = 0; index < numberOfWallets; index++) {
    const randomAmount =
      Math.random() * (SOL_BUY_MAX - SOL_BUY_MIN) + SOL_BUY_MIN;
    amounts.push(randomAmount);
  }

  return amounts;
}

export async function sendSolToWallet(
  connection: Connection,
  fromPvtKey: string,
  toPubKey: PublicKey,
  amount: number
) {
  try {
    const transaction = new Transaction();

    const srcPrivateKeyBuffer = Buffer.from(fromPvtKey.slice(2), "hex");
    const fromWallet = Keypair.fromSecretKey(srcPrivateKeyBuffer);

    const sendSolInstruction = SystemProgram.transfer({
      fromPubkey: fromWallet.publicKey,
      toPubkey: toPubKey,
      lamports: LAMPORTS_PER_SOL * amount,
    });

    transaction.add(sendSolInstruction);
    const transactionSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [fromWallet]
    );

    console.log(`Transaction signature: ${transactionSignature}`);
  } catch (err) {
    console.error("Error occurred during transfer:", err);
  }
}

// Fetches the number of decimals for a given token to accurately handle token amounts.
export async function getNumberDecimals(
  mintAddress: PublicKey,
  connection: Connection
): Promise<number> {
  try {
    const info = await connection.getParsedAccountInfo(mintAddress);
    const decimals = (info.value?.data as ParsedAccountData).parsed.info
      .decimals as number;
    console.log(`Token Decimals: ${decimals}`);
    return decimals;
  } catch (err) {
    console.error('Error in getting number decimal: ', err);
    return 9;
  }
}

export async function sendTokenToWallet(
  connection: Connection,
  fromPvtKey: string,
  toPubKey: PublicKey,
  tokenAddress: string,
  amount: number
) {
  try {
    const tokenMintAddress = new PublicKey(tokenAddress);
    const srcPrivateKeyBuffer = Buffer.from(fromPvtKey.slice(2), "hex");
    const fromWallet = Keypair.fromSecretKey(srcPrivateKeyBuffer);

    const decimals = await getNumberDecimals(tokenMintAddress, connection);

    // Creates or fetches the associated token accounts for the sender and receiver.
    let fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      fromWallet,
      tokenMintAddress,
      fromWallet.publicKey
    );
    console.log(`Source Account: ${fromTokenAccount.address.toString()}`);

    console.log(fromTokenAccount.amount);

    let toTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      fromWallet,
      tokenMintAddress,
      toPubKey
    );
    console.log(`Destination Account: ${toTokenAccount.address.toString()}`);

    // Adjusts the transfer amount according to the token's decimals to ensure accurate transfers.
    const transferAmountInDecimals = amount * Math.pow(10, decimals);

    // Prepares the transfer instructions with all necessary information.
    const transferInstruction = createTransferInstruction(
      // Those addresses are the Associated Token Accounts belonging to the sender and receiver
      fromTokenAccount.address,
      toTokenAccount.address,
      fromWallet.publicKey,
      transferAmountInDecimals
    );
    console.log(
      `Transaction instructions: ${JSON.stringify(transferInstruction)}`
    );
    let latestBlockhash = await connection.getLatestBlockhash("confirmed");

    // Compiles and signs the transaction message with the sender's Keypair.
    const messageV0 = new TransactionMessage({
      payerKey: fromWallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [transferInstruction],
    }).compileToV0Message();
    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([fromWallet]);
    console.log("Transaction Signed. Preparing to send...");

    const txid = await connection.sendTransaction(versionedTransaction, {
      maxRetries: 20,
    });
    console.log(`Transaction Submitted: ${txid}`);

    const confirmation = await connection.confirmTransaction(
      {
        signature: txid,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed"
    );
    if (confirmation.value.err) {
      throw new Error("🚨Transaction not confirmed.");
    }
    console.log(
      `Transaction Successfully Confirmed! 🎉 View on SolScan: https://solscan.io/tx/${txid}`
    );
  } catch (err) {
    console.error("Error in transferring SPL token: ", err);
  }
}
