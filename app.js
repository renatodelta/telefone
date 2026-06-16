// Core App Logic for VOIP Phone System Simulation (PeerJS Serverless WebRTC)

// Instantiating Tones Synthesizers
const audioA = new PhoneAudioEngine();
const audioB = new PhoneAudioEngine();

// Application State Variables
const state = {
    a: {
        number: '555-0101',
        displayName: 'Telefone A',
        typedDigits: '',
        status: 'idle', // idle, outgoing, incoming, connected
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
        typedDigits: '',
        status: 'idle',
        isMuted: false,
        isSpeaker: false,
        activePeer: null,
        callStartTime: null,
        callTimerInterval: null,
        visualizerInterval: null
    }
};

// PeerJS Configuration
let currentViewMode = 'dual'; // 'dual', 'phone-a', 'phone-b'
let peerInstance = null;      // PeerJS instance
let dataConn = null;          // PeerJS DataConnection
let mediaConn = null;         // PeerJS MediaConnection
let localStream = null;

// Unique namespace to prevent ID collisions on the public PeerJS server
const PEER_PREFIX = 'renatodelta-tele-';

// DTMF Keypad Tones Mapping
const toneFreqs = {
    '1': 350, '2': 440, '3': 480,
    '4': 350, '5': 440, '6': 480,
    '7': 350, '8': 440, '9': 480,
    '*': 350, '0': 440, '#': 480
};

// Initialization
window.addEventListener('DOMContentLoaded', async () => {
    updateSystemTime();
    setInterval(updateSystemTime, 30000);
    
    // Load initial logs
    renderLogs('a');
    renderLogs('b');
    
    // Request microphone permission on startup to prepare stream
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Microphone stream acquired.");
    } catch (e) {
        console.warn("Microphone access not granted or blocked by browser context. Using synthesizer backup.");
    }
    
    // Default mode is dual panel local simulation
    changeViewMode('dual');
});

// Update Simulated Top Bar Time
function updateSystemTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    document.querySelectorAll('.status-time').forEach(el => el.textContent = timeStr);
}

// Switch between Keyboard, Contacts, and Recentes tabs
function switchTab(phone, tabId) {
    const phoneEl = document.getElementById(`phone-${phone}`);
    phoneEl.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    phoneEl.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`phone-${phone}-${tabId}`).classList.add('active');
    
    const tabIndex = tabId === 'dialer' ? 0 : tabId === 'contacts' ? 1 : 2;
    phoneEl.querySelectorAll('.tab-btn')[tabIndex].classList.add('active');
}

// Handle Keypad digit presses
function pressKey(phone, key) {
    const phoneState = state[phone];
    if (phoneState.typedDigits.length < 15) {
        phoneState.typedDigits += key;
        document.getElementById(`phone-${phone}-display`).textContent = formatPhoneNumber(phoneState.typedDigits);
        
        const audio = phone === 'a' ? audioA : audioB;
        audio.playKeyPress(toneFreqs[key] || 440);
    }
}

// Backspace button for keypad digits
function deleteDigit(phone) {
    const phoneState = state[phone];
    phoneState.typedDigits = phoneState.typedDigits.slice(0, -1);
    document.getElementById(`phone-${phone}-display`).textContent = formatPhoneNumber(phoneState.typedDigits);
    
    const audio = phone === 'a' ? audioA : audioB;
    audio.playKeyPress(300);
}

// Helper to format numbers like 555-0101
function formatPhoneNumber(digits) {
    if (digits.length === 7) {
        return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    }
    return digits;
}

// Dial from Contacts list directly
function dialFromContact(phone, targetNumber) {
    state[phone].typedDigits = targetNumber.replace('-', '');
    document.getElementById(`phone-${phone}-display`).textContent = targetNumber;
    startCallInitiation(phone);
}

// Generate a silent Audio MediaStream if microphone is blocked (HTTP fallback)
function getSilentAudioStream() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextClass();
        const dst = ctx.createMediaStreamDestination();
        // Do NOT connect any oscillator so it is completely silent
        return dst.stream;
    } catch(e) {
        console.warn("Failed to create silent context stream, using empty MediaStream.");
        return new MediaStream();
    }
}

