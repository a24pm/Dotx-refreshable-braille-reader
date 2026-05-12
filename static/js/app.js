/* ═══════════════════════════════════════════════════════════════
   Braille Script — Frontend Application Logic
   Handles: File Upload, Braille Display, Voice Chat, Serial Monitor
   ═══════════════════════════════════════════════════════════════ */

// ─── Socket.IO Connection ───────────────────────────────────
const socket = io();
let logCount = 0;

// ─── State ──────────────────────────────────────────────────
let extractedContent = '';
let isRecording = false;
let recognition = null;
let speechSynth = window.speechSynthesis;
let currentUtterance = null;

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    initDropZone();
    initChatInput();
    initSpeechRecognition();
    initSocketListeners();
});

// ═══════════════════════════════════════════════════════════════
// FILE UPLOAD & OCR
// ═══════════════════════════════════════════════════════════════

function initDropZone() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    // Click to browse
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });

    // File selected via input
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });

    // Drag & Drop events
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });
}

async function uploadFile(file) {
    const progressEl = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('uploadProgressFill');
    const progressText = document.getElementById('uploadProgressText');

    // Show progress
    progressEl.hidden = false;
    progressFill.style.width = '20%';
    progressText.textContent = `Uploading "${file.name}"...`;

    const formData = new FormData();
    formData.append('file', file);

    try {
        progressFill.style.width = '50%';
        progressText.textContent = 'Extracting text via OCR...';

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            progressFill.style.width = '100%';
            progressText.textContent = 'Text extracted successfully!';

            extractedContent = data.text;
            showExtractedText(data.text, data.filename, data.char_count);
            showToast('Text extracted successfully!', 'success');

            // Announce to screen readers
            announceToScreenReader(`Text extracted from ${data.filename}. ${data.char_count} characters found.`);
            
            // Auto-start Braille transmission
            setTimeout(() => sendToBraille(data.text), 500);
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        progressFill.style.width = '100%';
        progressFill.style.background = 'var(--accent-red)';
        progressText.textContent = `Error: ${error.message}`;
        showToast(error.message, 'error');
    }

    // Hide progress after delay
    setTimeout(() => {
        progressEl.hidden = true;
        progressFill.style.width = '0%';
        progressFill.style.background = '';
    }, 3000);
}

function showExtractedText(text, filename, charCount) {
    const container = document.getElementById('extractedTextContainer');
    const textEl = document.getElementById('extractedText');
    const filenameEl = document.getElementById('extractedFilename');
    const charCountEl = document.getElementById('extractedCharCount');

    container.hidden = false;
    textEl.textContent = text;
    filenameEl.textContent = `📄 ${filename}`;
    charCountEl.textContent = `${charCount} chars`;
}

function clearExtracted() {
    document.getElementById('extractedTextContainer').hidden = true;
    document.getElementById('extractedText').textContent = '';
    extractedContent = '';
    // Reset file input
    document.getElementById('fileInput').value = '';
}

// ═══════════════════════════════════════════════════════════════
// BRAILLE DISPLAY & SERIAL
// ═══════════════════════════════════════════════════════════════

async function sendToBraille(text) {
    const content = text || extractedContent;
    if (!content) {
        showToast('No text to send to Braille display', 'error');
        return;
    }

    try {
        const response = await fetch('/start-braille', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: content })
        });

        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'info');
            document.getElementById('stopBrailleBtn').disabled = false;
            document.getElementById('brailleProgressContainer').hidden = false;
            announceToScreenReader('Braille cycle started. Sending characters to display.');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        showToast(`Braille error: ${error.message}`, 'error');
    }
}

async function stopBraille() {
    try {
        await fetch('/stop-braille', { method: 'POST' });
        document.getElementById('stopBrailleBtn').disabled = true;
        resetBrailleCells();
        showToast('Braille cycle stopped', 'info');
        announceToScreenReader('Braille cycle stopped.');
    } catch (error) {
        showToast('Failed to stop Braille', 'error');
    }
}

