const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying PrivacyTrendPredictor contract...");

  // Get the ContractFactory and Signers here.
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy the contract
  const PrivacyTrendPredictor = await ethers.getContractFactory("PrivacyTrendPredictor");
  const contract = await PrivacyTrendPredictor.deploy();

  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("PrivacyTrendPredictor deployed to:", contractAddress);

  // Initialize the first prediction cycle
  console.log("Initializing first prediction cycle...");
  const initTx = await contract.initiatePredictionCycle();
  await initTx.wait();
  console.log("First prediction cycle initialized");

  console.log("\n=== Deployment Summary ===");
  console.log("Contract Address:", contractAddress);
  console.log("Deployer:", deployer.address);
  console.log("Network:", network.name);

  // Save deployment info
  const fs = require('fs');
  const deploymentInfo = {
    contractAddress: contractAddress,
    deployer: deployer.address,
    network: network.name,
    deploymentTime: new Date().toISOString(),
    transactionHash: contract.deploymentTransaction()?.hash
  };

  fs.writeFileSync(
    'deployment.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment info saved to deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });