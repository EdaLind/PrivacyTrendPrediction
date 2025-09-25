# Hello FHEVM: Your First Confidential Application

**The Complete Beginner's Guide to Building with Fully Homomorphic Encryption**

Welcome to the world of confidential computing on blockchain! This tutorial will guide you through building your first FHEVM (Fully Homomorphic Encryption Virtual Machine) application - a Privacy Trend Predictor that allows users to submit encrypted predictions while keeping their data completely private.

## 🎯 What You'll Build

By the end of this tutorial, you'll have created:
- A smart contract that handles encrypted data without ever exposing it
- A web frontend that interacts with encrypted blockchain data
- A complete understanding of how FHE works in practice

**Live Example:** [https://privacy-trend-prediction.vercel.app/](https://privacy-trend-prediction.vercel.app/)

**Repository:** [https://github.com/EdaLind/PrivacyTrendPrediction](https://github.com/EdaLind/PrivacyTrendPrediction)

## 🏁 Prerequisites

Before we start, make sure you have:
- ✅ Basic Solidity knowledge (can write simple smart contracts)
- ✅ Familiarity with Hardhat or Foundry
- ✅ MetaMask wallet installed
- ✅ Node.js and npm/yarn installed
- ❌ **NO cryptography knowledge required!**
- ❌ **NO advanced mathematics needed!**

## 🔍 What is FHEVM?

### The Magic Explained Simply

Imagine you want to calculate the average of several secret numbers without anyone revealing their individual numbers. Traditionally, this would be impossible - you'd need to see all numbers to compute the average.

**Fully Homomorphic Encryption (FHE)** makes this magical scenario possible:

```
🔒 Secret Number 1 + 🔒 Secret Number 2 = 🔒 Sum
🔒 Sum ÷ 2 = 🔒 Average
```

The blockchain can perform calculations on encrypted data without ever decrypting it!

### Real-World Benefits

- **Privacy**: Your sensitive data never leaves its encrypted state
- **Security**: Even validators can't see your private information
- **Compliance**: Meet strict privacy regulations while staying decentralized
- **Trust**: Users don't need to trust anyone with their data

## 📚 Tutorial Overview

We'll build our application in 4 main phases:

1. **🏗️ Smart Contract Development** - Create the FHEVM contract
2. **🧪 Testing & Deployment** - Test our encrypted operations
3. **🎨 Frontend Development** - Build the user interface
4. **🚀 Integration & Launch** - Connect everything together

---

## Phase 1: Smart Contract Development

### Step 1: Setting Up Your Environment

First, let's create our project structure:

```bash
mkdir privacy-trend-predictor
cd privacy-trend-predictor
npm init -y
npm install --save-dev hardhat
npx hardhat init
```

Install FHEVM dependencies:

```bash
npm install @fhevm/solidity dotenv ethers
```

### Step 2: Understanding FHEVM Imports

Create `contracts/PrivacyTrendPredictor.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// These imports give us the FHE superpowers!
import { FHE, euint8, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
```

**What's happening here?**
- `FHE`: The main library for encrypted operations
- `euint8`, `euint32`: Encrypted integer types (8-bit and 32-bit)
- `ebool`: Encrypted boolean type
- `SepoliaConfig`: Configuration for the Sepolia testnet

### Step 3: Basic Contract Structure

```solidity
contract PrivacyTrendPredictor is SepoliaConfig {

    address public owner;
    uint32 public currentPredictionCycle;
    uint256 public cycleStartTime;

    // Time constants (24 hours = 86400 seconds)
    uint256 constant CYCLE_DURATION = 86400;
    uint256 constant SUBMISSION_WINDOW = 21600; // 6 hours

    constructor() {
        owner = msg.sender;
        currentPredictionCycle = 1;
        cycleStartTime = block.timestamp;
    }
}
```

### Step 4: Defining Encrypted Data Structures

Here's where FHE gets interesting! We can store encrypted data in structs:

```solidity
struct TrendData {
    euint32 encryptedValue;    // 🔒 The prediction value (encrypted!)
    euint8 confidenceLevel;    // 🔒 Confidence percentage (encrypted!)
    bool isSubmitted;          // ✅ Public boolean (submission status)
    uint256 timestamp;         // ⏰ Public timestamp
    bytes32 dataHash;          // 🔐 Public hash for verification
}

struct PredictionCycle {
    euint32 aggregatedTrend;   // 🔒 Sum of all predictions (encrypted!)
    euint8 averageConfidence;  // 🔒 Average confidence (encrypted!)
    bool analysisCompleted;    // ✅ Public status
    bool cycleEnded;           // ✅ Public status
    uint256 startTime;         // ⏰ Public timestamp
    uint256 endTime;           // ⏰ Public timestamp
    address[] analysts;        // 👥 List of participants
    uint32 participantCount;   // 📊 Public count
    bytes32 resultHash;        // 🔐 Public result identifier
}
```

**Key Insight:** Notice how we mix encrypted (`euint32`, `euint8`) and regular (`bool`, `uint256`) data types. This is the beauty of FHEVM - you can keep sensitive data encrypted while maintaining public metadata!

### Step 5: Writing Your First FHE Functions

#### Submitting Encrypted Predictions

```solidity
function submitTrendPrediction(
    uint32 _trendValue,        // Plain input from user
    uint8 _confidenceLevel,    // Plain input from user
    bytes32 _dataHash          // Public hash for uniqueness
) external {
    require(_confidenceLevel <= 100, "Confidence level must be 0-100");
    require(!analystPredictions[currentPredictionCycle][msg.sender].isSubmitted,
            "Already submitted for this cycle");

    // 🎩 Magic happens here: Convert plain values to encrypted!
    euint32 encryptedTrend = FHE.asEuint32(_trendValue);
    euint8 encryptedConfidence = FHE.asEuint8(_confidenceLevel);

    // Store the encrypted data
    analystPredictions[currentPredictionCycle][msg.sender] = TrendData({
        encryptedValue: encryptedTrend,
        confidenceLevel: encryptedConfidence,
        isSubmitted: true,
        timestamp: block.timestamp,
        dataHash: _dataHash
    });

    // 🔑 Grant access permissions (important!)
    FHE.allowThis(encryptedTrend);
    FHE.allowThis(encryptedConfidence);
    FHE.allow(encryptedTrend, msg.sender);
    FHE.allow(encryptedConfidence, msg.sender);

    emit TrendSubmitted(msg.sender, currentPredictionCycle, _dataHash);
}
```

**What's the magic?**
1. `FHE.asEuint32()` converts plain numbers to encrypted ones
2. `FHE.allowThis()` lets the contract access the encrypted data
3. `FHE.allow()` grants specific addresses permission to decrypt

#### Performing Encrypted Calculations

```solidity
function performConfidentialAnalysis() external onlyOwner {
    PredictionCycle storage cycle = predictionCycles[currentPredictionCycle];

    // Initialize encrypted accumulators
    euint32 totalTrend = FHE.asEuint32(0);
    euint32 totalConfidence = FHE.asEuint32(0);

    // 🧮 Perform calculations on encrypted data!
    for (uint i = 0; i < cycle.analysts.length; i++) {
        address analyst = cycle.analysts[i];
        TrendData storage prediction = analystPredictions[currentPredictionCycle][analyst];

        // Add encrypted values together (🤯 This works!)
        totalTrend = FHE.add(totalTrend, prediction.encryptedValue);
        totalConfidence = FHE.add(totalConfidence,
            FHE.asEuint32(prediction.confidenceLevel));
    }

    // Store encrypted results
    cycle.aggregatedTrend = totalTrend;

    // For average calculation, we use async decryption
    bytes32[] memory cts = new bytes32[](1);
    cts[0] = FHE.toBytes32(totalConfidence);
    FHE.requestDecryption(cts, this.processConfidenceAverage.selector);

    cycle.analysisCompleted = true;
    emit AnalysisCompleted(currentPredictionCycle, cycle.resultHash, cycle.participantCount);

    currentPredictionCycle++;
}
```

**Mind-blowing fact:** The line `FHE.add(totalTrend, prediction.encryptedValue)` adds two encrypted numbers together without decrypting them!

### Step 6: Handling Async Decryption

Sometimes you need the actual decrypted result. FHEVM provides async decryption:

```solidity
function processConfidenceAverage(
    uint256 requestId,
    uint32 totalConfidenceDecrypted,  // 🔓 Now it's decrypted!
    bytes[] memory signatures
) external {
    uint32 targetCycle = currentPredictionCycle - 1;
    PredictionCycle storage cycle = predictionCycles[targetCycle];

    // Calculate average and re-encrypt
    uint8 avgConfidence = uint8(totalConfidenceDecrypted / cycle.participantCount);
    cycle.averageConfidence = FHE.asEuint8(avgConfidence);

    FHE.allowThis(cycle.averageConfidence);
}
```

## Phase 2: Testing & Deployment

### Step 1: Writing Tests

Create `test/PrivacyTrendPredictor.test.js`:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PrivacyTrendPredictor", function () {
  let contract, owner, analyst1, analyst2;

  beforeEach(async function () {
    [owner, analyst1, analyst2] = await ethers.getSigners();

    const PrivacyTrendPredictor = await ethers.getContractFactory("PrivacyTrendPredictor");
    contract = await PrivacyTrendPredictor.deploy();
    await contract.waitForDeployment();
  });

  it("Should verify analysts", async function () {
    await contract.verifyAnalyst(analyst1.address);

    const profile = await contract.getAnalystProfile(analyst1.address);
    expect(profile.isVerified).to.be.true;
  });

  it("Should allow verified analysts to submit predictions", async function () {
    await contract.verifyAnalyst(analyst1.address);
    await contract.initiatePredictionCycle();

    const trendValue = 1000;
    const confidenceLevel = 85;
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test_data"));

    await expect(
      contract.connect(analyst1).submitTrendPrediction(
        trendValue, confidenceLevel, dataHash
      )
    ).to.emit(contract, "TrendSubmitted");
  });
});
```

### Step 2: Deployment Script

Create `scripts/deploy.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying PrivacyTrendPredictor contract...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const PrivacyTrendPredictor = await ethers.getContractFactory("PrivacyTrendPredictor");
  const contract = await PrivacyTrendPredictor.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("Contract deployed to:", contractAddress);

  // Initialize the first prediction cycle
  const initTx = await contract.initiatePredictionCycle();
  await initTx.wait();
  console.log("First prediction cycle initialized");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

