// Privacy Trend Predictor Application
class PrivacyTrendPredictor {
    constructor() {
        this.contractAddress = '0xAeca45f20F6a0Ca1E7be898D8201E69506c60AfE';
        this.contractABI = [
            // Read-only functions
            "function owner() view returns (address)",
            "function currentPredictionCycle() view returns (uint32)",
            "function cycleStartTime() view returns (uint256)",
            "function isSubmissionWindowActive() view returns (bool)",
            "function isAnalysisWindowActive() view returns (bool)",
            "function getCurrentCycleInfo() view returns (uint32 cycle, uint256 startTime, uint32 participantCount, bool analysisCompleted, bool submissionWindowActive, bool analysisWindowActive)",
            "function getAnalystProfile(address _analyst) view returns (uint32 totalPredictions, uint32 accurateCount, bool isVerified, uint256 lastSubmission)",
            "function getCycleHistory(uint32 _cycle) view returns (bool analysisCompleted, bool cycleEnded, uint256 startTime, uint256 endTime, uint32 participantCount, bytes32 resultHash)",
            "function hasAnalystSubmitted(address _analyst) view returns (bool)",
            "function getTimeRemaining() view returns (uint256 submissionTime, uint256 analysisTime)",

            // State-changing functions
            "function initiatePredictionCycle()",
            "function submitTrendPrediction(uint32 _trendValue, uint8 _confidenceLevel, bytes32 _dataHash)",
            "function performConfidentialAnalysis()",
            "function verifyAnalyst(address _analyst)",
            "function updateAnalystReputation(address _analyst, uint8 _newScore)",
            "function requestConfidentialResult(uint32 _cycle)",

            // Events
            "event CycleInitiated(uint32 indexed cycle, uint256 startTime)",
            "event TrendSubmitted(address indexed analyst, uint32 indexed cycle, bytes32 dataHash)",
            "event AnalysisCompleted(uint32 indexed cycle, bytes32 resultHash, uint32 participantCount)",
            "event ReputationUpdated(address indexed analyst, uint8 newScore)",
            "event ConfidentialResultRequested(uint32 indexed cycle, address indexed requester)"
        ];

        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;
        this.isOwner = false;

        this.transactions = JSON.parse(localStorage.getItem('transactions') || '[]');

        this.initializeApp();
    }

    async initializeApp() {
        this.setupEventListeners();
        this.renderTransactionHistory();

        // Check for existing wallet connection
        if (typeof window.ethereum !== 'undefined' && window.ethereum.selectedAddress) {
            await this.connectWallet();
        }

        // Set up periodic updates
        setInterval(() => this.updateCycleInfo(), 30000); // Update every 30 seconds
    }

    setupEventListeners() {
        // Wallet connection
        document.getElementById('connectWallet').addEventListener('click', () => this.connectWallet());
        document.getElementById('disconnectWallet').addEventListener('click', () => this.disconnectWallet());

        // Cycle management
        document.getElementById('refreshCycle').addEventListener('click', () => this.updateCycleInfo());
        document.getElementById('initiateCycle').addEventListener('click', () => this.initiateCycle());
        document.getElementById('performAnalysis').addEventListener('click', () => this.performAnalysis());
        document.getElementById('verifyCurrentUser').addEventListener('click', () => this.verifyCurrentUser());

        // Prediction form
        document.getElementById('predictionForm').addEventListener('submit', (e) => this.submitPrediction(e));
        document.getElementById('generateHash').addEventListener('click', () => this.generateRandomHash());

        // Confidence level slider
        const confidenceSlider = document.getElementById('confidenceLevel');
        const confidenceDisplay = document.getElementById('confidenceDisplay');
        confidenceSlider.addEventListener('input', (e) => {
            confidenceDisplay.textContent = `${e.target.value}%`;
        });

        // Results
        document.getElementById('requestResults').addEventListener('click', () => this.requestResults());
        document.getElementById('cycleSelect').addEventListener('change', (e) => {
            document.getElementById('requestResults').disabled = !e.target.value;
        });

        // Transaction history
        document.getElementById('clearHistory').addEventListener('click', () => this.clearTransactionHistory());

        // Notification close
        document.getElementById('closeNotification').addEventListener('click', () => this.hideNotification());

        // Form validation
        document.getElementById('trendValue').addEventListener('input', () => this.validateForm());
        document.getElementById('dataHash').addEventListener('input', () => this.validateForm());
    }

