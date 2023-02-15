const {
  getNamedAccounts,
  deployments,
  network,
  run,
  ethers,
} = require('hardhat');
// const { ethers } = require('ethers');
// const { network } = require('hardhat');
const {
  developmentChains,
  networkConfig,
} = require('../helper-hardhat-config.js');
const { verify } = require('../utils/verify');
const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther('2');

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  let vrfCoordinatorV2Address, subscriptionId;

  if (developmentChains.includes(network.name)) {
    const vrfCoordinatorV2Mock = await ethers.getContract(
      'VRFCoordinatorV2Mock'
    );
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
    // log(vrfCoordinatorV2Mock);

    const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
    const transactionReceipt = await transactionResponse.wait(1);
    subscriptionId = transactionReceipt.events[0].args.subId;

    await vrfCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      VRF_SUB_FUND_AMOUNT
    );
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId]['vrfCoordinatorV2'];
    subscriptionId = networkConfig[chainId]['subscriptionId']; // moved
  }

  const arguments = [
    vrfCoordinatorV2Address,
    networkConfig[chainId]['entranceFee'],
    networkConfig[chainId]['gasLane'],
    subscriptionId,
    networkConfig[chainId]['callbackGasLimit'],
    networkConfig[chainId]['interval'],
  ];

  const raffle = await deploy('Raffle', {
    from: deployer,
    args: arguments,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  //* Verify the deployment
  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log('Verifying...');
    await verify(raffle.address, arguments); //passing arguments
  }

  log('----------------------------------------------------');
};

module.exports.tags = ['all', 'raffle'];

/*



*/
