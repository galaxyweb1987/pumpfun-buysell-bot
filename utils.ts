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
  TransactionInstruction,
  ComputeBudgetProgram,
  AddressLookupTableProgram,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import axios from "axios";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import {
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as BufferLayout from "@solana/buffer-layout";
import {
  API_URL,
  ASSOC_TOKEN_ACC_PROG,
  EVENT_AUTHORITY,
  FEE_RECIPIENT,
  GLOBAL,
  PLATFORM_FEE_RECIPIENT,
  PRIORITY_FEE,
  PUMP_FUN_PROGRAM,
  RENT,
  RPC_URL,
  SLIPPAGE,
  SOL_BUY_MAX,
  SOL_BUY_MIN,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  UNIT_BUDGET,
  UNIT_PRICE,
} from "./constants";
import { getSimulationComputeUnits } from "@solana-developers/helpers";

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
      `Sending ${amount.toFixed(4)} SOL from ${
        fromWallet.publicKey
      } to ${toPubKey}`
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
      `Sending ${amount.toFixed(2)} token from ${
        fromWallet.publicKey
      } to ${toPubKey}`
    );

    // Adjust the transfer amount according to the token's decimals to ensure accurate transfers.
    const transferAmountInDecimals = Math.round(
      amount * Math.pow(10, decimals)
    );

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
      `Placing buy order with ${amount.toFixed(4)} SOL on ${
        walletInfo.publicKey
      }...`
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
    `Placing sell order with ${amount.toFixed(2)} token on ${
      walletInfo.publicKey
    }`
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

export async function newBuy(
  tokenMint: any,
  privateKey: string,
  amount: number
) {
  try {
    const coinData = await getCoinData(tokenMint);

    if (!coinData) {
      console.log("Failed to retrieve coin data...");
      return;
    }

    const walletInfo = Keypair.fromSecretKey(bs58.decode(privateKey));
    const tokenMintAddress = new PublicKey(tokenMint);

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
            walletInfo.publicKey,
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

    let tokenAccount = response?.data[0]?.result?.value[0]?.pubkey;
    let tokenAccountInstructions = null;

    if (!tokenAccount) {
      tokenAccount = await getAssociatedTokenAddress(
        tokenMintAddress,
        walletInfo.publicKey
      );
      //  = await getOrCreateAssociatedTokenAccount(connection, walletInfo, tokenMintAddress, walletInfo.publicKey);
      const accountInfo = await connection.getAccountInfo(tokenAccount);

      if(accountInfo === null) {
        tokenAccountInstructions = createAssociatedTokenAccountInstruction(
          walletInfo.publicKey,
          tokenAccount,
          walletInfo.publicKey,
          tokenMintAddress,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
      }
    }

    // Calculate tokens out
    // console.log(coinData);
    const solInLamports = amount * LAMPORTS_PER_SOL;
    const tokenOut = Math.floor(
      (solInLamports * coinData.virtual_token_reserves) /
        coinData.virtual_sol_reserves
    );

    // Calculate max_sol_cost and amount
    const solInWithSlippage = (amount * (100 + SLIPPAGE)) / 100;
    const maxSolCost = Math.floor(solInWithSlippage * LAMPORTS_PER_SOL);

    // Calculate the fee
    const feeAmount = Math.floor(amount * 0.03 * LAMPORTS_PER_SOL);

    // Define account keys required for the swap
    const MINT = new PublicKey(coinData.mint);
    const BONDING_CURVE = new PublicKey(coinData.bonding_curve);
    const ASSOCIATED_BONDING_CURVE = new PublicKey(
      coinData.associated_bonding_curve
    );
    const ASSOCIATED_USER = new PublicKey(tokenAccount);
    const USER = walletInfo.publicKey;

    // Build account key list
    const keys: {
      pubkey: PublicKey;
      isSigner: boolean;
      isWritable: boolean;
    }[] = [
      { pubkey: new PublicKey(GLOBAL), isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(FEE_RECIPIENT),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: BONDING_CURVE, isSigner: false, isWritable: true },
      { pubkey: ASSOCIATED_BONDING_CURVE, isSigner: false, isWritable: true },
      { pubkey: ASSOCIATED_USER, isSigner: false, isWritable: true },
      { pubkey: USER, isSigner: true, isWritable: true },
      // { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(SYSTEM_PROGRAM),
        isSigner: false,
        isWritable: false,
      },
      // { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(TOKEN_PROGRAM),
        isSigner: false,
        isWritable: false,
      },
      { pubkey: new PublicKey(RENT), isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(EVENT_AUTHORITY),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey(PUMP_FUN_PROGRAM),
        isSigner: false,
        isWritable: false,
      },
    ];

    // Define integer values
    const buy = BigInt("16927863322537952870");
    const integers = [buy, BigInt(tokenOut), BigInt(maxSolCost)];

    const binarySegments = integers.map((integer) => {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(integer, 0);
      return buffer;
    });
    const data = Buffer.concat(binarySegments);
    const swapInstruction = new TransactionInstruction({
      keys,
      programId: new PublicKey(PUMP_FUN_PROGRAM),
      data,
    });

    const instructions: TransactionInstruction[] = [];

    if (tokenAccountInstructions) {
      instructions.push(tokenAccountInstructions);
    }
    instructions.push(swapInstruction);

    const slot = await connection.getSlot();
    const [lookupTableInst, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: walletInfo.publicKey,
        payer: walletInfo.publicKey,
        recentSlot: slot,
      });

    const lookupTableAccount = (
      await connection.getAddressLookupTable(lookupTableAddress)
    ).value;
    let lookupTables: Array<AddressLookupTableAccount> = [];
    if (lookupTableAccount) {
      lookupTables = [lookupTableAccount];
    }

    // const [microLamports, units, recentBlockhash] = await Promise.all([
    //   100,
    //   getSimulationComputeUnits(
    //     connection,
    //     instructions,
    //     walletInfo.publicKey,
    //     lookupTables
    //   ),
    //   connection.getLatestBlockhash(),
    // ]);
    const microLamports = 100;

    instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
    );
    instructions.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({ units: UNIT_BUDGET })
    );
    // if (units) {
    //   // probably should add some margin of error to units
    //   instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units }));
    // }

    const latestBlockhash = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: walletInfo.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: instructions,
      // }).compileToV0Message(lookupTables);
    }).compileToV0Message();
    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([walletInfo]);

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
    console.error("Error in placing new buy: ", err);
  }
}

