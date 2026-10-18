// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/*
 * Lantern's honeypot test. Never deployed: Lantern places this code at a
 * throwaway address inside a read-only eth_call (a state override), funds it
 * with a little PLS there, and calls run(). Nothing touches the real chain.
 *
 * run() buys the token through a Uniswap-V2-style router (PulseX), then sells
 * everything it received straight back, and returns the raw measurements:
 *   buy:  tokens that left the pool vs tokens that arrived here (any gap is a buy tax)
 *   sell: tokens sold, the router's untaxed quote for them, the PLS actually
 *         received, and the pool's reserves just before the sale. Lantern works
 *         back from the PLS received through the pool's constant-product formula,
 *         so price impact doesn't distort the tax, and tokens that dump their own
 *         tax stash into the pool during a sale are charged as the cost they are.
 * A sell that fails outright is the mark of a honeypot.
 *
 * Compile: solc 0.8.26, optimizer on (200 runs), evmVersion shanghai; take
 * the deployed (runtime) bytecode. It is embedded in src/chains/honeypot.ts.
 */

interface IRouter {
    function factory() external view returns (address);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory);
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external;
}

interface IFactory {
    function getPair(address a, address b) external view returns (address);
}

interface IPair {
    function token0() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract SellSimulator {
    struct Result {
        uint8 stage;           // 0 = ok, 1 = no pool, 2 = buy failed, 3 = approve failed, 4 = sell failed
        uint256 buySent;       // tokens that left the pool on the buy
        uint256 buyGot;        // tokens that arrived here
        uint256 sellSent;      // tokens sold
        uint256 sellQuote;     // router's quote in PLS for them, before the sale (no tax)
        uint256 sellReceived;  // PLS that actually arrived
        uint256 reserveToken;  // pool reserves just before the sale
        uint256 reserveWrapped;
    }

    function run(address router, address wrapped, address token, uint256 amountIn) external returns (Result memory r) {
        address pair;
        try IRouter(router).factory() returns (address f) {
            pair = IFactory(f).getPair(token, wrapped);
        } catch {
            r.stage = 1;
            return r;
        }
        if (pair == address(0)) {
            r.stage = 1;
            return r;
        }

        address[] memory path = new address[](2);
        path[0] = wrapped;
        path[1] = token;

        uint256 poolBefore = IERC20(token).balanceOf(pair);
        uint256 mineBefore = IERC20(token).balanceOf(address(this));
        try IRouter(router).swapExactETHForTokensSupportingFeeOnTransferTokens{value: amountIn}(0, path, address(this), block.timestamp + 600) {
            r.buySent = poolBefore - IERC20(token).balanceOf(pair);
            r.buyGot = IERC20(token).balanceOf(address(this)) - mineBefore;
        } catch {
            r.stage = 2;
            return r;
        }
        if (r.buyGot == 0) {
            r.stage = 2;
            return r;
        }

        try IERC20(token).approve(router, type(uint256).max) returns (bool) {} catch {
            r.stage = 3;
            return r;
        }

        path[0] = token;
        path[1] = wrapped;
        r.sellSent = r.buyGot;
        try IRouter(router).getAmountsOut(r.sellSent, path) returns (uint256[] memory amounts) {
            r.sellQuote = amounts[1];
        } catch {}
        (uint112 reserve0, uint112 reserve1, ) = IPair(pair).getReserves();
        bool tokenIs0 = IPair(pair).token0() == token;
        r.reserveToken = tokenIs0 ? reserve0 : reserve1;
        r.reserveWrapped = tokenIs0 ? reserve1 : reserve0;

        uint256 plsBefore = address(this).balance;
        try IRouter(router).swapExactTokensForETHSupportingFeeOnTransferTokens(r.sellSent, 0, path, address(this), block.timestamp + 600) {
            r.sellReceived = address(this).balance - plsBefore;
        } catch {
            r.stage = 4;
            return r;
        }
        return r;
    }

    receive() external payable {}
}
