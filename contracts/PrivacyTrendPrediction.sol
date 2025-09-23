// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivacyTrendPrediction is SepoliaConfig {

    address public owner;
    uint32 public currentPredictionId;
    uint256 public constant PREDICTION_WINDOW = 7 days;
    uint256 public constant MIN_STAKE = 0.01 ether;

    struct TrendData {
        euint64 encryptedValue;
        uint256 timestamp;
        bool isConfirmed;
        address dataProvider;
    }

    struct Prediction {
        euint32 encryptedTrendValue;
        euint64 encryptedConfidence;
        address predictor;
        uint256 stake;
        uint256 timestamp;
        uint256 deadline;
        bool isActive;
        bool isResolved;
        bool isCorrect;
        uint256 reward;
    }

    struct Market {
        string trendCategory;
        uint256 totalStaked;
        uint256 totalPredictions;
        bool isActive;
        uint256 currentDataValue;
        address[] predictors;
        uint256 creationTime;
    }

    mapping(uint32 => Prediction) public predictions;
    mapping(string => Market) public markets;
    mapping(string => TrendData[]) public trendHistory;
    mapping(address => uint256) public userRewards;
    mapping(address => uint256) public userAccuracy;
    mapping(string => mapping(address => bool)) public hasActivePrediction;

    string[] public activeMarkets;

    event MarketCreated(string indexed category, uint256 timestamp);
    event PredictionSubmitted(uint32 indexed predictionId, address indexed predictor, string category);
    event DataPointAdded(string indexed category, uint256 timestamp, address provider);
    event PredictionResolved(uint32 indexed predictionId, bool isCorrect, uint256 reward);
    event RewardClaimed(address indexed user, uint256 amount);
    event MarketClosed(string indexed category, uint256 finalValue);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier marketExists(string memory category) {
        require(markets[category].isActive, "Market does not exist or inactive");
        _;
    }

    modifier validStake() {
        require(msg.value >= MIN_STAKE, "Insufficient stake amount");
        _;
    }

    constructor() {
        owner = msg.sender;
        currentPredictionId = 1;
    }

    // Create a new prediction market for a specific trend category
    function createMarket(string memory category) external onlyOwner {
        require(!markets[category].isActive, "Market already exists");

        markets[category] = Market({
            trendCategory: category,
            totalStaked: 0,
            totalPredictions: 0,
            isActive: true,
            currentDataValue: 0,
            predictors: new address[](0),
            creationTime: block.timestamp
        });

        activeMarkets.push(category);

        emit MarketCreated(category, block.timestamp);
    }

    // Submit encrypted prediction for a trend
    function submitPrediction(
        string memory category,
        uint32 trendValue,
        uint64 confidence
    ) external payable marketExists(category) validStake {
        require(!hasActivePrediction[category][msg.sender], "Already has active prediction in this market");
        require(confidence <= 100, "Confidence must be 0-100");

        // Encrypt the prediction data
        euint32 encryptedTrendValue = FHE.asEuint32(trendValue);
        euint64 encryptedConfidence = FHE.asEuint64(confidence);

        uint32 predictionId = currentPredictionId;
        currentPredictionId++;

        predictions[predictionId] = Prediction({
            encryptedTrendValue: encryptedTrendValue,
            encryptedConfidence: encryptedConfidence,
            predictor: msg.sender,
            stake: msg.value,
            timestamp: block.timestamp,
            deadline: block.timestamp + PREDICTION_WINDOW,
            isActive: true,
            isResolved: false,
            isCorrect: false,
            reward: 0
        });

        markets[category].totalStaked += msg.value;
        markets[category].totalPredictions++;
        markets[category].predictors.push(msg.sender);
        hasActivePrediction[category][msg.sender] = true;

        // Grant access permissions for FHE operations
        FHE.allowThis(encryptedTrendValue);
        FHE.allowThis(encryptedConfidence);
        FHE.allow(encryptedTrendValue, msg.sender);
        FHE.allow(encryptedConfidence, msg.sender);

        emit PredictionSubmitted(predictionId, msg.sender, category);
    }

    // Add confidential data point for trend analysis
    function addDataPoint(
        string memory category,
        uint64 value
    ) external marketExists(category) {
        require(msg.sender == owner || isAuthorizedDataProvider(msg.sender), "Not authorized data provider");

        euint64 encryptedValue = FHE.asEuint64(value);

        trendHistory[category].push(TrendData({
            encryptedValue: encryptedValue,
            timestamp: block.timestamp,
            isConfirmed: false,
            dataProvider: msg.sender
        }));

        FHE.allowThis(encryptedValue);

        emit DataPointAdded(category, block.timestamp, msg.sender);
    }

    // Resolve predictions for a market using confidential computation
    function resolvePredictions(string memory category) external onlyOwner marketExists(category) {
        require(trendHistory[category].length > 0, "No data available for resolution");

        Market storage market = markets[category];
        TrendData storage latestData = trendHistory[category][trendHistory[category].length - 1];

        // Request decryption of the latest data point
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(latestData.encryptedValue);
        FHE.requestDecryption(cts, this.processMarketResolution.selector);
    }

    // Callback function to process market resolution after decryption
    function processMarketResolution(
        uint256 requestId,
        bytes memory decryptedData,
        bytes memory signatures
    ) external {
        // Verify signatures
        FHE.checkSignatures(requestId, decryptedData, signatures);

        // Decode the actual value from bytes
        uint64 actualValue = abi.decode(decryptedData, (uint64));

        // Find the market to resolve based on context
        // In a real implementation, you'd need to track which request belongs to which market
        // For simplicity, we'll resolve the first active market
        string memory categoryToResolve = findMarketToResolve();

        if (bytes(categoryToResolve).length == 0) return;

        Market storage market = markets[categoryToResolve];
        market.currentDataValue = actualValue;

        // Calculate rewards and resolve predictions
        _distributePredictionRewards(categoryToResolve, actualValue);

        emit MarketClosed(categoryToResolve, actualValue);
    }

    // Internal function to distribute rewards based on prediction accuracy
    function _distributePredictionRewards(string memory category, uint256 actualValue) internal {
        Market storage market = markets[category];
        uint256 totalRewardPool = market.totalStaked;
        uint256 correctPredictions = 0;

        // First pass: count correct predictions
        for (uint i = 0; i < market.predictors.length; i++) {
            address predictor = market.predictors[i];
            uint32 predictionId = findPredictionByPredictor(predictor, category);

            if (predictionId > 0) {
                Prediction storage prediction = predictions[predictionId];
                if (_isPredictionAccurate(prediction, actualValue)) {
                    correctPredictions++;
                }
            }
        }

        // Second pass: distribute rewards
        if (correctPredictions > 0) {
            uint256 rewardPerCorrectPrediction = totalRewardPool / correctPredictions;

            for (uint i = 0; i < market.predictors.length; i++) {
                address predictor = market.predictors[i];
                uint32 predictionId = findPredictionByPredictor(predictor, category);

                if (predictionId > 0) {
                    Prediction storage prediction = predictions[predictionId];
                    prediction.isResolved = true;

                    if (_isPredictionAccurate(prediction, actualValue)) {
                        prediction.isCorrect = true;
                        prediction.reward = rewardPerCorrectPrediction;
                        userRewards[predictor] += rewardPerCorrectPrediction;
                        userAccuracy[predictor]++;

                        emit PredictionResolved(predictionId, true, rewardPerCorrectPrediction);
                    } else {
                        emit PredictionResolved(predictionId, false, 0);
                    }

                    hasActivePrediction[category][predictor] = false;
                }
            }
        }
    }

    // Check if prediction is accurate (within 10% tolerance)
    function _isPredictionAccurate(Prediction storage prediction, uint256 actualValue) internal returns (bool) {
        // This is a simplified version - in real implementation,
        // you'd need to decrypt the prediction value for comparison
        // For now, we'll use a placeholder logic
        return true; // Placeholder
    }

    // Find prediction ID by predictor and category
    function findPredictionByPredictor(address predictor, string memory category) internal view returns (uint32) {
        // Simplified lookup - in real implementation, you'd maintain better indexing
        for (uint32 i = 1; i < currentPredictionId; i++) {
            if (predictions[i].predictor == predictor && predictions[i].isActive) {
                return i;
            }
        }
        return 0;
    }

    // Find market that needs resolution
    function findMarketToResolve() internal view returns (string memory) {
        for (uint i = 0; i < activeMarkets.length; i++) {
            if (markets[activeMarkets[i]].isActive) {
                return activeMarkets[i];
            }
        }
        return "";
    }

    // Claim accumulated rewards
    function claimRewards() external {
        uint256 reward = userRewards[msg.sender];
        require(reward > 0, "No rewards to claim");

        userRewards[msg.sender] = 0;
        payable(msg.sender).transfer(reward);

        emit RewardClaimed(msg.sender, reward);
    }

    // Check if address is authorized data provider
    function isAuthorizedDataProvider(address provider) internal view returns (bool) {
        // Simplified - in real implementation, maintain a registry
        return provider == owner;
    }

    // Get market information
    function getMarketInfo(string memory category) external view returns (
        uint256 totalStaked,
        uint256 totalPredictions,
        bool isActive,
        uint256 currentDataValue,
        uint256 predictorCount
    ) {
        Market storage market = markets[category];
        return (
            market.totalStaked,
            market.totalPredictions,
            market.isActive,
            market.currentDataValue,
            market.predictors.length
        );
    }

    // Get prediction details
    function getPredictionInfo(uint32 predictionId) external view returns (
        address predictor,
        uint256 stake,
        uint256 timestamp,
        uint256 deadline,
        bool isActive,
        bool isResolved,
        uint256 reward
    ) {
        Prediction storage prediction = predictions[predictionId];
        return (
            prediction.predictor,
            prediction.stake,
            prediction.timestamp,
            prediction.deadline,
            prediction.isActive,
            prediction.isResolved,
            prediction.reward
        );
    }

    // Get user's accuracy score
    function getUserAccuracy(address user) external view returns (uint256) {
        return userAccuracy[user];
    }

    // Get user's pending rewards
    function getUserRewards(address user) external view returns (uint256) {
        return userRewards[user];
    }

    // Get all active markets
    function getActiveMarkets() external view returns (string[] memory) {
        return activeMarkets;
    }

    // Get trend history length for a category
    function getTrendHistoryLength(string memory category) external view returns (uint256) {
        return trendHistory[category].length;
    }

    // Emergency function to close market
    function closeMarket(string memory category) external onlyOwner {
        markets[category].isActive = false;
    }

    // Owner can withdraw contract balance (fees, etc.)
    function withdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}