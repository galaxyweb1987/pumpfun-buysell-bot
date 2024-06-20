require("dotenv").config();

export const PRIVATE_KEY = process.env.PRIVATE_KEY || ""; // private key of main wallet
export const TOKEN_MINT = "Db34g818Gt5JqJAAsNbMZA3qpEFtBuHQHPqBRiyTpump"; // address of target token
export const SOLANA_TOKEN = "11111111111111111111111111111111"; // address of SOL
export const RPC_URL = "https://api.mainnet-beta.solana.com";
export const API_URL = "https://pumpapi.fun/api"; // root url of pump.fun api
export const SLIPPAGE = 5; // 5 % : allowed slippage in trading
// export const SOL_BUY_MIN = 0.1; // min SOL amount to send to each wallet
// export const SOL_BUY_MAX = 0.5; // max SOL amount to send to each wallet
export const SOL_BUY_MIN = 0.01;
export const SOL_BUY_MAX = 0.03;
export const PLATFORM_FEE = 0.02; // 0.5% for pump.fun, 1% for creator
export const PRIORITY_FEE = 0;
export const SOL_RENT = 0.0015; // minimum balance to remain in solana account
export const PAUSE_ON_INTERRUPTION = false; // true: pause process of buying the token when other transactions interfere
