import assert from "node:assert"
import { describe, it } from "node:test"

import { isAddress } from "viem"

import { loadEilFixture } from "./fixture/eil.ts"
import { loadErc4337Fixture } from "./fixture/erc4337.ts"

describe("Fixture", () => {
  it("should load ERC-4337 fixture", async () => {
    const { entryPoint } = await loadErc4337Fixture()
    assert.equal(isAddress(entryPoint.address), true)
  })

  it("should load EIL fixture", async () => {
    const eilFixture = await loadEilFixture()
    // 验证所有合约地址（排除 deployer 等非合约对象）
    const contracts = [
      eilFixture.crossChainPaymaster,
      eilFixture.l1StakeManager,
      eilFixture.l1ArbConnector,
      eilFixture.l2ArbConnector,
      eilFixture.originSwapManager,
      eilFixture.arbInboxMock,
      eilFixture.arbOutboxMock,
      eilFixture.testToken,
      eilFixture.dummyAccount
    ]
    for (const contract of contracts) {
      assert.equal(isAddress(contract.address), true)
    }
  })
})
