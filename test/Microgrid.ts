import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("MicrogridExchange", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployMarket() {
    // Contracts are deployed using the first signer/account by default
    const [owner] = await ethers.getSigners();
    console.time("deploy market grid");
    const gridFactory = await ethers.getContractFactory("MicrogridMarket");
    const microgrid = await gridFactory.deploy(owner.address);
    console.timeEnd("deploy market grid");

    return { microgrid, owner };
  }

  async function deploySmartHomes() {
    const smartHomeFactory = await ethers.getContractFactory("SmartHomeFactory");
    const factory = await smartHomeFactory.deploy();

    return { factory }
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { microgrid, owner } = await loadFixture(deployMarket);

      expect(await microgrid.owner()).to.equal(owner.address);
    });
  });

  describe("smartHome tests", function () {

    it("Should correctly create the smarthome contract on blockchain", async function () {
      const [_, ...otherAccounts] = await ethers.getSigners();
      const { factory } = await loadFixture(deploySmartHomes);
      const tx = await factory.connect(otherAccounts[0]).createHousehold(1000)
      await tx.wait();

      const households = await factory.getDeployedHouseholds();
      // first way of getting event data
      const filter = factory.filters.SmartHomeCreated;
      const events = await factory.queryFilter(filter, -1);
      const event = events[0];
      await expect(event.args[0].valueOf()).to.equal(households[0])

      // second way of getting event data
      await expect(tx).to.emit(factory, "SmartHomeCreated").withArgs(households[0]);

      const sh = await ethers.getContractAt("SmartHome", event.args[0].valueOf())
      await expect(await sh.owner()).to.equal(otherAccounts[0].address)
    });

    it("Should correctly match the buy and sell orders", async function () {
      const [_, ...otherAccounts] = await ethers.getSigners();

      const { microgrid } = await loadFixture(deployMarket);
      const { factory } = await loadFixture(deploySmartHomes);

      const tx1 = await factory.connect(otherAccounts[0]).createHousehold(1000);
      tx1.wait();
      
      const tx2 = await factory.connect(otherAccounts[1]).createHousehold(1000);
      tx2.wait();

      const filter = factory.filters.SmartHomeCreated;
      let events = await factory.queryFilter(filter, -1);
      let event = events[0];
      const sh1 = await ethers.getContractAt("SmartHome", event.args[0].valueOf())
      events = await factory.queryFilter(filter, -1);
      event = events[1];
      const sh2 = await ethers.getContractAt("SmartHome", event.args[0].valueOf())
      
      await expect(await sh1.owner()).to.equal(otherAccounts[0].address)
      await expect(await sh2.owner()).to.equal(otherAccounts[1].address)



      await sh1.setExchange(microgrid.getAddress());
      await sh2.setExchange(microgrid.getAddress());

      await otherAccounts[1].sendTransaction({
        to: sh2.getAddress(),
        value: ethers.parseEther("0.5"),
      });
      
      await sh1.connect(otherAccounts[0]).submitAsk(10, 1, Date.now());
      await sh2.connect(otherAccounts[1]).submitBid(11, 1, Date.now())

      await expect(await ethers.provider.getBalance(sh1.getAddress())).to.equal(11)
    });
  });
});
