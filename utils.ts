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

// Wait for [seconds] seconds before proceeding to next method
export async function waitSeconds(seconds: number) {
  console.log(`Waiting ${seconds} seconds..`);
  await new Promise((_resolve_) => setTimeout(_resolve_, seconds * 1000));
}

// Get minimum rent fee of solana account
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

// Get current SOL price in usd
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

// Get SOL balance of wallet
export async function getWalletBalance(walletAddress: string): Promise<number> {
  try {
    const balance = await connection.getBalance(new PublicKey(walletAddress));
    return balance / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error("Error in getting wallet balance: ", err);
    return 0;
  }
}

// Get SPL token balance of wallet
export async function getTokenBalance(
  walletAddress: PublicKey,
  tokenMintAddress: PublicKey
) {
  try {
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

// Create a wallet by generating key pair of solana account
export function generateSolanaKeypair() {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKey = bs58.encode(keypair.secretKey);

  return { publicKey, privateKey };
}

// Read list of generated wallets from the wallets.json
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

// Write list of generated wallets to the wallets.json
export async function storeWalletsToFile(wallets: WalletInfoType[]) {
  try {
    const walletsFile = path.join(__dirname, "wallets.json");
    fs.writeFileSync(walletsFile, JSON.stringify(wallets, null, 2));

    console.log(`Wallets generated and saved to ${walletsFile}`);
  } catch (err) {
    console.error("Error in writing to wallets file: ", err);
  }
}

// Get list of wallets for resuming the trade from paused.json
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

// Write list of wallets for resuming the trade to paused.json
export async function setPausedState(wallets: PausedWalletInfoType[]) {
  try {
    const pausedFile = path.join(__dirname, "paused.json");
    fs.writeFileSync(pausedFile, JSON.stringify(wallets, null, 2));

    if (wallets?.length > 0) {
      console.log(`Paused process saved to ${pausedFile}`);
    }
  } catch (err) {
    console.error("Error in writing to paused wallets file: ", err);
  }
}

// Generate SOL amounts to send to each wallet
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

// Transfer [amount] SOL between wallets
export async function sendSolToWallet(
  fromPvtKey: string,
  toPubKey: PublicKey,
  amount: number
) {
  try {
    const fromWallet = Keypair.fromSecretKey(bs58.decode(fromPvtKey));

    console.log(
      `Sending ${amount.toFixed(4)} SOL from ${fromWallet.publicKey} to ${toPubKey}`
    );

    const transaction = new Transaction();
    const sendSolInstruction = SystemProgram.transfer({
      fromPubkey: fromWallet.publicKey,
      toPubkey: toPubKey,
      lamports: Math.round(LAMPORTS_PER_SOL * amount),
    });
    transaction.add(sendSolInstruction);    

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

// Transfer [amount] SPL token between wallets
export async function sendTokenToWallet(
  fromPvtKey: string,
  toPubKey: PublicKey,
  tokenAddress: string,
  amount: number
) {
  try {
    const fromWallet = Keypair.fromSecretKey(bs58.decode(fromPvtKey));
    const tokenMintAddress = new PublicKey(tokenAddress);
    const decimals = await getNumberDecimals(tokenMintAddress);

    console.log(
      `Sending ${amount.toFixed(2)} token from ${fromWallet.publicKey} to ${toPubKey}`
    );

    // Adjust the transfer amount according to the token's decimals to ensure accurate transfers.
    const transferAmountInDecimals = Math.round(amount * Math.pow(10, decimals));

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

    // Prepare the transfer instructions with all necessary information.
    const transferInstruction = createTransferInstruction(
      fromTokenAccount.address,
      toTokenAccount.address,
      fromWallet.publicKey,
      transferAmountInDecimals
    );

    let latestBlockhash = await connection.getLatestBlockhash("confirmed");

    // Compile and sign the transaction message with the sender's Keypair.
    const messageV0 = new TransactionMessage({
      payerKey: fromWallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [transferInstruction],
    }).compileToV0Message();
    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([fromWallet]);

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

// Get the latest transaction made on the target token
export async function getLatestTokenTransaction(tokenMintAddress: string) {
  try {
    const latestBlockhash = await connection.getLatestBlockhash();

    // Find all transactions that include this token
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
      "Error occurred during getting latest token transaction: ",
      err
    );
  }
}

// Place buy order on pump.fun for the target token with [amount] SOL
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
      `Placing buy order with ${amount.toFixed(4)} SOL on ${walletInfo.publicKey}...`
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

// Create sell transaction on pump.fun for SOL with [amount] SPL token
export async function getSellTransaction(
  tokenMint: any,
  privateKey: string,
  amount: any
) {
  const walletInfo = Keypair.fromSecretKey(bs58.decode(privateKey));

  const url = `${API_URL}/trade`;
  const data = {
    trade_type: "sell",
    mint: tokenMint,
    amount: amount,
    slippage: SLIPPAGE,
    priorityFee: PRIORITY_FEE,
    userPrivateKey: privateKey,
  };

  console.log(
    `Placing sell order with ${amount.toFixed(2)} token on ${walletInfo.publicKey}`
  );

  const response = await axios({
    url: url,
    method: "post",
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(data),
  });

  try {
    return response.data.tx_hash;
  } catch (err) {
    console.error("Error in creating sell transaction: ", err);
    throw err;
  }
}

// Place sell order on pump.fun for SOL with [amount] SPL token
export async function placeSellTrade(
  // owner: Keypair,
  tokenMint: any,
  privateKey: string,
  amount: number
) {
  try {
    // const walletInfo = Keypair.fromSecretKey(bs58.decode(privateKey));

    const tx_id: any = await getSellTransaction(tokenMint, privateKey, amount);

    if (tx_id) {
      console.log(
        `Transaction successful! View on SolScan: https://solscan.io/tx/${tx_id}`
      );
    }

    // Comment: To be used when tx_id is in encoded state
    // if (tx_id) {
    //   const transaction = VersionedTransaction.deserialize(
    //     bs58.decode(tx_id)
    //   );

    //   console.log(
    //     `Placing sell order with ${amount} token on ${walletInfo.publicKey}`
    //   );
    //   transaction.sign([owner]);

    //   const txid = await connection.sendTransaction(transaction, {
    //     skipPreflight: false,
    //     maxRetries: 20,
    //   });

    //   console.log(
    //     `Transaction successful! View on SolScan: https://solscan.io/tx/${txid}`
    //   );
    // } else {
    //   console.log("Transaction was not successful.");
    // }
  } catch (err) {
    console.error("Error in selling the token back: ", err);
  }
}
