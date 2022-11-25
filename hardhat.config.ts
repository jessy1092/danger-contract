import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const config: HardhatUserConfig = {
	solidity: '0.8.17',
	networks: {
		goerli: {
			url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
			accounts:
				typeof process.env.GOERLI_PRIVATE_KEY !== 'undefined'
					? [process.env.GOERLI_PRIVATE_KEY as string]
					: [],
		},
	},
	etherscan: {
		apiKey: process.env.ETHERSCAN_API_KEY,
	},
	typechain: process.env.HARDHAT_WEB3_TYPE
		? {
				outDir: 'web3-types', // For external web3 usage
				target: 'web3-v1',
		  }
		: {
				outDir: 'test-types', // For hardhat testing usage
				target: 'ethers-v5',
		  },
};

export default config;
