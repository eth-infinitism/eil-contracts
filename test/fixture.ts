import assert from "node:assert"
import { describe, it } from "node:test"

import hre from "hardhat"

import { erc4337Fixture } from "./fixture/erc4337.ts"

describe("Fixture", () => {
  it("should load ERC-4337 fixture", async () => {
    const { networkHelpers } = await hre.network.connect()
    const { entryPoint } = await networkHelpers.loadFixture(erc4337Fixture)
    assert.notEqual(entryPoint, "0x")
  })
})
