# 🚀 Crypto Portfolio Tracker

A privacy-first, self-hosted multi-chain cryptocurrency portfolio tracker that puts YOU in control of your data. Track wallets across Bitcoin, Ethereum, Pulsechain, Base, Solana, and more - all from your own server.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)

## ✨ Features

### 🔐 Privacy-First
- **Self-hosted**: Your data never leaves your server
- **No tracking**: No analytics, no data collection
- **Open source**: Fully auditable code

### 🌐 Multi-Chain Support
- **Bitcoin**: BTC + Ordinals (Bitcoin NFTs)
- **Ethereum**: ETH, ERC-20 tokens, NFTs
- **Pulsechain**: PLS, PRC-20 tokens, NFTs
- **Base**: ETH (L2), ERC-20 tokens, NFTs  
- **Solana**: SOL, SPL tokens, Solana NFTs

### 🎨 Personalization
- **Named Wallets**: Give your wallets custom names
- **NFT Avatars**: Use your owned NFTs as wallet avatars
- **Portfolio PFP**: Set any NFT/Ordinal as your portfolio picture
- **Smart Grouping**: Organize by chain, asset type, or value

### 📊 Portfolio Management
- **Real-time Pricing**: Live USD valuations
- **Multi-Wallet**: Track unlimited wallets per chain
- **EVM Unification**: Same address across Ethereum, Pulsechain, Base
- **Asset Breakdown**: Detailed view of tokens, NFTs, and native assets

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/crypto-portfolio-tracker.git
cd crypto-portfolio-tracker

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 🔑 API Setup

Everything works without API keys using public RPCs and free price APIs. Optional keys go in `.env.local`. They're read server-side only and never sent to the browser:

```bash
ALCHEMY_API_KEY=      # Faster Ethereum/Base/Robinhood RPC + NFTs
XVERSE_API_KEY=       # Full Ordinals metadata (numbers, collections, floors)
COINGECKO_API_KEY=    # CoinGecko Demo key for BTC/ETH/PLS prices
```

Add wallets from the dashboard. They're saved in your browser's localStorage, not on the server.

## 🏗️ Project Structure

```
src/
├── app/                    # Next.js app directory
├── components/            
│   ├── ui/                # Reusable UI components
│   ├── portfolio/         # Portfolio-specific components
│   └── wallet/            # Wallet management components
├── chains/                # Blockchain integrations
│   ├── ethereum.js        # Ethereum + EVM chains
│   ├── bitcoin.js         # Bitcoin + Ordinals
│   ├── solana.js          # Solana integration
│   └── base.js            # Base L2 integration
├── config/                # Configuration files
│   ├── chains.json        # Chain settings
│   ├── tokens.json        # Popular token lists
│   └── display.json       # UI customization
├── hooks/                 # React hooks
├── utils/                 # Helper functions
└── types/                 # TypeScript definitions
```

## 🎨 Customization Guide

### Adding New Blockchains

1. **Create chain handler** in `src/chains/yourchain.js`:
```javascript
// src/chains/yourchain.js
export class YourChainHandler {
  async getBalance(address) {
    // Implement balance fetching
  }
  
  async getTokens(address) {
    // Implement token fetching
  }
  
  async getNFTs(address) {
    // Implement NFT fetching
  }
}
```

2. **Add chain config** in `src/config/chains.json`:
```json
{
  "yourchain": {
    "name": "Your Chain",
    "symbol": "YOUR",
    "rpcUrl": "https://rpc.yourchain.com",
    "explorerUrl": "https://explorer.yourchain.com",
    "addressFormat": "hex", // or "base58", "bech32"
    "features": ["tokens", "nfts"]
  }
}
```

3. **Update display order** in `src/config/display.json`

### Customizing UI

**Colors & Styling**: Edit `tailwind.config.js`
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        bitcoin: '#f7931a',
        ethereum: '#627eea', 
        // Add your chain colors
      }
    }
  }
}
```

**Chain Display Order**: Edit `src/config/display.json`
```json
{
  "displayOrder": ["bitcoin", "ethereum", "yourchain"],
  "defaultExpanded": ["ethereum"],
  "groupByValue": true
}
```

### Adding Price Sources

Edit `src/utils/pricing.js` to add new price APIs:
```javascript
const priceProviders = [
  'coingecko',    // Primary
  'coinmarketcap', // Fallback
  'yourprovider'   // Add yours here
];
```

## 🔧 Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Check TypeScript
```

### Code Style

- **TypeScript**: Strongly typed for better documentation
- **ESLint**: Consistent code formatting
- **Comments**: Every function and component documented
- **Modular**: Each chain/feature in separate files

## 🤝 Contributing

We welcome contributions! Here's how:

### Quick Contributions
- 🐛 **Bug Reports**: Open an issue with details
- 💡 **Feature Requests**: Describe your idea in an issue
- 📝 **Documentation**: Improve README, comments, guides

### Code Contributions

1. **Fork** the repository
2. **Create branch**: `git checkout -b feature/amazing-feature`
3. **Make changes** with clear, documented code
4. **Test thoroughly** across different wallets/chains
5. **Commit**: `git commit -m 'Add amazing feature'`
6. **Push**: `git push origin feature/amazing-feature`
7. **Pull Request**: Open PR with description

### Contribution Areas

- 🔗 **New Blockchain Support**: Add Polygon, Arbitrum, etc.
- 🎨 **UI/UX Improvements**: Better charts, animations, mobile
- 📊 **Analytics Features**: Historical tracking, portfolio analysis
- 🔒 **Security Enhancements**: Better validation, error handling
- 📱 **Mobile App**: React Native version
- 🌐 **Internationalization**: Multi-language support

## 🛡️ Security

- **Local Storage Only**: No data sent to external servers
- **Read-Only**: Never requests private keys or permissions
- **Open Source**: Code is fully auditable
- **API Keys**: Your keys, your control

**⚠️ Important**: Only enter **public** wallet addresses. Never share private keys!

## 📋 Roadmap

### Phase 1: MVP ✅
- [x] Basic wallet tracking
- [x] Multi-chain support
- [x] NFT avatars
- [x] Real-time pricing

### Phase 2: Enhanced UX 🔄
- [ ] Portfolio analytics
- [ ] Historical tracking
- [ ] Export functionality
- [ ] Mobile optimization

### Phase 3: Advanced Features 🔮
- [ ] 3D Portfolio City visualization
- [ ] DeFi position tracking
- [ ] Multi-wallet comparisons
- [ ] Community themes

## 📞 Support

- **Documentation**: Check this README and code comments
- **Issues**: [GitHub Issues](https://github.com/YOUR_USERNAME/crypto-portfolio-tracker/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOUR_USERNAME/crypto-portfolio-tracker/discussions)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Ethereum Community**: For robust tooling and APIs
- **Bitcoin Developers**: For Ordinals innovation  
- **Solana Ecosystem**: For fast, cheap transactions
- **Pulsechain**: For EVM compatibility and innovation
- **Open Source Community**: For making this possible

---

**Built with ❤️ by the community, for the community**

*Take back control of your crypto portfolio tracking!*