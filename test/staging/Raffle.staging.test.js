//* Staging Test

// create a new folder 'staging' in the 'test' folder of our project, create a new file 'Raffle.staging.test.js' in it.

// This is 'Raffle.staging.test.js' file
const { assert, expect } = require('chai');
const { getNamedAccounts, deployments, ethers, network } = require('hardhat');
const {
  developmentChains,
  networkConfig,
} = require('../../helper-hardhat-config');

// If the name of the chain we're on is in the 'developmentChains', then skip the 'describe', otherwise continue.
developmentChains.includes(network.name)
  ? describe.skip
  : describe('Raffle Staging Tests', function () {
      let raffle, raffleEntranceFee, deployer;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        raffle = await ethers.getContract('Raffle', deployer);
        raffleEntranceFee = await raffle.getEntranceFee();
      });

      describe('fulfillRandomWords', function () {
        it('works with chainlink keepers, chainlink VRF, we get a random winner ', async function () {
          // enter the raffle, that's all we need to do.
          // chainlink keepers and chainlink VRF will kick this lottery off.
          console.log('Setting up test...');
          const startingTimeStamp = await raffle.getLastTimeStamp();
          const accounts = await ethers.getSigners();

          console.log('Setting up Listener...'); //getting accounts
          //* We need to setup a 'listener' before we enter the raffle just in case the blockchain moves very fast.
          await new Promise(async (resolve, reject) => {
            raffle.once('WinnerPicked', async () => {
              console.log('WinnerPicked event fired');
              try {
                const recentWinner = await raffle.getRecentWinner();
                const raffleState = await raffle.getRaffleState();
                const winnerEndingBalance = await accounts[0].getBalance(); // accounts[0] is deployer
                const endingTimeStamp = await raffle.getLastTimeStamp();

                //* ASSERTS
                await expect(raffle.getPlayer(0)).to.be.reverted; // players array is reset, so we'll have no player at index = 0.

                assert.equal(recentWinner.toString(), accounts[0].address); // recent winner should be deployer.
                assert.equal(raffleState, 0); // raffle is in 'open' state
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(raffleEntranceFee).toString()
                ); // money transferred correctly
                assert(endingTimeStamp > startingTimeStamp); // time interval has passed
                resolve();
              } catch (error) {
                console.log(error);
                reject(error);
              }
            });

            console.log('Entering Raffle...');
            const tx = await raffle.enterRaffle({ value: raffleEntranceFee }); //entering and saving to a const 'tx'
            await tx.wait(1); //adding
            console.log('Ok, time to wait...');
            const winnerStartingBalance = await accounts[0].getBalance();

            // and this code won't complete until our listener is finished listening.
          });
        });
      });
    });

/*

* Steps to take for staging test on Rinkeby testnet:

   * Get Subscription ID for chainlink VRF.
   * Deploy our contract using the Subscription ID.
   * Register the contract with Chainlink VRF and its Subscription ID.
   * Register the contract with Chainlink Keepers.
   * Run staging tests.
   * 

Subscription ID 15994. Add this to 'helper-hardhat-config' file under Rinkeby network. Make sure to add 'etherscan' API before deploying the contract in order to auto verify.

Fund with Test Link tokens, and add consumer address.

*To deploy on Rinkeby:
yarn hardhat deploy --network rinkeby

*OUTPUT:

deploying "Raffle" (tx: 0x78b588d24042ca19d20ac4283ec64ade9c6c273e4073e6f93b30b3c2b199ace4)...: deployed at 0x6FF5e4880166e6F215738C31358aF301f8551f46 with 1222990 gas
Verifying...
Verifying contract...
Successfully submitted source code for contract
contracts/Raffle.sol:Raffle at 0x6FF5e4880166e6F215738C31358aF301f8551f46 
for verification on the block explorer. Waiting for verification result...

Successfully verified contract Raffle on Etherscan.
https://rinkeby.etherscan.io/address/0x6FF5e4880166e6F215738C31358aF301f8551f46#code
----------------------------------------------------
Done in 45.65s.


------------------------------------------------------------------------------------

* Now add the deployed contract address as the consumer address in VRF.
https://vrf.chain.link/rinkeby/15994

* Then register for new upkeep:
https://keepers.chain.link/rinkeby

Select 'custom logic' and fill the form.

* NOW WE'RE GOING TO RUN OUR TEST:
yarn hardhat test --network rinkeby

  Raffle Staging Tests
    fulfillRandomWords
Setting up test...
Setting up Listener...
Entering Raffle...
Ok, time to wait...
WinnerPicked event fired
      ✔ works with chainlink keepers, chainlink VRF, we get a random winner  (128256ms)


  1 passing (2m)

Done in 133.83s.
*/
