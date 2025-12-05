import { maxUint256, parseEther, zeroAddress } from "viem"

import { getDeployer, getNetwork } from "../util/network.ts"
import { erc4337Fixture } from "./erc4337.ts"

export interface EilFixtureOptions {
  // Dispute period delay (default 1 second for fast testing)
  voucherUnlockDelay?: bigint
  // Time before dispute expires (default 1 second)
  timeBeforeDisputeExpires?: bigint
  // User cancellation delay (default 1 second)
  userCancellationDelay?: bigint
  // Voucher minimum expiration time (default 1 second)
  voucherMinExpirationTime?: bigint
  // Whether to disable L2 Connector (allows direct XLP registration in test environment)
  disableL2Connector?: boolean
}

export async function createEilFixture(options: EilFixtureOptions = {}) {
  const {
    voucherUnlockDelay = 1n,
    timeBeforeDisputeExpires = 1n,
    userCancellationDelay = 1n,
    voucherMinExpirationTime = 1n,
    disableL2Connector = false
  } = options

  const { viem, networkHelpers } = await getNetwork()
  const deployer = await getDeployer()
  const deployConfig = {
    client: {
      wallet: deployer
    }
  }
  const { entryPoint } = await networkHelpers.loadFixture(erc4337Fixture)

  // Deploy OriginSwapManager (used for delegate calls)
  const originSwapManager = await viem.deployContract(
    "OriginSwapManager",
    [
      voucherUnlockDelay,
      timeBeforeDisputeExpires,
      userCancellationDelay,
      voucherMinExpirationTime,
      0n, // uint256 _disputeBondPercent
      parseEther("0.1"), // uint256 _flatNativeBond
      zeroAddress, // address originModule
      0n // uint256 l1DisputeGasLimit
    ],
    deployConfig
  )

  // Deploy Mock Bridge Connectors
  const arbInboxMock = await viem.deployContract(
    "MockArbInbox",
    [],
    deployConfig
  )
  const arbOutboxMock = await viem.deployContract(
    "MockArbOutbox",
    [],
    deployConfig
  )
  const l1ArbConnector = await viem.deployContract(
    "L1ArbitrumBridgeConnector",
    [arbOutboxMock.address, arbInboxMock.address],
    deployConfig
  )
  const l2ArbConnector = await viem.deployContract(
    "L2ArbitrumBridgeConnector",
    [],
    deployConfig
  )

  // Deploy L1AtomicSwapStakeManager
  const l1StakeManager = await viem.deployContract(
    "L1AtomicSwapStakeManager",
    [
      {
        claimDelay: 1n,
        destBeforeOriginMinGap: 1n,
        minStakePerChain: 1n,
        unstakeDelay: 1n,
        maxChainsPerXlp: maxUint256,
        l2SlashedGasLimit: 0n,
        l2StakedGasLimit: 0n,
        owner: deployer.account.address
      }
    ],
    deployConfig
  )

  // Deploy CrossChainPaymaster
  // Note: When l2Connector is set to zeroAddress, _requireFromL1StakeManager check is skipped.
  // This allows us to call onL1XlpChainInfoAdded directly in test environment.
  const crossChainPaymaster = await viem.deployContract(
    "CrossChainPaymaster",
    [
      entryPoint.address, // IEntryPoint _entryPoint
      disableL2Connector ? zeroAddress : l2ArbConnector.address, // address _l2Connector
      l1ArbConnector.address, // address _l1Connector
      l1StakeManager.address, // address _l1StakeManager
      0n, // uint256 _postOpGasCost
      0n, // uint256 _destinationL1SlashGasLimit
      zeroAddress, // address _destinationDisputeModule
      originSwapManager.address, // address _originSwapModule
      deployer.account.address // address _owner
    ],
    deployConfig
  )

  // Deploy test ERC20 token
  const testToken = await viem.deployContract(
    "TestERC20",
    ["Test Token", "TT", 18],
    deployConfig
  )

  // Deploy DummyAccount for testing
  const dummyAccount = await viem.deployContract(
    "DummyAccount",
    [],
    deployConfig
  )

  return {
    entryPoint,
    crossChainPaymaster,
    l1StakeManager,
    l1ArbConnector,
    l2ArbConnector,
    originSwapManager,
    arbInboxMock,
    arbOutboxMock,
    testToken,
    dummyAccount,
    deployer
  }
}

// Default fixture (backward compatible)
export async function eilFixture() {
  return createEilFixture()
}

// Integration test fixture (disable L2 Connector, use realistic time params)
export async function eilIntegrationFixture() {
  return createEilFixture({
    voucherUnlockDelay: 3600n, // 1 hour
    timeBeforeDisputeExpires: 604800n, // 7 days
    userCancellationDelay: 300n, // 5 minutes
    voucherMinExpirationTime: 60n, // 1 minute
    disableL2Connector: true // Allow direct XLP registration
  })
}

export async function loadEilFixture() {
  const { networkHelpers } = await getNetwork()
  return networkHelpers.loadFixture(eilFixture)
}
