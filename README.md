# Lantern

**Shine a light on your whole crypto portfolio.**

Lantern is a free, open-source, read-only portfolio tracker for every wallet you own: Bitcoin, Ethereum, PulseChain, Base, Solana, Robinhood Chain, Litecoin, Dogecoin and Bitcoin Cash in one view. It reads public blockchain data and explains it plainly: what you hold, how it has moved, what your stakes will pay and when, and whether a token looks like a scam.

It was born in the HEX and PulseChain community, so it goes deepest there: contract-exact HEX staking, Maximus DAO, Hedron and Icosa, and scam checks that understand PulseChain fork copies.

Lantern is an independent project. It is not affiliated with PulseChain, HEX or their founders.

## Lantern will never

- Ask for your seed phrase, private key or recovery words.
- Ask you to connect a wallet or sign anything to see a portfolio.
- Message you first on Telegram, X, Discord or anywhere else. Anyone claiming to be "Lantern support" in your DMs is a scammer.
- Hold, move or "recover" funds.

## What it does

- **One portfolio across chains:** PulseChain, Ethereum, Bitcoin (including Ordinals, Runes and BRC-20), Base, Solana, Robinhood Chain, Litecoin, Dogecoin and Bitcoin Cash (legacy Bitcoin addresses also show any Bitcoin Cash from the 2017 split). ETH and WETH, and HEX liquid plus staked plus pools, roll up into single holdings. eHEX and pHEX are always priced separately.
- **A dashboard that tells you what matters:** net worth, a value chart (today's holdings at past prices) and a short morning brief, such as stakes that need ending, the day's move, the next stake to land and HDRN ready to mint.
- **HEX, done properly:** contract-exact interest and penalties, stake ladder and maturity calendar, a stake estimator with payout scenarios, .ics calendar export and stake alerts, and HSIs with mintable HDRN.
- **Maximus DAO:** perps worth now versus at cycle end, TEAM staking with unclaimed rewards, and pools compared with staking directly.
- **Hedron and Icosa:** HDRN, ICSA and WAATSA NFT stakes with earnings and penalty-free progress.
- **Scam detection:** behavior-based token risk checks (ghost balances, owner-controlled balances, and on PulseChain a simulated buy-and-sell through PulseX that catches honeypots and hidden taxes) that never flag core PulseChain tokens just for being PulseChain. The simulator's source is in [contracts/SellSimulator.sol](contracts/SellSimulator.sol); it only ever runs inside a read-only call.
- **Validator calculator:** what running an ETH or PLS validator pays compared with pooled staking, backtested on real data.
- **Collectibles:** NFTs and Ordinals (including recursive inscriptions such as Quantum Cats) with floor prices, and a framed gallery on the dashboard.

## Privacy

- Wallet addresses you add are stored in your browser only. There are no accounts and no user database.
- Balances, prices, history and token logos are fetched by the Lantern server from public nodes and price services, so those third parties see Lantern, not you. The server caches public data briefly and keeps no record of who looked up what.
- The one exception is NFT images, which your browser loads directly from where they are hosted (IPFS gateways, marketplace image servers).
- No analytics, ads or tracking cookies.
- For full control, run your own copy (below). Then nothing passes through anyone else's server.

## Run it yourself

Requires Node.js 20 or newer.

```bash
git clone https://github.com/seanmun/lantern.git
cd lantern
npm install
cp .env.example .env.local   # every key is optional
npm run dev                  # http://localhost:3000
```

Everything works without API keys, using public endpoints. These optional keys make it faster or more complete:

| Variable | What it adds |
|---|---|
| `ALCHEMY_API_KEY` | Faster Ethereum, Base and Robinhood RPC, and NFT metadata |
| `COINGECKO_API_KEY` | Higher limits for native coin prices and price history |
| `XVERSE_API_KEY` | Full Ordinals metadata |
| `UNISAT_API_KEY` | BRC-20 balances |
| `SOLANA_RPC_URL` | A dedicated Solana RPC (the public one is rate-limited) |

Keys are only read on the server and never reach the browser.

Scripts: `npm run dev`, `npm run build`, `npm start`, `npm run lint`, `npm run type-check`.

## How it is built

Next.js (App Router), React, TypeScript, Tailwind CSS and ethers.

```
src/
  app/          pages, plus API routes (/api/*) that do all third-party calls
  chains/       one module per chain or protocol: EVM handler, HEX, Hedron, Icosa,
                Maximus TEAM, Bitcoin, Solana, Robinhood, token risk, validators
  components/   UI: dashboard, HEX views, holdings, collectibles, tools
  hooks/        client data hooks (portfolio, prices, history, stats)
  utils/        pricing, holdings roll-up, logo resolver, the morning brief
```

Protocol math (HEX interest, penalties, Hedron minting, Icosa payouts, Maximus backing and TEAM rewards) reads the verified contracts directly. Where it says "exact", it was checked against on-chain results.

## Contributing

Issues and pull requests are welcome, especially for:

- scam tokens Lantern missed, or legitimate tokens it wrongly flagged (include the chain and contract address);
- PulseChain protocols worth supporting;
- wrong numbers, with a transaction or address that shows the problem;
- accessibility, translations and documentation.

Before opening a pull request, run `npm run lint` and `npm run type-check`.

To report a security issue privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Use it, fork it, run your own.

Prices and data come from public sources and can be wrong or late. Estimates of future value are illustrations, not financial advice.