// Request microphone access
async function requestMicrophonePermission() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        alert('Acesso ao microfone concedido! Agora as ligações usarão voz real.');
    } catch(err) {
        alert('Permissão de microfone negada. O sistema usará simulação de áudio sintetizado.');
    }
}

// --- PeerJS Signaling Setup ---

function changeViewMode(mode) {
    currentViewMode = mode;
    document.body.className = '';
    
    // Reset any active PeerJS connections
    if (peerInstance) {
        peerInstance.destroy();
        peerInstance = null;
    }
    dataConn = null;
    mediaConn = null;

    if (mode !== 'dual') {
        document.body.classList.add('view-mode-' + mode);
        
        // Initialize PeerJS for the selected standalone phone
        const myId = mode === 'phone-a' ? '5550101' : '5550102';
        const role = mode === 'phone-a' ? 'a' : 'b';
        
        console.log(`Inicializando PeerJS como: ${PEER_PREFIX}${myId}`);
        
        peerInstance = new Peer(`${PEER_PREFIX}${myId}`, {
            debug: 1
        });

        // Listen for incoming Data channel control signals
        peerInstance.on('connection', (conn) => {
            dataConn = conn;
            setupDataConnectionListeners(role);
        });

        // Listen for incoming WebRTC Audio call streams
        peerInstance.on('call', (call) => {
            mediaConn = call;
            console.log("Recebendo chamada de mídia...");
            
            // Auto accept incoming voice track once user accepts call
            // Handled inside acceptCall()
        });

        peerInstance.on('error', (err) => {
            console.error("Erro no PeerJS:", err);
            if (err.type === 'peer-unavailable') {
                alert("O telefone de destino não está online. Certifique-se de que ele está aberto no outro celular.");
                hangupCall(role);
            }
        });
    }
}

// Setup data channel callbacks to handle remote events
function setupDataConnectionListeners(localRole) {
    const peerRole = localRole === 'a' ? 'b' : 'a';
    const localPhoneState = state[localRole];

    dataConn.on('data', (data) => {
        console.log("Sinal recebido:", data);
        
        if (data.type === 'call_init') {
            localPhoneState.status = 'incoming';
            localPhoneState.activePeer = peerRole;
            
            // Show Ringing Overlay screen
            const callScreen = document.getElementById(`phone-${localRole}-call-screen`);
            document.getElementById(`phone-${localRole}-call-status`).textContent = 'Ligação de Voz VoIP';
            document.getElementById(`phone-${localRole}-call-name`).textContent = peerRole === 'a' ? 'Telefone A' : 'Telefone B';
            document.getElementById(`phone-${localRole}-call-number`).textContent = peerRole === 'a' ? '555-0101' : '555-0102';
            
            document.getElementById(`phone-${localRole}-btn-accept`).style.display = 'flex';
            document.getElementById(`phone-${localRole}-pulse-1`).style.display = 'block';
            document.getElementById(`phone-${localRole}-pulse-2`).style.display = 'block';
            callScreen.classList.add('active');
            
            // Ring and vibrate
            document.getElementById(`phone-${localRole}`).classList.add('vibrate-active');
            const audio = localRole === 'a' ? audioA : audioB;
            audio.startRingtone();
        } 
        
        else if (data.type === 'call_accept') {
            console.log("Chamada aceita!");
            localPhoneState.status = 'connected';
            
            const audio = localRole === 'a' ? audioA : audioB;
            audio.stopCallingTone();
            audio.playConnectTone();
            
            document.getElementById(`phone-${localRole}-btn-accept`).style.display = 'none';
            document.getElementById(`phone-${localRole}-pulse-1`).style.display = 'none';
            document.getElementById(`phone-${localRole}-pulse-2`).style.display = 'none';
            
            startCallTimer(localRole);
            startVisualizer(localRole);
        } 
        
        else if (data.type === 'hangup') {
            console.log("O par encerrou a chamada.");
            hangupCall(localRole, false); // Hangup locally without sending another signal loop
        } 
        
        else if (data.type === 'mute_toggle') {
            // Flatten wave if peer is muted
            const peerState = state[peerRole];
            peerState.isMuted = data.isMuted;
        }
    });

    dataConn.on('close', () => {
        console.log("Canal de sinalização fechado.");
        hangupCall(localRole, false);
    });
}

