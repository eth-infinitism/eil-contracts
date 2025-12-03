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
    const eilContract = await loadEilFixture()
    for (const contract of Object.values(eilContract)) {
      assert.equal(isAddress(contract.address), true)
    }
  })
})
