import EntryPointArtifact from "@account-abstraction/contracts/artifacts/EntryPoint.json"

import { getDeployer, getNetwork } from "../util/network.ts"

export async function erc4337Fixture() {
  const { viem } = await getNetwork()
  const deployer = await getDeployer()
  const hash = await deployer.deployContract({
    abi: EntryPointArtifact.abi,
    bytecode: EntryPointArtifact.bytecode as `0x${string}`
  })
  const receipt = await (
    await viem.getPublicClient()
  ).waitForTransactionReceipt({ hash })
  return { entryPoint: receipt.contractAddress as `0x${string}` }
}

export async function loadErc4337Fixture() {
  const { networkHelpers } = await getNetwork()
  return networkHelpers.loadFixture(erc4337Fixture)
}