### Step 3: Configuration

Update `hardhat.config.js`:

```javascript
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    zama: {
      url: "https://devnet.zama.ai/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8009,
    }
  }
};
```

## Phase 3: Frontend Development

### Step 1: HTML Structure

Create `public/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Trend Predictor</title>
    <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
    <header class="header">
        <div class="container">
            <h1>🔒 Privacy Trend Predictor</h1>
            <button id="connectWallet" class="btn btn-primary">Connect Wallet</button>
        </div>
    </header>

    <main class="main">
        <div class="container">
            <!-- Prediction Form -->
            <div class="card">
                <h2>Submit Encrypted Prediction</h2>
                <form id="predictionForm">
                    <div class="form-group">
                        <label>Trend Value:</label>
                        <input type="number" id="trendValue" required>
                        <small>Your prediction will be encrypted automatically</small>
                    </div>

                    <div class="form-group">
                        <label>Confidence Level (%):</label>
                        <input type="range" id="confidenceLevel" min="0" max="100" value="50">
                        <span id="confidenceDisplay">50%</span>
                    </div>

                    <button type="submit" class="btn btn-primary">
                        🔐 Submit Encrypted Prediction
                    </button>
                </form>
            </div>

            <!-- Results Display -->
            <div class="card">
                <h2>Confidential Results</h2>
                <div id="resultsArea">
                    <p>Connect your wallet to view encrypted results</p>
                </div>
            </div>
        </div>
    </main>

    <script src="https://cdn.jsdelivr.net/npm/ethers@6.7.1/dist/ethers.umd.min.js"></script>
    <script src="assets/app.js"></script>
</body>
</html>
```

