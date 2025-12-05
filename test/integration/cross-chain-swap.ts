import assert from "node:assert"
import { describe, it } from "node:test"

import {
  encodeAbiParameters,
  getAddress,
  getContract,
  keccak256,
  parseEther,
  zeroAddress
} from "viem"

import { createEilFixture } from "../fixture/eil.ts"
import { getDeployer, getNetwork } from "../util/network.ts"

/**
 * Get a CrossChainPaymaster contract reference with OriginSwapManager ABI.
 * This is needed because CrossChainPaymaster delegates calls to OriginSwapManager via Proxy.
 */
async function getPaymasterWithOriginAbi(
  crossChainPaymaster: any,
  originSwapManager: any,
  client: any
) {
  return getContract({
    address: crossChainPaymaster.address,
    abi: originSwapManager.abi,
    client
  })
}

/**
 * EIL Cross-Chain Atomic Swap Integration Tests
 *
 * Complete flow based on the sequence diagram:
 * 1. Lookup registered & funded XLPs (Chain_A, Chain_B)
 * 2. Fill & Sign UserOps
 * 3. UserOp1: Commit funds (lock funds on origin chain)
 * 4. XLP Claim funds (gives voucher) - XLP issues voucher on origin chain
 * 5. UserOp2: Use voucher to claim funds + call (use voucher on destination chain)
 * 6. Alice gets funds
 * 7. Paymaster pays gas
 * 8. Alice's call executes
 * 9. Wait an hour
 * 10. XLP Unlock & reuse funds (XLP withdraws funds from origin chain)
 */

// Helper function: Calculate VoucherRequest ID
function getVoucherRequestId(voucherRequest: any): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          {
            type: "tuple",
            name: "origination",
            components: [
              { type: "uint256", name: "chainId" },
              { type: "address", name: "paymaster" },
              { type: "address", name: "sender" },
              {
                type: "tuple[]",
                name: "assets",
                components: [
                  { type: "address", name: "erc20Token" },
                  { type: "uint256", name: "amount" }
                ]
              },
              {
                type: "tuple",
                name: "feeRule",
                components: [
                  { type: "uint256", name: "startFeePercentNumerator" },
                  { type: "uint256", name: "maxFeePercentNumerator" },
                  { type: "uint256", name: "feeIncreasePerSecond" },
                  { type: "uint256", name: "unspentVoucherFee" }
                ]
              },
              { type: "uint256", name: "senderNonce" },
              { type: "address[]", name: "allowedXlps" }
            ]
          },
          {
            type: "tuple",
            name: "destination",
            components: [
              { type: "uint256", name: "chainId" },
              { type: "address", name: "paymaster" },
              { type: "address", name: "sender" },
              {
                type: "tuple[]",
                name: "assets",
                components: [
                  { type: "address", name: "erc20Token" },
                  { type: "uint256", name: "amount" }
                ]
              },
              { type: "uint256", name: "maxUserOpCost" },
              { type: "uint256", name: "expiresAt" }
            ]
          }
        ]
      }
    ],
    [voucherRequest]
  )
  return keccak256(encoded)
}

