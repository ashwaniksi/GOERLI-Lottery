//* Deploying Raffle contract -6 - Deploy Mock

// create a new file '00-deploy-mocks.js' inside the 'deploy' folder.

// This is '00-deploy-mocks.js' file.

const { getNamedAccounts, deployments, network, ethers } = require('hardhat');
const { developmentChains } = require('../helper-hardhat-config.js');

const BASE_FEE = ethers.utils.parseEther('0.25'); // 0.25 is this the premium. It costs this much per request.
const GAS_PRICE_LINK = 1e9; // 1 * 10 rasie to power 9 //Link per gas

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  // If we are on a local development network, we need to deploy mocks!
  if (developmentChains.includes(network.name)) {
    log('Local network detected! Deploying mocks...');

    /*

    The constructor of the VRFCoordinatorV2Mock has two arguments, '_baseFee' and '_gasPriceLink':

    constructor(uint96 _baseFee, uint96 _gasPriceLink) {
    BASE_FEE = _baseFee;
    GAS_PRICE_LINK = _gasPriceLink;

    * Base Fee: The fee charged as base for every request of random number. This is set to 0.25 LINK on the Rinkeby.

    * Gas Price Link: calculated value based on the gas price of the chainlink blockchain.
  }

    */

    await deploy('VRFCoordinatorV2Mock', {
      from: deployer,
      log: true,
      args: [BASE_FEE, GAS_PRICE_LINK], //passing the arguments to constructor of mock
    });

    log('Mocks Deployed!');
    log('-----------------------------------------------------------------');
  }
};
module.exports.tags = ['all', 'mocks'];
