require("dotenv").config();

export const PRIVATE_KEY = process.env.PRIVATE_KEY || ""; // private key of main wallet
export const TOKEN_MINT = "Db34g818Gt5JqJAAsNbMZA3qpEFtBuHQHPqBRiyTpump"; // address of target token
export const SOLANA_TOKEN = "11111111111111111111111111111111"; // address of SOL
export const RPC_URL = "https://api.mainnet-beta.solana.com";
export const SLIPPAGE = 5; // 5 % : allowed slippage in trading
// export const SOL_BUY_MIN = 0.1; // min SOL amount to send to each wallet
// export const SOL_BUY_MAX = 0.5; // max SOL amount to send to each wallet
export const SOL_BUY_MIN = 0.01;
export const SOL_BUY_MAX = 0.03;
export const PLATFORM_FEE = 0.02; // 0.5% for pump.fun, 1% for creator
export const PRIORITY_FEE = 0;
export const SOL_RENT = 0.0015; // minimum balance to remain in solana account
export const PAUSE_ON_INTERRUPTION = false; // true: pause process of buying the token when other transactions interfere

export const PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const GLOBAL = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
export const FEE_RECIPIENT = "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ASSOC_TOKEN_ACC_PROG =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const RENT = "SysvarRent111111111111111111111111111111111";
export const EVENT_AUTHORITY = "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1";
export const PLATFORM_FEE_RECIPIENT =
  "24qW6aYFYjJbBUy1iLiSY3Firaib9A6tFMeV8ZyfGVyo";
export const SOL = "So11111111111111111111111111111111111111112";
export const UNIT_PRICE = 10_000_000;
export const UNIT_BUDGET = 1_000_000;