describe("Cross-Chain Atomic Swap Integration", () => {
  /**
   * Complete cross-chain atomic swap flow test.
   * Simulates Alice transferring assets from Chain_A to Chain_B.
   *
   * Note: CrossChainPaymaster delegates calls to OriginSwapManager,
   * so all origin and destination operations go through crossChainPaymaster.
   */
  it("should complete full cross-chain atomic swap flow", async () => {
    const { viem, networkHelpers } = await getNetwork()
    const publicClient = await viem.getPublicClient()
    const walletClients = await viem.getWalletClients()

    const alice = walletClients[0] // User
    const xlpOperator = walletClients[1] // XLP operator

    // Use integration test fixture (disable L2 Connector, use realistic time params)
    const fixture = await createEilFixture({
      voucherUnlockDelay: 3600n, // 1 hour
      timeBeforeDisputeExpires: 604800n, // 7 days
      userCancellationDelay: 300n, // 5 minutes
      voucherMinExpirationTime: 60n, // 1 minute
      disableL2Connector: true // Allow direct XLP registration
    })

    const { crossChainPaymaster, testToken, dummyAccount, originSwapManager } =
      fixture

    // Get paymaster reference with OriginSwapManager ABI
    const paymasterAsOrigin = await getPaymasterWithOriginAbi(
      crossChainPaymaster,
      originSwapManager,
      alice
    )

    // ========================================
    // Step 1: Lookup registered & funded XLPs
    // ========================================
    console.log("\n=== Step 1: Register XLP and fund deposits ===")

    // Register XLP (can be called directly when l2Connector is zeroAddress)
    await crossChainPaymaster.write.onL1XlpChainInfoAdded([
      xlpOperator.account.address, // l1XlpAddress
      xlpOperator.account.address // l2XlpAddress
    ])

    // Verify XLP is registered
    const isXlpRegistered = await crossChainPaymaster.read.isL2XlpRegistered([
      xlpOperator.account.address
    ])
    assert.equal(isXlpRegistered, true, "XLP should be registered")
    console.log("✓ XLP registered:", xlpOperator.account.address)

    // XLP deposits ETH on destination chain (for paying user assets and gas)
    const xlpDepositAmount = parseEther("10")
    await crossChainPaymaster.write.depositToXlp(
      [xlpOperator.account.address],
      { value: xlpDepositAmount, account: xlpOperator.account }
    )

    // Verify XLP balance
    const xlpNativeBalance = await crossChainPaymaster.read.nativeBalanceOf([
      xlpOperator.account.address
    ])
    assert.equal(
      xlpNativeBalance,
      xlpDepositAmount,
      "XLP should have deposited ETH"
    )
    console.log("✓ XLP funded with:", xlpDepositAmount, "wei")

    // ========================================
    // Step 2 & 3: Fill & Sign UserOps, UserOp1: Commit funds
    // ========================================
    console.log("\n=== Step 2 & 3: Alice commits funds on origin chain ===")

    const chainId = await publicClient.getChainId()
    const currentBlock = await publicClient.getBlock()
    const currentTimestamp = currentBlock.timestamp

    // Get Alice's nonce (via delegate call to OriginSwapManager)
    const aliceNonce = await paymasterAsOrigin.read.getSenderNonce([
      alice.account.address
    ])

    // Mint test tokens to Alice
    const swapAmount = parseEther("1")
    const maxFeePercent = 100n // 1%
    const amountWithMaxFee = swapAmount + (swapAmount * maxFeePercent) / 10000n

    await testToken.write.sudoMint([alice.account.address, amountWithMaxFee])
    await testToken.write.sudoApprove([
      alice.account.address,
      crossChainPaymaster.address,
      amountWithMaxFee
    ])

    // Build AtomicSwapVoucherRequest
    const voucherRequest = {
      origination: {
        chainId: BigInt(chainId),
        paymaster: getAddress(crossChainPaymaster.address),
        sender: getAddress(alice.account.address),
        assets: [
          {
            erc20Token: getAddress(testToken.address),
            amount: swapAmount
          }
        ],
        feeRule: {
          startFeePercentNumerator: 10n, // 0.1%
          maxFeePercentNumerator: maxFeePercent, // 1%
          feeIncreasePerSecond: 1n,
          unspentVoucherFee: parseEther("0.01")
        },
        senderNonce: aliceNonce,
        allowedXlps: [xlpOperator.account.address] // XLP whitelist
      },
      destination: {
        chainId: BigInt(chainId), // Same chain for testing
        paymaster: getAddress(crossChainPaymaster.address),
        sender: getAddress(dummyAccount.address), // AA account address
        assets: [
          {
            erc20Token: zeroAddress, // Native ETH
            amount: parseEther("0.9") // Amount after fee deduction
          }
        ],
        maxUserOpCost: parseEther("0.1"),
        expiresAt: currentTimestamp + 3600n // 1 hour from now
      }
    }

    // Alice locks funds (UserOp1: Commit funds)
    // Via CrossChainPaymaster delegate call to OriginSwapManager.lockUserDeposit
    await paymasterAsOrigin.write.lockUserDeposit([voucherRequest])

    const requestId = getVoucherRequestId(voucherRequest)
    console.log("✓ Request ID:", requestId)

    // Verify swap status
    const metadata = await paymasterAsOrigin.read.getAtomicSwapMetadata([
      requestId
    ])
    assert.equal(metadata.core.status, 1, "Status should be NEW (1)")
    console.log("✓ Atomic swap created with status NEW")

    // ========================================
    // Step 4: XLP Claim funds (gives voucher)
    // ========================================
    console.log("\n=== Step 4: XLP issues voucher ===")

    const voucherExpiresAt = currentTimestamp + 3600n
    const voucherType = 0 // STANDARD

    // Generate signature message
    const signatureMessage = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { type: "uint256", name: "chainId" },
            { type: "address", name: "paymaster" },
            { type: "address", name: "sender" },
            {
              type: "tuple[]",
              name: "assets",
              components: [
                { type: "address", name: "erc20Token" },
                { type: "uint256", name: "amount" }
              ]
            },
            { type: "uint256", name: "maxUserOpCost" },
            { type: "uint256", name: "expiresAt" }
          ]
        },
        { type: "bytes32", name: "requestId" },
        { type: "address", name: "xlpAddress" },
        { type: "uint256", name: "expiresAt" },
        { type: "uint8", name: "voucherType" }
      ],
      [
        voucherRequest.destination,
        requestId,
        getAddress(xlpOperator.account.address),
        voucherExpiresAt,
        voucherType
      ]
    )

    // XLP signs the voucher
    const xlpSignature = await xlpOperator.signMessage({
      message: { raw: signatureMessage }
    })

    // Build Voucher
    const voucher = {
      requestId,
      originationXlpAddress: getAddress(xlpOperator.account.address),
      voucherRequestDest: voucherRequest.destination,
      expiresAt: voucherExpiresAt,
      voucherType,
      xlpSignature
    }

    // XLP issues voucher (needs to be called with XLP's account)
    const paymasterAsOriginXlp = await getPaymasterWithOriginAbi(
      crossChainPaymaster,
      originSwapManager,
      xlpOperator
    )
    await paymasterAsOriginXlp.write.issueVouchers([
      [{ voucherRequest, voucher }]
    ])

    // Verify voucher is issued
    const metadataAfterVoucher =
      await paymasterAsOrigin.read.getAtomicSwapMetadata([requestId])
    assert.equal(
      metadataAfterVoucher.core.status,
      2,
      "Status should be VOUCHER_ISSUED (2)"
    )
    assert.equal(
      getAddress(metadataAfterVoucher.core.voucherIssuerL2XlpAddress),
      getAddress(xlpOperator.account.address),
      "Voucher issuer should be XLP"
    )
    console.log("✓ Voucher issued by XLP")

    // ========================================
    // Step 5-8: UserOp2 - Use voucher to claim funds
    // ========================================
    console.log("\n=== Step 5-8: Alice uses voucher on destination chain ===")

    // In real scenarios, this is done via ERC-4337 UserOp
    // Here we verify destination chain status is NONE (voucher can be used)
    const destinationSwapBefore =
      await crossChainPaymaster.read.getIncomingAtomicSwap([requestId])
    assert.equal(
      destinationSwapBefore.status,
      0,
      "Destination status should be NONE before withdrawal"
    )
    console.log("✓ Voucher ready for use on destination chain")

    // ========================================
    // Step 9: Wait an hour (dispute period)
    // ========================================
    console.log("\n=== Step 9: Wait for dispute period (1 hour) ===")

    await networkHelpers.time.increase(3601n) // 1 hour + 1 second
    console.log("✓ Dispute period passed (1 hour)")

    // ========================================
    // Step 10: XLP Unlock & reuse funds
    // ========================================
    console.log(
      "\n=== Step 10: XLP withdraws user deposit from origin chain ==="
    )

    // XLP withdraws user's locked funds from origin chain
    await paymasterAsOriginXlp.write.withdrawFromUserDeposit([[voucherRequest]])

    // Verify final status
    const finalMetadata = await paymasterAsOrigin.read.getAtomicSwapMetadata([
      requestId
    ])
    assert.equal(
      finalMetadata.core.status,
      6,
      "Status should be SUCCESSFUL (6)"
    )

    // Verify XLP received user's funds (as internal balance)
    const xlpTokenBalance = await crossChainPaymaster.read.tokenBalanceOf([
      testToken.address,
      xlpOperator.account.address
    ])
    assert.ok(xlpTokenBalance > 0n, "XLP should have received tokens")

    console.log("✓ XLP successfully withdrew user deposit")
    console.log("✓ Atomic swap completed successfully!")
    console.log("\n=== Cross-Chain Atomic Swap Flow Complete ===")
  })

  /**
   * Test user cancellation flow.
   * When no XLP claims, user can cancel after USER_CANCELLATION_DELAY.
   */
  it("should allow user to cancel if no XLP claims", async () => {
    const { viem, networkHelpers } = await getNetwork()
    const publicClient = await viem.getPublicClient()
    const walletClients = await viem.getWalletClients()

    const alice = walletClients[0]
    const deployer = await getDeployer()

    // Use shorter cancellation delay for testing
    const fixture = await createEilFixture({
      userCancellationDelay: 300n, // 5 minutes
      disableL2Connector: true
    })

    const { crossChainPaymaster, testToken, originSwapManager } = fixture

    // Get paymaster reference with OriginSwapManager ABI
    const paymasterAsOrigin = await getPaymasterWithOriginAbi(
      crossChainPaymaster,
      originSwapManager,
      alice
    )

    const chainId = await publicClient.getChainId()
    const currentBlock = await publicClient.getBlock()
    const currentTimestamp = currentBlock.timestamp

    // Mint tokens to Alice
    const swapAmount = parseEther("1")
    const maxFeePercent = 100n
    const amountWithMaxFee = swapAmount + (swapAmount * maxFeePercent) / 10000n

    await testToken.write.sudoMint([alice.account.address, amountWithMaxFee])
    await testToken.write.sudoApprove([
      alice.account.address,
      crossChainPaymaster.address,
      amountWithMaxFee
    ])

    // Build request
    const voucherRequest = {
      origination: {
        chainId: BigInt(chainId),
        paymaster: getAddress(crossChainPaymaster.address),
        sender: getAddress(alice.account.address),
        assets: [
          {
            erc20Token: getAddress(testToken.address),
            amount: swapAmount
          }
        ],
        feeRule: {
          startFeePercentNumerator: 10n,
          maxFeePercentNumerator: maxFeePercent,
          feeIncreasePerSecond: 1n,
          unspentVoucherFee: parseEther("0.01")
        },
        senderNonce: 0n,
        allowedXlps: [deployer.account.address] // An XLP that won't claim
      },
      destination: {
        chainId: BigInt(chainId),
        paymaster: getAddress(crossChainPaymaster.address),
        sender: getAddress(alice.account.address),
        assets: [
          {
            erc20Token: zeroAddress,
            amount: parseEther("0.9")
          }
        ],
        maxUserOpCost: parseEther("0.1"),
        expiresAt: currentTimestamp + 3600n
      }
    }

    // Alice locks funds
    await paymasterAsOrigin.write.lockUserDeposit([voucherRequest])

    const requestId = getVoucherRequestId(voucherRequest)
    console.log("Request created, ID:", requestId)

    // Wait for USER_CANCELLATION_DELAY (5 minutes)
    await networkHelpers.time.increase(301n)

    // Alice cancels the request
    await paymasterAsOrigin.write.cancelVoucherRequest([voucherRequest])

    // Verify status changed to CANCELLED
    const metadata = await paymasterAsOrigin.read.getAtomicSwapMetadata([
      requestId
    ])
    assert.equal(metadata.core.status, 3, "Status should be CANCELLED (3)")

    // Verify Alice received original amount back (without fee)
    const aliceBalanceAfter = await testToken.read.balanceOf([
      alice.account.address
    ])
    assert.equal(
      aliceBalanceAfter,
      swapAmount,
      "Alice should have received her original swap amount back"
    )

    console.log("✓ User successfully cancelled and recovered funds")
  })

  /**
   * Test XLP balance queries.
   */
  it("should correctly query XLP balances and registration status", async () => {
    const { viem } = await getNetwork()
    const walletClients = await viem.getWalletClients()

    const xlp1 = walletClients[1]
    const xlp2 = walletClients[2]

    const fixture = await createEilFixture({ disableL2Connector: true })
    const { crossChainPaymaster } = fixture

    // Register two XLPs
    await crossChainPaymaster.write.onL1XlpChainInfoAdded([
      xlp1.account.address,
      xlp1.account.address
    ])
    await crossChainPaymaster.write.onL1XlpChainInfoAdded([
      xlp2.account.address,
      xlp2.account.address
    ])

    // Verify registration status
    assert.equal(
      await crossChainPaymaster.read.isL2XlpRegistered([xlp1.account.address]),
      true
    )
    assert.equal(
      await crossChainPaymaster.read.isL2XlpRegistered([xlp2.account.address]),
      true
    )

    // XLP1 deposits
    await crossChainPaymaster.write.depositToXlp([xlp1.account.address], {
      value: parseEther("5"),
      account: xlp1.account
    })

    // XLP2 deposits
    await crossChainPaymaster.write.depositToXlp([xlp2.account.address], {
      value: parseEther("3"),
      account: xlp2.account
    })

    // Verify balances
    assert.equal(
      await crossChainPaymaster.read.nativeBalanceOf([xlp1.account.address]),
      parseEther("5")
    )
    assert.equal(
      await crossChainPaymaster.read.nativeBalanceOf([xlp2.account.address]),
      parseEther("3")
    )

    // Query XLP list
    const xlps = await crossChainPaymaster.read.getXlps([0n, 10n])
    assert.equal(xlps.length, 2, "Should have 2 registered XLPs")

    console.log("✓ XLP registration and balance queries work correctly")
  })
})
