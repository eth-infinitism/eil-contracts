import EntryPointArtifact from "@account-abstraction/contracts/artifacts/EntryPoint.json"
import hre from "hardhat"

import { getDeployer } from "../util/viem.ts"

export async function erc4337Fixture() {
  const { viem } = await hre.network.connect()
  const deployer = await getDeployer(viem)
  const entryPoint = await deployer.deployContract({
    abi: EntryPointArtifact.abi,
    bytecode: EntryPointArtifact.bytecode as `0x${string}`
  })
  return { entryPoint }
}