export async function newSell(
  tokenMint: any,
  privateKey: string,
  amount: number
) {
  try {
    const coinData = await getCoinData(tokenMint);

    if (!coinData) {
      console.log("Failed to retrieve coin data...");
      return;
    }

    const walletInfo = Keypair.fromSecretKey(bs58.decode(privateKey));
    const tokenMintAddress = new PublicKey(tokenMint);

    const tokenAccount = await getAssociatedTokenAddress(
      tokenMintAddress,
      walletInfo.publicKey
    );

    // Calculate tokens out
    const virtualSolReserves = coinData.virtual_sol_reserves / 10 ** 9;
    const virtualTokenReserves = coinData.virtual_token_reserves / 10 ** 6;
    const pricePerToken = virtualSolReserves / virtualTokenReserves;

    const minSolOutput = Math.floor(
      ((amount * pricePerToken * (100 - SLIPPAGE)) / 100) * LAMPORTS_PER_SOL
    );

    // Define account keys required for the swap
    const MINT = new PublicKey(coinData.mint);
    const BONDING_CURVE = new PublicKey(coinData.bonding_curve);
    const ASSOCIATED_BONDING_CURVE = new PublicKey(
      coinData.associated_bonding_curve
    );
    const ASSOCIATED_USER = new PublicKey(tokenAccount);
    const USER = walletInfo.publicKey;

    // Build account key list
    const keys: {
      pubkey: PublicKey;
      isSigner: boolean;
      isWritable: boolean;
    }[] = [
      { pubkey: new PublicKey(GLOBAL), isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(FEE_RECIPIENT),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: MINT, isSigner: false, isWritable: false },
      { pubkey: BONDING_CURVE, isSigner: false, isWritable: true },
      { pubkey: ASSOCIATED_BONDING_CURVE, isSigner: false, isWritable: true },
      { pubkey: ASSOCIATED_USER, isSigner: false, isWritable: true },
      { pubkey: USER, isSigner: true, isWritable: true },
      // { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(SYSTEM_PROGRAM),
        isSigner: false,
        isWritable: false,
      },
      // { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(ASSOC_TOKEN_ACC_PROG),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey(TOKEN_PROGRAM),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey(EVENT_AUTHORITY),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey(PUMP_FUN_PROGRAM),
        isSigner: false,
        isWritable: false,
      },
    ];

    // Define integer values
    const sell = BigInt("12502976635542562355");
    const integers = [
      sell,
      BigInt(Math.floor(amount * 10 ** 6)),
      BigInt(minSolOutput),
    ];

    const binarySegments = integers.map((integer) => {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64LE(integer, 0);
      return buffer;
    });
    const data = Buffer.concat(binarySegments);
    const swapInstruction = new TransactionInstruction({
      keys,
      programId: new PublicKey(PUMP_FUN_PROGRAM),
      data,
    });

    const instructions: TransactionInstruction[] = [];

    instructions.push(swapInstruction);

    const slot = await connection.getSlot();
    const [lookupTableInst, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: walletInfo.publicKey,
        payer: walletInfo.publicKey,
        recentSlot: slot,
      });

    const lookupTableAccount = (
      await connection.getAddressLookupTable(lookupTableAddress)
    ).value;
    let lookupTables: Array<AddressLookupTableAccount> = [];
    if (lookupTableAccount) {
      lookupTables = [lookupTableAccount];
    }

    // const [microLamports, units, recentBlockhash] = await Promise.all([
    //   100,
    //   getSimulationComputeUnits(
    //     connection,
    //     instructions,
    //     walletInfo.publicKey,
    //     lookupTables
    //   ),
    //   connection.getLatestBlockhash(),
    // ]);
    const microLamports = 100;

    instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
    );
    instructions.unshift(
      ComputeBudgetProgram.setComputeUnitLimit({ units: UNIT_BUDGET })
    );
    // if (units) {
    //   // probably should add some margin of error to units
    //   instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units }));
    // }

    const latestBlockhash = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: walletInfo.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: instructions,
      // }).compileToV0Message(lookupTables);
    }).compileToV0Message();
    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([walletInfo]);

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
    console.error("Error in placing new sell: ", err);
  }
}

async function getCoinData(tokenMint: string) {
  const url = `https://frontend-api.pump.fun/coins/${tokenMint}`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.5",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "If-None-Match": 'W/"41b-5sP6oeDs1tG//az0nj9tRYbL22A"',
    Priority: "u=4",
  };

  const { data } = await axios.get(url, { headers });

  return data;
}
