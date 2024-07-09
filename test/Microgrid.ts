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

  async function deploySmartHomeFactory() {
    const smartHomeFactory = await ethers.getContractFactory("SmartHomeFactory");
    const factory = await smartHomeFactory.deploy();
    return factory;
  }

  async function deploy1SmartHome() {
    const [_, ...otherAccounts] = await ethers.getSigners();

    const factory = await deploySmartHomeFactory();

    const tx = await factory.connect(otherAccounts[0]).createHousehold(1000);
    tx.wait();
    const households = await factory.getDeployedHouseholds();

    // first way of getting event data
    const filter = factory.filters.SmartHomeCreated;
    let events = await factory.queryFilter(filter, -1);
    let event = events[0];
    await expect(event.args[0].valueOf()).to.equal(households[0])
    // second way of getting event data
    await expect(tx).to.emit(factory, "SmartHomeCreated").withArgs(households[0]);
    
    const sh1 = await ethers.getContractAt("SmartHome", event.args[0].valueOf())
    return { factory, SmartHome1: sh1, account1: otherAccounts[0] }
  }
  
  async function deploy2SmartHomes() {
    const [_, ...otherAccounts] = await ethers.getSigners();

    const factory = await deploySmartHomeFactory();

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

    return { factory, SmartHome1: sh1, SmartHome2: sh2, account1: otherAccounts[0], account2: otherAccounts[1] }
  }

  describe("Microgrid Deployment", function () {
    it("Should set the right owner for MicroGrid market", async function () {
      const { microgrid, owner } = await loadFixture(deployMarket);

      expect(await microgrid.owner()).to.equal(owner.address);
    });
  });

  describe("smartHome tests", function () {

    it("Should correctly create the smarthome contract on blockchain", async function () {
      const [_, ...otherAccounts] = await ethers.getSigners();
      const { SmartHome1, account1 } = await loadFixture(deploy1SmartHome);
      expect(await SmartHome1.owner()).to.equal(otherAccounts[0].address);
      expect(await SmartHome1.owner()).to.equal(account1.address);
    });

    it("Should correctly match the buy and sell orders", async function () {

      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, SmartHome2, account1, account2 } = await loadFixture(deploy2SmartHomes);
      
      expect(await SmartHome1.owner()).to.equal(account1.address);
      expect(await SmartHome2.owner()).to.equal(account2.address);

      await SmartHome1.setExchange(microgrid.getAddress());
      await SmartHome2.setExchange(microgrid.getAddress());

      await account2.sendTransaction({
        to: SmartHome2.getAddress(),
        value: ethers.parseEther("0.5"),
      });
      
      await SmartHome1.connect(account1).submitAsk(10, 1, Date.now());
      await SmartHome2.connect(account2).submitBid(11, 1, Date.now())

      expect(await ethers.provider.getBalance(SmartHome1.getAddress())).to.equal(11)
    });

    it("Should prevent sending trust score before interaction", async () => {
      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, SmartHome2, account1, account2 } = await loadFixture(deploy2SmartHomes);
      
      expect(await SmartHome1.owner()).to.equal(account1.address);
      expect(await SmartHome2.owner()).to.equal(account2.address);

      await SmartHome1.setExchange(microgrid.getAddress());
      await SmartHome2.setExchange(microgrid.getAddress());

      await expect(microgrid.connect(account1).rateInteraction(account2, 5)).to.be.reverted;
      await expect(microgrid.connect(account2).rateInteraction(account1, 5)).to.be.reverted;
    })

    it("Should should submit trust score after interaction", async () => {
      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, SmartHome2, account1, account2 } = await loadFixture(deploy2SmartHomes);
      
      expect(await SmartHome1.owner()).to.equal(account1.address);
      expect(await SmartHome2.owner()).to.equal(account2.address);

      await SmartHome1.setExchange(microgrid.getAddress());
      await SmartHome2.setExchange(microgrid.getAddress());

      await account2.sendTransaction({
        to: SmartHome2.getAddress(),
        value: ethers.parseEther("0.5"),
      });
      
      await SmartHome1.connect(account1).submitAsk(10, 1, Date.now());
      await SmartHome2.connect(account2).submitBid(11, 1, Date.now());

      expect(await ethers.provider.getBalance(SmartHome1.getAddress())).to.equal(11)

      await expect(microgrid.connect(account1).rateInteraction(account2, 5)).to.not.be.reverted;
      await expect(microgrid.connect(account2).rateInteraction(account1, 5)).to.not.be.reverted;
    })

    it("Should prevent double-spending on trust score", async () => {
      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, SmartHome2, account1, account2 } = await loadFixture(deploy2SmartHomes);
      
      expect(await SmartHome1.owner()).to.equal(account1.address);
      expect(await SmartHome2.owner()).to.equal(account2.address);

      await SmartHome1.setExchange(microgrid.getAddress());
      await SmartHome2.setExchange(microgrid.getAddress());

      await account2.sendTransaction({
        to: SmartHome2.getAddress(),
        value: ethers.parseEther("0.5"),
      });
      
      await SmartHome1.connect(account1).submitAsk(10, 1, Date.now());
      await SmartHome2.connect(account2).submitBid(11, 1, Date.now());

      expect(await ethers.provider.getBalance(SmartHome1.getAddress())).to.equal(11)

      await expect(microgrid.connect(account1).rateInteraction(account2, 5)).to.not.be.reverted;
      await expect(microgrid.connect(account2).rateInteraction(account1, 5)).to.not.be.reverted;
      
      await expect(microgrid.connect(account1).rateInteraction(account2, 5)).to.be.reverted;

    })
  });
});


