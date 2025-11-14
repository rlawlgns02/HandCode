from flask import Flask, render_template, jsonify, request, send_from_directory
import os

app = Flask(__name__)

# 설정
app.config['SECRET_KEY'] = 'ksl-translator-secret-key'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# 라우트
@app.route('/')
def index():
    """메인 페이지 - 수어 통역"""
    return render_template('index.html')

@app.route('/train')
def train():
    """모델 학습 페이지"""
    return render_template('train.html')

@app.route('/collector')
def collector():
    """데이터 수집 페이지"""
    return render_template('collector.html')

@app.route('/workspace')
def workspace():
    """통합 워크스페이스 페이지"""
    return render_template('workspace.html')

@app.route('/api/model/info')
def model_info():
    """모델 정보 반환"""
    model_path = os.path.join('trained-model', 'model.json')
    has_trained_model = os.path.exists(model_path)

    return jsonify({
        'has_trained_model': has_trained_model,
        'model_path': model_path if has_trained_model else None,
        'supported_gestures': 32
    })

@app.route('/trained-model/<path:filename>')
def trained_model(filename):
    """학습된 모델 파일 서빙"""
    return send_from_directory('trained-model', filename)

@app.route('/static/<path:filename>')
def static_files(filename):
    """Static 파일 서빙 (CSS, JS 등)"""
    import os
    # Try static folder first
    static_path = os.path.join('static', filename)
    if os.path.exists(static_path):
        return send_from_directory('static', filename)
    # Try root directory for legacy files
    if os.path.exists(filename):
        return send_from_directory('.', filename)
    return '', 404

@app.route('/favicon.ico')
def favicon():
    """Favicon 처리 (404 에러 방지)"""
    return '', 204  # No Content

@app.route('/api/data/stats')
def data_stats():
    """데이터셋 통계 반환"""
    data_dir = 'data'
    stats = {
        'total_gestures': 0,
        'total_samples': 0,
        'gestures': []
    }

    if os.path.exists(data_dir):
        import json
        for root, dirs, files in os.walk(data_dir):
            for file in files:
                if file.endswith('.json'):
                    try:
                        file_path = os.path.join(root, file)
                        with open(file_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            if 'dataset' in data and len(data['dataset']) > 0:
                                label = data['dataset'][0].get('label', 'Unknown')
                                count = len(data['dataset'])
                                stats['gestures'].append({
                                    'label': label,
                                    'count': count,
                                    'file': file
                                })
                                stats['total_samples'] += count
                    except Exception as e:
                        print(f"Error reading {file}: {e}")

        stats['total_gestures'] = len(stats['gestures'])

    return jsonify(stats)

@app.errorhandler(404)
def not_found(error):
    """404 에러 처리"""
    return jsonify({
        'error': '404 Not Found',
        'message': 'The requested resource was not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    """500 에러 처리"""
    return jsonify({
        'error': '500 Internal Server Error',
        'message': 'An internal error occurred'
    }), 500

if __name__ == '__main__':
    print('=' * 50)
    print('   KSL 수어 통역 시스템')
    print('   Flask Web Application')
    print('=' * 50)
    print('')
    print('>> 서버 시작 중...')
    print('>> 주소: http://localhost:5000')
    print('')
    print('사용 가능한 페이지:')
    print('  - http://localhost:5000/          : 메인 (수어 통역)')
    print('  - http://localhost:5000/workspace : 통합 워크스페이스 [NEW!]')
    print('  - http://localhost:5000/train     : 모델 학습')
    print('  - http://localhost:5000/collector : 데이터 수집')
    print('')
    print('종료하려면 Ctrl+C를 누르세요.')
    print('')

    app.run(debug=True, host='0.0.0.0', port=5000)
