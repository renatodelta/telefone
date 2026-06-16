// Dedicated JS Engine for Telefone A (555-0101)

const audioA = new PhoneAudioEngine();
let peerInstance = null;
let dataConn = null;
let mediaConn = null;
let localStream = null;

const MY_ROLE = 'a';
const PEER_ROLE = 'b';
const MY_NUM = '5550101';
const DEST_NUM = '5550102';
const PEER_PREFIX = 'renatodelta-tele-';

const state = {
    a: {
        number: '555-0101',
        displayName: 'Telefone A',
        typedDigits: '',
        status: 'idle',
        isMuted: false,
        isSpeaker: false,
        activePeer: null,
        callStartTime: null,
        callTimerInterval: null,
        visualizerInterval: null
    },
    b: {
        number: '555-0102',
        displayName: 'Telefone B',
        isMuted: false
    }
};

const toneFreqs = {
    '1': 350, '2': 440, '3': 480, '4': 350, '5': 440, '6': 480,
    '7': 350, '8': 440, '9': 480, '*': 350, '0': 440, '#': 480
};

// Gesture Unlock audio triggers
async function initAudioOnGesture() {
    console.log("Unlock trigger activated on Phone A");
    const audioPlayer = document.getElementById('remote-audio-player');
    if (audioPlayer) {
        audioPlayer.play().catch(e => {});
    }

    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Phone A Mic acquired.");
        } catch(e) {
            console.warn("Phone A Mic blocked.");
        }
    }
}
document.addEventListener('click', initAudioOnGesture, { once: true });
document.addEventListener('touchstart', initAudioOnGesture, { once: true });

// Setup on load
window.addEventListener('DOMContentLoaded', () => {
    updateSystemTime();
    setInterval(updateSystemTime, 30000);
    renderLogs('a');
    
    // Initialize PeerJS
    console.log(`Starting Peer A: ${PEER_PREFIX}${MY_NUM}`);
    peerInstance = new Peer(`${PEER_PREFIX}${MY_NUM}`, { debug: 1 });

    peerInstance.on('connection', (conn) => {
        dataConn = conn;
        setupDataConnectionListeners();
    });

    peerInstance.on('call', async (call) => {
        mediaConn = call;
        console.log("Recebendo retorno de chamada de áudio...");
        
        // Auto-answer incoming reverse audio call from B
        if (state.a.status === 'outgoing' || state.a.status === 'connected') {
            if (!localStream) {
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                } catch(e) {}
            }
            
            const myStream = localStream || getSilentAudioStream();
            mediaConn.answer(myStream);
            
            mediaConn.on('stream', (remoteStream) => {
                console.log("Reproduzindo voz do Telefone B...");
                const audioPlayer = document.getElementById('remote-audio-player');
                if (audioPlayer) {
                    audioPlayer.srcObject = remoteStream;
                    audioPlayer.play().catch(e => {});
                }
            });
        }
    });

    peerInstance.on('error', (err) => {
        console.error("PeerJS A Error:", err);
        if (err.type === 'peer-unavailable') {
            alert("O Telefone B não está online no momento.");
            hangupCall('a');
        }
    });
});

function updateSystemTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('.status-time').forEach(el => el.textContent = timeStr);
}

function switchTab(phone, tabId) {
    const phoneEl = document.getElementById(`phone-a`);
    phoneEl.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    phoneEl.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`phone-a-${tabId}`).classList.add('active');
    const tabIndex = tabId === 'dialer' ? 0 : tabId === 'contacts' ? 1 : 2;
    phoneEl.querySelectorAll('.tab-btn')[tabIndex].classList.add('active');
}

function pressKey(phone, key) {
    const phoneState = state.a;
    if (phoneState.typedDigits.length < 15) {
        phoneState.typedDigits += key;
        document.getElementById(`phone-a-display`).textContent = formatPhoneNumber(phoneState.typedDigits);
        audioA.playKeyPress(toneFreqs[key] || 440);
    }
}

function deleteDigit(phone) {
    const phoneState = state.a;
    phoneState.typedDigits = phoneState.typedDigits.slice(0, -1);
    document.getElementById(`phone-a-display`).textContent = formatPhoneNumber(phoneState.typedDigits);
    audioA.playKeyPress(300);
}

function formatPhoneNumber(digits) {
    if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return digits;
}

function dialFromContact(phone, targetNumber) {
    state.a.typedDigits = targetNumber.replace('-', '');
    document.getElementById(`phone-a-display`).textContent = targetNumber;
    startCallInitiation('a');
}

function getSilentAudioStream() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextClass();
        const dst = ctx.createMediaStreamDestination();
        return dst.stream;
    } catch(e) {
        return new MediaStream();
    }
}

