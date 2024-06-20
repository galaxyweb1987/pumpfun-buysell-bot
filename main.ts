import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import prompts from "prompts";
import {
  PAUSE_ON_INTERRUPTION,
  PLATFORM_FEE,
  PRIVATE_KEY,
  SOL_RENT,
  TOKEN_MINT,
} from "./constants";
import {
  PausedWalletInfoType,
  WalletInfoType,
  generateRandomAmounts,
  generateSolanaKeypair,
  getLatestTokenTransaction,
  getPausedState,
  getTokenBalance,
  getWalletBalance,
  getWalletsFromFile,
  placeBuyTrade,
  placeSellTrade,
  sendSolToWallet,
  sendTokenToWallet,
  setPausedState,
  storeWalletsToFile,
  waitSeconds,
} from "./utils";

// Get key pair of the main wallet
const owner = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

// Create [numberOfWallets] wallets
async function generateWallets(numberOfWallets: number) {
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

// Begin buying process
async function beginBuying(
  wallets: WalletInfoType[],
  amounts: number[],
  resuming: boolean
) {
  try {
    // If it's initial phase of buying, send random SOLs from main wallet to generated wallets respectively
    if (!resuming) {
      for (let index = 0; index < wallets.length; index++) {
        await sendSolToWallet(
          PRIVATE_KEY,
          new PublicKey(wallets[index].publicKey),
          amounts[index]
        );
        await waitSeconds(10);
      }
    }

    let prevTransaction = ""; // To check if the last transaction is made by you, not someone else
    let index = 0;
    for (index = 0; index < wallets.length; index++) {
      // If PAUSE_ON_INTERRUPTION is set true and the last transaction on the target token is not made by you, the buying process should be paused
      if (PAUSE_ON_INTERRUPTION && index !== 0) {
        const latestTransaction = await getLatestTokenTransaction(TOKEN_MINT);
        if (latestTransaction !== prevTransaction) {
          console.log(
            "Your transactions have been interrupted by someone else's transactions. Pausing the process..."
          );

          // When paused, store addresses of pending wallets
          const remainingWallets: PausedWalletInfoType[] = [];
          for (let subindex = index; subindex < wallets.length; subindex++) {
            remainingWallets.push({
              ...wallets[subindex],
              amount: amounts[subindex],
            });
          }
          await setPausedState(remainingWallets);
          break;
        }
      }

      // Place buy order
      const balance = await getWalletBalance(wallets[index].publicKey);
      const allowedBalance = balance - SOL_RENT;
      if (allowedBalance > 0) {
        const amount =
          (allowedBalance / 2) * LAMPORTS_PER_SOL * (1 - PLATFORM_FEE); // subtract 2 time transfer fee: 15000 * 2
        const txid = await placeBuyTrade(
          TOKEN_MINT,
          wallets[index].privateKey,
          Math.round(amount) / LAMPORTS_PER_SOL
        );
        prevTransaction = txid ? txid : prevTransaction;
        await waitSeconds(10);
      }
    }

    // If the process is not paused, clear the paused.json
    if (index >= wallets.length) {
      await setPausedState([]);
    }
  } catch (err) {
    console.error("Error in buying process: ", err);
  }
}

// Begin selling process
async function beginSelling(wallets: WalletInfoType[]) {
  try {
    // Send all available tokens and SOLs from all generated wallets to first generated wallet
    for (let index = 1; index < wallets.length; index++) {
      const tokenBalance = await getTokenBalance(
        new PublicKey(wallets[index].publicKey),
        new PublicKey(TOKEN_MINT)
      );

      if (tokenBalance > 0) {
        await sendTokenToWallet(
          wallets[index].privateKey,
          new PublicKey(wallets[0].publicKey),
          TOKEN_MINT,
          tokenBalance
        );
        await waitSeconds(10);
      } else {
        console.log(
          `Token balance is apparently 0 on ${wallets[index].publicKey}.`
        );
      }

      const solBalance = await getWalletBalance(wallets[index].publicKey);
      const amount = solBalance - SOL_RENT;
      if (amount > 0) {
        await sendSolToWallet(
          wallets[index].privateKey,
          new PublicKey(wallets[0].publicKey),
          amount
        ); // subtract sol transfer fee
        await waitSeconds(10);
      }
    }

    // Sell SPL tokens to get SOL back on the first generated wallet
    const tokenBalance = await getTokenBalance(
      new PublicKey(wallets[0].publicKey),
      new PublicKey(TOKEN_MINT)
    );
    if (tokenBalance) {
      await placeSellTrade(
        // owner,
        TOKEN_MINT,
        wallets[0].privateKey,
        tokenBalance
      );
    } else {
      console.log(
        `There is no token available to swap with SOL on ${wallets[0].publicKey}`
      );
    }

    // Send all available SOL from the first generated wallet to the main wallet
    await waitSeconds(20);
    const solBalance = await getWalletBalance(wallets[0].publicKey);
    const amount = solBalance - SOL_RENT;
    if (amount > 0) {
      await sendSolToWallet(wallets[0].privateKey, owner.publicKey, amount);
    }
  } catch (err) {
    console.error("Error in selling process: ", err);
  }
}

async function main() {
  let shouldContinue = true;

  while (shouldContinue) {
    let response = await prompts({
      type: "select",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { title: "Generate wallets", value: "generate" },
        { title: "Begin buying tokens", value: "buy" },
        { title: "Begin selling tokens", value: "sell" },
        { title: "Resume process", value: "resume" },
        { title: "Exit", value: "exit" },
      ],
    });

    if (response.action === "generate") {
      // Create wallets
      const numberOfWallets = await prompts({
        type: "number",
        name: "amount",
        message: "Enter a number of wallets to generate:",
      });

      if (isNaN(numberOfWallets.amount) || numberOfWallets.amount <= 0) {
        console.error("Invalid amount. Please enter a positive number.");
        break;
      }

      console.log("Generating wallets...");

      await generateWallets(parseInt(numberOfWallets.amount));
    } else if (response.action === "buy") {
      // Buy process
      const wallets: WalletInfoType[] = await getWalletsFromFile();

      if (wallets.length > 0) {
        console.log("Beginning buying process...");

        const amounts = generateRandomAmounts(wallets.length);

        const mainWalletBalance = await getWalletBalance(
          owner.publicKey.toString()
        );
        const neededBalance = amounts.reduce(
          (sum, currentVal) => sum + currentVal,
          0
        );

        // Check if the main wallet has enough SOL balance to send to all generated wallets
        if (neededBalance + SOL_RENT > mainWalletBalance) {
          console.error("Insufficient balance in the main wallet.");
          break;
        }

        await beginBuying(wallets, amounts, false);
      } else {
        console.log("No wallet exist.");
      }
    } else if (response.action === "sell") {
      console.log("Beginning selling process...");

      const wallets: [] = await getWalletsFromFile();
      await beginSelling(wallets);
    } else if (response.action === "resume") {
      const wallets: [] = await getPausedState();
      if (wallets.length > 0) {
        console.log("Resuming buying process...");
        await beginBuying(
          wallets,
          wallets.map((wallet: PausedWalletInfoType) => wallet.amount),
          true
        );
      } else {
        console.log("There is no process to resume.");
      }
    } else if (response.action === "exit") {
      shouldContinue = false;
      console.log("Application exited.");
    } else {
      console.error("Invalid option. Please choose a valid option.");
    }
  }
}

main().catch((err) => console.error(err));
