import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  gasReporter: {
    currency: 'USD',
    // L1: "ethereum",
    L2:"arbitrum",
    "L2Etherscan":"YV23NEQ48TRV4TN7ZY4YEFS99ANWWWN3UG",
    coinmarketcap: "e63d6069-011a-4e3a-a165-1ca4a622a4f8",
  }
};

export default config;
