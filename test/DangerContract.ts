import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { parseUnits } from 'ethers/lib/utils';
import { ethers } from 'hardhat';

import { DangerContract, DangerContract__factory, TestERC20 } from '../test-types';
import { deployDangerContractFixture, DangerContractFixture } from './fixtures';
import { sqrt } from './utils';

describe('DangerContract Spec', () => {
	let owner: SignerWithAddress;
	let taker: SignerWithAddress;
	let maker: SignerWithAddress;
	let fixture: DangerContractFixture;
	let dangerContract: DangerContract;
	let tokenA: TestERC20;
	let tokenB: TestERC20;
	let tokenADecimals: number;
	let tokenBDecimals: number;
	let slpDecimals: number;

	beforeEach(async () => {
		// maker = liquidity provider
		// trader = taker
		[owner, taker, maker] = await ethers.getSigners();

		fixture = await loadFixture(deployDangerContractFixture);
		dangerContract = fixture.dangerContract;
		tokenA = fixture.tokenA;
		tokenB = fixture.tokenB;

		tokenADecimals = await tokenA.decimals();
		tokenBDecimals = await tokenB.decimals();
		slpDecimals = await dangerContract.decimals();

		// Mint tokenA to trader, maker
		await tokenA.mint(taker.address, parseUnits('1000', tokenADecimals));
		await tokenA.mint(maker.address, parseUnits('1000', tokenADecimals));

		// Mint tokenB to trader, maker
		await tokenB.mint(taker.address, parseUnits('1000', tokenBDecimals));
		await tokenB.mint(maker.address, parseUnits('1000', tokenBDecimals));

		// Approve tokenA to dangerContract
		await tokenA.connect(taker).approve(dangerContract.address, parseUnits('1000', tokenADecimals));
		await tokenA.connect(maker).approve(dangerContract.address, parseUnits('1000', tokenADecimals));
		await tokenB.connect(taker).approve(dangerContract.address, parseUnits('1000', tokenBDecimals));
		await tokenB.connect(maker).approve(dangerContract.address, parseUnits('1000', tokenBDecimals));
	});

	describe('# constructor', () => {
		let dangerContractFactory: DangerContract__factory;

		beforeEach(async () => {
			dangerContractFactory = await ethers.getContractFactory('DangerContract');
		});

		it('forces error, when tokenA is not a contract', async () => {
			await expect(
				dangerContractFactory.deploy(ethers.constants.AddressZero, tokenB.address),
			).to.be.revertedWith('SimpleSwap: TOKENA_IS_NOT_CONTRACT');
		});

		it('forces error, when tokenB is not a contract', async () => {
			await expect(
				dangerContractFactory.deploy(tokenA.address, ethers.constants.AddressZero),
			).to.be.revertedWith('SimpleSwap: TOKENB_IS_NOT_CONTRACT');
		});

		it('forces error, when tokenA is the same as tokenB', async () => {
			await expect(dangerContractFactory.deploy(tokenA.address, tokenA.address)).to.be.revertedWith(
				'SimpleSwap: TOKENA_TOKENB_IDENTICAL_ADDRESS',
			);
		});

		it('reserves should be zero after contract initialized', async () => {
			const [reserve0, reserve1] = await dangerContract.getReserves();

			expect(reserve0).to.be.eq(0);
			expect(reserve1).to.be.eq(0);
		});

		it("tokenA's address should be less than tokenB's address", async () => {
			const tokenA = (await dangerContract.getTokenA()).toLowerCase();
			const tokenB = (await dangerContract.getTokenB()).toLowerCase();

			expect(tokenA < tokenB).to.be.eq(true);
		});

		it('Should set the right owner', async function () {
			expect(await dangerContract.owner()).to.equal(owner.address);
		});
	});

	describe('# addLiquidity', () => {
		describe('first time to add liquidity', () => {
			it('forces error, when tokenA amount is zero', async () => {
				const amountA = parseUnits('0', tokenADecimals);
				const amountB = parseUnits('42', tokenBDecimals);

				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB)).to.revertedWith(
					'SimpleSwap: INSUFFICIENT_INPUT_AMOUNT',
				);
			});

			it('forces error, when tokenB amount is zero', async () => {
				const amountA = parseUnits('42', tokenADecimals);
				const amountB = parseUnits('0', tokenBDecimals);

				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB)).to.revertedWith(
					'SimpleSwap: INSUFFICIENT_INPUT_AMOUNT',
				);
			});

			it('should be able to add liquidity', async () => {
				const amountA = parseUnits('42', tokenADecimals);
				const amountB = parseUnits('420', tokenBDecimals);
				const liquidity = sqrt(amountA.mul(amountB));

				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB))
					.to.changeTokenBalances(tokenA, [maker, dangerContract], [amountA.mul(-1), amountA])
					.to.changeTokenBalances(tokenB, [maker, dangerContract], [amountB.mul(-1), amountB])
					.to.emit(dangerContract, 'AddLiquidity')
					.withArgs(maker.address, amountA, amountB, liquidity);

				const [reserveA, reserveB] = await dangerContract.getReserves();

				expect(reserveA).to.be.eq(amountA);
				expect(reserveB).to.be.eq(amountB);
			});
		});

		describe('not first time to add liquidity', () => {
			let reserveAAfterFirstAddLiquidity: BigNumber;
			let reserveBAfterFirstAddLiquidity: BigNumber;

			beforeEach(async () => {
				// after beforeEach
				// SLP total supply is sqrt(45 * 20) = 30
				// SimpleSwap reserveA is 45
				// SimpleSwap reserveB is 20

				const amountA = parseUnits('45', tokenADecimals);
				const amountB = parseUnits('20', tokenBDecimals);
				await dangerContract.connect(maker).addLiquidity(amountA, amountB);
				[reserveAAfterFirstAddLiquidity, reserveBAfterFirstAddLiquidity] =
					await dangerContract.getReserves();
			});

			it('forces error, when tokenA amount is zero', async () => {
				const amountA = parseUnits('0', tokenADecimals);
				const amountB = parseUnits('42', tokenBDecimals);

				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB)).to.revertedWith(
					'SimpleSwap: INSUFFICIENT_INPUT_AMOUNT',
				);
			});

			it('forces error, when tokenB amount is zero', async () => {
				const amountA = parseUnits('42', tokenADecimals);
				const amountB = parseUnits('0', tokenBDecimals);

				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB)).to.revertedWith(
					'SimpleSwap: INSUFFICIENT_INPUT_AMOUNT',
				);
			});

			it("should be able to add liquidity when tokenA's proportion is the same as tokenB's proportion", async () => {
				const amountA = parseUnits('90', tokenADecimals);
				const amountB = parseUnits('40', tokenBDecimals); // amountA / reserveA * reserveB = 90 / 45 * 20 = 40
				const liquidity = sqrt(amountA.mul(amountB));

				// check event and balanceChanged
				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB))
					.to.changeTokenBalances(tokenA, [maker, dangerContract], [amountA.mul(-1), amountA])
					.to.changeTokenBalances(tokenB, [maker, dangerContract], [amountB.mul(-1), amountB])
					.to.emit(dangerContract, 'AddLiquidity')
					.withArgs(maker.address, amountA, amountB, liquidity);

				const [reserveA, reserveB] = await dangerContract.getReserves();

				// check reserve after addLiquidity
				expect(reserveA).to.be.eq(reserveAAfterFirstAddLiquidity.add(amountA));
				expect(reserveB).to.be.eq(reserveBAfterFirstAddLiquidity.add(amountB));
			});

			it("should be able to add liquidity when tokenA's proportion is greater than tokenB's proportion", async () => {
				const amountA = parseUnits('90', tokenADecimals);
				const amountB = parseUnits('50', tokenBDecimals); // 50 > amountA / reserveA * reserveB = 90 / 45 * 20 = 40
				const actualAmountB = amountA
					.mul(reserveBAfterFirstAddLiquidity)
					.div(reserveAAfterFirstAddLiquidity);
				const liquidity = sqrt(amountA.mul(actualAmountB));

				// check event and balanceChanged
				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB))
					.to.changeTokenBalances(tokenA, [maker, dangerContract], [amountA.mul(-1), amountA])
					.to.changeTokenBalances(
						tokenB,
						[maker, dangerContract],
						[actualAmountB.mul(-1), actualAmountB],
					)
					.to.emit(dangerContract, 'AddLiquidity')
					.withArgs(maker.address, amountA, actualAmountB, liquidity);

				const [reserveA, reserveB] = await dangerContract.getReserves();

				// check reserve after addLiquidity
				expect(reserveA).to.be.eq(reserveAAfterFirstAddLiquidity.add(amountA));
				expect(reserveB).to.be.eq(reserveBAfterFirstAddLiquidity.add(actualAmountB));
			});

			it("should be able to add liquidity when tokenA's proportion is less than tokenB's proportion", async () => {
				const amountA = parseUnits('100', tokenADecimals); // 100 > amountB * reserveA / reserveB = 40 * 45 / 20 = 90
				const amountB = parseUnits('40', tokenBDecimals);
				const actualAmountA = amountB
					.mul(reserveAAfterFirstAddLiquidity)
					.div(reserveBAfterFirstAddLiquidity);
				const liquidity = sqrt(actualAmountA.mul(amountB));

				// check event and balanceChanged
				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB))
					.to.changeTokenBalances(
						tokenA,
						[maker, dangerContract],
						[actualAmountA.mul(-1), actualAmountA],
					)
					.to.changeTokenBalances(tokenB, [maker, dangerContract], [amountB.mul(-1), amountB])
					.to.emit(dangerContract, 'AddLiquidity')
					.withArgs(maker.address, actualAmountA, amountB, liquidity);

				const [reserveA, reserveB] = await dangerContract.getReserves();

				// check reserve after addLiquidity
				expect(reserveA).to.be.eq(reserveAAfterFirstAddLiquidity.add(actualAmountA));
				expect(reserveB).to.be.eq(reserveBAfterFirstAddLiquidity.add(amountB));
			});

			it('should be able to add liquidity after swap', async () => {
				const tokenIn = tokenA.address;
				const tokenOut = tokenB.address;
				const amountIn = parseUnits('45', tokenADecimals);

				await dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn);

				const [reserveAAfterSwap, reserveBAfterSwap] = await dangerContract.getReserves();

				const amountA = parseUnits('18', tokenADecimals);
				const amountB = parseUnits('2', tokenBDecimals); // amountB = amountA / reserveA * reserveB = 18 / 90 * 10 = 2
				const totalSupply = await dangerContract.totalSupply(); // 30

				const liquidityA = amountA.mul(totalSupply).div(reserveAAfterSwap); // 18 * 30 / 90 = 6
				const liquidityB = amountB.mul(totalSupply).div(reserveBAfterSwap); // 2 * 30 / 10 = 6
				const liquidity = liquidityA.lt(liquidityB) ? liquidityA : liquidityB; // 6
				// check event and balanceChanged
				await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB))
					.to.changeTokenBalances(tokenA, [maker, dangerContract], [amountA.mul(-1), amountA])
					.to.changeTokenBalances(tokenB, [maker, dangerContract], [amountB.mul(-1), amountB])
					.to.changeTokenBalance(dangerContract, maker, liquidity)
					.to.emit(dangerContract, 'AddLiquidity')
					.withArgs(maker.address, amountA, amountB, liquidity);

				const [reserveA, reserveB] = await dangerContract.getReserves();

				// check reserve after addLiquidity
				expect(reserveA).to.be.eq(reserveAAfterSwap.add(amountA));
				expect(reserveB).to.be.eq(reserveBAfterSwap.add(amountB));
			});
		});
	});

	describe('# swap', () => {
		beforeEach('maker add liquidity', async () => {
			const amountA = parseUnits('100', tokenADecimals);
			const amountB = parseUnits('100', tokenBDecimals);
			await dangerContract.connect(maker).addLiquidity(amountA, amountB);
		});

		it('forces error, when tokenIn is not tokenA or tokenB', async () => {
			const tokenIn = ethers.constants.AddressZero;
			const tokenOut = tokenB.address;
			const amountIn = parseUnits('10', tokenADecimals);

			await expect(dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn)).to.revertedWith(
				'SimpleSwap: INVALID_TOKEN_IN',
			);
		});

		it('forces error, when tokenOut is not tokenA or tokenB', async () => {
			const tokenIn = tokenA.address;
			const tokenOut = ethers.constants.AddressZero;
			const amountIn = parseUnits('10', tokenADecimals);

			await expect(dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn)).to.revertedWith(
				'SimpleSwap: INVALID_TOKEN_OUT',
			);
		});

		it('forces error, when tokenIn is the same as tokenOut', async () => {
			const tokenIn = tokenA.address;
			const tokenOut = tokenA.address;
			const amountIn = parseUnits('10', tokenADecimals);

			await expect(dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn)).to.revertedWith(
				'SimpleSwap: IDENTICAL_ADDRESS',
			);
		});

		it('forces error, when amountIn is zero', async () => {
			const tokenIn = tokenA.address;
			const tokenOut = tokenB.address;
			const amountIn = parseUnits('0', tokenADecimals);

			await expect(dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn)).to.revertedWith(
				'SimpleSwap: INSUFFICIENT_INPUT_AMOUNT',
			);
		});

		it('forces error, when amountOut is zero', async () => {
			const tokenIn = tokenA.address;
			const tokenOut = tokenB.address;
			const amountIn = 1;

			// Amount can not be zero
			await expect(dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn)).to.revertedWith(
				'SimpleSwap: INSUFFICIENT_OUTPUT_AMOUNT',
			);
		});

		it('should be able to swap from tokenA to tokenB', async () => {
			const tokenIn = tokenA.address;
			const tokenOut = tokenB.address;
			const amountIn = parseUnits('100', tokenADecimals);
			const amountOut = parseUnits('50', tokenBDecimals); // 100 * 100 / (100 + 100) = 50

			await expect(dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn))
				.to.changeTokenBalances(tokenA, [taker, dangerContract], [amountIn.mul(-1), amountIn])
				.to.changeTokenBalances(tokenB, [taker, dangerContract], [amountOut, amountOut.mul(-1)])
				.emit(dangerContract, 'Swap')
				.withArgs(taker.address, tokenIn, tokenOut, amountIn, amountOut);

			const [reserveA, reserveB] = await dangerContract.getReserves();
			expect(reserveA).to.equal(parseUnits('200', tokenADecimals));
			expect(reserveB).to.equal(parseUnits('50', tokenBDecimals));
		});

		it('should be able to swap from tokenB to tokenA', async () => {
			const tokenIn = tokenB.address;
			const tokenOut = tokenA.address;
			const amountIn = parseUnits('100', tokenADecimals);
			const amountOut = parseUnits('50', tokenBDecimals); // 100 * 100 / (100 + 100) = 50

			await expect(dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn))
				.to.changeTokenBalances(tokenA, [taker, dangerContract], [amountOut, amountOut.mul(-1)])
				.to.changeTokenBalances(tokenB, [taker, dangerContract], [amountIn.mul(-1), amountIn])
				.emit(dangerContract, 'Swap')
				.withArgs(taker.address, tokenIn, tokenOut, amountIn, amountOut);

			const [reserveA, reserveB] = await dangerContract.getReserves();
			expect(reserveA).to.equal(parseUnits('50', tokenADecimals));
			expect(reserveB).to.equal(parseUnits('200', tokenBDecimals));
		});
	});

	describe('# removeLiquidity', () => {
		beforeEach('maker add liquidity', async () => {
			const amountA = parseUnits('100', tokenADecimals);
			const amountB = parseUnits('100', tokenBDecimals);
			await dangerContract.connect(maker).addLiquidity(amountA, amountB);

			await dangerContract
				.connect(maker)
				.approve(dangerContract.address, ethers.constants.MaxUint256);
		});

		it('forces error, when lp token amount is zero', async () => {
			await expect(
				dangerContract.connect(maker).removeLiquidity(parseUnits('0', slpDecimals)),
			).to.revertedWith('SimpleSwap: INSUFFICIENT_LIQUIDITY_BURNED');
		});

		// skip this, because ERC20 will handle this error
		it.skip('forces error, when lp token amount is greater than maker balance');

		it('should be able to remove liquidity when lp token amount greater than zero', async () => {
			const lpTokenAmount = parseUnits('10', slpDecimals);
			const [reserveA, reserveB] = await dangerContract.getReserves();
			const totalSupply = await dangerContract.totalSupply();
			const amountA = lpTokenAmount.mul(reserveA).div(totalSupply);
			const amountB = lpTokenAmount.mul(reserveB).div(totalSupply);

			await expect(dangerContract.connect(maker).removeLiquidity(lpTokenAmount))
				.to.changeTokenBalances(tokenA, [maker, dangerContract], [amountA, amountA.mul(-1)])
				.to.changeTokenBalances(tokenB, [maker, dangerContract], [amountB, amountB.mul(-1)])
				.to.emit(dangerContract, 'RemoveLiquidity')
				.withArgs(maker.address, amountA, amountB, lpTokenAmount);
		});

		it('should be able to remove liquidity after swap', async () => {
			// taker swap 10 tokenA to tokenB
			await dangerContract
				.connect(taker)
				.swap(tokenA.address, tokenB.address, parseUnits('10', tokenADecimals));

			// maker remove liquidity
			const lpTokenAmount = parseUnits('10', slpDecimals);
			const [reserveA, reserveB] = await dangerContract.getReserves();
			const totalSupply = await dangerContract.totalSupply();
			const amountA = lpTokenAmount.mul(reserveA).div(totalSupply);
			const amountB = lpTokenAmount.mul(reserveB).div(totalSupply);
			await expect(dangerContract.connect(maker).removeLiquidity(lpTokenAmount))
				.to.changeTokenBalances(tokenA, [maker, dangerContract], [amountA, amountA.mul(-1)])
				.to.changeTokenBalances(tokenB, [maker, dangerContract], [amountB, amountB.mul(-1)])
				.to.emit(dangerContract, 'RemoveLiquidity')
				.withArgs(maker.address, amountA, amountB, lpTokenAmount);
		});
	});

	describe('# getReserves', () => {
		it('should be able to get reserves', async () => {
			const [reserveA, reserveB] = await dangerContract.getReserves();
			expect(reserveA).to.eq(0);
			expect(reserveB).to.eq(0);
		});

		it('should update reserves after add liquidity', async () => {
			const amountA = parseUnits('100', tokenADecimals);
			const amountB = parseUnits('100', tokenBDecimals);
			await dangerContract.connect(maker).addLiquidity(amountA, amountB);

			const [reserveA, reserveB] = await dangerContract.getReserves();
			expect(reserveA).to.eq(amountA);
			expect(reserveB).to.eq(amountB);
		});
	});

	describe('# getTokenA', () => {
		it('should be able to get tokenA', async () => {
			const tokenAAddress = await dangerContract.getTokenA();
			expect(tokenAAddress).to.eq(tokenA.address);
		});
	});

	describe('# getTokenB', () => {
		it('should be able to get tokenB', async () => {
			const tokenBAddress = await dangerContract.getTokenB();
			expect(tokenBAddress).to.eq(tokenB.address);
		});
	});

	describe('lp token', () => {
		beforeEach('maker add liquidity', async () => {
			const amountA = parseUnits('100', tokenADecimals);
			const amountB = parseUnits('100', tokenBDecimals);
			await dangerContract.connect(maker).addLiquidity(amountA, amountB);

			await dangerContract
				.connect(maker)
				.approve(dangerContract.address, ethers.constants.MaxUint256);
		});

		it('should be able to get lp token after adding liquidity', async () => {
			const amountA = parseUnits('100', tokenADecimals);
			const amountB = parseUnits('100', tokenBDecimals);
			const liquidity = sqrt(amountA.mul(amountB));

			await expect(dangerContract.connect(maker).addLiquidity(amountA, amountB))
				.to.changeTokenBalances(dangerContract, [maker], [liquidity])
				.to.emit(dangerContract, 'Transfer')
				.withArgs(ethers.constants.AddressZero, maker.address, liquidity);
		});

		it('should be able to repay lp token after removing liquidity', async () => {
			const lpTokenAmount = parseUnits('10', slpDecimals);

			await expect(dangerContract.connect(maker).removeLiquidity(lpTokenAmount))
				.to.changeTokenBalances(dangerContract, [maker], [lpTokenAmount.mul(-1)])
				.to.emit(dangerContract, 'Transfer')
				.withArgs(dangerContract.address, ethers.constants.AddressZero, lpTokenAmount);
		});

		it('should be able to transfer lp token', async () => {
			const lpTokenAmount = parseUnits('42', slpDecimals);

			await expect(dangerContract.connect(maker).transfer(taker.address, lpTokenAmount))
				.to.changeTokenBalances(
					dangerContract,
					[maker, taker],
					[lpTokenAmount.mul(-1), lpTokenAmount],
				)
				.to.emit(dangerContract, 'Transfer')
				.withArgs(maker.address, taker.address, lpTokenAmount);
		});

		it('should be able to approve lp token', async () => {
			const lpTokenAmount = parseUnits('42', slpDecimals);

			await expect(dangerContract.connect(maker).approve(taker.address, lpTokenAmount))
				.to.emit(dangerContract, 'Approval')
				.withArgs(maker.address, taker.address, lpTokenAmount);
		});
	});

	describe('K value checking', () => {
		let K: BigNumber;

		beforeEach('maker add liquidity', async () => {
			const amountA = parseUnits('30', tokenADecimals);
			const amountB = parseUnits('300', tokenBDecimals);
			await dangerContract.connect(maker).addLiquidity(amountA, amountB);

			K = amountA.mul(amountB);
		});

		it('k value should be the same after swap', async () => {
			const tokenIn = tokenA.address;
			const tokenOut = tokenB.address;
			const amountIn = parseUnits('70', tokenADecimals);

			await dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn);

			const [reserveA, reserveB] = await dangerContract.getReserves();

			expect(reserveA.mul(reserveB)).to.be.eq(K);
		});

		it('k value should be closed to the origin K', async () => {
			const tokenIn = tokenA.address;
			const tokenOut = tokenB.address;
			const amountIn = parseUnits('33', tokenADecimals);
			const amountOut = parseUnits('133', tokenADecimals);

			await tokenA
				.connect(taker)
				.approve(dangerContract.address, parseUnits('1000000', tokenADecimals));
			await tokenB
				.connect(taker)
				.approve(dangerContract.address, parseUnits('1000000', tokenADecimals));

			for (let i = 0; i < 100; i++) {
				await dangerContract.connect(taker).swap(tokenIn, tokenOut, amountIn);
				await dangerContract.connect(taker).swap(tokenOut, tokenIn, amountOut);
			}

			const [reserveA, reserveB] = await dangerContract.getReserves();

			expect(reserveA.mul(reserveB)).to.be.closeTo(K, parseUnits('100', tokenBDecimals));
		});
	});
});
