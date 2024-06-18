import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  API_URL,
  PLATFORM_FEE,
  PRIORITY_FEE,
  PRIVATE_KEY,
  RPC_URL,
  SLIPPAGE,
  TOKEN_MINT,
} from "./constants";
import {
  WalletInfoType,
  generateRandomAmounts,
  generateSolanaKeypair,
  getTokenBalance,
  getWalletBalance,
  getWalletsFromFile,
  sendSolToWallet,
  sendTokenToWallet,
  storeWalletsToFile,
} from "./utils";
import prompts from "prompts";

export const connection = new Connection(RPC_URL, "confirmed");
export const owner = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

export async function generateWallets(numberOfWallets: number) {
  try {
    const wallets: WalletInfoType[] = [];
    for (let index = 0; index < numberOfWallets; index++) {
      const newWallet = generateSolanaKeypair();
      wallets.push(newWallet);
    }

    storeWalletsToFile(wallets);
  } catch (err) {
    console.error("Error occured in generating wallets: ", err);
  }
}

export async function getBuyTransaction(
  tokenMint: any,
  privateKey: string,
  amt: number
) {
  const url = `${API_URL}/trade`;

  const data = {
    trade_type: "buy",
    mint: tokenMint,
    amount: amt,
    slippage: SLIPPAGE,
    priorityFee: PRIORITY_FEE,
    userPrivateKey: privateKey,
  };

  console.log(data);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${await response.text()}`);
    }

    const datax = await response.json();
    return datax["tx_hash"];
  } catch (err) {
    console.error("Error fetching data:", err);
  }
}

async function placeBuyTrade(tokenMint: any, privateKey: string, amt: number) {
  try {
    console.log(`Placing buy order...`);
    const tx_hash: any = await getBuyTransaction(tokenMint, privateKey, amt);
    console.log(tx_hash);

    console.log(`https://solscan.io/tx/${tx_hash}`);
  } catch (err) {
    console.error('Error in buying the token: ', err);
  }
}

export async function getSellTransaction(
  tokenMint: any,
  privateKey: string,
  amt: any
) {
  const url = `${API_URL}/trade`;

  const data = {
    trade_type: "sell",
    mint: tokenMint,
    amount: amt,
    slippage: SLIPPAGE,
    priorityFee: PRIORITY_FEE,
    userPrivateKey: privateKey,
  };

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
    .then((response: any) => {
      if (!response.ok) {
        throw new Error(`Error: ${response.text()}`);
      }
      return response.json()["transaction"];
    })
    .catch((err) => {
      console.error('Error in creating sell transaction: ', err);
    });
}

async function placeSellTrade(tokenMint: any, privateKey: string, amt: any) {
  try {
    console.log(`Placing sell order...`);
    const encoded_tx: any = await getSellTransaction(
      tokenMint,
      privateKey,
      amt
    );

    const transaction = VersionedTransaction.deserialize(
      bs58.decode(encoded_tx)
    );
    console.log(transaction);

    transaction.sign([owner]);
    console.log("Transaction loaded and signed...");

    const txid = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 2,
    });

    console.log(`https://solscan.io/tx/${txid}`);
  } catch (err) {
    console.error('Error in selling the token back: ', err);
  }
}

async function beginBuying(wallets: WalletInfoType[], amounts: number[]) {
  for (let index = 0; index < wallets.length; index++) {
    sendSolToWallet(
      connection,
      PRIVATE_KEY,
      new PublicKey(wallets[index].publicKey),
      amounts[index]
    );
  }

  const neededFeeForLastAccumulation =
    amounts.reduce((sum, currentVal) => sum + currentVal, 0) * PLATFORM_FEE;

  for (let index = 0; index < wallets.length; index++) {
    await getLatestTokenTransaction(TOKEN_MINT);
    const balance = await getWalletBalance(
      connection,
      wallets[index].publicKey
    );

    // All tokens should be accumulated to first wallet and swapped there, so more fee should be prepared in the first wallet.
    await placeBuyTrade(
      TOKEN_MINT,
      wallets[index].privateKey,
      (balance - index === 0 ? neededFeeForLastAccumulation : 0) *
        (1 - PLATFORM_FEE) -
        30000
    ); // subtract 2 time transfer fee: 15000 * 2
  }
}

