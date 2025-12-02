import hre from "hardhat"
import { NetworkConnection } from "hardhat/types/network"

let network: NetworkConnection | null = null

export async function getNetwork() {
  if (!network) {
    network = await hre.network.connect()
  }
  return network
}

export async function getDeployer() {
  const { viem } = await getNetwork()
  return (await viem.getWalletClients()).slice(-1)[0]
}
