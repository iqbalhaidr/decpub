import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem';
import { configVariable, defineConfig } from 'hardhat/config';

/**
 * Konfigurasi Hardhat 3 untuk sistem terintegrasi.
 * - `localhost`: node Hardhat yang dinyalakan dengan `npm run chain` (port 8545).
 * - `sepolia`: dipakai di M13, kredensial dibaca dari variabel konfigurasi Hardhat.
 */
export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: '0.8.28',
  },
  networks: {
    localhost: {
      type: 'http',
      chainType: 'l1',
      url: process.env.RPC_URL ?? 'http://127.0.0.1:8545',
    },
    sepolia: {
      type: 'http',
      chainType: 'l1',
      url: configVariable('SEPOLIA_RPC_URL'),
      accounts: [configVariable('SEPOLIA_PRIVATE_KEY')],
    },
  },
});
