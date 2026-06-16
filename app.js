// Core App Logic for VOIP Phone System Simulation (Local + Remote WebRTC modes)

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

// Mode configuration: 'dual' (local side-by-side) or 'phone-a' / 'phone-b' (remote standalone)
let currentViewMode = 'dual';
let remotePollInterval = null;
let sentCandidatesCount = 0;
let receivedCandidatesCount = 0;

// WebRTC Peer Connections
let localPeerConnection = null; // Used for standalone mode or peer A in local mode
let localPeerConnectionB = null; // Used for peer B in local mode
let localStream = null;

// Public STUN servers to bypass NAT (4G to Wi-Fi connection)
const iceConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

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
    
    // Auto-request microphone permission to prepare WebRTC stream
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Microphone stream acquired.");
    } catch (e) {
        console.warn("Microphone access not granted, using synthesizer simulation mode.");
    }
    
    // No global resets on load to avoid wiping active peer states

    
    // Start default signaling/view config
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

// Switch View Modes: Dual Panel vs Remote Phone A/B Standalone
function changeViewMode(mode) {
    currentViewMode = mode;
    document.body.className = '';
    
    if (mode !== 'dual') {
        document.body.classList.add('view-mode-' + mode);
    }
    
    // Stop any existing signaling polling
    if (remotePollInterval) {
        clearInterval(remotePollInterval);
        remotePollInterval = null;
    }
    
    // If in standalone mode, start polling signaling server for events
    if (mode === 'phone-a' || mode === 'phone-b') {
        const role = mode === 'phone-a' ? 'a' : 'b';
        console.log(`Iniciando monitoramento de sinalização remota como: ${mode}`);
        resetSignaling(role); // Reset only our own phone state on startup to clear previous hangs
        remotePollInterval = setInterval(pollSignalingServer, 1000);
    }
}

// Request microphone access
async function requestMicrophonePermission() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        alert('Acesso ao microfone concedido! Ligações usarão voz real.');
    } catch(err) {
        alert('Permissão de microfone negada. O sistema usará simulação de áudio sintetizado.');
    }
}

// --- PHP Signaling Server Sync Helpers ---

async function sendStateToCloud(phone, localPhoneState) {
    const payload = {
        status: localPhoneState.status,
        peer: localPhoneState.activePeer,
        sdp: localPhoneState.sdp
    };
    
    await fetch(`signal.php?action=send&phone=${phone}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(err => console.error("Error sending state:", err));
}

async function sendCandidateToCloud(phone, candidate) {
    await fetch(`signal.php?action=send&phone=${phone}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate })
    }).catch(err => console.error("Error sending candidate:", err));
}

