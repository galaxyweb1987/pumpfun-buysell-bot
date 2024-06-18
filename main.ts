import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import prompts from "prompts";
import {
  PAUSE_ON_INTERRUPTION,
  PLATFORM_FEE,
  PRIVATE_KEY,
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
} from "./utils";

const owner = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

async function generateWallets(numberOfWallets: number) {
  try {
    const wallets: WalletInfoType[] = [];
    for (let index = 0; index < numberOfWallets; index++) {
      const newWallet = generateSolanaKeypair();
      wallets.push(newWallet);
    }

    storeWalletsToFile(wallets);
    console.log("Created");
  } catch (err) {
    console.error("Error occured in generating wallets: ", err);
  }
}

async function beginBuying(wallets: WalletInfoType[], amounts: number[]) {
  try {
    for (let index = 0; index < wallets.length; index++) {
      await sendSolToWallet(
        PRIVATE_KEY,
        new PublicKey(wallets[index].publicKey),
        amounts[index]
      );
    }

    // const neededFeeForLastAccumulation =
    //   amounts.reduce((sum, currentVal) => sum + currentVal, 0) * PLATFORM_FEE;

    let prevTransaction = "";
    for (let index = 0; index < wallets.length; index++) {
      if (PAUSE_ON_INTERRUPTION && index !== 0) {
        const latestTransaction = await getLatestTokenTransaction(TOKEN_MINT);
        if (latestTransaction !== prevTransaction) {
          console.log(
            "Your transactions have been interrupted by someone else's transactions. Pausing the process..."
          );
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

      const balance = await getWalletBalance(wallets[index].publicKey);

      console.log("balance===================");
      console.log(balance);

      // All tokens should be accumulated to first wallet and swapped there, so more fee might be needed in the first wallet.
      // const amount =
      //   (balance - (index === 0 ? neededFeeForLastAccumulation : 0)) *
      //     LAMPORTS_PER_SOL *
      //     (1 - PLATFORM_FEE) -
      //   30000;
      const amount = balance * LAMPORTS_PER_SOL * (1 - PLATFORM_FEE) - 30000; // subtract 2 time transfer fee: 15000 * 2
      prevTransaction = await placeBuyTrade(
        TOKEN_MINT,
        wallets[index].privateKey,
        Math.round(amount) / LAMPORTS_PER_SOL
      );
    }
  } catch (err) {
    console.error("Error in buying process: ", err);
  }
}

async function beginSelling(wallets: WalletInfoType[]) {
  try {
    console.log("right after beginselling");
    console.log(wallets);
    console.log("==================");
    for (let index = 1; index < wallets.length; index++) {
      const tokenBalance = await getTokenBalance(
        new PublicKey(wallets[index].publicKey),
        new PublicKey(TOKEN_MINT)
      );

      console.log("================token balance");
      console.log(tokenBalance);

      if(tokenBalance > 0) {
        await sendTokenToWallet(
          wallets[index].privateKey,
          new PublicKey(wallets[0].publicKey),
          TOKEN_MINT,
          tokenBalance
        );
      }
    }

    const tokenBalance = await getTokenBalance(
      new PublicKey(wallets[0].publicKey),
      new PublicKey(TOKEN_MINT)
    );

    await placeSellTrade(owner, TOKEN_MINT, wallets[0].privateKey, tokenBalance);

    const solBalance = await getWalletBalance(wallets[0].publicKey);
    await sendSolToWallet(wallets[0].privateKey, owner.publicKey, solBalance);
  } catch (err) {
    console.error('Error in selling process: ', err);
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
      const numberOfWallets = await prompts({
        type: "number",
        name: "amount",
        message: "Enter a number of wallets to generate:",
      });

      if (isNaN(numberOfWallets.amount) || numberOfWallets.amount <= 0) {
        console.error("Invalid amount. Please enter a positive number.");
        break;
      }

      await generateWallets(parseInt(numberOfWallets.amount));
    } else if (response.action === "buy") {
      const wallets: WalletInfoType[] = await getWalletsFromFile();

      if (wallets.length > 0) {
        const amounts = generateRandomAmounts(wallets.length);

        const mainWalletBalance = await getWalletBalance(
          owner.publicKey.toString()
        );
        const neededBalance = amounts.reduce(
          (sum, currentVal) => sum + currentVal,
          0
        );

        console.log("============mainwalletbalance");
        console.log(amounts);
        console.log(wallets);
        console.log(mainWalletBalance);
        console.log(neededBalance);
        if (neededBalance > mainWalletBalance) {
          console.error("Insufficient balance in the main wallet.");
          break;
        }

        await beginBuying(wallets, amounts);
      } else {
        console.log("No wallet exist.");
      }
    } else if (response.action === "sell") {
      const wallets: [] = await getWalletsFromFile();
      await beginSelling(wallets);
    } else if (response.action === "resume") {
      const wallets: [] = await getPausedState();
      if (wallets.length > 0) {
        console.log("Resuming buying process...");
        await beginBuying(
          wallets,
          wallets.map((wallet: PausedWalletInfoType) => wallet.amount)
        );
      }
    } else if (response.action === "exit") {
      shouldContinue = false;
    } else {
      console.error("Invalid option. Please choose a valid option.");
    }
  }
}

main().catch((err) => console.error(err));