    async connectWallet() {
        try {
            if (typeof window.ethereum === 'undefined') {
                this.showNotification('Please install MetaMask or another Web3 wallet', 'error');
                return;
            }

            this.showLoading('Connecting wallet...');

            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

            if (accounts.length === 0) {
                throw new Error('No accounts found');
            }

            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.userAddress = accounts[0];

            // Initialize contract
            this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.signer);

            // Verify contract deployment
            try {
                const code = await this.provider.getCode(this.contractAddress);
                if (code === '0x') {
                    throw new Error('Contract not deployed at this address');
                }
                console.log('✅ Contract verified at address:', this.contractAddress);
            } catch (error) {
                throw new Error(`Contract verification failed: ${error.message}`);
            }

            // Check if user is owner
            try {
                const owner = await this.contract.owner();
                this.isOwner = owner.toLowerCase() === this.userAddress.toLowerCase();
                console.log('📋 Contract owner:', owner);
                console.log('👤 Current user:', this.userAddress);
                console.log('🔑 Is owner:', this.isOwner);
            } catch (error) {
                console.warn('Could not fetch owner address:', error);
                this.isOwner = false;
            }

            // Update UI
            this.updateWalletUI();
            await this.updateNetworkInfo();
            await this.updateAnalystProfile();
            await this.updateCycleInfo();
            await this.populateCycleSelect();

            this.hideLoading();
            this.showNotification('Wallet connected successfully', 'success');
        } catch (error) {
            this.hideLoading();
            this.showNotification(`Failed to connect wallet: ${error.message}`, 'error');
            console.error('Wallet connection error:', error);
        }
    }

    async disconnectWallet() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;
        this.isOwner = false;

        this.updateWalletUI();
        this.resetUI();
        this.showNotification('Wallet disconnected', 'warning');
    }

    updateWalletUI() {
        const connectBtn = document.getElementById('connectWallet');
        const walletInfo = document.getElementById('walletInfo');

        if (this.userAddress) {
            connectBtn.classList.add('hidden');
            walletInfo.classList.remove('hidden');
            document.getElementById('walletAddress').textContent =
                `${this.userAddress.slice(0, 6)}...${this.userAddress.slice(-4)}`;
        } else {
            connectBtn.classList.remove('hidden');
            walletInfo.classList.add('hidden');
        }

        // Show/hide owner controls
        const analysisControls = document.getElementById('analysisControls');
        if (this.isOwner && this.userAddress) {
            analysisControls.style.display = 'block';
        } else {
            analysisControls.style.display = 'none';
        }
    }

    async updateNetworkInfo() {
        if (!this.provider) return;

        try {
            const network = await this.provider.getNetwork();
            document.getElementById('networkName').textContent = network.name || `Chain ID: ${network.chainId}`;
        } catch (error) {
            console.error('Network info error:', error);
            document.getElementById('networkName').textContent = 'Unknown';
        }
    }

    async updateAnalystProfile() {
        if (!this.contract || !this.userAddress) {
            this.resetAnalystProfile();
            return;
        }

        try {
            const profile = await this.contract.getAnalystProfile(this.userAddress);
            const [totalPredictions, accurateCount, isVerified, lastSubmission] = profile;

            // Update verification status
            const statusElement = document.getElementById('verificationStatus');
            const messageElement = document.getElementById('verificationMessage');

            if (isVerified) {
                messageElement.textContent = '✓ You are a verified analyst';
                messageElement.className = 'status-message verified';
            } else {
                messageElement.textContent = '⚠ You are not verified as an analyst';
                messageElement.className = 'status-message unverified';
            }

            // Update stats
            document.getElementById('totalPredictions').textContent = totalPredictions.toString();
            document.getElementById('accurateCount').textContent = accurateCount.toString();

            const lastSubmissionDate = lastSubmission > 0 ?
                new Date(Number(lastSubmission) * 1000).toLocaleDateString() : 'Never';
            document.getElementById('lastSubmission').textContent = lastSubmissionDate;

        } catch (error) {
            console.error('Analyst profile error:', error);
            this.resetAnalystProfile();
        }
    }

    resetAnalystProfile() {
        document.getElementById('verificationMessage').textContent = 'Connect wallet to check verification status';
        document.getElementById('verificationMessage').className = 'status-message';
        document.getElementById('totalPredictions').textContent = '-';
        document.getElementById('accurateCount').textContent = '-';
        document.getElementById('lastSubmission').textContent = '-';
    }

    async updateCycleInfo() {
        if (!this.contract) {
            this.resetCycleInfo();
            return;
        }

        try {
            const cycleInfo = await this.contract.getCurrentCycleInfo();
            const [cycle, startTime, participantCount, analysisCompleted, submissionWindowActive, analysisWindowActive] = cycleInfo;

            // Update basic info
            document.getElementById('currentCycle').textContent = cycle.toString();
            document.getElementById('participantCount').textContent = participantCount.toString();

            // Update cycle status
            const statusElement = document.getElementById('cycleStatus');
            if (submissionWindowActive) {
                statusElement.textContent = '🟢 Submission Window Open';
                statusElement.className = 'status-badge active';
            } else if (analysisWindowActive) {
                statusElement.textContent = '🟡 Analysis Window Open';
                statusElement.className = 'status-badge active';
            } else if (analysisCompleted) {
                statusElement.textContent = '✅ Analysis Completed';
                statusElement.className = 'status-badge';
            } else {
                statusElement.textContent = '🔴 Cycle Inactive';
                statusElement.className = 'status-badge inactive';
            }

            // Update time remaining
            await this.updateTimeRemaining();

            // Update form state
            this.updateFormState(submissionWindowActive);

        } catch (error) {
            console.error('Cycle info error:', error);
            this.resetCycleInfo();
        }
    }

    async updateTimeRemaining() {
        if (!this.contract) return;

        try {
            const timeRemaining = await this.contract.getTimeRemaining();
            const [submissionTime, analysisTime] = timeRemaining;

            document.getElementById('submissionTime').textContent =
                this.formatTime(Number(submissionTime));
            document.getElementById('analysisTime').textContent =
                this.formatTime(Number(analysisTime));
        } catch (error) {
            console.error('Time remaining error:', error);
        }
    }

    formatTime(seconds) {
        if (seconds === 0) return 'Closed';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${seconds}s`;
        }
    }

    resetCycleInfo() {
        document.getElementById('currentCycle').textContent = '-';
        document.getElementById('participantCount').textContent = '-';
        document.getElementById('cycleStatus').textContent = 'Not Connected';
        document.getElementById('cycleStatus').className = 'status-badge';
        document.getElementById('submissionTime').textContent = '-';
        document.getElementById('analysisTime').textContent = '-';
    }

    updateFormState(submissionWindowActive) {
        const submitBtn = document.getElementById('submitPrediction');
        const form = document.getElementById('predictionForm');

        if (!this.userAddress) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Connect Wallet';
            return;
        }

        if (!submissionWindowActive) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submission Window Closed';
            return;
        }

        // Check if form is valid and user hasn't submitted
        this.validateForm();
    }

    async validateForm() {
        const submitBtn = document.getElementById('submitPrediction');
        const trendValue = document.getElementById('trendValue').value;
        const dataHash = document.getElementById('dataHash').value;

        if (!this.userAddress) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Connect Wallet';
            return;
        }

        // Check if user has already submitted
        if (this.contract && this.userAddress) {
            try {
                const hasSubmitted = await this.contract.hasAnalystSubmitted(this.userAddress);
                if (hasSubmitted) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Already Submitted';
                    return;
                }
            } catch (error) {
                console.error('Submission check error:', error);
            }
        }

        const isValid = trendValue && dataHash && dataHash.match(/^0x[a-fA-F0-9]{64}$/);
        submitBtn.disabled = !isValid;
        submitBtn.textContent = isValid ? 'Submit Prediction' : 'Complete Form';
    }

    generateRandomHash() {
        const randomBytes = ethers.randomBytes(32);
        const hash = ethers.hexlify(randomBytes);
        document.getElementById('dataHash').value = hash;
        this.validateForm();
    }

    async submitPrediction(event) {
        event.preventDefault();

        if (!this.contract || !this.userAddress) {
            this.showNotification('Please connect your wallet first', 'error');
            return;
        }

        const trendValue = document.getElementById('trendValue').value;
        const confidenceLevel = document.getElementById('confidenceLevel').value;
        const dataHash = document.getElementById('dataHash').value;

        // Validation
        if (!trendValue || trendValue < 0 || trendValue > 4294967295) {
            this.showNotification('Please enter a valid trend value (0-4,294,967,295)', 'error');
            return;
        }

        if (!confidenceLevel || confidenceLevel < 0 || confidenceLevel > 100) {
            this.showNotification('Please enter a valid confidence level (0-100)', 'error');
            return;
        }

        if (!dataHash || !dataHash.match(/^0x[a-fA-F0-9]{64}$/)) {
            this.showNotification('Please enter a valid 32-byte hash', 'error');
            return;
        }

        try {
            this.showLoading('Checking submission status...');

            // Check if user is verified
            const profile = await this.contract.getAnalystProfile(this.userAddress);
            if (!profile.isVerified) {
                this.hideLoading();
                this.showNotification('You must be a verified analyst to submit predictions', 'error');
                return;
            }

            // Check if submission window is active
            const cycleInfo = await this.contract.getCurrentCycleInfo();
            if (!cycleInfo.submissionWindowActive) {
                this.hideLoading();
                this.showNotification('Submission window is not currently active', 'error');
                return;
            }

            // Check if user has already submitted
            const hasSubmitted = await this.contract.hasAnalystSubmitted(this.userAddress);
            if (hasSubmitted) {
                this.hideLoading();
                this.showNotification('You have already submitted a prediction for this cycle', 'error');
                return;
            }

            this.showLoading('Submitting prediction...');

            // Estimate gas first
            const gasEstimate = await this.contract.submitTrendPrediction.estimateGas(
                parseInt(trendValue),
                parseInt(confidenceLevel),
                dataHash
            );

            // Add 20% buffer to gas estimate
            const gasLimit = Math.floor(Number(gasEstimate) * 1.2);

            const tx = await this.contract.submitTrendPrediction(
                parseInt(trendValue),
                parseInt(confidenceLevel),
                dataHash,
                { gasLimit }
            );

            this.addTransaction({
                type: 'Submit Prediction',
                hash: tx.hash,
                status: 'pending'
            });

            this.showLoading('Waiting for confirmation...');
            const receipt = await tx.wait();

            if (receipt.status === 1) {
                this.updateTransaction(tx.hash, 'success');
                await this.updateCycleInfo();
                await this.updateAnalystProfile();

                // Reset form
                document.getElementById('predictionForm').reset();
                document.getElementById('confidenceDisplay').textContent = '50%';

                this.hideLoading();
                this.showNotification('Prediction submitted successfully!', 'success');
            } else {
                throw new Error('Transaction failed');
            }

        } catch (error) {
            this.hideLoading();

            let errorMessage = 'Failed to submit prediction';

            if (error.message.includes('user rejected')) {
                errorMessage = 'Transaction was rejected by user';
            } else if (error.message.includes('insufficient funds')) {
                errorMessage = 'Insufficient funds for gas fees';
            } else if (error.message.includes('Already submitted')) {
                errorMessage = 'You have already submitted a prediction for this cycle';
            } else if (error.message.includes('Not authorized') || error.message.includes('Analyst not verified')) {
                errorMessage = 'You must be a verified analyst to submit predictions';
            } else if (error.message.includes('Submission window')) {
                errorMessage = 'Submission window is not currently active';
            } else if (error.reason) {
                errorMessage = `Contract error: ${error.reason}`;
            } else if (error.message) {
                errorMessage = error.message;
            }

            this.showNotification(errorMessage, 'error');
            console.error('Prediction submission error:', error);
        }
    }

    async initiateCycle() {
        if (!this.contract || !this.isOwner) {
            this.showNotification('Only the contract owner can initiate cycles', 'error');
            return;
        }

        try {
            this.showLoading('Initiating new cycle...');

            const tx = await this.contract.initiatePredictionCycle();

            this.addTransaction({
                type: 'Initiate Cycle',
                hash: tx.hash,
                status: 'pending'
            });

            const receipt = await tx.wait();

            this.updateTransaction(tx.hash, 'success');
            await this.updateCycleInfo();

            this.hideLoading();
            this.showNotification('New prediction cycle initiated!', 'success');

        } catch (error) {
            this.hideLoading();
            this.showNotification(`Failed to initiate cycle: ${error.message}`, 'error');
            console.error('Cycle initiation error:', error);
        }
    }

    async performAnalysis() {
        if (!this.contract || !this.isOwner) {
            this.showNotification('Only the contract owner can perform analysis', 'error');
            return;
        }

        try {
            this.showLoading('Performing confidential analysis...');

            const tx = await this.contract.performConfidentialAnalysis();

            this.addTransaction({
                type: 'Perform Analysis',
                hash: tx.hash,
                status: 'pending'
            });

            const receipt = await tx.wait();

            this.updateTransaction(tx.hash, 'success');
            await this.updateCycleInfo();
            await this.populateCycleSelect();

            this.hideLoading();
            this.showNotification('Confidential analysis completed!', 'success');

        } catch (error) {
            this.hideLoading();
            this.showNotification(`Failed to perform analysis: ${error.message}`, 'error');
            console.error('Analysis error:', error);
        }
    }

    async populateCycleSelect() {
        if (!this.contract) return;

        try {
            const currentCycle = await this.contract.currentPredictionCycle();
            const select = document.getElementById('cycleSelect');

            // Clear existing options except first
            select.innerHTML = '<option value="">Select a cycle...</option>';

            // Add options for completed cycles
            for (let i = 1; i < Number(currentCycle); i++) {
                try {
                    const history = await this.contract.getCycleHistory(i);
                    if (history[0]) { // analysisCompleted
                        const option = document.createElement('option');
                        option.value = i;
                        option.textContent = `Cycle ${i}`;
                        select.appendChild(option);
                    }
                } catch (error) {
                    // Skip cycles that don't exist or have errors
                    continue;
                }
            }
        } catch (error) {
            console.error('Cycle select population error:', error);
        }
    }

    async verifyCurrentUser() {
        if (!this.contract || !this.isOwner || !this.userAddress) {
            this.showNotification('Only the contract owner can verify analysts', 'error');
            return;
        }

        try {
            this.showLoading('Verifying current user as analyst...');

            const tx = await this.contract.verifyAnalyst(this.userAddress);

            this.addTransaction({
                type: 'Verify Analyst',
                hash: tx.hash,
                status: 'pending'
            });

            const receipt = await tx.wait();

            this.updateTransaction(tx.hash, 'success');
            await this.updateAnalystProfile();

            this.hideLoading();
            this.showNotification('User verified as analyst!', 'success');

        } catch (error) {
            this.hideLoading();
            this.showNotification(`Failed to verify analyst: ${error.message}`, 'error');
            console.error('Verification error:', error);
        }
    }

    async requestResults() {
        if (!this.contract || !this.userAddress) {
            this.showNotification('Please connect your wallet first', 'error');
            return;
        }

        const cycleNumber = document.getElementById('cycleSelect').value;
        if (!cycleNumber) {
            this.showNotification('Please select a cycle', 'error');
            return;
        }

        try {
            this.showLoading('Requesting confidential results...');

            // First, request access to the results
            const tx = await this.contract.requestConfidentialResult(cycleNumber);

            this.addTransaction({
                type: 'Request Results',
                hash: tx.hash,
                status: 'pending'
            });

            const receipt = await tx.wait();
            this.updateTransaction(tx.hash, 'success');

            // Then fetch and display cycle history
            const history = await this.contract.getCycleHistory(cycleNumber);
            const [analysisCompleted, cycleEnded, startTime, endTime, participantCount, resultHash] = history;

            // Update results display
            document.getElementById('resultCycle').textContent = cycleNumber;
            document.getElementById('analysisStatus').textContent = analysisCompleted ? 'Completed' : 'Pending';
            document.getElementById('resultParticipants').textContent = participantCount.toString();
            document.getElementById('resultHash').textContent = resultHash || 'N/A';

            document.getElementById('resultsContent').classList.remove('hidden');

            this.hideLoading();
            this.showNotification('Results access requested successfully!', 'success');

        } catch (error) {
            this.hideLoading();
            this.showNotification(`Failed to request results: ${error.message}`, 'error');
            console.error('Results request error:', error);
        }
    }

    addTransaction(transaction) {
        const newTransaction = {
            ...transaction,
            timestamp: Date.now()
        };
        this.transactions.unshift(newTransaction);
        this.saveTransactions();
        this.renderTransactionHistory();
    }

    updateTransaction(hash, status) {
        const transaction = this.transactions.find(tx => tx.hash === hash);
        if (transaction) {
            transaction.status = status;
            this.saveTransactions();
            this.renderTransactionHistory();
        }
    }

    saveTransactions() {
        // Keep only last 20 transactions
        this.transactions = this.transactions.slice(0, 20);
        localStorage.setItem('transactions', JSON.stringify(this.transactions));
    }

    renderTransactionHistory() {
        const container = document.getElementById('transactionList');

        if (this.transactions.length === 0) {
            container.innerHTML = '<div class="empty-state">No transactions yet</div>';
            return;
        }

        container.innerHTML = this.transactions.map(tx => `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-type">${tx.type}</div>
                    <div class="transaction-hash">${tx.hash.slice(0, 10)}...${tx.hash.slice(-8)}</div>
                </div>
                <div class="transaction-status ${tx.status}">${tx.status}</div>
            </div>
        `).join('');
    }

    clearTransactionHistory() {
        this.transactions = [];
        this.saveTransactions();
        this.renderTransactionHistory();
        this.showNotification('Transaction history cleared', 'warning');
    }

    resetUI() {
        document.getElementById('networkName').textContent = 'Not Connected';
        this.resetCycleInfo();
        this.resetAnalystProfile();
        document.getElementById('resultsContent').classList.add('hidden');
        document.getElementById('cycleSelect').innerHTML = '<option value="">Select a cycle...</option>';
    }

    showLoading(message = 'Loading...') {
        document.getElementById('loadingMessage').textContent = message;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const messageElement = document.getElementById('notificationMessage');

        messageElement.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');

        // Auto hide after 5 seconds
        setTimeout(() => {
            this.hideNotification();
        }, 5000);
    }

    hideNotification() {
        document.getElementById('notification').classList.add('hidden');
    }

    async debugContractCall(functionName, ...args) {
        console.log(`🔍 Debug: Calling ${functionName} with args:`, args);
        try {
            if (!this.contract) {
                throw new Error('Contract not initialized');
            }

            const result = await this.contract[functionName](...args);
            console.log(`✅ Debug: ${functionName} result:`, result);
            return result;
        } catch (error) {
            console.error(`❌ Debug: ${functionName} failed:`, error);
            throw error;
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PrivacyTrendPredictor();
});

// Handle wallet account changes
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            // User disconnected wallet
            window.location.reload();
        } else {
            // User switched accounts
            window.location.reload();
        }
    });

    window.ethereum.on('chainChanged', (chainId) => {
        // User switched networks
        window.location.reload();
    });
}