async function beginSelling(wallets: WalletInfoType[]) {
  for (let index = 1; index < wallets.length; index++) {
    const tokenBalance = await getTokenBalance(
      connection,
      new PublicKey(wallets[index].publicKey),
      new PublicKey(TOKEN_MINT)
    );

    await sendTokenToWallet(
      connection,
      wallets[index].privateKey,
      new PublicKey(wallets[0].publicKey),
      TOKEN_MINT,
      tokenBalance
    );
  }

  const tokenBalance = await getTokenBalance(
    connection,
    new PublicKey(wallets[0].publicKey),
    new PublicKey(TOKEN_MINT)
  );

  await placeSellTrade(TOKEN_MINT, wallets[0].privateKey, tokenBalance);

  const solBalance = await getWalletBalance(connection, wallets[0].publicKey);
  await sendSolToWallet(
    connection,
    wallets[0].privateKey,
    owner.publicKey,
    solBalance
  );
}

async function getLatestTokenTransaction(tokenMintAddress: string) {
  try {
    const latestBlockhash = await connection.getLatestBlockhash();

    // Find all transactions that include this token
    const tokenTransactionsLamportRange =
      await connection.getConfirmedSignaturesForAddress2(
        new PublicKey(tokenMintAddress),
        { until: latestBlockhash.blockhash }
      );

    if (tokenTransactionsLamportRange.length > 0) {
      const sortedTokenTransactions = tokenTransactionsLamportRange
        .sort((a, b) => Number(b.signature) - Number(a.signature))
        .slice(0, 1);

      if (sortedTokenTransactions.length > 0) {
        const latestTokenTransaction = await connection.getParsedTransaction(
          sortedTokenTransactions[0].signature
        );

        console.log("Latest Token Transaction:", latestTokenTransaction);
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

async function main() {
  const wallets: [] = await getWalletsFromFile();

  let response = await prompts({
    type: "select",
    name: "action",
    message: "What would you like to do?",
    choices: [
      { title: "Generate wallets", value: "generate" },
      { title: "Begin buying tokens", value: "buy" },
      { title: "Begin selling tokens", value: "sell" },
      { title: "Resume process", value: "resume" },
    ],
  });

  if (
    response.action !== "generate" &&
    response.action !== "buy" &&
    response.action !== "sell" &&
    response.action !== "resume"
  ) {
    console.error("Invalid option. Please choose a valid option.");
    return;
  }

  if (response.action === "generate") {
    const numberOfWallets = await prompts({
      type: "number",
      name: "amt",
      message: "Enter a number of wallets to generate:",
    });

    if (isNaN(numberOfWallets.amt) || numberOfWallets.amt <= 0) {
      console.error("Invalid amount. Please enter a positive number.");
      return;
    }

    generateWallets(parseInt(numberOfWallets.amt));
  } else if (response.action === "buy") {
    const amounts = generateRandomAmounts(wallets.length);

    const mainWalletBalance = await getWalletBalance(
      connection,
      owner.publicKey.toString()
    );
    const neededBalance = amounts.reduce(
      (sum, currentVal) => sum + currentVal,
      0
    );
    if (neededBalance > mainWalletBalance) {
      console.error("Insufficient balance in the main wallet.");
      return;
    }

    await beginBuying(wallets, amounts);
  } else if (response.action === "sell") {
    await beginSelling(wallets);
  } else if (response.action === "resume") {
  } else {
    console.error("Invalid action selected.");
  }
}

main().catch(console.error);
