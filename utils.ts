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
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import {
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import {
  API_URL,
  PRIORITY_FEE,
  RPC_URL,
  SLIPPAGE,
  SOL_BUY_MAX,
  SOL_BUY_MIN,
} from "./constants";

export const connection = new Connection(RPC_URL, {
  confirmTransactionInitialTimeout: 45_000,
  commitment: "confirmed",
});

export type WalletInfoType = {
  privateKey: string;
  publicKey: string;
};

export type PausedWalletInfoType = {
  privateKey: string;
  publicKey: string;
  amount: number;
};

// Get the number of decimals for a given token to accurately handle token amounts.
async function getNumberDecimals(mintAddress: PublicKey): Promise<number> {
  try {
    await waitSeconds(10);
    const info = await connection.getParsedAccountInfo(mintAddress);
    const decimals = (info.value?.data as ParsedAccountData).parsed.info
      .decimals as number;
    // console.log(`Token Decimals: ${decimals}`);
    return decimals;
  } catch (err) {
    console.error("Error in getting number decimal: ", err);
    return 9;
  }
}

export async function waitSeconds(seconds: number) {
  console.log(`Waiting ${seconds} seconds..`);
  await new Promise((_resolve_) => setTimeout(_resolve_, seconds * 1000));
}

export async function getRentFee() {
  try {
    const dataLength = 1500;
    const rentExemptionAmount =
      await connection.getMinimumBalanceForRentExemption(dataLength);
    return rentExemptionAmount;
  } catch (err) {
    console.error("Error in getting rent fee: ", err);
    throw err;
  }
}

export async function getSolPrice() {
  try {
    // Get the current price of SOL from CoinGecko API
    const { data } = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    return data.solana.usd;
  } catch (err) {
    console.error("Error getting SOL price:", err);
    throw err;
  }
}

export async function getWalletBalance(publicKey: string): Promise<number> {
  try {
    await waitSeconds(10);
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return balance / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error("Error in getting wallet balance: ", err);
    return 0;
  }
}

export async function getTokenBalance(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey
) {
  try {
    await waitSeconds(10);
    const response = await axios({
      url: RPC_URL,
      method: "post",
      headers: { "Content-Type": "application/json" },
      data: [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [
            walletAddress,
            {
              mint: tokenMintAddress,
            },
            {
              encoding: "jsonParsed",
            },
          ],
        },
      ],
    });

    const tokenAmount =
      response?.data[0]?.result?.value[0]?.account?.data?.parsed?.info
        ?.tokenAmount;
    return tokenAmount ? tokenAmount.uiAmount : 0;
  } catch (err) {
    console.error("Error in getting token balance:", err);
    return 0;
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
    console.error("Error in reading from wallets file: ", err);
    return [];
  }
}

export async function storeWalletsToFile(wallets: WalletInfoType[]) {
  try {
    const walletsFile = path.join(__dirname, "wallets.json");
    fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 2));

    console.log(`Wallets generated and saved to ${walletsFile}`);
  } catch (err) {
    console.error("Error in writing to wallets file: ", err);
  }
}

export async function getPausedState() {
  try {
    const pausedFile = path.join(__dirname, "paused.json");
    const wallets = fs.readFileSync(pausedFile, "utf8");
    return JSON.parse(wallets);
  } catch (err) {
    console.error("Error in reading from paused wallets file: ", err);
    return [];
  }
}

export async function setPausedState(wallets: PausedWalletInfoType[]) {
  try {
    const pausedFile = path.join(__dirname, "paused.json");
    fs.writeFileSync(pausedFile, JSON.stringify(wallets, null, 2));

    console.log(`Paused process saved to ${pausedFile}`);
  } catch (err) {
    console.error("Error in writing to paused wallets file: ", err);
  }
}

export function generateRandomAmounts(numberOfWallets: number) {
  const amounts = [];
  for (let index = 0; index < numberOfWallets; index++) {
    const randomAmount =
      Math.round(
        (Math.random() * (SOL_BUY_MAX - SOL_BUY_MIN) + SOL_BUY_MIN) *
          LAMPORTS_PER_SOL
      ) / LAMPORTS_PER_SOL;
    amounts.push(randomAmount);
  }

  return amounts;
}

export async function sendSolToWallet(
  fromPvtKey: string,
  toPubKey: PublicKey,
  amount: number
) {
  try {
    const transaction = new Transaction();

    const fromWallet = Keypair.fromSecretKey(bs58.decode(fromPvtKey));

    const sendSolInstruction = SystemProgram.transfer({
      fromPubkey: fromWallet.publicKey,
      toPubkey: toPubKey,
      lamports: Math.round(LAMPORTS_PER_SOL * amount),
    });
    transaction.add(sendSolInstruction);

    await waitSeconds(10);
    console.log(
      `Sending ${amount} SOL from ${fromWallet.publicKey} to ${toPubKey}`
    );

    const transactionSignature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [fromWallet]
    );

    console.log(
      `Transaction successful: https://solscan.io/tx/${transactionSignature}`
    );
  } catch (err) {
    console.error("Error occurred in transferring SOL: ", err);
    throw err;
  }
}

