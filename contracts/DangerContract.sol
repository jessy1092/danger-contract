// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import { Ownable } from '@openzeppelin/contracts/access/Ownable.sol';
import { ReentrancyGuard } from '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import { ERC20 } from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { Math } from '@openzeppelin/contracts/utils/math/Math.sol';


import { ISimpleSwap, ISimpleSwapCallee } from './interface/ISimpleSwap.sol';

contract DangerContract is ISimpleSwap, ERC20, Ownable, ReentrancyGuard {
	IERC20 public tokenA;
	IERC20 public tokenB;
	uint256 public lastK;

	uint256 public reserveA;
	uint256 public reserveB;

	constructor(address _tokenA, address _tokenB) ERC20('Simple Swap Token', 'SToken') {
		require(_isContract(_tokenA), 'SimpleSwap: TOKENA_IS_NOT_CONTRACT');
		require(_isContract(_tokenB), 'SimpleSwap: TOKENB_IS_NOT_CONTRACT');
		require(_tokenA != _tokenB, 'SimpleSwap: TOKENA_TOKENB_IDENTICAL_ADDRESS');
		tokenA = IERC20(_tokenA);
		tokenB = IERC20(_tokenB);
	}

	function _isContract(address addr) private view returns (bool) {
		return addr.code.length > 0;
	}

	/// @inheritdoc ISimpleSwap
	function swap(
		address tokenIn,
		address tokenOut,
		uint256 amountIn,
		bytes calldata data
	) external nonReentrant returns (uint256) {
		require(
			_isContract(tokenIn) && (address(tokenA) == tokenIn || address(tokenB) == tokenIn),
			'SimpleSwap: INVALID_TOKEN_IN'
		);
		require(
			_isContract(tokenOut) && (address(tokenA) == tokenOut || address(tokenB) == tokenOut),
			'SimpleSwap: INVALID_TOKEN_OUT'
		);
		require(tokenIn != tokenOut, 'SimpleSwap: IDENTICAL_ADDRESS');
		require(amountIn > 0, 'SimpleSwap: INSUFFICIENT_INPUT_AMOUNT');

		address sender = _msgSender();

		uint256 reserveTokenIn = IERC20(tokenIn).balanceOf(address(this));
		uint256 reserveTokenOut = IERC20(tokenOut).balanceOf(address(this));

		uint256 diffK = reserveTokenOut * (reserveTokenIn + amountIn) - lastK;

		// amountOut = reserveTokenOut - lastK / (reserveTokenIn + amountIn)
		uint256 amountOut = diffK / (reserveTokenIn + amountIn);

		require(amountOut > 0, 'SimpleSwap: INSUFFICIENT_OUTPUT_AMOUNT');
		require(
			(reserveTokenOut - amountOut) * (reserveTokenIn + amountIn) >= lastK,
			'SimpleSwap: K'
		);

		IERC20(tokenIn).transferFrom(sender, address(this), amountIn);
		IERC20(tokenOut).transfer(sender, amountOut);
		if (data.length > 0) ISimpleSwapCallee(sender).simpleswapCall(sender, amountOut, data);
		_updateReserves();

		emit Swap(sender, tokenIn, tokenOut, amountIn, amountOut);

		return amountOut;
	}

	/// @inheritdoc ISimpleSwap
	function addLiquidity(uint256 amountAIn, uint256 amountBIn)
		external
		nonReentrant
		returns (
			uint256,
			uint256,
			uint256
		)
	{
		require(amountAIn > 0 && amountBIn > 0, 'SimpleSwap: INSUFFICIENT_INPUT_AMOUNT');

		address sender = _msgSender();
		uint256 _totalSupply = totalSupply();
		uint256 liquidity = 0;
		uint256 actualAmountA = amountAIn;
		uint256 actualAmountB = amountBIn;

		if (_totalSupply == 0) {
			liquidity = Math.sqrt(amountAIn * amountBIn);
			lastK = amountAIn * amountBIn;
		} else {
			liquidity = Math.min(
				(amountAIn * _totalSupply) / reserveA,
				(amountBIn * _totalSupply) / reserveB
			);

			actualAmountA = (liquidity * reserveA) / _totalSupply;
			actualAmountB = (liquidity * reserveB) / _totalSupply;
		}

		tokenA.transferFrom(sender, address(this), actualAmountA);
		tokenB.transferFrom(sender, address(this), actualAmountB);

		_updateReserves();

		uint256 feeLiquidity = (liquidity * 3) / 1000;
		uint256 userLiquidity = liquidity - feeLiquidity;

		_mint(sender, userLiquidity);
		_mint(address(this), feeLiquidity);

		emit AddLiquidity(sender, actualAmountA, actualAmountB, userLiquidity);

		return (actualAmountA, actualAmountB, userLiquidity);
	}

	/// @inheritdoc ISimpleSwap
	function removeLiquidity(uint256 liquidity) public nonReentrant returns (uint256, uint256) {
		require(liquidity > 0, 'SimpleSwap: INSUFFICIENT_LIQUIDITY_BURNED');

		address sender = _msgSender();
		uint256 _totalSupply = totalSupply();
		uint256 amountA = (liquidity * reserveA) / _totalSupply;
		uint256 amountB = (liquidity * reserveB) / _totalSupply;

		_transfer(sender, address(this), liquidity);
		_burn(address(this), liquidity);

		tokenA.transfer(sender, amountA);
		tokenB.transfer(sender, amountB);

		_updateReserves();

		emit RemoveLiquidity(sender, amountA, amountB, liquidity);

		return (amountA, amountB);
	}

	function withdrawFee() external onlyOwner returns (uint256) {
		uint256 feeLiquidity = balanceOf(address(this));

		_transfer(address(this), msg.sender, feeLiquidity);

		return feeLiquidity;
	}

	function _updateReserves() private {
		reserveA = tokenA.balanceOf(address(this));
		reserveB = tokenB.balanceOf(address(this));
	}

	/// @inheritdoc ISimpleSwap
	function getReserves() external view returns (uint256, uint256) {
		return (reserveA, reserveB);
	}

	/// @inheritdoc ISimpleSwap
	function getTokenA() external view returns (address) {
		return address(tokenA);
	}

	/// @inheritdoc ISimpleSwap
	function getTokenB() external view returns (address) {
		return address(tokenB);
	}
}