### Step 2: JavaScript Integration

Create `public/assets/app.js`:

```javascript
class PrivacyTrendPredictor {
    constructor() {
        this.contractAddress = 'YOUR_DEPLOYED_CONTRACT_ADDRESS';
        this.contractABI = [
            // Your contract ABI here
            "function submitTrendPrediction(uint32 _trendValue, uint8 _confidenceLevel, bytes32 _dataHash)",
            "function getCurrentCycleInfo() view returns (uint32, uint256, uint32, bool, bool, bool)"
        ];

        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;

        this.initializeApp();
    }

    async initializeApp() {
        this.setupEventListeners();

        // Check for existing wallet connection
        if (typeof window.ethereum !== 'undefined' && window.ethereum.selectedAddress) {
            await this.connectWallet();
        }
    }

    setupEventListeners() {
        document.getElementById('connectWallet').addEventListener('click', () => this.connectWallet());
        document.getElementById('predictionForm').addEventListener('submit', (e) => this.submitPrediction(e));

        // Update confidence display
        const confidenceSlider = document.getElementById('confidenceLevel');
        confidenceSlider.addEventListener('input', (e) => {
            document.getElementById('confidenceDisplay').textContent = `${e.target.value}%`;
        });
    }

    async connectWallet() {
        try {
            if (typeof window.ethereum === 'undefined') {
                alert('Please install MetaMask!');
                return;
            }

            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.userAddress = accounts[0];

            // Initialize contract
            this.contract = new ethers.Contract(
                this.contractAddress,
                this.contractABI,
                this.signer
            );

            // Update UI
            document.getElementById('connectWallet').textContent =
                `Connected: ${this.userAddress.slice(0, 6)}...${this.userAddress.slice(-4)}`;

            await this.updateCycleInfo();

        } catch (error) {
            console.error('Wallet connection failed:', error);
            alert('Failed to connect wallet');
        }
    }

    async submitPrediction(event) {
        event.preventDefault();

        if (!this.contract) {
            alert('Please connect your wallet first');
            return;
        }

        const trendValue = document.getElementById('trendValue').value;
        const confidenceLevel = document.getElementById('confidenceLevel').value;

        // Generate a unique hash for this prediction
        const dataHash = ethers.keccak256(
            ethers.toUtf8Bytes(`${this.userAddress}-${Date.now()}`)
        );

        try {
            console.log('📤 Submitting encrypted prediction...');

            // This is where the magic happens!
            // The values get encrypted by the smart contract
            const tx = await this.contract.submitTrendPrediction(
                trendValue,
                confidenceLevel,
                dataHash
            );

            console.log('⏳ Transaction sent:', tx.hash);
            alert('Prediction submitted! Your data is now encrypted on-chain.');

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log('✅ Transaction confirmed:', receipt.transactionHash);

            // Reset form
            document.getElementById('predictionForm').reset();
            document.getElementById('confidenceDisplay').textContent = '50%';

            await this.updateCycleInfo();

        } catch (error) {
            console.error('Submission failed:', error);
            alert(`Failed to submit prediction: ${error.message}`);
        }
    }

    async updateCycleInfo() {
        if (!this.contract) return;

        try {
            const cycleInfo = await this.contract.getCurrentCycleInfo();
            const [cycle, startTime, participantCount, analysisCompleted, submissionActive, analysisActive] = cycleInfo;

            const resultsArea = document.getElementById('resultsArea');
            resultsArea.innerHTML = `
                <div class="cycle-stats">
                    <h3>Current Cycle: ${cycle}</h3>
                    <p>👥 Participants: ${participantCount}</p>
                    <p>📊 Status: ${submissionActive ? '🟢 Accepting Predictions' :
                                    analysisActive ? '🟡 Analysis Phase' :
                                    '🔴 Cycle Complete'}</p>
                    <p>🔐 <strong>All prediction data is encrypted on-chain!</strong></p>
                </div>
            `;

        } catch (error) {
            console.error('Failed to update cycle info:', error);
        }
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PrivacyTrendPredictor();
});
```

