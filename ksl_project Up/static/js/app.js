// 로딩 진행률 업데이트 헬퍼 함수
function updateLoadingProgress(percent, text) {
    const progressBar = document.getElementById('progressBar');
    const loadingText = document.getElementById('loadingText');
    
    if (progressBar) {
        progressBar.style.width = percent + '%';
    }
    if (loadingText) {
        loadingText.textContent = text;
    }
}

// 메인 애플리케이션
class SignLanguageApp {
    constructor() {
        this.camera = null;
        this.hands = null;
        this.model = null;
        this.isRunning = false;
        this.showSkeleton = true;
        this.showDetail = false;
        
        // 설정
        this.confidenceThreshold = 85;
        this.stabilityTime = 500;
        this.minDetectionConfidence = 0.5;
        this.modelComplexity = 1;
        
        // 통계
        this.stats = {
            totalRecognitions: 0,
            confidenceSum: 0,
            sessionStart: null,
            recognitionHistory: []
        };
        
        // 제스처 안정화
        this.gestureBuffer = [];
        this.bufferSize = 10;
        this.lastGesture = null;
        this.gestureStartTime = 0;
        
        // FPS
        this.frameCount = 0;
        this.lastFPSUpdate = Date.now();
        this.fps = 0;
    }

    // 초기화
    async initialize() {
        try {
            // UI 이벤트 리스너 등록
            this.setupEventListeners();
            
            // 지원 수어 목록 표시
            this.displayGesturesList();
            
            // 모델 로딩
            document.getElementById('loadingOverlay').classList.add('active');
            
            this.model = new SignLanguageModel();
            const success = await this.model.initialize(updateLoadingProgress);
            
            if (!success) {
                throw new Error('모델 초기화 실패');
            }
            
            document.getElementById('loadingOverlay').classList.remove('active');
            document.getElementById('modelStatus').textContent = '모델 준비됨';
            
            console.log('✅ 앱 초기화 완료');
            
        } catch (error) {
            console.error('❌ 초기화 오류:', error);
            alert('앱 초기화에 실패했습니다.\n' + error.message);
            document.getElementById('loadingOverlay').classList.remove('active');
        }
    }

    // 이벤트 리스너 설정
    setupEventListeners() {
        // 시작/정지 버튼
        document.getElementById('startBtn').addEventListener('click', () => this.start());
        document.getElementById('stopBtn').addEventListener('click', () => this.stop());
        
        // 설정 슬라이더
        document.getElementById('thresholdSlider').addEventListener('input', (e) => {
            this.confidenceThreshold = parseInt(e.target.value);
            document.getElementById('thresholdValue').textContent = this.confidenceThreshold + '%';
        });
        
        document.getElementById('stabilitySlider').addEventListener('input', (e) => {
            this.stabilityTime = parseInt(e.target.value);
            document.getElementById('stabilityValue').textContent = this.stabilityTime + 'ms';
        });

        document.getElementById('minDetectionConfidenceSlider').addEventListener('input', (e) => {
            this.minDetectionConfidence = parseFloat(e.target.value);
            document.getElementById('minDetectionConfidenceValue').textContent = this.minDetectionConfidence.toFixed(1);
            if (this.hands) {
                this.hands.setOptions({ minDetectionConfidence: this.minDetectionConfidence });
            }
        });

        document.getElementById('modelComplexitySlider').addEventListener('input', (e) => {
            this.modelComplexity = parseInt(e.target.value);
            document.getElementById('modelComplexityValue').textContent = this.modelComplexity === 0 ? '간단' : '정확';
            if (this.hands) {
                this.hands.setOptions({ modelComplexity: this.modelComplexity });
            }
        });
        
        // 토글
        document.getElementById('skeletonToggle').addEventListener('change', (e) => {
            this.showSkeleton = e.target.checked;
        });
        
        document.getElementById('detailToggle').addEventListener('change', (e) => {
            this.showDetail = e.target.checked;
            document.getElementById('predictionCard').style.display = e.target.checked ? 'block' : 'none';
        });
        
        // 기타 버튼
        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    }

