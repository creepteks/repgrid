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
    let events = await factory.queryFilter(filter, 1);
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
    let events = await factory.queryFilter(filter, 2);
    const sh1 = await ethers.getContractAt("SmartHome", events[0].args[0].valueOf())
    const sh2 = await ethers.getContractAt("SmartHome", events[1].args[0].valueOf())

    return { factory, SmartHome1: sh1, SmartHome2: sh2, account1: otherAccounts[0], account2: otherAccounts[1] }
  }

  async function deploy3SmartHomes() {
    const [_, ...otherAccounts] = await ethers.getSigners();

    const factory = await deploySmartHomeFactory();

    const tx1 = await factory.connect(otherAccounts[0]).createHousehold(1000);
    tx1.wait();
    
    const tx2 = await factory.connect(otherAccounts[1]).createHousehold(1000);
    tx2.wait();

    const tx3 = await factory.connect(otherAccounts[2]).createHousehold(1000);
    tx3.wait();

    const filter = factory.filters.SmartHomeCreated;
    let events = await factory.queryFilter(filter, 3);

    const sh1 = await ethers.getContractAt("SmartHome", events[0].args[0].valueOf())
    const sh2 = await ethers.getContractAt("SmartHome", events[1].args[0].valueOf())
    const sh3 = await ethers.getContractAt("SmartHome", events[2].args[0].valueOf());

    return { factory, SmartHome1: sh1, SmartHome2: sh2, account1: otherAccounts[0], account2: otherAccounts[1], SmartHome3: sh3, account3: otherAccounts[2] }
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

    it("Should correctly set an ask order", async function () {

      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, account1} = await loadFixture(deploy1SmartHome);
      
      expect(await SmartHome1.owner()).to.equal(account1.address);

      await SmartHome1.setExchange(microgrid.getAddress());
      await SmartHome1.connect(account1).submitAsk(10, 1, Date.now());
      const expectedOriginAddress = await SmartHome1.getAddress();

      const [origin] = await SmartHome1.getAsk(0); // Assuming index 0 is used for testing

      expect(origin).to.equal(expectedOriginAddress);
    });

    it("Should correctly set a buy order", async function () {

      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, account1} = await loadFixture(deploy1SmartHome);
      
      expect(await SmartHome1.owner()).to.equal(account1.address);

      await SmartHome1.setExchange(microgrid.getAddress());
      await SmartHome1.connect(account1).submitBid(10, 1, Date.now());
      const expectedOriginAddress = await SmartHome1.getAddress();

      const [origin] = await SmartHome1.getBid(0); // Assuming index 0 is used for testing

      expect(origin).to.equal(expectedOriginAddress);
    });

    it("Should correctly match the buy and sell orders", async function () {

      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, SmartHome2, account1, account2 } = await loadFixture(deploy2SmartHomes);
      
      expect(await SmartHome1.owner()).to.equal(account1.address);
      expect(await SmartHome2.owner()).to.equal(account2.address);
      const [,,,, previousCharge1] = await SmartHome1.getSmartMeterDetails();
      const [,,,, previousCharge2] = await SmartHome2.getSmartMeterDetails();

      await SmartHome1.setExchange(microgrid.getAddress());
      await SmartHome2.setExchange(microgrid.getAddress());

      await SmartHome1.connect(account1).charge(1);

      await account2.sendTransaction({
        to: SmartHome2.getAddress(),
        value: ethers.parseEther("0.5"),
      });
      
      await SmartHome1.connect(account1).submitAsk(10, 1, Date.now());
      await SmartHome2.connect(account2).submitBid(11, 1, Date.now())
      const [,,,,charge1] = await SmartHome1.getSmartMeterDetails();
      const [,,,,charge2] = await SmartHome2.getSmartMeterDetails();

      expect(await ethers.provider.getBalance(SmartHome1.getAddress())).to.equal(11)
      expect(charge1 - previousCharge1).to.be.equal(-1)
      expect(charge2 - previousCharge2).to.be.equal(1)
    });

    it("should match sell order with the highest bid", async () => {
      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, SmartHome2, account1, account2, SmartHome3, account3 } = await loadFixture(deploy3SmartHomes);
      
      expect(await SmartHome1.owner()).to.equal(account1.address);
      expect(await SmartHome2.owner()).to.equal(account2.address);
      expect(await SmartHome3.owner()).to.equal(account3.address);

      const [,,,, previousCharge1] = await SmartHome1.getSmartMeterDetails();
      const [,,,, previousCharge2] = await SmartHome2.getSmartMeterDetails();
      const [,,,, previousCharge3] = await SmartHome3.getSmartMeterDetails();

      await SmartHome1.setExchange(microgrid.getAddress());
      await SmartHome2.setExchange(microgrid.getAddress());
      await SmartHome3.setExchange(microgrid.getAddress());

      await SmartHome1.connect(account1).charge(1);

      await account2.sendTransaction({
        to: SmartHome2.getAddress(),
        value: ethers.parseEther("0.5"),
      });

      await account3.sendTransaction({
        to: SmartHome3.getAddress(),
        value: ethers.parseEther("0.5"),
      });
      
      await SmartHome2.connect(account2).submitBid(11, 1, Date.now())
      await SmartHome3.connect(account3).submitBid(15, 1, Date.now())
      await SmartHome1.connect(account1).submitAsk(10, 1, Date.now());

      const [,,,,charge1] = await SmartHome1.getSmartMeterDetails();
      const [,,,,charge2] = await SmartHome2.getSmartMeterDetails();
      const [,,,,charge3] = await SmartHome3.getSmartMeterDetails();

      expect(await ethers.provider.getBalance(SmartHome1.getAddress())).to.equal(15)
      expect(charge1 - previousCharge1).to.be.equal(-1)
      expect(charge2 - previousCharge2).to.be.equal(0)
      expect(charge3 - previousCharge3).to.be.equal(1)
    })

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

    it("Should record unrated interaction between 2 parties", async () => {
      const { microgrid } = await loadFixture(deployMarket);
      const { SmartHome1, SmartHome2, account1, account2 } = await loadFixture(deploy2SmartHomes);
      const [, , , , account4] = await ethers.getSigners();
      
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

      const found = await microgrid.connect(account1).getUnratedInteractions(account1.getAddress(), account2.getAddress()); // Assuming index 0 is used for testing

      await expect(found).to.be.true;
      const notFound = await microgrid.connect(account1).getUnratedInteractions(account1.getAddress(), account4.getAddress());
      await expect(notFound).to.not.be.true;
    });

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
      
      // both parties have voted their trust score, now a second try should fail
      await expect(microgrid.connect(account1).rateInteraction(account2, 5)).to.be.reverted;

    })
  });
});