function setupDataConnectionListeners() {
    dataConn.on('data', (data) => {
        console.log("Dados recebidos em A:", data);
        
        if (data.type === 'call_init') {
            state.a.status = 'incoming';
            state.a.activePeer = PEER_ROLE;
            
            document.getElementById(`phone-a-call-screen`).classList.add('active');
            document.getElementById(`phone-a-call-status`).textContent = 'Ligação de Voz VoIP';
            document.getElementById(`phone-a-call-name`).textContent = 'Telefone B';
            document.getElementById(`phone-a-call-number`).textContent = '555-0102';
            
            document.getElementById(`phone-a-btn-accept`).style.display = 'flex';
            document.getElementById(`phone-a-pulse-1`).style.display = 'block';
            document.getElementById(`phone-a-pulse-2`).style.display = 'block';
            
            document.getElementById(`phone-a`).classList.add('vibrate-active');
            audioA.startRingtone();
        } 
        
        else if (data.type === 'call_accept') {
            console.log("B aceitou a chamada.");
            state.a.status = 'connected';
            audioA.stopCallingTone();
            audioA.playConnectTone();
            
            document.getElementById(`phone-a-btn-accept`).style.display = 'none';
            document.getElementById(`phone-a-pulse-1`).style.display = 'none';
            document.getElementById(`phone-a-pulse-2`).style.display = 'none';
            
            startCallTimer('a');
            startVisualizer('a');
        } 
        
        else if (data.type === 'hangup') {
            hangupCall('a', false);
        } 
        
        else if (data.type === 'mute_toggle') {
            state.b.isMuted = data.isMuted;
        }
    });

    dataConn.on('close', () => {
        hangupCall('a', false);
    });
}

async function startCallInitiation(phone) {
    const phoneState = state.a;
    const dialed = phoneState.typedDigits.replace(/-/g, '');
    
    if (dialed !== DEST_NUM) {
        alert('Número inválido! Ligue para 555-0102.');
        return;
    }

    phoneState.status = 'outgoing';
    phoneState.activePeer = PEER_ROLE;
    
    document.getElementById(`phone-a-call-screen`).classList.add('active');
    document.getElementById(`phone-a-call-status`).textContent = 'Chamando...';
    document.getElementById(`phone-a-call-name`).textContent = 'Telefone B';
    document.getElementById(`phone-a-call-number`).textContent = '555-0102';
    document.getElementById(`phone-a-btn-accept`).style.display = 'none';
    
    audioA.startCallingTone();

    console.log(`Connecting to: ${PEER_PREFIX}${DEST_NUM}`);
    dataConn = peerInstance.connect(`${PEER_PREFIX}${DEST_NUM}`);
    
    dataConn.on('open', () => {
        dataConn.send({ type: 'call_init' });
        setupDataConnectionListeners();
    });
}

async function acceptCall(phone) {
    const phoneState = state.a;
    audioA.stopRingtone();
    document.getElementById(`phone-a`).classList.remove('vibrate-active');
    audioA.playConnectTone();

    phoneState.status = 'connected';
    document.getElementById(`phone-a-btn-accept`).style.display = 'none';
    document.getElementById(`phone-a-pulse-1`).style.display = 'none';
    document.getElementById(`phone-a-pulse-2`).style.display = 'none';

    if (dataConn) {
        dataConn.send({ type: 'call_accept' });
    }

    if (!localStream) {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch(e) {}
    }

    // Acceptor B/A calls Caller back
    const myStream = localStream || getSilentAudioStream();
    mediaConn = peerInstance.call(`${PEER_PREFIX}${DEST_NUM}`, myStream);

    mediaConn.on('stream', (remoteStream) => {
        console.log("Recebendo voz do Telefone B...");
        const audioPlayer = document.getElementById('remote-audio-player');
        if (audioPlayer) {
            audioPlayer.srcObject = remoteStream;
            audioPlayer.play().catch(e => {});
        }
    });

    startCallTimer('a');
    startVisualizer('a');
}

function hangupCall(phone, notifyPeer = true) {
    const phoneState = state.a;
    
    saveCallLog('a', PEER_ROLE, phoneState.status);
    
    audioA.stopRingtone();
    audioA.stopCallingTone();
    audioA.playDisconnectTone();
    document.getElementById(`phone-a`).classList.remove('vibrate-active');

    if (notifyPeer && dataConn) {
        try { dataConn.send({ type: 'hangup' }); } catch(e) {}
    }

    if (dataConn) { dataConn.close(); dataConn = null; }
    if (mediaConn) { mediaConn.close(); mediaConn = null; }

    stopCallTimer('a');
    stopVisualizer('a');

    phoneState.status = 'idle';
    phoneState.activePeer = null;
    phoneState.typedDigits = '';
    document.getElementById(`phone-a-display`).textContent = '';
    document.getElementById(`phone-a-call-screen`).classList.remove('active');

    resetFeatureButtons('a');
    renderLogs('a');
}

function resetFeatureButtons(phone) {
    state.a.isMuted = false;
    state.a.isSpeaker = false;
    document.getElementById(`phone-a-btn-mute`).classList.remove('active');
    document.getElementById(`phone-a-btn-speaker`).classList.remove('active');
}

