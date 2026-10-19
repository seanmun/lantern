# exchangeWallets.json

Ethereum addresses of centralized exchanges (hot wallets and known deposit
addresses), used only by the privacy score to recognise exchange links. Built
from the exact exchange labels in two MIT-licensed datasets of Etherscan's
public label cloud:

- [dawsbot/eth-labels](https://github.com/dawsbot/eth-labels): Copyright (c) 2022 Dawson Botsford
- [brianleect/etherscan-labels](https://github.com/brianleect/etherscan-labels): Copyright (c) 2022 Brian Lee Cheow Teng

Both are distributed under the MIT License:

> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

The format is `{ "Exchange name": ["0x…", …] }`, addresses lowercase.
Labels can be stale or incomplete; the score treats them as evidence, not proof.
