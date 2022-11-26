import { ethers } from 'hardhat';
import {
	DangerContract,
	DangerContract__factory,
	TestERC20,
	TestERC20__factory,
} from '../test-types';

export interface DangerContractFixture {
	dangerContract: DangerContract;
	tokenA: TestERC20;
	tokenB: TestERC20;
}

export async function deployDangerContractFixture(): Promise<DangerContractFixture> {
	// Deploy tokenA, tokenB
	const ERC20Factory = (await ethers.getContractFactory('TestERC20')) as TestERC20__factory;

	const tokenA = (await ERC20Factory.deploy('TokenA', 'TokenA')) as TestERC20;
	await tokenA.deployed();

	const tokenB = (await ERC20Factory.deploy('TokenB', 'TokenB')) as TestERC20;
	await tokenB.deployed();

	// Deploy DangerContract
	const DangerContractFactory = (await ethers.getContractFactory(
		'DangerContract',
	)) as DangerContract__factory;
	const dangerContract = (await DangerContractFactory.deploy(
		tokenA.address,
		tokenB.address,
	)) as DangerContract;
	await dangerContract.deployed();

	return {
		dangerContract,
		tokenA,
		tokenB,
	};
}