    // 카메라 시작
    async start() {
        try {
            document.getElementById('loadingOverlay').classList.add('active');
            updateLoadingProgress(20, '카메라 초기화 중...');
            
            // MediaPipe Hands 초기화
            this.hands = new Hands({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });

            this.hands.setOptions({
                maxNumHands: 2,
                modelComplexity: this.modelComplexity,
                minDetectionConfidence: this.minDetectionConfidence,
                minTrackingConfidence: 0.7
            });

            this.hands.onResults((results) => this.onResults(results));

            updateLoadingProgress(50, '카메라 액세스 중...');
            
            const video = document.getElementById('video');
            let stream;
            
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 1280, height: 720, facingMode: 'user' }
                });
            } catch (e) {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: 'user' }
                });
            }

            video.srcObject = stream;
            
            await new Promise(resolve => {
                video.onloadedmetadata = resolve;
            });

            updateLoadingProgress(80, '카메라 시작 중...');
            
            this.camera = new Camera(video, {
                onFrame: async () => {
                    await this.hands.send({ image: video });
                    this.updateFPS();
                },
                width: 1280,
                height: 720
            });

            await this.camera.start();

            updateLoadingProgress(100, '시작 완료!');
            
            this.isRunning = true;
            this.stats.sessionStart = Date.now();
            
            document.getElementById('startBtn').disabled = true;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('videoOverlay').classList.add('hidden');
            document.getElementById('statusBadge').classList.add('active');
            document.getElementById('statusText').textContent = '실행 중';
            
            setTimeout(() => {
                document.getElementById('loadingOverlay').classList.remove('active');
            }, 500);
            
            this.updateSessionTime();
            
        } catch (error) {
            console.error('카메라 시작 오류:', error);
            
            let errorMessage = '카메라를 시작할 수 없습니다.\n\n';
            
            if (error.name === 'NotReadableError') {
                errorMessage += '카메라가 이미 사용 중입니다.\n다른 프로그램을 종료하고 다시 시도하세요.';
            } else if (error.name === 'NotAllowedError') {
                errorMessage += '카메라 권한이 거부되었습니다.\n브라우저 설정에서 카메라 권한을 허용해주세요.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += '카메라를 찾을 수 없습니다.\n카메라가 연결되어 있는지 확인해주세요.';
            } else {
                errorMessage += error.message;
            }
            
            alert(errorMessage);
            document.getElementById('loadingOverlay').classList.remove('active');
        }
    }

    // 카메라 정지
    stop() {
        if (this.camera) {
            this.camera.stop();
        }

        const video = document.getElementById('video');
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        this.isRunning = false;
        this.stats.sessionStart = null;
        
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('videoOverlay').classList.remove('hidden');
        document.getElementById('statusBadge').classList.remove('active');
        document.getElementById('statusText').textContent = '정지됨';
        
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        document.getElementById('fpsCounter').textContent = '0 FPS';
        document.getElementById('handsCounter').textContent = '0 손';
    }

    // MediaPipe 결과 처리
    async onResults(results) {
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = results.image.width;
        canvas.height = results.image.height;

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const numHands = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
        document.getElementById('handsCounter').textContent = numHands + ' 손';

        if (results.multiHandLandmarks && this.showSkeleton) {
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness?.[i];
                const isLeft = handedness?.label === 'Left';

                drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
                    color: isLeft ? '#4a5568' : '#2d3748',
                    lineWidth: 5
                });

                drawLandmarks(ctx, landmarks, {
                    color: '#ffffff',
                    fillColor: isLeft ? '#718096' : '#2d3748',
                    lineWidth: 2,
                    radius: 6
                });
            }
        }

        ctx.restore();

        // AI 예측
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            await this.predictGesture(results.multiHandLandmarks[0]);
        } else {
            this.resetPrediction();
        }
    }

    // 제스처 예측
    async predictGesture(landmarks) {
        const prediction = await this.model.predict(landmarks);
        
        if (!prediction) {
            return;
        }

        const { topLabel, topProbability, predictions } = prediction;
        const confidencePercent = Math.round(topProbability * 100);

        // 제스처 버퍼에 추가 (안정화)
        this.gestureBuffer.push({ label: topLabel, confidence: topProbability });
        if (this.gestureBuffer.length > this.bufferSize) {
            this.gestureBuffer.shift();
        }

        // 가장 많이 나타난 제스처 찾기
        const gestureCounts = {};
        this.gestureBuffer.forEach(g => {
            gestureCounts[g.label] = (gestureCounts[g.label] || 0) + 1;
        });

        const stableGesture = Object.keys(gestureCounts).reduce((a, b) => 
            gestureCounts[a] > gestureCounts[b] ? a : b
        );

        const stability = (gestureCounts[stableGesture] / this.gestureBuffer.length) * 100;

        // UI 업데이트
        this.updateConfidence(confidencePercent);
        
        if (this.showDetail) {
            this.updatePredictions(predictions);
        }

        // 신뢰도가 임계값을 넘고 안정적이면 인식
        const currentTime = Date.now();
        
        if (stableGesture === this.lastGesture) {
            const elapsed = currentTime - this.gestureStartTime;
            
            if (elapsed > this.stabilityTime && 
                confidencePercent >= this.confidenceThreshold && 
                stability >= 70 &&
                topLabel !== '대기') {
                
                this.recognizeGesture(topLabel, confidencePercent);
            }
        } else {
            this.lastGesture = stableGesture;
            this.gestureStartTime = currentTime;
        }

        // 상태 메시지
        if (confidencePercent >= this.confidenceThreshold) {
            document.getElementById('confidenceStatus').textContent = 
                `${stability.toFixed(0)}% 안정 - 인식 중...`;
        } else {
            document.getElementById('confidenceStatus').textContent = 
                `신뢰도 ${confidencePercent}% (임계값: ${this.confidenceThreshold}%)`;
        }
    }

    // 제스처 인식 처리
    recognizeGesture(label, confidence) {
        const resultText = document.getElementById('resultText');
        
        if (resultText.textContent !== label) {
            resultText.textContent = label;
            resultText.classList.remove('waiting');
            
            // 애니메이션
            resultText.style.animation = 'none';
            setTimeout(() => {
                resultText.style.animation = '';
            }, 10);

            // 기록에 추가
            this.addToHistory(label, confidence);

            // 통계 업데이트
            this.stats.totalRecognitions++;
            this.stats.confidenceSum += confidence;
            this.stats.recognitionHistory.push({
                label,
                confidence,
                timestamp: new Date().toISOString()
            });

            this.updateStats();
        }
    }

    // 예측 초기화
    resetPrediction() {
        this.gestureBuffer = [];
        document.getElementById('confidenceStatus').textContent = '손을 보여주세요';
    }

    // 신뢰도 업데이트
    updateConfidence(percent) {
        document.getElementById('confidenceValue').textContent = percent + '%';
        document.getElementById('confidenceFill').style.width = percent + '%';
    }

    // 예측 목록 업데이트
    updatePredictions(predictions) {
        const list = document.getElementById('predictionsList');
        list.innerHTML = '';

        predictions.forEach((pred, index) => {
            const percent = Math.round(pred.probability * 100);
            
            const item = document.createElement('div');
            item.className = 'prediction-item';
            item.innerHTML = `
                <div class="prediction-rank">${index + 1}</div>
                <div class="prediction-label">${pred.label}</div>
                <div class="prediction-bar">
                    <div class="prediction-bar-fill" style="width: ${percent}%"></div>
                </div>
                <div class="prediction-percent">${percent}%</div>
            `;
            
            list.appendChild(item);
        });
    }

    // 기록에 추가
    addToHistory(label, confidence) {
        const container = document.getElementById('historyContainer');

        if (container.querySelector('.history-empty')) {
            container.innerHTML = '';
        }

        const time = new Date().toLocaleTimeString('ko-KR');

        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-header">
                <div class="history-time">${time}</div>
                <div class="history-confidence">${confidence}%</div>
            </div>
            <div class="history-text">${label}</div>
        `;

        container.insertBefore(item, container.firstChild);

        while (container.children.length > 100) {
            container.removeChild(container.lastChild);
        }
    }

    // 기록 삭제
    clearHistory() {
        const container = document.getElementById('historyContainer');
        container.innerHTML = '<div class="history-empty">아직 인식 기록이 없습니다</div>';
        
        document.getElementById('resultText').textContent = '수어를 보여주세요';
        document.getElementById('resultText').classList.add('waiting');
        
        this.updateConfidence(0);
        this.stats.totalRecognitions = 0;
        this.stats.confidenceSum = 0;
        this.stats.recognitionHistory = [];
        this.updateStats();
    }

    // 통계 업데이트
    updateStats() {
        document.getElementById('totalRecognitions').textContent = this.stats.totalRecognitions;
        
        const avgConfidence = this.stats.totalRecognitions > 0 
            ? Math.round(this.stats.confidenceSum / this.stats.totalRecognitions)
            : 0;
        
        document.getElementById('avgConfidence').textContent = avgConfidence + '%';
        document.getElementById('accuracy').textContent = avgConfidence + '%';
    }

    // 세션 시간 업데이트
    updateSessionTime() {
        if (!this.stats.sessionStart) return;

        const elapsed = Date.now() - this.stats.sessionStart;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        document.getElementById('sessionTime').textContent = 
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        if (this.isRunning) {
            requestAnimationFrame(() => this.updateSessionTime());
        }
    }

    // FPS 업데이트
    updateFPS() {
        this.frameCount++;
        const now = Date.now();
        const elapsed = now - this.lastFPSUpdate;

        if (elapsed >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / elapsed);
            document.getElementById('fpsCounter').textContent = this.fps + ' FPS';
            this.frameCount = 0;
            this.lastFPSUpdate = now;
        }
    }

    // 지원 수어 목록 표시
    displayGesturesList() {
        const grid = document.getElementById('gesturesGrid');
        const gestures = [
            { icon: '👋', name: '안녕하세요' },
            { icon: '🙏', name: '감사합니다' },
            { icon: '👍', name: '좋아요' },
            { icon: '👎', name: '싫어요' },
            { icon: '👌', name: '확인' },
            { icon: '✌️', name: '평화' },
            { icon: '🤟', name: '사랑해요' },
            { icon: '1️⃣', name: '하나' },
            { icon: '2️⃣', name: '둘' },
            { icon: '3️⃣', name: '셋' },
            { icon: '4️⃣', name: '넷' },
            { icon: '5️⃣', name: '다섯' },
            { icon: '✊', name: '주먹' },
            { icon: '☝️', name: '가리키기' },
            { icon: '✋', name: '멈춰' },
            { icon: '🤘', name: '락' }
        ];

        gestures.forEach(gesture => {
            const item = document.createElement('div');
            item.className = 'gesture-item';
            item.innerHTML = `
                <div class="gesture-icon">${gesture.icon}</div>
                <div>${gesture.name}</div>
            `;
            grid.appendChild(item);
        });
    }

    // 데이터 내보내기
    exportData() {
        if (this.stats.recognitionHistory.length === 0) {
            alert('내보낼 데이터가 없습니다.');
            return;
        }

        const data = {
            exportDate: new Date().toISOString(),
            totalRecognitions: this.stats.totalRecognitions,
            averageConfidence: Math.round(this.stats.confidenceSum / this.stats.totalRecognitions),
            history: this.stats.recognitionHistory
        };

        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `수어인식_데이터_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

// 앱 초기화
let app;

window.addEventListener('DOMContentLoaded', async () => {
    app = new SignLanguageApp();
    await app.initialize();
});

window.addEventListener('beforeunload', () => {
    if (app && app.isRunning) {
        app.stop();
    }
});
