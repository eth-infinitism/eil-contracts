# Ethereum Interop Layer Contracts

This repository contains the smart-contract core of **Ethereum Interop Layer**, a trust-minimized, cross–chain interoperability protocol.
EIL enables users to interact with the entire Ethereum ecosystem instead of separate fragmented chains cross-chain UserOperations — moving tokens, making calls, or paying gas — without relying on trusted relayers or bridges

---

## Table of Contents

- [Background](#background)  
- [Vision & Goals](#vision--goals)  
- [Core Contracts](#core-contracts)  
- [How It Works](#how-it-works)  
- [Trust Model & Security](#trust-model--security)  
- [Getting Started](#getting-started)  
- [Contributing](#contributing)  
- [License](#license)  

---

## Background

EIL is motivated by the fragmentation of the L2 ecosystem. Each rollup feels like a separate chain with its own assets and applications, which hurts the user experience.

EIL’s goal is to unify that experience so that interacting across chains feels like interacting on a single Ethereum chain.

Unlike solutions that depend on third-party relayers or centralized operators, EIL is designed around **on-chain contracts**, preserving Ethereum’s core principles of self-custody, censorship resistance, privacy and verifiability.

## Vision & Goals

### **Seamless Multichain UX**

Users sign once; wallets figure out how to route the transaction across L2s.

### **CrossfChain Gas Abstraction**

Users don’t need to hold gas on every chain.
Instead, they can pay for gas with tokens from one chain, for all chains in the cross chain transaction

### **Trustless**

* Communication is done solely on-chain.
No reliance on opaque relayers or off-chain services. Users transact directly with the chain and liquidity providers never know users’ intentions in advance.
* Users' funds are never at risk. Transfer assets cross chain without relying on a third party cenralized service to release your funds and transact on your behalf.

### **On-chain Dispute Mechanism**

Stake and dispute logic to penalize misbehavior by liquidity providers or malicious users.

## Core Contracts

Here are the major contract components in the Ethereum Interop Layer protocol and their roles:

### **`CrossChainPaymaster`**

The main singleton EIL contract deployed on every chain.

Acts as the Paymaster for cross-chain gas payments on the destination chain.

Users lock funds into this contract on the origin chain, specifying which liquidity providers will be accepted, and request a Voucher for the destination chain.

### **`L1StakeManager`**

Manages the stake of XLPs on the Ethereum Mainnet.

Liquidity providers lock stake on L1 to back their cross-chain liquidity.

The stake is used for security in case of a dispute. If an XLP misbehaves, their stake can be slashed.

### **`VoucherRequest`** and **`Voucher`** structs
 
Represents a user request and the correspondon obligation by an XLP to fulfill the cross-chain transaction on the destination chain.

When a user locks funds in the `CrossChainPaymaster` and requests a voucher,all allowed XLPs compete to issue the `Voucher` according to a fee schedule specified in the `VoucherRequest` in a reverse dutch auction model.

### **`Dispute` contracts**

These contracts handle dispute resolution.

If a voucher is misused, or funds are not properly delivered, other actors can submit a dispute on-chain to the L1 and trigger slashing of stake.

## How It Works: High-Level Flow

Here is a simplified sequence of how a cross-chain transaction works under EIL:

1. **Wallet constructs multiple UserOps for every chain**

The user’s wallet creates a set of `UserOperation` objects that together specify a cross-chain operation, i.e. "send 90 USDC from Arbitrum to Optimism", or even something more complex: calls, swaps, mints, etc.

2. **Lock funds & request voucher**  
When submitting the operation on the origin chain, the UserOp deposits funds into the `CrossChainPaymaster`, and creates a request for a voucher from eligible XLPs.

3. **XLP issues vouchers**  

Registered XLPs on that chain see the request and compete to submit vouchers issuance.

4. **User Operation executes**  

Once an XLP issues a voucher, the wallet, that listens to this event, attaches the voucher to the destination chain UserOp, and complete its execution. 
Funds are locked, the voucher is accepted, and the "cross-chain call" is effectively finalized on the destination chain.

5. **Settlement or dispute (if needed)**  
   - If everything goes well, the transaction finalizes on the destination chain.  
   - If there's a dispute (e.g., XLP doesn’t fulfill or misbehaves), anyone can raise a dispute on L2 origin and destination chains to L1, and the offending XLP’s stake will be slashed.

6. **Redemption / withdrawal**  
   After successful execution, liquidity is reconciled, and XLPs can reclaim funds on the origin chain.

This gives users a near–instant, one-signature cross-chain experience, **without trusting centralized bridges or relayers**.

## Trust Model & Security

- **Self-custody**: Users retain control; they sign all UserOps from their own wallet.
- **No relayer trust**: Liquidity providers (XLPs) never see users' private data — they only see the voucher requests.
- **Economic security**: XLPs must lock a stake on the L1. Dishonest behavior will lead to slashing via the L1 smart contract.
- **On-chain dispute resolution**: Built-in dispute mechanism to enforce correct behavior.

## Getting Started

To work with this repo:

1. **Clone**  
   ```bash
   git clone https://github.com/eth-infinitism/eil-contracts.git  
   cd eil-contracts
   ```

2. Install dependencies
```bash
yarn install
```

3. Compile

```bash
npx hardhat compile  
# or using forge:  
forge build
```

4. Test

```bash
npx hardhat test  
```