### Step 3: Basic Styling

Create `public/assets/styles.css`:

```css
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.6;
    color: #2d3748;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
}

.header {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    padding: 1rem 0;
    box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
}

.header .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.main {
    padding: 2rem 0;
}

.card {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(10px);
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.btn-primary {
    background: linear-gradient(135deg, #4c51bf, #667eea);
    color: white;
    box-shadow: 0 4px 12px rgba(76, 81, 191, 0.3);
}

.btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(76, 81, 191, 0.4);
}

.form-group {
    margin-bottom: 1.5rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
}

.form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #cbd5e0;
    border-radius: 8px;
    font-size: 0.875rem;
}

.form-group small {
    color: #718096;
    font-size: 0.8rem;
}

.cycle-stats {
    text-align: center;
    padding: 1rem;
    background: rgba(247, 250, 252, 0.5);
    border-radius: 8px;
}

.cycle-stats h3 {
    color: #4c51bf;
    margin-bottom: 1rem;
}

.cycle-stats p {
    margin-bottom: 0.5rem;
}
```

## Phase 4: Integration & Testing

### Step 1: Deploy Your Contract

```bash
# Compile your contract
npx hardhat compile

# Deploy to Zama devnet
npx hardhat run scripts/deploy.js --network zama
```

### Step 2: Update Frontend with Contract Address

