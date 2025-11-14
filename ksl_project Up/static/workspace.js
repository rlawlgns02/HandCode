// KSL 통합 워크스페이스
class KSLWorkspace {
    constructor() {
        // State
        this.currentTab = 'collect';
        this.model = new SignLanguageModel();

        // Data Collection
        this.collectedData = [];
        this.selectedGesture = null;
        this.sessionCount = 0;
        this.isRecording = false;
        this.collectCamera = null;
        this.collectHands = null;
        this.showSkeletonCollect = true;
        this.autoSaveEnabled = false;
        this.collectFPS = 0;
        this.lastFrameTime = Date.now();
        this.targetCount = parseInt(localStorage.getItem('ksl_target_count') || '800');

        // Training
        this.isTraining = false;
        this.trainingModel = null;

        // Translation
        this.translateCamera = null;
        this.translateHands = null;
        this.isTranslating = false;
        this.recognitionHistory = [];
        this.showSkeletonTranslate = true;
        this.translateFPS = 0;
        this.translateCount = 0;
        this.confidenceSum = 0;

        this.initialize();
    }

    async initialize() {
        console.log('KSL Workspace 초기화 중...');

        // Tab navigation
        this.setupTabNavigation();

        // Initialize UI
        this.initializeCollectionUI();
        this.initializeTrainingUI();
        this.initializeTranslationUI();

        // Load model for translation
        await this.loadModel();

        console.log('KSL Workspace 초기화 완료!');
    }

