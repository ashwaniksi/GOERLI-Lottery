const { assert, expect } = require('chai');
const { getNamedAccounts, deployments, ethers, network } = require('hardhat');
const {
  developmentChains,
  networkConfig,
} = require('../../helper-hardhat-config');

!developmentChains.includes(network.name)
  ? describe.skip
  : describe('Raffle unit tests', async function () {
      let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;

      const chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(['all']);
        raffle = await ethers.getContract('Raffle', deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          'VRFCoordinatorV2Mock',
          deployer
        );
        raffleEntranceFee = await raffle.getEntranceFee();

        interval = await raffle.getInterval();
      });

      describe('constructor', function () {
        it('Initializes the Raffle correctly', async function () {
          const raffleState = await raffle.getRaffleState();
          // const interval = await raffle.getInterval();
          assert.equal(raffleState.toString(), '0');
          assert.equal(interval.toString(), networkConfig[chainId]['interval']);
        });
      });

      describe('enter raffle', function () {
        it('reverts if you do not pay enough', async function () {
          await expect(raffle.enterRaffle()).to.be.revertedWith(
            'Raffle__NotEnoughEthEntered'
          );
        });

        it('records players when they enter raffle', async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          const playerFromContract = await raffle.getPlayer('0');
          assert.equal(playerFromContract, deployer);
        });

        it('emits an event on enter', async function () {
          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.emit(raffle, 'RaffleEnter');
        });

        it('does not allow entering when raffle is calculating', async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ]);

          await network.provider.request({ method: 'evm_mine', params: [] });
          await raffle.performUpkeep([]);
          await expect(
            raffle.enterRaffle({ value: raffleEntranceFee })
          ).to.be.revertedWith('Raffle__RaffleNotOpen');
        });
      });

      describe('checkUpkeep', function () {
        it('returns false if people have not sent any ETH', async function () {
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });

        it("returns false if raffle isn't open", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: 'evm_mine', params: [] });

          await raffle.performUpkeep([]); // changes the state to from 'open' to 'calculating'
          const raffleState = await raffle.getRaffleState();
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x');

          assert.equal(raffleState.toString(), '1');
          assert.equal(upkeepNeeded, false);
        });

        it("returns false if enough time hasn't passed", async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() - 1,
          ]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x');
          // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(!upkeepNeeded);
        });

        it('returns true if enough time has passed, has players, eth, and is open', async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: 'evm_mine', params: [] });
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep('0x'); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
          assert(upkeepNeeded);
        });
      });

      describe('performUpkeep', function () {
        it('it can only run if checkUpkeep is true', async () => {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: 'evm_mine', params: [] });

          const tx = await raffle.performUpkeep([]); // if tx fails, then 'checkUpkeep' isn't true. Our test fails.
          assert(tx);
        });

        it('reverts if checkup is false', async () => {
          await expect(raffle.performUpkeep('0x')).to.be.revertedWith(
            'Raffle__UpkeepNotNeeded'
          );
        });

        it('updates the raffle state, emits an event, and calls the vrf coordinator', async () => {
          //making the 'checkUpkeep' return 'true'.
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: 'evm_mine', params: [] });

          const txResponse = await raffle.performUpkeep([]); //changing the state
          const txReceipt = await txResponse.wait(1);

          const requestId = txReceipt.events[1].args.requestId;
          const raffleState = await raffle.getRaffleState();

          assert(requestId.toNumber() > 0); // valid requestId
          assert(raffleState.toString() == '1'); // calculating state.
        });
      });

      describe('fulfillRandomWords', function () {
        beforeEach(async function () {
          await raffle.enterRaffle({ value: raffleEntranceFee });
          await network.provider.send('evm_increaseTime', [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: 'evm_mine', params: [] });
        });

        it('can only be called after performUpkeep', async () => {
          expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
          ).to.be.revertedWith('nonexistent request');
          expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
          ).to.be.revertedWith('nonexistent request');
        });

        it('picks a winner, resets, and sends money', async () => {
          const additionalEntrants = 3;
          const startingAccountIndex = 1;
          const accounts = await ethers.getSigners();

          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrants;
            i++
          ) {
            const accountConnectedRaffle = raffle.connect(accounts[i]);
            await accountConnectedRaffle.enterRaffle({
              value: raffleEntranceFee,
            });
          }

          const startingTimeStamp = await raffle.getLastTimeStamp();

          await new Promise(async (resolve, reject) => {
            raffle.once('WinnerPicked', async () => {
              console.log('Found the event');
              try {
                const recentWinner = await raffle.getRecentWinner();
                console.log(recentWinner);

                console.log(accounts[0].address);
                console.log(accounts[1].address); //winner
                console.log(accounts[2].address);
                console.log(accounts[3].address);

                const raffleState = await raffle.getRaffleState();
                const endingTimestamp = await raffle.getLastTimeStamp();
                const numPlayers = await raffle.getNumberOfPlayers();
                const winnerEndingBalance = await accounts[1].getBalance(); // Ending balance of winner.

                //* ASSERTS

                assert.equal(numPlayers.toString(), '0');
                assert.equal(raffleState.toString(), '0');
                assert(endingTimestamp > startingTimeStamp);

                // winnerEndingBalance = winnerEndingBalance + (raffleEntranceFee * additionalEntrants ) + raffleEntranceFee
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(
                    raffleEntranceFee
                      .mul(additionalEntrants)
                      .add(raffleEntranceFee) //we paid this
                      .toString()
                  )
                );

                resolve();
              } catch (e) {
                reject(e);
              }
            });

            const tx = await raffle.performUpkeep([]);
            const txReceipt = await tx.wait(1);

            const winnerStartingBalance = await accounts[1].getBalance(); // getting the winner's account starting balance

            await vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args.requestId,
              raffle.address
            );
          });
        });
      });
    });

/* 

yarn hardhat test --grep "picks a winner, resets, and sends money"

  Raffle unit tests
    fulfillRandomWords
Found the event
0x70997970C51812dc3A010C7d01b50e0d17dc79C8
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
0x70997970C51812dc3A010C7d01b50e0d17dc79C8
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
0x90F79bf6EB2c4f870365E785982E1f101E93b906
      ✔ picks a winner, resets, and sends money (4242ms)


  1 passing (7s)

Done in 10.56s.

*/