// --- Call Handlers ---

async function startCallInitiation(caller) {
    const callerState = state[caller];
    const dialed = callerState.typedDigits.replace(/-/g, '');
    
    if (!dialed) return;

    let receiver = null;
    if (caller === 'a' && dialed === '5550102') receiver = 'b';
    else if (caller === 'b' && dialed === '5550101') receiver = 'a';

    if (!receiver) {
        alert('Número inválido! Ligue para 555-0101 ou 555-0102.');
        return;
    }

    const receiverState = state[receiver];
    
    // Local Loopback Simulation Mode
    if (currentViewMode === 'dual') {
        if (receiverState.status !== 'idle') {
            alert('Linha ocupada.');
            const audio = caller === 'a' ? audioA : audioB;
            audio.playDisconnectTone();
            return;
        }

        callerState.status = 'outgoing';
        callerState.activePeer = receiver;
        receiverState.status = 'incoming';
        receiverState.activePeer = caller;

        document.getElementById(`phone-${caller}-call-screen`).classList.add('active');
        document.getElementById(`phone-${caller}-call-status`).textContent = 'Chamando...';
        document.getElementById(`phone-${caller}-call-name`).textContent = receiverState.displayName;
        document.getElementById(`phone-${caller}-call-number`).textContent = receiverState.number;
        document.getElementById(`phone-${caller}-btn-accept`).style.display = 'none';

        document.getElementById(`phone-${receiver}-call-screen`).classList.add('active');
        document.getElementById(`phone-${receiver}-call-status`).textContent = 'Ligação de Voz VoIP';
        document.getElementById(`phone-${receiver}-call-name`).textContent = callerState.displayName;
        document.getElementById(`phone-${receiver}-call-number`).textContent = callerState.number;
        document.getElementById(`phone-${receiver}-btn-accept`).style.display = 'flex';
        document.getElementById(`phone-${receiver}-pulse-1`).style.display = 'block';
        document.getElementById(`phone-${receiver}-pulse-2`).style.display = 'block';

        const callerAudio = caller === 'a' ? audioA : audioB;
        callerAudio.startCallingTone();
        
        const receiverAudio = receiver === 'a' ? audioA : audioB;
        receiverAudio.startRingtone();
        document.getElementById(`phone-${receiver}`).classList.add('vibrate-active');
    } 
    
    // Remote PeerJS Serverless Mode
    else {
        callerState.status = 'outgoing';
        callerState.activePeer = receiver;
        
        // Show local calling screen
        document.getElementById(`phone-${caller}-call-screen`).classList.add('active');
        document.getElementById(`phone-${caller}-call-status`).textContent = 'Chamando...';
        document.getElementById(`phone-${caller}-call-name`).textContent = receiver === 'a' ? 'Telefone A' : 'Telefone B';
        document.getElementById(`phone-${caller}-call-number`).textContent = receiver === 'a' ? '555-0101' : '555-0102';
        document.getElementById(`phone-${caller}-btn-accept`).style.display = 'none';
        
        const audio = caller === 'a' ? audioA : audioB;
        audio.startCallingTone();

        const destId = receiver === 'a' ? '5550101' : '5550102';
        
        console.log(`Conectando sinal ao destino: ${PEER_PREFIX}${destId}`);
        
        // Establish Signaling channel connection
        dataConn = peerInstance.connect(`${PEER_PREFIX}${destId}`);
        
        dataConn.on('open', () => {
            console.log("Canal de dados aberto. Enviando chamada...");
            dataConn.send({ type: 'call_init' });
            setupDataConnectionListeners(caller);
        });

        // Establish WebRTC Audio Stream connection
        const mediaStream = localStream || getSilentAudioStream();
        mediaConn = peerInstance.call(`${PEER_PREFIX}${destId}`, mediaStream);

        mediaConn.on('stream', (remoteStream) => {
            console.log("Mídia de áudio estabelecida com sucesso.");
            // Play incoming stream on a virtual audio tag if needed
            const audioEl = document.createElement('audio');
            audioEl.srcObject = remoteStream;
            audioEl.play().catch(e=>{});
        });
    }
}

