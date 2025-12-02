import { NetworkConnection } from "hardhat/types/network"

type HardhatViem = NetworkConnection["viem"]

export async function getDeployer(viem: HardhatViem) {
  return (await viem.getWalletClients()).slice(-1)[0]
}
