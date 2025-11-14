class DataCollectorApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');

        // Buttons
        this.startBtn = document.getElementById('startBtn');
        this.recordBtn = document.getElementById('recordBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.resetBtn = document.getElementById('resetBtn');

        // UI Elements
        this.gestureSelect = document.getElementById('gestureSelect');
        this.currentGestureSpan = document.getElementById('currentGesture');
        this.sessionCountSpan = document.getElementById('sessionCount');
        this.totalCountSpan = document.getElementById('totalCount');
        this.recordingStatusSpan = document.getElementById('recordingStatus');

        // App state
        this.hands = null;
        this.camera = null;
        this.model = new SignLanguageModel(); // For using its labels and preprocessing
        this.isCameraStarted = false;
        this.isRecording = false;
        
        // Data
        this.collectedData = [];
        this.sessionCount = 0;
    }

    initialize() {
        this.populateGestureSelect();
        this.setupEventListeners();
        console.log('Data Collector Initialized');
    }

    populateGestureSelect() {
        // Exclude '대기' (idle) from collection
        const labels = this.model.labels.filter(label => label !== '대기');
        labels.forEach(label => {
            const option = document.createElement('option');
            option.value = label;
            option.textContent = label;
            this.gestureSelect.appendChild(option);
        });
        this.currentGestureSpan.textContent = this.gestureSelect.value;
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.stopBtn.addEventListener('click', () => this.stopCamera());
        this.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.downloadBtn.addEventListener('click', () => this.downloadData());
        this.resetBtn.addEventListener('click', () => this.resetData());
        this.gestureSelect.addEventListener('change', (e) => {
            this.currentGestureSpan.textContent = e.target.value;
        });
    }

    async startCamera() {
        this.hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        this.hands.onResults((results) => this.onResults(results));

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 }
            });
            this.video.srcObject = stream;
        } catch (error) {
            alert('카메라에 접근할 수 없습니다. 권한을 확인해주세요.');
            console.error(error);
            return;
        }

        this.camera = new Camera(this.video, {
            onFrame: async () => {
                await this.hands.send({ image: this.video });
            },
            width: 1280,
            height: 720
        });
        await this.camera.start();

        this.isCameraStarted = true;
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.recordBtn.disabled = false;
        this.recordingStatusSpan.textContent = '녹화 대기 중...';
    }

    stopCamera() {
        if (this.camera) {
            this.camera.stop();
        }
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
        }
        this.isCameraStarted = false;
        this.isRecording = false;

        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.recordBtn.disabled = true;
        this.recordBtn.textContent = '녹화 시작';
        this.recordBtn.classList.remove('btn-warning');
        this.recordBtn.classList.add('btn-success');
        this.recordingStatusSpan.textContent = '카메라 정지됨.';
    }

    toggleRecording() {
        this.isRecording = !this.isRecording;
        if (this.isRecording) {
            this.sessionCount = 0;
            this.sessionCountSpan.textContent = this.sessionCount;
            this.recordBtn.textContent = '녹화 중지';
            this.recordBtn.classList.remove('btn-success');
            this.recordBtn.classList.add('btn-warning');
            this.gestureSelect.disabled = true;
            this.recordingStatusSpan.textContent = `"${this.gestureSelect.value}" 동작을 녹화 중...`;
        } else {
            this.recordBtn.textContent = '녹화 시작';
            this.recordBtn.classList.remove('btn-warning');
            this.recordBtn.classList.add('btn-success');
            this.gestureSelect.disabled = false;
            this.recordingStatusSpan.textContent = '녹화 대기 중...';
        }
    }

    onResults(results) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.width = results.image.width;
        this.canvas.height = results.image.height;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            drawConnectors(this.ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(this.ctx, landmarks, { color: '#FF0000', lineWidth: 2, radius: 5 });

            if (this.isRecording) {
                const normalizedLandmarks = this.model.preprocessLandmarks(landmarks);
                if (normalizedLandmarks) {
                    this.collectedData.push({
                        label: this.gestureSelect.value,
                        landmarks: normalizedLandmarks
                    });
                    this.sessionCount++;
                    this.totalCountSpan.textContent = this.collectedData.length;
                    this.sessionCountSpan.textContent = this.sessionCount;
                }
            }
        }
        this.ctx.restore();
    }

    downloadData() {
        if (this.collectedData.length === 0) {
            alert('수집된 데이터가 없습니다.');
            return;
        }

        const dataStr = JSON.stringify({ dataset: this.collectedData }, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ksl_dataset_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.recordingStatusSpan.textContent = `${this.collectedData.length}개의 데이터를 다운로드했습니다.`;
    }

    resetData() {
        if (confirm('정말로 전체 데이터를 리셋하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            this.collectedData = [];
            this.sessionCount = 0;
            this.totalCountSpan.textContent = '0';
            this.sessionCountSpan.textContent = '0';
            this.recordingStatusSpan.textContent = '데이터가 리셋되었습니다.';
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const app = new DataCollectorApp();
    app.initialize();
});