function updateBrailleCells(chunk) {
    const chars = chunk.split('');
    for (let i = 0; i < 5; i++) {
        const cell = document.getElementById(`cell${i}`);
        const charEl = cell.querySelector('.cell-char');

        if (i < chars.length) {
            charEl.textContent = chars[i] === ' ' ? '⎵' : chars[i];
            cell.classList.add('active');
        } else {
            charEl.textContent = '—';
            cell.classList.remove('active');
        }
    }
}

function resetBrailleCells() {
    for (let i = 0; i < 5; i++) {
        const cell = document.getElementById(`cell${i}`);
        cell.querySelector('.cell-char').textContent = '—';
        cell.classList.remove('active');
    }
    document.getElementById('brailleProgressContainer').hidden = true;
}

// ═══════════════════════════════════════════════════════════════
// AI CHATBOT
// ═══════════════════════════════════════════════════════════════

function initChatInput() {
    const input = document.getElementById('chatInput');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChat();
        }
    });
}

async function sendChat() {
    const input = document.getElementById('chatInput');
    const question = input.value.trim();

    if (!question) return;

    // Clear input
    input.value = '';

    // Add user bubble
    addChatBubble(question, 'user');

    // Show typing indicator
    const typingId = showTypingIndicator();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });

        const data = await response.json();

        // Remove typing indicator
        removeTypingIndicator(typingId);

        if (data.success) {
            addChatBubble(data.answer, 'assistant');

            // Speak the answer (Disabled by user request)
            // speakResponse(data.answer);
        } else {
            addChatBubble(`Error: ${data.error}`, 'assistant');
        }
    } catch (error) {
        removeTypingIndicator(typingId);
        addChatBubble(`Connection error: ${error.message}`, 'assistant');
    }
}

function addChatBubble(text, role) {
    const messagesEl = document.getElementById('chatMessages');

    // Remove welcome message if present
    const welcome = messagesEl.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;

    const label = document.createElement('div');
    label.className = 'bubble-label';
    label.textContent = role === 'user' ? 'You' : 'AI Assistant';

    const content = document.createElement('div');
    content.className = 'bubble-content';
    content.textContent = text;

    bubble.appendChild(label);
    bubble.appendChild(content);

    // Add action buttons for assistant messages
    if (role === 'assistant') {
        const actions = document.createElement('div');
        actions.className = 'bubble-actions';

        const speakBtn = document.createElement('button');
        speakBtn.className = 'bubble-action-btn';
        speakBtn.textContent = '🔊 Read Aloud';
        speakBtn.onclick = () => speakResponse(text);

        const brailleBtn = document.createElement('button');
        brailleBtn.className = 'bubble-action-btn';
        brailleBtn.textContent = '⠿ Send to Braille';
        brailleBtn.onclick = () => sendToBraille(text);

        actions.appendChild(speakBtn);
        actions.appendChild(brailleBtn);
        bubble.appendChild(actions);
    }

    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTypingIndicator() {
    const messagesEl = document.getElementById('chatMessages');
    const id = 'typing-' + Date.now();

    const indicator = document.createElement('div');
    indicator.className = 'chat-bubble assistant';
    indicator.id = id;

    const label = document.createElement('div');
    label.className = 'bubble-label';
    label.textContent = 'AI Assistant';

    const dots = document.createElement('div');
    dots.className = 'typing-indicator';
    dots.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

    indicator.appendChild(label);
    indicator.appendChild(dots);
    messagesEl.appendChild(indicator);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ═══════════════════════════════════════════════════════════════
// VOICE INPUT / OUTPUT
// ═══════════════════════════════════════════════════════════════

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        console.warn('Speech Recognition not supported');
        const micBtn = document.getElementById('micBtn');
        micBtn.disabled = true;
        document.getElementById('micLabel').textContent = 'Voice not supported';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }

        // Update input field with transcript
        document.getElementById('chatInput').value = transcript;

        // If final result, send it
        if (event.results[event.results.length - 1].isFinal) {
            stopRecording();
            if (transcript.trim()) {
                sendChat();
            }
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        stopRecording();
        if (event.error !== 'no-speech') {
            showToast(`Voice error: ${event.error}`, 'error');
        }
    };

    recognition.onend = () => {
        stopRecording();
    };
}