// --- Accept Call ---

async function acceptCall(phone) {
    const phoneState = state[phone];
    const peer = phoneState.activePeer;
    const peerState = state[peer];

    audioA.stopRingtone();
    audioA.stopCallingTone();
    audioB.stopRingtone();
    audioB.stopCallingTone();

    document.getElementById(`phone-a`).classList.remove('vibrate-active');
    document.getElementById(`phone-b`).classList.remove('vibrate-active');

    const audio = phone === 'a' ? audioA : audioB;
    audio.playConnectTone();

    // Local Loopback Connect
    if (currentViewMode === 'dual') {
        phoneState.status = 'connected';
        peerState.status = 'connected';

        document.getElementById('phone-a-btn-accept').style.display = 'none';
        document.getElementById('phone-b-btn-accept').style.display = 'none';
        document.getElementById('phone-a-pulse-1').style.display = 'none';
        document.getElementById('phone-a-pulse-2').style.display = 'none';
        document.getElementById('phone-b-pulse-1').style.display = 'none';
        document.getElementById('phone-b-pulse-2').style.display = 'none';

        startCallTimer('a');
        startCallTimer('b');
        startVisualizer('a');
        startVisualizer('b');
    } 
    
    // Remote PeerJS Connect
    else {
        phoneState.status = 'connected';
        
        document.getElementById(`phone-${phone}-btn-accept`).style.display = 'none';
        document.getElementById(`phone-${phone}-pulse-1`).style.display = 'none';
        document.getElementById(`phone-${phone}-pulse-2`).style.display = 'none';

        // Notify caller that we accepted the call
        if (dataConn) {
            dataConn.send({ type: 'call_accept' });
        }

        // Answer WebRTC audio channel
        if (mediaConn) {
            const mediaStream = localStream || getSilentAudioStream();
            mediaConn.answer(mediaStream);
            
            mediaConn.on('stream', (remoteStream) => {
                console.log("Recebendo voz remota...");
                const audioEl = document.createElement('audio');
                audioEl.srcObject = remoteStream;
                audioEl.play().catch(e=>{});
            });
        }

        startCallTimer(phone);
        startVisualizer(phone);
    }
}

// --- Hangup Call ---

function hangupCall(phone, notifyPeer = true) {
    const phoneState = state[phone];
    const peer = phoneState.activePeer;

    // Write history record
    if (peer) {
        const peerState = state[peer];
        saveCallLog(phone, peer, phoneState.status);
        if (currentViewMode === 'dual') {
            saveCallLog(peer, phone, peerState.status === 'incoming' ? 'missed' : peerState.status);
        }
    }

    // Stop ringtones
    audioA.stopRingtone();
    audioA.stopCallingTone();
    audioB.stopRingtone();
    audioB.stopCallingTone();

    const audio = phone === 'a' ? audioA : audioB;
    audio.playDisconnectTone();

    document.getElementById(`phone-a`).classList.remove('vibrate-active');
    document.getElementById(`phone-b`).classList.remove('vibrate-active');

    // Notify peer of disconnect
    if (currentViewMode !== 'dual' && notifyPeer && dataConn) {
        try {
            dataConn.send({ type: 'hangup' });
        } catch(e) {}
    }

    // Close PeerJS connections
    if (dataConn) {
        dataConn.close();
        dataConn = null;
    }
    if (mediaConn) {
        mediaConn.close();
        mediaConn = null;
    }

    stopCallTimer('a');
    stopCallTimer('b');
    stopVisualizer('a');
    stopVisualizer('b');

    // Reset UI states
    phoneState.status = 'idle';
    phoneState.activePeer = null;
    phoneState.typedDigits = '';
    document.getElementById(`phone-${phone}-display`).textContent = '';

    document.getElementById(`phone-a-call-screen`).classList.remove('active');
    document.getElementById(`phone-b-call-screen`).classList.remove('active');

    resetFeatureButtons('a');
    resetFeatureButtons('b');

    renderLogs('a');
    renderLogs('b');
}