export async function sendTokenToWallet(
  fromPvtKey: string,
  toPubKey: PublicKey,
  tokenAddress: string,
  amount: number
) {
  try {
    const tokenMintAddress = new PublicKey(tokenAddress);
    const fromWallet = Keypair.fromSecretKey(bs58.decode(fromPvtKey));

    const decimals = await getNumberDecimals(tokenMintAddress);

    // Create or get the associated token accounts for the sender and receiver.
    let fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      fromWallet,
      tokenMintAddress,
      fromWallet.publicKey
    );

    let toTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      fromWallet,
      tokenMintAddress,
      toPubKey
    );

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

    let latestBlockhash = await connection.getLatestBlockhash("confirmed");

    // Compiles and signs the transaction message with the sender's Keypair.
    const messageV0 = new TransactionMessage({
      payerKey: fromWallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [transferInstruction],
    }).compileToV0Message();
    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([fromWallet]);

    console.log(
      `Sending ${amount} token from ${fromWallet.publicKey} to ${toPubKey}`
    );
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
      throw new Error("Transaction not confirmed.");
    }
    console.log(
      `Transaction Successfully Confirmed! View on SolScan: https://solscan.io/tx/${txid}`
    );
  } catch (err) {
    console.error("Error in transferring SPL token: ", err);
    throw err;
  }
}

export async function getLatestTokenTransaction(tokenMintAddress: string) {
  try {
    await waitSeconds(10);
    const latestBlockhash = await connection.getLatestBlockhash();

    // Find all transactions that include this token
    await waitSeconds(10);
    const tokenTransactionsLamportRange =
      await connection.getSignaturesForAddress(
        new PublicKey(tokenMintAddress),
        { limit: 1 } //until: latestBlockhash.blockhash,
      );

    if (tokenTransactionsLamportRange.length > 0) {
      const sortedTokenTransactions = tokenTransactionsLamportRange
        .sort((a, b) => Number(b.signature) - Number(a.signature))
        .slice(0, 1);

      if (sortedTokenTransactions.length > 0) {
        await waitSeconds(10);
        const latestTokenTransaction = await connection.getTransaction(
          sortedTokenTransactions[0].signature,
          { maxSupportedTransactionVersion: 0 }
        );

        return latestTokenTransaction?.transaction?.signatures[0];
      } else {
        console.log("No token transactions were found.");
      }
    } else {
      console.log("No token transactions were found.");
    }
  } catch (err) {
    console.error(
      "Error occurred during latest token transaction lookup:",
      err
    );
  }
}

export async function placeBuyTrade(
  tokenMint: any,
  privateKey: string,
  amount: number
) {
  const url = `${API_URL}/trade`;
  const data = {
    trade_type: "buy",
    mint: tokenMint,
    amount: amount,
    slippage: SLIPPAGE,
    priorityFee: PRIORITY_FEE,
    userPrivateKey: privateKey,
  };

  try {
    const walletInfo = Keypair.fromSecretKey(bs58.decode(privateKey));
    console.log(
      `Placing buy order with ${amount} SOL on ${walletInfo.publicKey}...`
    );
    const response = await axios({
      url: url,
      method: "post",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(data),
    });

    const txid = response.data.tx_hash;
    console.log(`Transaction successful: https://solscan.io/tx/${txid}`);

    return txid;
  } catch (err) {
    console.error("Error in buying the token:", err);
    return null;
  }
}

export async function getSellTransaction(
  tokenMint: any,
  privateKey: string,
  amount: any
) {
  const url = `${API_URL}/trade`;

  const data = {
    trade_type: "sell",
    mint: tokenMint,
    amount: amount,
    slippage: SLIPPAGE,
    priorityFee: PRIORITY_FEE,
    userPrivateKey: privateKey,
  };

  const response = await axios({
    url: url,
    method: "post",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(data),
  });

  try {
    return response.data.transaction;
  } catch (err) {
    console.error("Error in creating sell transaction: ", err);
    throw err;
  }
}

export async function placeSellTrade(
  owner: Keypair,
  tokenMint: any,
  privateKey: string,
  amount: number
) {
  try {
    const walletInfo = Keypair.fromSecretKey(bs58.decode(privateKey));

    const encoded_tx: any = await getSellTransaction(
      tokenMint,
      privateKey,
      amount
    );

    if (encoded_tx) {
      const transaction = VersionedTransaction.deserialize(
        bs58.decode(encoded_tx)
      );

      console.log(
        `Placing sell order with ${amount} token on ${walletInfo.publicKey}`
      );
      transaction.sign([owner]);

      await waitSeconds(10);
      const txid = await connection.sendTransaction(transaction, {
        skipPreflight: false,
        maxRetries: 5,
      });

      console.log(
        `Transaction successful! View on SolScan: https://solscan.io/tx/${txid}`
      );
    } else {
      console.log("Transaction was not successful.");
    }
  } catch (err) {
    console.error("Error in selling the token back: ", err);
  }
}
