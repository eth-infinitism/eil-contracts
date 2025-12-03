import { maxUint256, zeroAddress } from "viem"

import { getDeployer, getNetwork } from "../util/network.ts"
import { erc4337Fixture } from "./erc4337.ts"

export async function eilFixture() {
  const { viem, networkHelpers } = await getNetwork()
  const deployer = await getDeployer()
  const deployConfig = {
    client: {
      wallet: deployer
    }
  }
  const { entryPoint } = await networkHelpers.loadFixture(erc4337Fixture)
  const originSwapManager = await viem.deployContract(
    "OriginSwapManager",
    [
      1n, // uint256 _voucherUnlockDelay,
      1n, // uint256 _timeBeforeDisputeExpires,
      1n, // uint256 _userCancellationDelay,
      1n, // uint256 _voucherMinExpirationTime,
      0n, // uint256 _disputeBondPercent,
      1n, // uint256 _flatNativeBond,
      zeroAddress, // address originModule,
      0n // uint256 l1DisputeGasLimit
    ],
    deployConfig
  )
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
  const crossChainPaymaster = await viem.deployContract(
    "CrossChainPaymaster",
    [
      entryPoint.address, // IEntryPoint _entryPoint,
      l2ArbConnector.address, // address _l2Connector,
      l1ArbConnector.address, // address _l1Connector,
      l1StakeManager.address, // address _l1StakeManager,
      0n, // uint256 _postOpGasCost,
      0n, // uint256 _destinationL1SlashGasLimit,
      zeroAddress, // address _destinationDisputeModule,
      originSwapManager.address, // address _originSwapModule,
      deployer.account.address // address _owner
    ],
    deployConfig
  )
  return {
    crossChainPaymaster,
    l1StakeManager,
    l1ArbConnector,
    l2ArbConnector,
    originSwapManager,
    arbInboxMock,
    arbOutboxMock
  }
}

export async function loadEilFixture() {
  const { networkHelpers } = await getNetwork()
  return networkHelpers.loadFixture(eilFixture)
}