// Reset Mute/Speaker button highlights
function resetFeatureButtons(phone) {
    state[phone].isMuted = false;
    state[phone].isSpeaker = false;
    document.getElementById(`phone-${phone}-btn-mute`).classList.remove('active');
    document.getElementById(`phone-${phone}-btn-speaker`).classList.remove('active');
}

// Toggle Mute
function toggleMute(phone) {
    const phoneState = state[phone];
    phoneState.isMuted = !phoneState.isMuted;
    
    const btn = document.getElementById(`phone-${phone}-btn-mute`);
    if (phoneState.isMuted) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }

    // Notify peer to flatten visualizer wave
    if (currentViewMode !== 'dual' && dataConn) {
        dataConn.send({ type: 'mute_toggle', isMuted: phoneState.isMuted });
    }
}

// Toggle Speaker
function toggleSpeaker(phone) {
    const phoneState = state[phone];
    phoneState.isSpeaker = !phoneState.isSpeaker;
    
    const btn = document.getElementById(`phone-${phone}-btn-speaker`);
    if (phoneState.isSpeaker) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }
}

// --- Waveform Canvas Visualizer ---
function startVisualizer(phone) {
    const canvas = document.getElementById(`phone-${phone}-visualizer`);
    const canvasCtx = canvas.getContext('2d');
    if (!canvas) return;
    
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const phoneState = state[phone];
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
            if (!phoneState.isMuted && Math.random() > 0.85) {
                amp += Math.random() * 12;
            }

            const y = (canvas.height / 2) + Math.sin(angle + i * 0.1) * amp;

            if (i === 0) {
                canvasCtx.moveTo(x, y);
            } else {
                canvasCtx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        canvasCtx.stroke();
        angle += 0.12;
        phoneState.visualizerInterval = requestAnimationFrame(draw);
    };

    draw();
}

function stopVisualizer(phone) {
    const phoneState = state[phone];
    if (phoneState.visualizerInterval) {
        cancelAnimationFrame(phoneState.visualizerInterval);
        phoneState.visualizerInterval = null;
    }
}

// Start call connection timer
function startCallTimer(phone) {
    const phoneState = state[phone];
    phoneState.callStartTime = Date.now();
    
    const labelEl = document.getElementById(`phone-${phone}-call-status`);
    if (!labelEl) return;
    
    phoneState.callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - phoneState.callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        labelEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer(phone) {
    const phoneState = state[phone];
    if (phoneState.callTimerInterval) {
        clearInterval(phoneState.callTimerInterval);
        phoneState.callTimerInterval = null;
    }
}

// --- Call logs (Recentes) Persistent storage ---

function saveCallLog(phone, peer, callOutcome) {
    const logs = JSON.parse(localStorage.getItem(`calls_${phone}`)) || [];
    let peerName = '';
    let peerNumber = '';
    
    if (peer === 'a') {
        peerName = 'Telefone A';
        peerNumber = '555-0101';
    } else {
        peerName = 'Telefone B';
        peerNumber = '555-0102';
    }
    
    let label = 'outgoing';
    if (callOutcome === 'connected') {
        label = 'outgoing';
    } else if (callOutcome === 'incoming') {
        label = 'incoming';
    } else if (callOutcome === 'missed') {
        label = 'missed';
    }

    logs.unshift({
        name: peerName,
        number: peerNumber,
        type: label,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    if (logs.length > 12) logs.pop();
    localStorage.setItem(`calls_${phone}`, JSON.stringify(logs));
}

function renderLogs(phone) {
    const logs = JSON.parse(localStorage.getItem(`calls_${phone}`)) || [];
    const listEl = document.getElementById(`phone-${phone}-log-list`);
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
