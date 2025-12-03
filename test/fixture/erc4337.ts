import EntryPointArtifact from "@account-abstraction/contracts/artifacts/EntryPoint.json"
import { getContract } from "viem"

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

  const entryPoint = getContract({
    address: receipt.contractAddress as `0x${string}`,
    abi: EntryPointArtifact.abi,
    client: deployer
  })
  return { entryPoint }
}

export async function loadErc4337Fixture() {
  const { networkHelpers } = await getNetwork()
  return networkHelpers.loadFixture(erc4337Fixture)
}
