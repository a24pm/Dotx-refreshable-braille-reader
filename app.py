"""
Braille Script Web Application
Main Flask server with OCR, Braille serial, and AI chatbot endpoints.
"""

import os
import uuid
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

load_dotenv()

from ocr_handler import extract_text
from serial_mock import BrailleController, MockSerial
from groq_chat import get_response

# ─── App Setup ───────────────────────────────────────────────
app = Flask(__name__)
app.config['SECRET_KEY'] = 'braille-app-secret-key'
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ─── Braille Controller (Auto-connect to Hardware or Mock) ───
serial_port = MockSerial(port='COM4', baudrate=115200)
braille = BrailleController(serial_port=serial_port)

# ─── Conversation History ────────────────────────────────────
chat_history = []

# ─── Allowed File Extensions ────────────────────────────────
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'webp', 'pdf', 'docx', 'txt'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ═══════════════════════════════════════════════════════════════
# ROUTES
# ═══════════════════════════════════════════════════════════════

@app.route('/')
def index():
    """Serve the main page."""
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    """
    Upload an image or document and extract text via OCR.
    Returns JSON with extracted text.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': f'Unsupported file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    # Save file with unique name
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    try:
        import re
        raw_text = extract_text(filepath)
        if not raw_text:
            return jsonify({'error': 'No text could be extracted from the file'}), 400
            
        # Clean text: keep alphanumeric, whitespace, and supported punctuation (#.,?'")
        clean_text = re.sub(r'[^a-zA-Z0-9\s#.,?\'"]', '', raw_text)
        text = re.sub(r'\s+', ' ', clean_text).strip()
        
        return jsonify({
            'success': True,
            'text': text,
            'filename': file.filename,
            'char_count': len(text)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up uploaded file
        try:
            os.remove(filepath)
        except OSError:
            pass


@app.route('/chat', methods=['POST'])
def chat():
    """
    AI Chatbot endpoint.
    Accepts a text question, returns AI-generated answer.
    """
    data = request.get_json()
    if not data or 'question' not in data:
        return jsonify({'error': 'No question provided'}), 400

    question = data['question'].strip()
    if not question:
        return jsonify({'error': 'Empty question'}), 400

    # Add to history
    chat_history.append({"role": "user", "content": question})

    # Get AI response
    answer = get_response(question, chat_history)

    # Add response to history
    chat_history.append({"role": "assistant", "content": answer})

    return jsonify({
        'success': True,
        'answer': answer
    })


@app.route('/start-braille', methods=['POST'])
def start_braille():
    """
    Start sending text to the Braille display.
    Sends 5 characters at a time via serial (mocked).
    """
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400

    text = data['text'].strip()
    if not text:
        return jsonify({'error': 'Empty text'}), 400

    def on_chunk(chunk, idx, total):
        """Called for each 5-char chunk sent to serial."""
        socketio.emit('braille_update', {
            'chunk': chunk,
            'index': idx,
            'total': total,
            'progress': round((idx + 1) / total * 100, 1)
        })
        spaced_chunk = ' '.join(list(chunk))
        socketio.emit('serial_log', {
            'message': f"TX [{idx+1}/{total}]: '{spaced_chunk}'"
        })

    def on_complete():
        """Called when all chunks are sent."""
        socketio.emit('braille_complete', {
            'message': 'All characters sent to Braille display'
        })
        socketio.emit('serial_log', {
            'message': '── Cycle Complete ──'
        })

    braille.start(text, on_chunk=on_chunk, on_complete=on_complete)

    # Calculate total chunks for response
    clean = ''.join(c for c in text if c.isprintable())
    total_chunks = (len(clean) + 4) // 5

    return jsonify({
        'success': True,
        'message': f'Braille cycle started: {total_chunks} chunks of 5 characters',
        'total_chunks': total_chunks
    })


@app.route('/stop-braille', methods=['POST'])
def stop_braille():
    """Stop the current Braille serial cycle."""
    braille.stop()
    socketio.emit('serial_log', {
        'message': '── Stopped by user ──'
    })
    return jsonify({'success': True, 'message': 'Braille cycle stopped'})


# ═══════════════════════════════════════════════════════════════
# WEBSOCKET EVENTS
# ═══════════════════════════════════════════════════════════════

@socketio.on('connect')
def handle_connect():
    print('[WebSocket] Client connected')
    emit('serial_log', {'message': '── Connected to Braille Serial Monitor ──'})


@socketio.on('disconnect')
def handle_disconnect():
    print('[WebSocket] Client disconnected')


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("=" * 50)
    print("  Braille Script Web Application")
    print("  http://localhost:5000")
    print("=" * 50)

    # Check for Groq API key
    if not os.environ.get('GROQ_API_KEY'):
        print("\n  ⚠ WARNING: GROQ_API_KEY not set!")
        print("  AI Chatbot will not work without it.")
        print("  Set it with: set GROQ_API_KEY=your_key_here\n")

    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