function toggleMute(phone) {
    const phoneState = state.a;
    phoneState.isMuted = !phoneState.isMuted;
    
    const btn = document.getElementById(`phone-a-btn-mute`);
    if (phoneState.isMuted) btn.classList.add('active');
    else btn.classList.remove('active');

    if (dataConn) {
        dataConn.send({ type: 'mute_toggle', isMuted: phoneState.isMuted });
    }
}

function toggleSpeaker(phone) {
    const phoneState = state.a;
    phoneState.isSpeaker = !phoneState.isSpeaker;
    
    const btn = document.getElementById(`phone-a-btn-speaker`);
    if (phoneState.isSpeaker) btn.classList.add('active');
    else btn.classList.remove('active');
}

function startVisualizer(phone) {
    const canvas = document.getElementById(`phone-a-visualizer`);
    const canvasCtx = canvas?.getContext('2d');
    if (!canvas) return;
    
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const phoneState = state.a;
    let angle = 0;

    const draw = () => {
        if (phoneState.status !== 'connected') return;

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        canvasCtx.lineWidth = 3;
        
        const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(0.5, '#3b82f6');
        gradient.addColorStop(1, '#10b981');
        canvasCtx.strokeStyle = gradient;

        canvasCtx.beginPath();
        const sliceWidth = canvas.width / 80;
        let x = 0;

        for (let i = 0; i < 80; i++) {
            let amp = phoneState.isMuted ? 0 : (12 + Math.sin(angle + i * 0.15) * 8 + Math.cos(angle * 1.5 + i * 0.08) * 4);
            if (!phoneState.isMuted && Math.random() > 0.85) amp += Math.random() * 12;

            const y = (canvas.height / 2) + Math.sin(angle + i * 0.1) * amp;

            if (i === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
            x += sliceWidth;
        }

        canvasCtx.stroke();
        angle += 0.12;
        phoneState.visualizerInterval = requestAnimationFrame(draw);
    };

    draw();
}

function stopVisualizer(phone) {
    const phoneState = state.a;
    if (phoneState.visualizerInterval) {
        cancelAnimationFrame(phoneState.visualizerInterval);
        phoneState.visualizerInterval = null;
    }
}

function startCallTimer(phone) {
    const phoneState = state.a;
    phoneState.callStartTime = Date.now();
    
    const labelEl = document.getElementById(`phone-a-call-status`);
    if (!labelEl) return;
    
    phoneState.callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - phoneState.callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        labelEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer(phone) {
    const phoneState = state.a;
    if (phoneState.callTimerInterval) {
        clearInterval(phoneState.callTimerInterval);
        phoneState.callTimerInterval = null;
    }
}

function saveCallLog(phone, peer, callOutcome) {
    const logs = JSON.parse(localStorage.getItem(`calls_a`)) || [];
    let label = 'outgoing';
    if (callOutcome === 'connected') label = 'outgoing';
    else if (callOutcome === 'incoming') label = 'incoming';
    else if (callOutcome === 'missed') label = 'missed';

    logs.unshift({
        name: 'Telefone B',
        number: '555-0102',
        type: label,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    if (logs.length > 12) logs.pop();
    localStorage.setItem(`calls_a`, JSON.stringify(logs));
}

function renderLogs(phone) {
    const logs = JSON.parse(localStorage.getItem(`calls_a`)) || [];
    const listEl = document.getElementById(`phone-a-log-list`);
    if (!listEl) return;
    
    listEl.innerHTML = '';
    if (logs.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-secondary); text-align: center; margin-top: 2rem; font-size: 0.9rem;">Sem chamadas recentes</div>';
        return;
    }

    logs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        let icon = '';
        let iconClass = '';
        
        if (log.type === 'missed') {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.11-.27 11.5 11.5 0 0 0 3.58.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.5 11.5 0 0 0 .57 3.58 1 1 0 0 1-.27 1.11z"/></svg>';
            iconClass = 'missed';
        } else if (log.type === 'incoming') {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 15.5c-1.2 0-2.4-.2-3.6-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.1-3.8-6.6-6.6l2.2-2.2c.3-.3.4-.7.2-1-.3-1.1-.5-2.3-.5-3.5 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z"/></svg>';
            iconClass = 'incoming';
        } else {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 5v2h6.59L4 18.59 5.41 20 17 8.41V15h2V5H9z"/></svg>';
            iconClass = 'outgoing';
        }

        item.innerHTML = `
            <div class="log-left">
                <div class="log-indicator ${iconClass}">${icon}</div>
                <div class="log-text">
                    <h4 style="color: ${log.type === 'missed' ? 'var(--danger)' : 'var(--text-primary)'}">${log.name}</h4>
                    <p>${log.number}</p>
                </div>
            </div>
            <div class="log-time">${log.time}</div>
        `;
        listEl.appendChild(item);
    });
}