function toggleVoice() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!recognition) {
        showToast('Voice input is not supported in this browser', 'error');
        return;
    }

    // Stop any ongoing speech
    if (speechSynth.speaking) {
        speechSynth.cancel();
    }

    isRecording = true;
    const micBtn = document.getElementById('micBtn');
    const micLabel = document.getElementById('micLabel');
    micBtn.classList.add('recording');
    micLabel.textContent = 'Listening... Tap to Stop';

    document.getElementById('chatInput').value = '';
    document.getElementById('chatInput').placeholder = 'Listening...';

    try {
        recognition.start();
        announceToScreenReader('Listening for your voice. Speak now.');
    } catch (e) {
        stopRecording();
    }
}

function stopRecording() {
    isRecording = false;
    const micBtn = document.getElementById('micBtn');
    const micLabel = document.getElementById('micLabel');
    micBtn.classList.remove('recording');
    micLabel.textContent = 'Tap to Speak';
    document.getElementById('chatInput').placeholder = 'Type your question or use voice...';

    try {
        recognition?.stop();
    } catch (e) { /* ignore */ }
}

function speakResponse(text) {
    if (!speechSynth) return;

    // Cancel any ongoing speech
    speechSynth.cancel();

    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = 0.9;
    currentUtterance.pitch = 1.0;
    currentUtterance.volume = 1.0;

    // Try to get a good English voice
    const voices = speechSynth.getVoices();
    const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'))
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0];

    if (preferredVoice) {
        currentUtterance.voice = preferredVoice;
    }

    speechSynth.speak(currentUtterance);
}

function speakText() {
    if (extractedContent) {
        speakResponse(extractedContent);
        showToast('Reading text aloud...', 'info');
    }
}

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

function initSocketListeners() {
    socket.on('connect', () => {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
    });

    socket.on('disconnect', () => {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
    });

    socket.on('braille_update', (data) => {
        updateBrailleCells(data.chunk);

        // Update progress
        document.getElementById('brailleChunkInfo').textContent = `Chunk ${data.index + 1} / ${data.total}`;
        document.getElementById('braillePercent').textContent = `${data.progress}%`;
        document.getElementById('brailleProgressFill').style.width = `${data.progress}%`;

        // Announce and spell current chunk out loud, explicitly saying "space" for empty characters
        const spellText = data.chunk.split('').map(char => char === ' ' ? 'space' : char).join(', ');
        speakResponse(spellText);
        announceToScreenReader(`Braille: ${spellText}`);
    });

    socket.on('braille_complete', (data) => {
        document.getElementById('stopBrailleBtn').disabled = true;
        showToast(data.message, 'success');
        announceToScreenReader('Braille cycle complete.');

        // Reset after a short delay
        setTimeout(resetBrailleCells, 3000);
    });

    socket.on('serial_log', (data) => {
        addSerialLog(data.message);
    });
}

// ═══════════════════════════════════════════════════════════════
// SERIAL MONITOR 
// ═══════════════════════════════════════════════════════════════

function addSerialLog(message) {
    const logEl = document.getElementById('serialLog');
    const countEl = document.getElementById('logCount');

    const entry = document.createElement('div');
    entry.className = `log-entry ${message.includes('──') ? 'log-system' : ''}`;

    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-msg">${escapeHtml(message)}</span>`;

    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;

    logCount++;
    countEl.textContent = logCount;
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // Remove after animation
    setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function announceToScreenReader(message) {
    // Create an aria-live region announcement
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'assertive');
    announcement.style.position = 'absolute';
    announcement.style.width = '1px';
    announcement.style.height = '1px';
    announcement.style.overflow = 'hidden';
    announcement.style.clip = 'rect(0,0,0,0)';
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
}

// Load voices when available (needed for some browsers)
if (speechSynth) {
    speechSynth.onvoiceschanged = () => {
        speechSynth.getVoices();
    };
}