async function getRemoteState(peerPhone) {
    try {
        const res = await fetch(`signal.php?action=get&phone=${peerPhone}`);
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function clearRemoteCandidates(phone) {
    await fetch(`signal.php?action=clear_candidates&phone=${phone}`).catch(e => {});
}

async function resetSignaling(phone) {
    await fetch(`signal.php?action=reset&phone=${phone}`).catch(e => {});
}

// --- Signaling Polling loop for Remote Call routing ---

async function pollSignalingServer() {
    const role = currentViewMode === 'phone-a' ? 'a' : 'b';
    const peerRole = role === 'a' ? 'b' : 'a';
    
    const localPhoneState = state[role];
    
    // 1. Fetch current remote peer's published state
    const remoteData = await getRemoteState(peerRole);
    if (!remoteData) return;
    
    // A. IDLE state: Check if peer is calling us
    if (localPhoneState.status === 'idle') {
        if (remoteData.status === 'outgoing' && remoteData.peer === role) {
            console.log(`Recebendo chamada remota do Telefone ${peerRole.toUpperCase()}`);
            
            localPhoneState.status = 'incoming';
            localPhoneState.activePeer = peerRole;
            
            // Show incoming call overlay screen
            const callScreen = document.getElementById(`phone-${role}-call-screen`);
            document.getElementById(`phone-${role}-call-status`).textContent = 'Ligação de Voz VoIP';
            document.getElementById(`phone-${role}-call-name`).textContent = peerRole === 'a' ? 'Telefone A' : 'Telefone B';
            document.getElementById(`phone-${role}-call-number`).textContent = peerRole === 'a' ? '555-0101' : '555-0102';
            
            document.getElementById(`phone-${role}-btn-accept`).style.display = 'flex';
            document.getElementById(`phone-${role}-pulse-1`).style.display = 'block';
            document.getElementById(`phone-${role}-pulse-2`).style.display = 'block';
            callScreen.classList.add('active');
            
            // Trigger vibration & ringtone
            document.getElementById(`phone-${role}`).classList.add('vibrate-active');
            const audio = role === 'a' ? audioA : audioB;
            audio.startRingtone();
        }
    }
    
    // B. OUTGOING state: Check if peer answered our call
    else if (localPhoneState.status === 'outgoing') {
        // If peer answered
        if (remoteData.status === 'connected' && remoteData.sdp) {
            console.log("Chamada aceita remotamente. Conectando WebRTC...");
            localPhoneState.status = 'connected';
            
            const audio = role === 'a' ? audioA : audioB;
            audio.stopCallingTone();
            audio.playConnectTone();
            
            document.getElementById(`phone-${role}-btn-accept`).style.display = 'none';
            document.getElementById(`phone-${role}-pulse-1`).style.display = 'none';
            document.getElementById(`phone-${role}-pulse-2`).style.display = 'none';
            
            // Setup local WebRTC answers
            await localPeerConnection.setRemoteDescription(new RTCSessionDescription(remoteData.sdp));
            
            // Pull ICE candidates
            if (remoteData.candidates && remoteData.candidates.length > 0) {
                for (const cand of remoteData.candidates) {
                    await localPeerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                }
                await clearRemoteCandidates(peerRole);
            }
            
            startCallTimer(role);
            startVisualizer(role);
        } 
        // If peer rejected or remains idle
        else if (remoteData.status === 'idle') {
            console.log("Chamada rejeitada ou encerrada pelo destino.");
            hangupCall(role);
        }
    }
    
    // C. CONNECTED state: Handle active WebRTC candidate flow or hangup
    else if (localPhoneState.status === 'connected') {
        if (remoteData.status === 'idle') {
            console.log("O par desligou a chamada.");
            hangupCall(role);
        } else {
            // Check for new ICE candidates sent by remote peer
            if (remoteData.candidates && remoteData.candidates.length > 0) {
                for (const cand of remoteData.candidates) {
                    await localPeerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
                }
                await clearRemoteCandidates(peerRole);
            }
        }
    }
    
    // D. INCOMING state: Check if peer hung up before we answered
    else if (localPhoneState.status === 'incoming') {
        if (remoteData.status === 'idle') {
            console.log("O chamador cancelou a ligação.");
            hangupCall(role);
        }
    }
}

// --- VoIP Initiation (Dialing) ---

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
    
    // Handoff to local double loopback if in dual panel mode
    if (currentViewMode === 'dual') {
        if (receiverState.status !== 'idle') {
            alert('Linha ocupada.');
            const audio = caller === 'a' ? audioA : audioB;
            audio.playDisconnectTone();
            return;
        }

        // Set UI States locally
        callerState.status = 'outgoing';
        callerState.activePeer = receiver;
        receiverState.status = 'incoming';
        receiverState.activePeer = caller;

        // Display screens
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

        // Play sounds
        const callerAudio = caller === 'a' ? audioA : audioB;
        callerAudio.startCallingTone();
        
        const receiverAudio = receiver === 'a' ? audioA : audioB;
        receiverAudio.startRingtone();
        document.getElementById(`phone-${receiver}`).classList.add('vibrate-active');
    } 
    
    // Remote Server-signaled Mode (across networks/devices)
    else {
        callerState.status = 'outgoing';
        callerState.activePeer = receiver;
        
        // Show call screen
        document.getElementById(`phone-${caller}-call-screen`).classList.add('active');
        document.getElementById(`phone-${caller}-call-status`).textContent = 'Chamando...';
        document.getElementById(`phone-${caller}-call-name`).textContent = receiver === 'a' ? 'Telefone A' : 'Telefone B';
        document.getElementById(`phone-${caller}-call-number`).textContent = receiver === 'a' ? '555-0101' : '555-0102';
        document.getElementById(`phone-${caller}-btn-accept`).style.display = 'none';
        
        const audio = caller === 'a' ? audioA : audioB;
        audio.startCallingTone();

        // Create remote WebRTC Connection and SDP Offer
        localPeerConnection = new RTCPeerConnection(iceConfiguration);
        sentCandidatesCount = 0;
        
        if (localStream) {
            localStream.getTracks().forEach(track => localPeerConnection.addTrack(track, localStream));
        }

        localPeerConnection.onicecandidate = e => {
            if (e.candidate) {
                sendCandidateToCloud(caller, e.candidate);
            }
        };

        const offer = await localPeerConnection.createOffer();
        await localPeerConnection.setLocalDescription(offer);

        callerState.sdp = offer;
        
        // Write status and SDP to server file (state_a.json or state_b.json)
        await sendStateToCloud(caller, callerState);
    }
}

// --- Accept Call (Connected) ---

async function acceptCall(phone) {
    const phoneState = state[phone];
    const peer = phoneState.activePeer;
    const peerState = state[peer];

    // Stop ring signals
    audioA.stopRingtone();
    audioA.stopCallingTone();
    audioB.stopRingtone();
    audioB.stopCallingTone();

    document.getElementById(`phone-a`).classList.remove('vibrate-active');
    document.getElementById(`phone-b`).classList.remove('vibrate-active');

    const audio = phone === 'a' ? audioA : audioB;
    audio.playConnectTone();

    // Local Dual Panel connection logic
    if (currentViewMode === 'dual') {
        phoneState.status = 'connected';
        peerState.status = 'connected';

        document.getElementById('phone-a-btn-accept').style.display = 'none';
        document.getElementById('phone-b-btn-accept').style.display = 'none';
        document.getElementById('phone-a-pulse-1').style.display = 'none';
        document.getElementById('phone-a-pulse-2').style.display = 'none';
        document.getElementById('phone-b-pulse-1').style.display = 'none';
        document.getElementById('phone-b-pulse-2').style.display = 'none';

        // Connect WebRTC locally
        localPeerConnection = new RTCPeerConnection(iceConfiguration);
        localPeerConnectionB = new RTCPeerConnection(iceConfiguration);

        localPeerConnection.onicecandidate = e => {
            if (e.candidate) localPeerConnectionB.addIceCandidate(e.candidate).catch(e=>{});
        };
        localPeerConnectionB.onicecandidate = e => {
            if (e.candidate) localPeerConnection.addIceCandidate(e.candidate).catch(e=>{});
        };

        if (localStream) {
            localStream.getTracks().forEach(track => {
                localPeerConnection.addTrack(track, localStream);
                localPeerConnectionB.addTrack(track, localStream);
            });
        }

        const offer = await localPeerConnection.createOffer();
        await localPeerConnection.setLocalDescription(offer);
        await localPeerConnectionB.setRemoteDescription(offer);

        const answer = await localPeerConnectionB.createAnswer();
        await localPeerConnectionB.setLocalDescription(answer);
        await localPeerConnection.setRemoteDescription(answer);

        startCallTimer('a');
        startCallTimer('b');
        startVisualizer('a');
        startVisualizer('b');
    } 
    
    // Remote Mode WebRTC accept
    else {
        phoneState.status = 'connected';
        
        document.getElementById(`phone-${phone}-btn-accept`).style.display = 'none';
        document.getElementById(`phone-${phone}-pulse-1`).style.display = 'none';
        document.getElementById(`phone-${phone}-pulse-2`).style.display = 'none';

        // Fetch Caller's SDP Offer
        const remoteData = await getRemoteState(peer);
        
        localPeerConnection = new RTCPeerConnection(iceConfiguration);
        
        if (localStream) {
            localStream.getTracks().forEach(track => localPeerConnection.addTrack(track, localStream));
        }

        localPeerConnection.onicecandidate = e => {
            if (e.candidate) {
                sendCandidateToCloud(phone, e.candidate);
            }
        };

        await localPeerConnection.setRemoteDescription(new RTCSessionDescription(remoteData.sdp));
        
        const answer = await localPeerConnection.createAnswer();
        await localPeerConnection.setLocalDescription(answer);

        phoneState.sdp = answer;
        
        // Publish Answer to server
        await sendStateToCloud(phone, phoneState);

        // Fetch Caller candidates
        if (remoteData.candidates && remoteData.candidates.length > 0) {
            for (const cand of remoteData.candidates) {
                await localPeerConnection.addIceCandidate(new RTCIceCandidate(cand)).catch(e => {});
            }
            await clearRemoteCandidates(peer);
        }

        startCallTimer(phone);
        startVisualizer(phone);
    }
}

// --- Hangup Call ---

async function hangupCall(phone) {
    const phoneState = state[phone];
    const peer = phoneState.activePeer;

    // Save history logs locally
    if (peer) {
        const peerState = state[peer];
        saveCallLog(phone, peer, phoneState.status);
        if (currentViewMode === 'dual') {
            saveCallLog(peer, phone, peerState.status === 'incoming' ? 'missed' : peerState.status);
        }
    }

    // Stop ringtones & calling signals
    audioA.stopRingtone();
    audioA.stopCallingTone();
    audioB.stopRingtone();
    audioB.stopCallingTone();

    const audio = phone === 'a' ? audioA : audioB;
    audio.playDisconnectTone();

    document.getElementById(`phone-a`).classList.remove('vibrate-active');
    document.getElementById(`phone-b`).classList.remove('vibrate-active');

    // Close WebRTC
    if (localPeerConnection) {
        localPeerConnection.close();
        localPeerConnection = null;
    }
    if (localPeerConnectionB) {
        localPeerConnectionB.close();
        localPeerConnectionB = null;
    }

    stopCallTimer('a');
    stopCallTimer('b');
    stopVisualizer('a');
    stopVisualizer('b');

    // If Remote, reset server signaling state
    if (currentViewMode !== 'dual') {
        await resetSignaling(phone);
    }

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

// Toggle mute
function toggleMute(phone) {
    const phoneState = state[phone];
    phoneState.isMuted = !phoneState.isMuted;
    
    const btn = document.getElementById(`phone-${phone}-btn-mute`);
    if (phoneState.isMuted) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }
}

// Toggle speaker
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

// --- Call logs (Recentes) Persistent storage ---

function saveCallLog(phone, peer, callOutcome) {
    const logs = JSON.parse(localStorage.getItem(`calls_${phone}`)) || [];
    
    // Adjust logic to get name and number of the peer based on mode
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
