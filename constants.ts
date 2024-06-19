require('dotenv').config();

export const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
export const TOKEN_MINT = "Db34g818Gt5JqJAAsNbMZA3qpEFtBuHQHPqBRiyTpump";
export const SOLANA_TOKEN = "11111111111111111111111111111111";
export const RPC_URL = "https://api.mainnet-beta.solana.com";
export const API_URL = "https://pumpapi.fun/api";
export const SLIPPAGE = 5; // 5 %
// export const SOL_BUY_MIN = 0.1;
// export const SOL_BUY_MAX = 0.5;
export const SOL_BUY_MIN = 0.002;
export const SOL_BUY_MAX = 0.005;
export const PLATFORM_FEE = 0.02; // 0.5% for pump.fun, 1% for creator
export const PRIORITY_FEE = 0;
export const SOL_RENT = 0.0015;
export const PAUSE_ON_INTERRUPTION = false;