Replace `YOUR_DEPLOYED_CONTRACT_ADDRESS` in `app.js` with your actual contract address.

### Step 3: Test the Full Flow

1. **Connect MetaMask** to Zama devnet
2. **Add Zama network** to MetaMask:
   - Network Name: Zama Devnet
   - RPC URL: https://devnet.zama.ai/
   - Chain ID: 8009
   - Currency: ETH

3. **Get test ETH** from Zama faucet
4. **Submit a prediction** and watch the magic happen!

---

## 🎯 Understanding What You Built

### The Encryption Flow

```
User Input (Plain) → Frontend → Smart Contract → FHE.asEuint32() → Encrypted Storage
     1000      →    1000    →      1000       →  🔒encrypted🔒  →    Blockchain
```

### The Computation Flow

```
🔒encrypted_a + 🔒encrypted_b = 🔒encrypted_sum
```

This happens **without decryption**! The blockchain never sees your actual values.

### The Access Control Flow

```
FHE.allowThis(encryptedData) → Contract can use the data
FHE.allow(encryptedData, userAddress) → User can decrypt their own data
```

## 🚀 Next Steps & Advanced Features

### Immediate Improvements

1. **Add input validation** on the frontend
2. **Implement error handling** for failed transactions
3. **Add loading states** for better UX
4. **Style the interface** with your preferred CSS framework

### Advanced FHE Features to Explore

1. **Encrypted Comparisons**: `FHE.gt()`, `FHE.lt()`, `FHE.eq()`
2. **Conditional Logic**: `FHE.select()` for encrypted if/else
3. **Batch Operations**: Process multiple encrypted values
4. **Access Control Lists**: Fine-grained permission management

### Production Considerations

1. **Gas Optimization**: FHE operations are more expensive
2. **Key Management**: Proper encryption key handling
3. **Privacy Audits**: Ensure no data leakage paths
4. **User Education**: Help users understand encryption benefits

## 🛠️ Troubleshooting

### Common Issues

**Q: "FHE library not found" error**
A: Make sure you installed `@fhevm/solidity` and imported correctly

**Q: Transaction fails with "access denied" error**
A: Check that you called `FHE.allowThis()` and `FHE.allow()` properly

**Q: MetaMask shows very high gas estimates**
A: FHE operations are computationally expensive - this is normal

**Q: Can't see encrypted values in explorer**
A: That's the point! Encrypted data appears as random bytes

### Debugging Tips

1. **Use console.log** extensively in your frontend
2. **Check contract events** for successful operations
3. **Verify permissions** with `FHE.allow()` calls
4. **Test with small values** first

## 📚 Additional Resources

### Essential Reading
- [Zama Documentation](https://docs.zama.ai/)
- [FHEVM Developer Guide](https://docs.zama.ai/fhevm)
- [FHE Cryptography Basics](https://docs.zama.ai/fhe-by-example)

### Code Examples
- [Official FHEVM Examples](https://github.com/zama-ai/fhevm)
- [Complete Tutorial Repository](https://github.com/EdaLind/PrivacyTrendPrediction)

### Community
- [Zama Discord](https://discord.gg/zama)
- [Developer Forum](https://community.zama.ai/)

## 🎉 Congratulations!

You've successfully built your first confidential application using FHEVM! You now understand:

- ✅ How to encrypt data at the smart contract level
- ✅ How to perform computations on encrypted data
- ✅ How to manage access permissions for encrypted information
- ✅ How to build a complete frontend for encrypted interactions

**You're now ready to build privacy-preserving applications that were impossible before FHE!**

---

*This tutorial was created to help developers enter the exciting world of confidential computing. Continue experimenting, and remember: with great privacy comes great responsibility!*