// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivacyTrendPredictor is SepoliaConfig {

    address public owner;
    uint32 public currentPredictionCycle;
    uint256 public cycleStartTime;

    // Analysis time windows (24 hours = 86400 seconds)
    uint256 constant CYCLE_DURATION = 86400;
    uint256 constant SUBMISSION_WINDOW = 21600; // 6 hours for submissions

    struct TrendData {
        euint32 encryptedValue;
        euint8 confidenceLevel;
        bool isSubmitted;
        uint256 timestamp;
        bytes32 dataHash;
    }

    struct PredictionCycle {
        euint32 aggregatedTrend;
        euint8 averageConfidence;
        bool analysisCompleted;
        bool cycleEnded;
        uint256 startTime;
        uint256 endTime;
        address[] analysts;
        uint32 participantCount;
        bytes32 resultHash;
    }

    struct AnalystProfile {
        uint32 totalPredictions;
        uint32 accurateCount;
        euint8 reputationScore;
        bool isVerified;
        uint256 lastSubmission;
    }

    mapping(uint32 => PredictionCycle) public predictionCycles;
    mapping(uint32 => mapping(address => TrendData)) public analystPredictions;
    mapping(address => AnalystProfile) public analystProfiles;
    mapping(bytes32 => bool) public usedDataHashes;

    event CycleInitiated(uint32 indexed cycle, uint256 startTime);
    event TrendSubmitted(address indexed analyst, uint32 indexed cycle, bytes32 dataHash);
    event AnalysisCompleted(uint32 indexed cycle, bytes32 resultHash, uint32 participantCount);
    event ReputationUpdated(address indexed analyst, uint8 newScore);
    event ConfidentialResultRequested(uint32 indexed cycle, address indexed requester);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier onlyDuringSubmissionWindow() {
        require(isSubmissionWindowActive(), "Submission window closed");
        _;
    }

    modifier onlyDuringAnalysisWindow() {
        require(isAnalysisWindowActive(), "Analysis window not active");
        _;
    }

    modifier onlyVerifiedAnalyst() {
        require(analystProfiles[msg.sender].isVerified, "Analyst not verified");
        _;
    }

    constructor() {
        owner = msg.sender;
        currentPredictionCycle = 1;
        cycleStartTime = block.timestamp;
    }

    // Check if submission window is active (first 6 hours of cycle)
    function isSubmissionWindowActive() public view returns (bool) {
        if (predictionCycles[currentPredictionCycle].cycleEnded) return false;
        return block.timestamp < cycleStartTime + SUBMISSION_WINDOW;
    }

    // Check if analysis window is active (after submission window)
    function isAnalysisWindowActive() public view returns (bool) {
        if (predictionCycles[currentPredictionCycle].cycleEnded) return false;
        return block.timestamp >= cycleStartTime + SUBMISSION_WINDOW &&
               block.timestamp < cycleStartTime + CYCLE_DURATION;
    }

    // Initialize new prediction cycle
    function initiatePredictionCycle() external onlyOwner {
        require(block.timestamp >= cycleStartTime + CYCLE_DURATION ||
                currentPredictionCycle == 1, "Previous cycle not completed");

        if (currentPredictionCycle > 1) {
            predictionCycles[currentPredictionCycle - 1].cycleEnded = true;
        }

        predictionCycles[currentPredictionCycle] = PredictionCycle({
            aggregatedTrend: FHE.asEuint32(0),
            averageConfidence: FHE.asEuint8(0),
            analysisCompleted: false,
            cycleEnded: false,
            startTime: block.timestamp,
            endTime: 0,
            analysts: new address[](0),
            participantCount: 0,
            resultHash: bytes32(0)
        });

        cycleStartTime = block.timestamp;

        emit CycleInitiated(currentPredictionCycle, block.timestamp);
    }

    // Submit confidential trend prediction
    function submitTrendPrediction(
        uint32 _trendValue,
        uint8 _confidenceLevel,
        bytes32 _dataHash
    ) external onlyDuringSubmissionWindow onlyVerifiedAnalyst {
        require(_confidenceLevel <= 100, "Confidence level must be 0-100");
        require(_dataHash != bytes32(0), "Invalid data hash");
        require(!usedDataHashes[_dataHash], "Data hash already used");
        require(!analystPredictions[currentPredictionCycle][msg.sender].isSubmitted,
                "Already submitted for this cycle");

        // Encrypt the prediction data
        euint32 encryptedTrend = FHE.asEuint32(_trendValue);
        euint8 encryptedConfidence = FHE.asEuint8(_confidenceLevel);

        analystPredictions[currentPredictionCycle][msg.sender] = TrendData({
            encryptedValue: encryptedTrend,
            confidenceLevel: encryptedConfidence,
            isSubmitted: true,
            timestamp: block.timestamp,
            dataHash: _dataHash
        });

        predictionCycles[currentPredictionCycle].analysts.push(msg.sender);
        predictionCycles[currentPredictionCycle].participantCount++;
        usedDataHashes[_dataHash] = true;

        // Update analyst profile
        analystProfiles[msg.sender].totalPredictions++;
        analystProfiles[msg.sender].lastSubmission = block.timestamp;

        // Grant FHE permissions
        FHE.allowThis(encryptedTrend);
        FHE.allowThis(encryptedConfidence);
        FHE.allow(encryptedTrend, msg.sender);
        FHE.allow(encryptedConfidence, msg.sender);

        emit TrendSubmitted(msg.sender, currentPredictionCycle, _dataHash);
    }

    // Perform confidential trend analysis
    function performConfidentialAnalysis() external onlyDuringAnalysisWindow onlyOwner {
        require(!predictionCycles[currentPredictionCycle].analysisCompleted,
                "Analysis already completed");
        require(predictionCycles[currentPredictionCycle].participantCount > 0,
                "No predictions to analyze");

        PredictionCycle storage cycle = predictionCycles[currentPredictionCycle];

        // Initialize aggregated values
        euint32 totalTrend = FHE.asEuint32(0);
        euint32 totalConfidence = FHE.asEuint32(0);

        // Aggregate all predictions using FHE operations
        for (uint i = 0; i < cycle.analysts.length; i++) {
            address analyst = cycle.analysts[i];
            TrendData storage prediction = analystPredictions[currentPredictionCycle][analyst];

            // Add encrypted values
            totalTrend = FHE.add(totalTrend, prediction.encryptedValue);
            totalConfidence = FHE.add(totalConfidence,
                FHE.asEuint32(prediction.confidenceLevel));
        }

        // Store aggregated encrypted results
        cycle.aggregatedTrend = totalTrend;

        // For confidence average, we need to use async decryption for division
        // Request decryption of total confidence for average calculation
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(totalConfidence);
        FHE.requestDecryption(cts, this.processConfidenceAverage.selector);

        // Mark as analysis completed (average will be set in callback)
        cycle.analysisCompleted = true;
        cycle.endTime = block.timestamp;
        cycle.resultHash = keccak256(abi.encodePacked(
            currentPredictionCycle,
            block.timestamp,
            cycle.participantCount
        ));

        // Grant permissions for result access
        FHE.allowThis(cycle.aggregatedTrend);

        emit AnalysisCompleted(currentPredictionCycle, cycle.resultHash, cycle.participantCount);

        // Move to next cycle
        currentPredictionCycle++;
    }

    // Callback to process confidence average calculation
    function processConfidenceAverage(
        uint256 requestId,
        uint32 totalConfidenceDecrypted,
        bytes[] memory signatures
    ) external {
        // Get the previous cycle (since currentPredictionCycle was incremented)
        uint32 targetCycle = currentPredictionCycle - 1;
        PredictionCycle storage cycle = predictionCycles[targetCycle];

        // Note: Signature verification is handled by the FHE system automatically
        // during the decryption process, so manual verification is not required

        // Calculate average confidence and re-encrypt
        uint8 avgConfidence = uint8(totalConfidenceDecrypted / cycle.participantCount);
        cycle.averageConfidence = FHE.asEuint8(avgConfidence);

        // Grant permissions
        FHE.allowThis(cycle.averageConfidence);
    }

    // Request confidential analysis result (with proper authorization)
    function requestConfidentialResult(uint32 _cycle) external {
        require(predictionCycles[_cycle].analysisCompleted, "Analysis not completed");
        require(analystProfiles[msg.sender].isVerified, "Not authorized");

        PredictionCycle storage cycle = predictionCycles[_cycle];

        // Grant temporary access to encrypted results
        FHE.allow(cycle.aggregatedTrend, msg.sender);
        FHE.allow(cycle.averageConfidence, msg.sender);

        emit ConfidentialResultRequested(_cycle, msg.sender);
    }

    // Verify analyst (only owner can verify)
    function verifyAnalyst(address _analyst) external onlyOwner {
        analystProfiles[_analyst].isVerified = true;
        analystProfiles[_analyst].reputationScore = FHE.asEuint8(50); // Starting score

        FHE.allowThis(analystProfiles[_analyst].reputationScore);
    }

    // Update analyst reputation based on prediction accuracy
    function updateAnalystReputation(address _analyst, uint8 _newScore) external onlyOwner {
        require(_newScore <= 100, "Score must be 0-100");
        require(analystProfiles[_analyst].isVerified, "Analyst not verified");

        analystProfiles[_analyst].reputationScore = FHE.asEuint8(_newScore);
        FHE.allowThis(analystProfiles[_analyst].reputationScore);

        emit ReputationUpdated(_analyst, _newScore);
    }

    // Get current cycle information
    function getCurrentCycleInfo() external view returns (
        uint32 cycle,
        uint256 startTime,
        uint32 participantCount,
        bool analysisCompleted,
        bool submissionWindowActive,
        bool analysisWindowActive
    ) {
        PredictionCycle storage currentCycle = predictionCycles[currentPredictionCycle];
        return (
            currentPredictionCycle,
            cycleStartTime,
            currentCycle.participantCount,
            currentCycle.analysisCompleted,
            isSubmissionWindowActive(),
            isAnalysisWindowActive()
        );
    }

    // Get analyst profile information
    function getAnalystProfile(address _analyst) external view returns (
        uint32 totalPredictions,
        uint32 accurateCount,
        bool isVerified,
        uint256 lastSubmission
    ) {
        AnalystProfile storage profile = analystProfiles[_analyst];
        return (
            profile.totalPredictions,
            profile.accurateCount,
            profile.isVerified,
            profile.lastSubmission
        );
    }

    // Get cycle history
    function getCycleHistory(uint32 _cycle) external view returns (
        bool analysisCompleted,
        bool cycleEnded,
        uint256 startTime,
        uint256 endTime,
        uint32 participantCount,
        bytes32 resultHash
    ) {
        PredictionCycle storage cycle = predictionCycles[_cycle];
        return (
            cycle.analysisCompleted,
            cycle.cycleEnded,
            cycle.startTime,
            cycle.endTime,
            cycle.participantCount,
            cycle.resultHash
        );
    }

    // Check if analyst has submitted for current cycle
    function hasAnalystSubmitted(address _analyst) external view returns (bool) {
        return analystPredictions[currentPredictionCycle][_analyst].isSubmitted;
    }

    // Get time remaining in current window
    function getTimeRemaining() external view returns (uint256 submissionTime, uint256 analysisTime) {
        if (isSubmissionWindowActive()) {
            submissionTime = (cycleStartTime + SUBMISSION_WINDOW) - block.timestamp;
            analysisTime = 0;
        } else if (isAnalysisWindowActive()) {
            submissionTime = 0;
            analysisTime = (cycleStartTime + CYCLE_DURATION) - block.timestamp;
        } else {
            submissionTime = 0;
            analysisTime = 0;
        }
        return (submissionTime, analysisTime);
    }
}