    setupTabNavigation() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tab}`);
        });

        // Update progress flow
        document.getElementById('flowCollect').classList.toggle('active', tab === 'collect');
        document.getElementById('flowTrain').classList.toggle('active', tab === 'train');
        document.getElementById('flowTranslate').classList.toggle('active', tab === 'translate');

        this.currentTab = tab;

        // Stop cameras when switching tabs
        if (tab !== 'collect' && this.collectCamera) {
            this.stopCollectionCamera();
        }
        if (tab !== 'translate' && this.translateCamera) {
            this.stopTranslationCamera();
        }
    }

    // ============================================
    // DATA COLLECTION
    // ============================================

    initializeCollectionUI() {
        this.populateGestureGrid();

        // Event listeners
        document.getElementById('startCollectBtn').addEventListener('click', () => this.startCollectionCamera());
        document.getElementById('stopCollectBtn').addEventListener('click', () => this.stopCollectionCamera());
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('saveDataBtn').addEventListener('click', () => this.saveCollectedData());
        document.getElementById('resetDataBtn').addEventListener('click', () => this.resetCollectedData());

        // Skeleton toggle
        document.getElementById('skeletonToggleCollect').addEventListener('change', (e) => {
            this.showSkeletonCollect = e.target.checked;
        });

        // Auto-save toggle
        document.getElementById('autoSaveToggle').addEventListener('change', (e) => {
            this.autoSaveEnabled = e.target.checked;
        });

        // Search
        document.getElementById('gestureSearch').addEventListener('input', (e) => {
            this.filterGestures(e.target.value);
        });

        // Target edit button
        document.getElementById('editTargetBtn').addEventListener('click', () => this.openTargetModal());
        document.getElementById('cancelTargetBtn').addEventListener('click', () => this.closeTargetModal());
        document.getElementById('confirmTargetBtn').addEventListener('click', () => this.updateTarget());

        // Close modal on outside click
        document.getElementById('targetModal').addEventListener('click', (e) => {
            if (e.target.id === 'targetModal') {
                this.closeTargetModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.currentTab === 'collect') {
                // Space: Toggle recording
                if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                    e.preventDefault();
                    if (!document.getElementById('recordBtn').disabled) {
                        this.toggleRecording();
                    }
                }
                // Ctrl+S: Save data
                if (e.ctrlKey && e.key === 's') {
                    e.preventDefault();
                    this.saveCollectedData();
                }
            }
        });

        // Initialize target display
        document.getElementById('targetValue').textContent = this.targetCount;
        document.getElementById('targetInput').value = this.targetCount;

        this.updateCollectionStats();
        this.updateLiveProgress();
    }

    openTargetModal() {
        document.getElementById('targetModal').classList.add('show');
        document.getElementById('targetInput').value = this.targetCount;
        document.getElementById('targetInput').focus();
        document.getElementById('targetInput').select();
    }

    closeTargetModal() {
        document.getElementById('targetModal').classList.remove('show');
    }

    updateTarget() {
        const newTarget = parseInt(document.getElementById('targetInput').value);
        if (newTarget < 100 || newTarget > 5000) {
            alert('목표 개수는 100에서 5000 사이여야 합니다.');
            return;
        }

        this.targetCount = newTarget;
        localStorage.setItem('ksl_target_count', newTarget);
        document.getElementById('targetValue').textContent = newTarget;

        // Update all gesture cards and progress bar
        this.populateGestureGrid();
        this.updateLiveProgress();

        this.closeTargetModal();
    }

    populateGestureGrid() {
        const grid = document.getElementById('gestureGrid');
        const labels = this.model.labels.filter(l => l !== '대기');

        // Load existing data to get counts per gesture
        const dataset = JSON.parse(localStorage.getItem('ksl_dataset') || '[]');
        const countsByGesture = {};
        labels.forEach(label => countsByGesture[label] = 0);
        dataset.forEach(d => {
            if (countsByGesture[d.label] !== undefined) {
                countsByGesture[d.label]++;
            }
        });

        grid.innerHTML = '';

        labels.forEach(label => {
            const count = countsByGesture[label] || 0;
            const percentage = Math.min((count / this.targetCount) * 100, 100);
            const isCompleted = count >= this.targetCount;

            const card = document.createElement('div');
            card.className = `gesture-card${isCompleted ? ' completed' : ''}`;
            card.dataset.gesture = label;
            card.innerHTML = `
                <div class="gesture-card-header">
                    <span class="gesture-name">${this.getGestureEmoji(label)} ${label}</span>
                    <span class="gesture-count">${count}/${this.targetCount}</span>
                </div>
                <div class="gesture-progress-bar">
                    <div class="gesture-progress-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="gesture-progress-text">${percentage.toFixed(1)}% 완료</div>
            `;
            card.addEventListener('click', () => this.selectGesture(label, card));
            grid.appendChild(card);
        });

        this.allGestureCards = labels;
    }

    getGestureEmoji(label) {
        const map = {
            '안녕하세요': '👋', '감사합니다': '🙏', '좋아요': '👍', '싫어요': '👎',
            '확인': '👌', '평화': '✌️', '사랑해요': '🤟', '하나': '☝️',
            '둘': '✌️', '셋': '🤟', '넷': '🖖', '다섯': '🖐',
            '여섯': '🤙', '일곱': '🖖', '여덟': '🤘', '아홉': '👆',
            '열': '🙌', '주먹': '✊', '가리키기': '☝️', '멈춰': '✋',
            '와': '👈', '가': '👉', '예': '👍', '아니오': '👎',
            '물': '💧', '밥': '🍚', '도와주세요': '🆘', '미안합니다': '🙇',
            '잘가': '👋', '전화': '📱', '락': '🤘'
        };
        return map[label] || '✋';
    }

    selectGesture(label, card) {
        document.querySelectorAll('.gesture-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedGesture = label;
        document.getElementById('currentGesture').textContent = label;
        this.updateLiveProgress();
    }

    updateLiveProgress() {
        const progressText = document.getElementById('liveProgressText');
        const progressBarFill = document.getElementById('liveProgressBarFill');
        const progressRemaining = document.getElementById('progressRemaining');

        if (!this.selectedGesture) {
            document.getElementById('currentGestureProgress').textContent = '수집 진행률';
            document.getElementById('progressGestureName').textContent = '동작을 선택하세요';
            progressText.textContent = `0 / ${this.targetCount} (0%)`;
            progressText.classList.remove('complete');
            progressBarFill.style.width = '0%';
            progressBarFill.classList.remove('complete');
            progressRemaining.textContent = '-';
            progressRemaining.classList.remove('complete');
            return;
        }

        // Get current count for selected gesture
        const dataset = JSON.parse(localStorage.getItem('ksl_dataset') || '[]');
        const currentCount = dataset.filter(d => d.label === this.selectedGesture).length +
                           this.collectedData.filter(d => d.label === this.selectedGesture).length;

        const percentage = Math.min((currentCount / this.targetCount) * 100, 100);
        const remaining = Math.max(this.targetCount - currentCount, 0);
        const isComplete = currentCount >= this.targetCount;

        // Update UI
        document.getElementById('currentGestureProgress').textContent = `"${this.selectedGesture}" 진행률`;
        document.getElementById('progressGestureName').textContent = `${this.getGestureEmoji(this.selectedGesture)} ${this.selectedGesture}`;
        progressText.textContent = `${currentCount} / ${this.targetCount} (${percentage.toFixed(1)}%)`;
        progressBarFill.style.width = `${percentage}%`;

        if (isComplete) {
            progressBarFill.classList.add('complete');
            progressText.classList.add('complete');
            progressRemaining.textContent = '✅ 목표 달성!';
            progressRemaining.classList.add('complete');
        } else {
            progressBarFill.classList.remove('complete');
            progressText.classList.remove('complete');
            progressRemaining.textContent = `${remaining}개 남음`;
            progressRemaining.classList.remove('complete');
        }
    }

    filterGestures(searchTerm) {
        const term = searchTerm.toLowerCase();
        const cards = document.querySelectorAll('.gesture-card');
        cards.forEach(card => {
            const gesture = card.dataset.gesture.toLowerCase();
            card.style.display = gesture.includes(term) ? 'block' : 'none';
        });
    }

    async startCollectionCamera() {
        const video = document.getElementById('videoCollect');
        const canvas = document.getElementById('canvasCollect');
        const ctx = canvas.getContext('2d');

        this.collectHands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.collectHands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        this.collectHands.onResults((results) => {
            // Calculate FPS
            const now = Date.now();
            this.collectFPS = Math.round(1000 / (now - this.lastFrameTime));
            this.lastFrameTime = now;
            document.getElementById('quickFPS').textContent = this.collectFPS;

            // Set canvas size to match video element dimensions
            canvas.width = video.videoWidth || video.clientWidth;
            canvas.height = video.videoHeight || video.clientHeight;

            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Hand detection indicator
            const handBadge = document.getElementById('handDetectionBadge');
            const handText = document.getElementById('handDetectionText');

            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                handBadge.classList.add('detected');
                handText.textContent = `${results.multiHandLandmarks.length}개 손 감지됨`;

                // Draw skeleton for each hand if enabled
                if (this.showSkeletonCollect) {
                    results.multiHandLandmarks.forEach(landmarks => {
                        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
                        drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 5 });
                    });
                }

                // Record only the first hand for training
                if (this.isRecording && this.selectedGesture) {
                    const landmarks = results.multiHandLandmarks[0];
                    const normalized = this.model.preprocessLandmarks(landmarks);
                    if (normalized) {
                        this.collectedData.push({
                            label: this.selectedGesture,
                            landmarks: normalized
                        });
                        this.sessionCount++;
                        this.updateCollectionStats();
                        this.updateLiveProgress();

                        // Auto-save every 100 samples
                        if (this.autoSaveEnabled && this.sessionCount % 100 === 0) {
                            this.autoSave();
                        }
                    }
                }
            } else {
                handBadge.classList.remove('detected');
                handText.textContent = '손 감지 대기';
            }
            ctx.restore();
        });

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 }
            });
            video.srcObject = stream;

            this.collectCamera = new Camera(video, {
                onFrame: async () => {
                    await this.collectHands.send({ image: video });
                },
                width: 1280,
                height: 720
            });
            await this.collectCamera.start();

            document.getElementById('startCollectBtn').disabled = true;
            document.getElementById('stopCollectBtn').disabled = false;
            document.getElementById('recordBtn').disabled = false;
            document.getElementById('recordingStatus').textContent = '녹화 대기 중...';
        } catch (error) {
            alert('카메라 접근 실패: ' + error.message);
        }
    }

    stopCollectionCamera() {
        if (this.collectCamera) {
            this.collectCamera.stop();
        }
        const video = document.getElementById('videoCollect');
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        this.isRecording = false;
        document.getElementById('startCollectBtn').disabled = false;
        document.getElementById('stopCollectBtn').disabled = true;
        document.getElementById('recordBtn').disabled = true;
        document.getElementById('recordBtn').textContent = '녹화 시작';
        document.getElementById('recordBtn').classList.remove('btn-warning');
        document.getElementById('recordBtn').classList.add('btn-success');
        document.getElementById('recordingStatus').textContent = '카메라 정지됨';
    }

    toggleRecording() {
        if (!this.selectedGesture) {
            alert('먼저 수집할 동작을 선택해주세요!');
            return;
        }

        this.isRecording = !this.isRecording;
        const btn = document.getElementById('recordBtn');
        const indicator = document.getElementById('recordingIndicator');

        if (this.isRecording) {
            this.sessionCount = 0;
            btn.innerHTML = '⏹️ 녹화 중지';
            btn.classList.remove('btn-success');
            btn.classList.add('btn-warning');
            indicator.classList.add('active');
            document.getElementById('gestureSearch').disabled = true;
            document.querySelectorAll('.gesture-card').forEach(c => c.style.pointerEvents = 'none');
            document.getElementById('recordingStatus').textContent = `"${this.selectedGesture}" 녹화 중...`;
        } else {
            btn.innerHTML = '🔴 녹화 시작';
            btn.classList.remove('btn-warning');
            btn.classList.add('btn-success');
            indicator.classList.remove('active');
            document.getElementById('gestureSearch').disabled = false;
            document.querySelectorAll('.gesture-card').forEach(c => c.style.pointerEvents = 'auto');
            document.getElementById('recordingStatus').textContent = '녹화 대기 중...';
        }
    }

    updateCollectionStats() {
        document.getElementById('sessionCount').textContent = this.sessionCount;
        document.getElementById('totalCount').textContent = this.collectedData.length;

        // Update quick stats
        document.getElementById('quickSessionCount').textContent = this.sessionCount;
        const dataset = JSON.parse(localStorage.getItem('ksl_dataset') || '[]');
        document.getElementById('quickTotalCount').textContent = dataset.length + this.collectedData.length;

        const progress = Math.min((this.collectedData.length / 1000) * 100, 100);
        document.getElementById('progressBar').style.width = progress + '%';

        // Update gesture grid every 10 samples to avoid performance issues
        if (this.sessionCount % 10 === 0) {
            this.populateGestureGrid();
        }

        // Update training tab
        this.updateTrainingDataInfo();
    }

    autoSave() {
        const existingData = JSON.parse(localStorage.getItem('ksl_dataset') || '[]');
        const combined = [...existingData, ...this.collectedData];
        localStorage.setItem('ksl_dataset', JSON.stringify(combined));

        // Show notification
        const notification = document.getElementById('autoSaveNotification');
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 2000);

        // Clear collected data after auto-save
        this.collectedData = [];
        this.updateCollectionStats();
        this.populateGestureGrid();
        this.updateLiveProgress();
    }

    saveCollectedData() {
        if (this.collectedData.length === 0) {
            alert('수집된 데이터가 없습니다.');
            return;
        }

        // Save to localStorage
        const existingData = JSON.parse(localStorage.getItem('ksl_dataset') || '[]');
        const combined = [...existingData, ...this.collectedData];
        localStorage.setItem('ksl_dataset', JSON.stringify(combined));

        alert(`${this.collectedData.length}개의 데이터가 저장되었습니다!`);

        // Mark collect step as completed
        document.getElementById('flowCollect').classList.add('completed');

        // Clear session data
        this.collectedData = [];
        this.sessionCount = 0;

        // Update UI
        this.updateCollectionStats();
        this.populateGestureGrid();
        this.updateLiveProgress();
        this.updateTrainingDataInfo();
    }

    resetCollectedData() {
        if (confirm('정말로 수집된 데이터를 초기화하시겠습니까?')) {
            this.collectedData = [];
            this.sessionCount = 0;
            this.updateCollectionStats();
            document.getElementById('recordingStatus').textContent = '데이터 초기화됨';
        }
    }

    // ============================================
    // MODEL TRAINING
    // ============================================

    initializeTrainingUI() {
        document.getElementById('startTrainBtn').addEventListener('click', () => this.startTraining());
        document.getElementById('stopTrainBtn').addEventListener('click', () => this.stopTraining());

        // Preset selector
        document.getElementById('trainingPreset').addEventListener('change', (e) => {
            this.applyTrainingPreset(e.target.value);
        });

        // Sync sliders with number inputs
        this.setupSliderSync('epochs');
        this.setupSliderSync('batchSize');
        this.setupSliderSync('learningRate');

        document.getElementById('validationSplitSlider').addEventListener('input', (e) => {
            document.getElementById('validationSplitValue').textContent = (e.target.value * 100).toFixed(0) + '%';
        });

        this.updateTrainingDataInfo();
        this.initializeTrainingChart();
    }

    initializeTrainingChart() {
        const ctx = document.getElementById('trainingChart').getContext('2d');
        this.trainingChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: '학습 정확도',
                        data: [],
                        borderColor: '#4299e1',
                        backgroundColor: 'rgba(66, 153, 225, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '검증 정확도',
                        data: [],
                        borderColor: '#48bb78',
                        backgroundColor: 'rgba(72, 187, 120, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: '학습 손실',
                        data: [],
                        borderColor: '#f56565',
                        backgroundColor: 'rgba(245, 101, 101, 0.1)',
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y1'
                    },
                    {
                        label: '검증 손실',
                        data: [],
                        borderColor: '#ed8936',
                        backgroundColor: 'rgba(237, 137, 54, 0.1)',
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: '정확도 (%)'
                        },
                        min: 0,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: '손실'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Epoch'
                        }
                    }
                }
            }
        });
    }

    updateTrainingChart(epoch, trainAcc, valAcc, trainLoss, valLoss) {
        this.trainingChart.data.labels.push(epoch);
        this.trainingChart.data.datasets[0].data.push(trainAcc * 100);
        this.trainingChart.data.datasets[1].data.push(valAcc * 100);
        this.trainingChart.data.datasets[2].data.push(trainLoss);
        this.trainingChart.data.datasets[3].data.push(valLoss);
        this.trainingChart.update('none'); // Update without animation for better performance
    }

    resetTrainingChart() {
        this.trainingChart.data.labels = [];
        this.trainingChart.data.datasets.forEach(dataset => {
            dataset.data = [];
        });
        this.trainingChart.update();
    }

    setupSliderSync(name) {
        const slider = document.getElementById(`${name}Slider`);
        const input = document.getElementById(`${name}Input`);

        if (slider && input) {
            slider.addEventListener('input', (e) => {
                input.value = e.target.value;
                document.getElementById('trainingPreset').value = 'custom';
            });

            input.addEventListener('input', (e) => {
                slider.value = e.target.value;
                document.getElementById('trainingPreset').value = 'custom';
            });
        }
    }

    applyTrainingPreset(preset) {
        const presets = {
            fast: {
                epochs: 20,
                batchSize: 64,
                learningRate: 0.003,
                validationSplit: 0.15
            },
            balanced: {
                epochs: 50,
                batchSize: 32,
                learningRate: 0.001,
                validationSplit: 0.2
            },
            accurate: {
                epochs: 100,
                batchSize: 16,
                learningRate: 0.0005,
                validationSplit: 0.25
            },
            professional: {
                epochs: 150,
                batchSize: 8,
                learningRate: 0.0003,
                validationSplit: 0.25
            }
        };

        if (preset !== 'custom' && presets[preset]) {
            const config = presets[preset];

            // Update epochs
            document.getElementById('epochsInput').value = config.epochs;
            document.getElementById('epochsSlider').value = config.epochs;

            // Update batch size
            document.getElementById('batchSizeInput').value = config.batchSize;
            document.getElementById('batchSizeSlider').value = config.batchSize;

            // Update learning rate
            document.getElementById('learningRateInput').value = config.learningRate;
            document.getElementById('learningRateSlider').value = config.learningRate;

            // Update validation split
            document.getElementById('validationSplitSlider').value = config.validationSplit;
            document.getElementById('validationSplitValue').textContent = (config.validationSplit * 100).toFixed(0) + '%';
        }
    }

    updateTrainingDataInfo() {
        const dataset = JSON.parse(localStorage.getItem('ksl_dataset') || '[]');
        const uniqueGestures = [...new Set(dataset.map(d => d.label))];

        document.getElementById('datasetSize').textContent = dataset.length;
        document.getElementById('gestureTypes').textContent = uniqueGestures.length;

        // 최소 2종류 이상의 제스처가 있어야 학습 가능
        const canTrain = uniqueGestures.length >= 2;
        const isOptimal = dataset.length >= 100 && uniqueGestures.length >= 5;

        if (!canTrain) {
            document.getElementById('trainingReady').textContent = '❌ 최소 2종류 필요';
            document.getElementById('trainingReady').className = 'text-muted';
            document.getElementById('startTrainBtn').disabled = true;
        } else if (isOptimal) {
            document.getElementById('trainingReady').textContent = '✅ 준비됨';
            document.getElementById('trainingReady').className = 'text-success';
            document.getElementById('startTrainBtn').disabled = false;
        } else {
            document.getElementById('trainingReady').textContent = '⚠️ 학습 가능 (권장: 100개 이상)';
            document.getElementById('trainingReady').className = 'text-warning';
            document.getElementById('trainingReady').style.color = '#ecc94b';
            document.getElementById('startTrainBtn').disabled = false;
        }
    }

    async startTraining() {
        const dataset = JSON.parse(localStorage.getItem('ksl_dataset') || '[]');
        const uniqueGestures = [...new Set(dataset.map(d => d.label))];

        // 최소 조건 확인
        if (uniqueGestures.length < 2) {
            alert('학습을 시작하려면 최소 2종류 이상의 제스처가 필요합니다.');
            return;
        }

        // 권장 조건 미달 시 경고
        if (dataset.length < 100) {
            const confirmed = confirm(
                `⚠️ 경고\n\n` +
                `현재 데이터셋: ${dataset.length}개\n` +
                `권장 데이터셋: 100개 이상\n\n` +
                `데이터가 적으면 학습 정확도가 낮을 수 있습니다.\n` +
                `그래도 학습을 진행하시겠습니까?`
            );
            if (!confirmed) return;
        }

        if (uniqueGestures.length < 5) {
            const confirmed = confirm(
                `⚠️ 경고\n\n` +
                `현재 제스처 종류: ${uniqueGestures.length}개\n` +
                `권장 제스처 종류: 5개 이상\n\n` +
                `제스처 종류가 적으면 모델의 범용성이 낮을 수 있습니다.\n` +
                `그래도 학습을 진행하시겠습니까?`
            );
            if (!confirmed) return;
        }

        this.isTraining = true;
        document.getElementById('startTrainBtn').disabled = true;
        document.getElementById('stopTrainBtn').disabled = false;
        document.getElementById('trainingProgress').style.display = 'block';
        document.getElementById('trainingChartSection').style.display = 'block';

        // Reset chart
        this.resetTrainingChart();

        this.addLog('학습 시작...', 'info');

        // Get training parameters
        const epochs = parseInt(document.getElementById('epochsInput').value);
        const batchSize = parseInt(document.getElementById('batchSizeInput').value);
        const learningRate = parseFloat(document.getElementById('learningRateInput').value);
        const validationSplit = parseFloat(document.getElementById('validationSplitSlider').value);

        try {
            // Prepare dataset
            this.addLog('데이터셋 준비 중...', 'info');
            const labelMap = {};
            this.model.labels.forEach((label, idx) => {
                labelMap[label] = idx;
            });

            const validData = dataset.filter(d => labelMap[d.label] !== undefined);
            tf.util.shuffle(validData);

            const inputs = validData.map(d => d.landmarks);
            const labels = validData.map(d => labelMap[d.label]);

            const xs = tf.tensor3d(inputs, [inputs.length, 21, 3]);
            const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), this.model.labels.length);

            this.addLog(`학습 데이터: ${inputs.length}개`, 'success');

            // Create model
            this.addLog('모델 생성 중...', 'info');
            this.trainingModel = await this.model.createModel();

            // Compile with custom learning rate
            this.trainingModel.compile({
                optimizer: tf.train.adam(learningRate),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });

            this.addLog('학습 시작!', 'success');

            // Train
            await this.trainingModel.fit(xs, ys, {
                epochs: epochs,
                batchSize: batchSize,
                validationSplit: validationSplit,
                shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        if (!this.isTraining) return;

                        const progress = ((epoch + 1) / epochs) * 100;
                        document.getElementById('epochProgressBar').style.width = progress + '%';
                        document.getElementById('epochText').textContent = `${epoch + 1}/${epochs}`;

                        document.getElementById('trainAccuracy').textContent = (logs.acc * 100).toFixed(2) + '%';
                        document.getElementById('valAccuracy').textContent = (logs.val_acc * 100).toFixed(2) + '%';
                        document.getElementById('trainLoss').textContent = logs.loss.toFixed(4);
                        document.getElementById('valLoss').textContent = logs.val_loss.toFixed(4);

                        // Update real-time chart
                        this.updateTrainingChart(epoch + 1, logs.acc, logs.val_acc, logs.loss, logs.val_loss);

                        this.addLog(`Epoch ${epoch + 1}: 정확도 ${(logs.val_acc * 100).toFixed(2)}%`, 'success');
                    }
                }
            });

            // Save model
            this.addLog('모델 저장 중...', 'info');
            await this.trainingModel.save('localstorage://ksl-model');

            this.addLog('✅ 학습 완료! 모델이 저장되었습니다.', 'success');

            // Mark train step as completed
            document.getElementById('flowTrain').classList.add('completed');

            // Reload model for translation
            await this.loadModel();

            xs.dispose();
            ys.dispose();

        } catch (error) {
            this.addLog('❌ 학습 실패: ' + error.message, 'error');
            console.error(error);
        } finally {
            this.isTraining = false;
            document.getElementById('startTrainBtn').disabled = false;
            document.getElementById('stopTrainBtn').disabled = true;
        }
    }

    stopTraining() {
        // TensorFlow.js doesn't support stopping training mid-way easily
        alert('학습을 중단하려면 페이지를 새로고침하세요.');
    }

    addLog(message, type = 'info') {
        const log = document.getElementById('trainingLog');
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    // ============================================
    // REAL-TIME TRANSLATION
    // ============================================

    async initializeTranslationUI() {
        document.getElementById('startTranslateBtn').addEventListener('click', () => this.startTranslation());
        document.getElementById('stopTranslateBtn').addEventListener('click', () => this.stopTranslation());
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());

        // Skeleton toggle
        document.getElementById('skeletonToggleTranslate').addEventListener('change', (e) => {
            this.showSkeletonTranslate = e.target.checked;
        });
    }

    async loadModel() {
        try {
            // Try to load trained model from localStorage
            this.model.model = await tf.loadLayersModel('localstorage://ksl-model');
            this.model.isModelLoaded = true;
            console.log('✅ 학습된 모델 로드 완료!');
        } catch (error) {
            console.log('⚠️ 학습된 모델이 없습니다. 기본 모델을 사용합니다.');
            // Create a new model
            this.model.model = await this.model.createModel();
            this.model.isModelLoaded = true;
        }
    }

    async startTranslation() {
        const video = document.getElementById('videoTranslate');
        const canvas = document.getElementById('canvasTranslate');
        const ctx = canvas.getContext('2d');

        this.translateHands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.translateHands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        this.translateHands.onResults((results) => this.onTranslationResults(results, canvas, ctx));

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 }
            });
            video.srcObject = stream;

            this.translateCamera = new Camera(video, {
                onFrame: async () => {
                    await this.translateHands.send({ image: video });
                },
                width: 1280,
                height: 720
            });
            await this.translateCamera.start();

            this.isTranslating = true;
            document.getElementById('startTranslateBtn').disabled = true;
            document.getElementById('stopTranslateBtn').disabled = false;
            document.getElementById('statusText').textContent = '인식 중';
            document.getElementById('statusBadge').querySelector('.status-indicator').style.backgroundColor = '#48bb78';
        } catch (error) {
            alert('카메라 접근 실패: ' + error.message);
        }
    }

    stopTranslationCamera() {
        if (this.translateCamera) {
            this.translateCamera.stop();
        }
        const video = document.getElementById('videoTranslate');
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        this.isTranslating = false;
        document.getElementById('startTranslateBtn').disabled = false;
        document.getElementById('stopTranslateBtn').disabled = true;
        document.getElementById('statusText').textContent = '정지됨';
        document.getElementById('statusBadge').querySelector('.status-indicator').style.backgroundColor = '#f56565';
    }

    stopTranslation() {
        this.stopTranslationCamera();
    }

    async onTranslationResults(results, canvas, ctx) {
        const video = document.getElementById('videoTranslate');

        // Calculate FPS
        const now = Date.now();
        this.translateFPS = Math.round(1000 / (now - this.lastFrameTime));
        this.lastFrameTime = now;
        document.getElementById('translateFPS').textContent = this.translateFPS;

        // Set canvas size to match video element dimensions
        canvas.width = video.videoWidth || video.clientWidth;
        canvas.height = video.videoHeight || video.clientHeight;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Hand detection indicator
        const handBadge = document.getElementById('handDetectionBadgeTranslate');
        const handText = document.getElementById('handDetectionTextTranslate');

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            handBadge.classList.add('detected');
            handText.textContent = `${results.multiHandLandmarks.length}개 손 감지됨`;

            // Draw skeleton for each hand if enabled
            if (this.showSkeletonTranslate) {
                results.multiHandLandmarks.forEach(landmarks => {
                    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
                    drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 5 });
                });
            }

            // Predict only with the first hand
            if (this.isTranslating && this.model.isModelLoaded) {
                const landmarks = results.multiHandLandmarks[0];
                const result = await this.model.predict(landmarks);
                if (result && result.topProbability > 0.7) {
                    this.displayTranslationResult(result);
                }
            }
        } else {
            handBadge.classList.remove('detected');
            handText.textContent = '손 감지 대기';
        }
        ctx.restore();
    }

    displayTranslationResult(result) {
        document.getElementById('resultText').textContent = result.topLabel;
        document.getElementById('confidenceValue').textContent = (result.topProbability * 100).toFixed(1) + '%';
        document.getElementById('confidenceFill').style.width = (result.topProbability * 100) + '%';
        document.getElementById('confidenceStatus').textContent = '인식됨!';

        // Update statistics
        this.translateCount++;
        this.confidenceSum += result.topProbability;
        document.getElementById('translateCount').textContent = this.translateCount;
        document.getElementById('translateConfidence').textContent =
            ((this.confidenceSum / this.translateCount) * 100).toFixed(1) + '%';

        // Add to history
        if (!this.lastRecognized || this.lastRecognized !== result.topLabel || Date.now() - this.lastRecognizedTime > 2000) {
            this.addToHistory(result.topLabel, result.topProbability);
            this.lastRecognized = result.topLabel;
            this.lastRecognizedTime = Date.now();
        }
    }

    addToHistory(label, confidence) {
        const container = document.getElementById('historyContainer');

        // Remove empty message
        const empty = container.querySelector('.history-empty');
        if (empty) {
            empty.remove();
        }

        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-gesture">${this.getGestureEmoji(label)} ${label}</div>
            <div class="history-confidence">${(confidence * 100).toFixed(1)}%</div>
            <div class="history-time">${new Date().toLocaleTimeString()}</div>
        `;

        container.insertBefore(item, container.firstChild);

        // Keep only last 50 items
        while (container.children.length > 50) {
            container.removeChild(container.lastChild);
        }
    }

    clearHistory() {
        const container = document.getElementById('historyContainer');
        container.innerHTML = '<div class="history-empty">아직 인식 기록이 없습니다</div>';
    }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    window.kslWorkspace = new KSLWorkspace();
});
