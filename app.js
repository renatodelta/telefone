// Core App Logic for VOIP Phone System Simulation

// Instantiating Tones Synthesizer
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

// WebRTC Peer Connections
let localPeerConnectionA = null;
let localPeerConnectionB = null;
let localStream = null;

// DTMF Keypad Tones Mapping
const toneFreqs = {
    '1': 350, '2': 440, '3': 480,
    '4': 350, '5': 440, '6': 480,
    '7': 350, '8': 440, '9': 480,
    '*': 350, '0': 440, '#': 480
};

// Initialization on load
window.addEventListener('DOMContentLoaded', () => {
    updateSystemTime();
    setInterval(updateSystemTime, 30000);
    
    // Load initial call history logs
    renderLogs('a');
    renderLogs('b');
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
    
    // Set active class on corresponding button
    const tabIndex = tabId === 'dialer' ? 0 : tabId === 'contacts' ? 1 : 2;
    phoneEl.querySelectorAll('.tab-btn')[tabIndex].classList.add('active');
}

// Handle Keypad digit presses
function pressKey(phone, key) {
    const phoneState = state[phone];
    if (phoneState.typedDigits.length < 15) {
        phoneState.typedDigits += key;
        document.getElementById(`phone-${phone}-display`).textContent = formatPhoneNumber(phoneState.typedDigits);
        
        // Play DTMF keypad feedback sound
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
    audio.playKeyPress(300); // short click sound
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

// --- VoIP Signaling & WebRTC Call Logic ---

// Request microphone access ahead of calls
async function requestMicrophonePermission() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        alert('Acesso ao microfone concedido! Agora as ligações usarão voz real via WebRTC.');
    } catch(err) {
        console.warn('Microphone permission denied, falling back to audio simulator.', err);
        alert('Permissão de microfone negada. O sistema usará simulação de áudio sintetizado.');
    }
}

// Start Call (Dialing)
function startCallInitiation(caller) {
    const callerState = state[caller];
    const dialed = callerState.typedDigits.replace('-', '');
    
    if (!dialed) return;

    // Define target recipient
    let receiver = null;
    if (caller === 'a' && dialed === '5550102') {
        receiver = 'b';
    } else if (caller === 'b' && dialed === '5550101') {
        receiver = 'a';
    }

    if (!receiver) {
        alert('Número inválido! Ligue para 555-0101 (Fone A) ou 555-0102 (Fone B).');
        return;
    }

    const receiverState = state[receiver];
    
    // Check if target line is busy
    if (receiverState.status !== 'idle') {
        alert('O telefone de destino está ocupado.');
        const audio = caller === 'a' ? audioA : audioB;
        audio.playDisconnectTone();
        return;
    }

    // Set States
    callerState.status = 'outgoing';
    callerState.activePeer = receiver;
    receiverState.status = 'incoming';
    receiverState.activePeer = caller;

    // Update Caller Screen UI
    const callScreenA = document.getElementById(`phone-${caller}-call-screen`);
    document.getElementById(`phone-${caller}-call-status`).textContent = 'Chamando...';
    document.getElementById(`phone-${caller}-call-name`).textContent = receiverState.displayName;
    document.getElementById(`phone-${caller}-call-number`).textContent = receiverState.number;
    
    // Hide Accept button, show only Decline
    document.getElementById(`phone-${caller}-btn-accept`).style.display = 'none';
    
    // Show Caller Screen
    callScreenA.classList.add('active');

    // Play Dial tone on Caller side
    const callerAudio = caller === 'a' ? audioA : audioB;
    callerAudio.startCallingTone();

    // Trigger Ringing Screen on Receiver side
    const callScreenB = document.getElementById(`phone-${receiver}-call-screen`);
    document.getElementById(`phone-${receiver}-call-status`).textContent = 'Ligação de Voz VoIP';
    document.getElementById(`phone-${receiver}-call-name`).textContent = callerState.displayName;
    document.getElementById(`phone-${receiver}-call-number`).textContent = callerState.number;
    
    // Show Accept & Decline button
    document.getElementById(`phone-${receiver}-btn-accept`).style.display = 'flex';
    
    // Add pulsing background elements
    document.getElementById(`phone-${receiver}-pulse-1`).style.display = 'block';
    document.getElementById(`phone-${receiver}-pulse-2`).style.display = 'block';

    // Show Ringing Screen
    callScreenB.classList.add('active');
    
    // Vibrate receiver device frame
    document.getElementById(`phone-${receiver}`).classList.add('vibrate-active');

    // Play Ringtone on Receiver side
    const receiverAudio = receiver === 'a' ? audioA : audioB;
    receiverAudio.startRingtone();
}

// Accept Call (Connected)
async function acceptCall(phone) {
    const phoneState = state[phone];
    const peer = phoneState.activePeer;
    const peerState = state[peer];

    if (!peer) return;

    // Stop Ringtone & Calling tones
    audioA.stopRingtone();
    audioA.stopCallingTone();
    audioB.stopRingtone();
    audioB.stopCallingTone();

    // Remove Vibrate classes
    document.getElementById(`phone-a`).classList.remove('vibrate-active');
    document.getElementById(`phone-b`).classList.remove('vibrate-active');

    // Play short connect chirp sound
    const audio = phone === 'a' ? audioA : audioB;
    audio.playConnectTone();

    // Update States to connected
    phoneState.status = 'connected';
    peerState.status = 'connected';

    // Hide Accept buttons on both phone screens
    document.getElementById('phone-a-btn-accept').style.display = 'none';
    document.getElementById('phone-b-btn-accept').style.display = 'none';

    // Hide Ring pulses
    document.getElementById('phone-a-pulse-1').style.display = 'none';
    document.getElementById('phone-a-pulse-2').style.display = 'none';
    document.getElementById('phone-b-pulse-1').style.display = 'none';
    document.getElementById('phone-b-pulse-2').style.display = 'none';

    // Initialize WebRTC
    await setupWebRTCPeerConnection();

    // Start active call timers
    startCallTimer('a');
    startCallTimer('b');

    // Run active frequency visualizers
    startVisualizer('a');
    startVisualizer('b');
}

// Set up the local WebRTC connection loopback
async function setupWebRTCPeerConnection() {
    try {
        localPeerConnectionA = new RTCPeerConnection();
        localPeerConnectionB = new RTCPeerConnection();

        // Connect ICE Candidates locally
        localPeerConnectionA.onicecandidate = e => {
            if (e.candidate) localPeerConnectionB.addIceCandidate(e.candidate).catch(err => console.error(err));
        };
        localPeerConnectionB.onicecandidate = e => {
            if (e.candidate) localPeerConnectionA.addIceCandidate(e.candidate).catch(err => console.error(err));
        };

        // If local microphone stream was granted, attach tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                localPeerConnectionA.addTrack(track, localStream);
                localPeerConnectionB.addTrack(track, localStream);
            });
        }

        // Handle incoming audio stream (if any)
        localPeerConnectionA.ontrack = e => {
            // Bind audio output element if we wanted actual loopback speaker output
            console.log('Stream WebRTC A estabelecido.');
        };
        localPeerConnectionB.ontrack = e => {
            console.log('Stream WebRTC B estabelecido.');
        };

        // Create SDP Offer
        const offer = await localPeerConnectionA.createOffer();
        await localPeerConnectionA.setLocalDescription(offer);
        await localPeerConnectionB.setRemoteDescription(offer);

        // Create SDP Answer
        const answer = await localPeerConnectionB.createAnswer();
        await localPeerConnectionB.setLocalDescription(answer);
        await localPeerConnectionA.setRemoteDescription(answer);

        console.log('WebRTC P2P estabelecido com sucesso!');

    } catch (err) {
        console.error('Falha ao conectar via WebRTC:', err);
    }
}

// Start Timer Display
function startCallTimer(phone) {
    const phoneState = state[phone];
    phoneState.callStartTime = Date.now();
    
    const labelEl = document.getElementById(`phone-${phone}-call-status`);
    
    phoneState.callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - phoneState.callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        labelEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

// Stop Timer
function stopCallTimer(phone) {
    const phoneState = state[phone];
    if (phoneState.callTimerInterval) {
        clearInterval(phoneState.callTimerInterval);
        phoneState.callTimerInterval = null;
    }
}

// Hangup / Decline Call
function hangupCall(phone) {
    const phoneState = state[phone];
    const peer = phoneState.activePeer;
    
    if (!peer) return;

    const peerState = state[peer];

    // Log call records in history
    saveCallLog(phone, peer, phoneState.status);
    saveCallLog(peer, phone, peerState.status === 'incoming' ? 'missed' : peerState.status);

    // Stop ringtones & calling signals
    audioA.stopRingtone();
    audioA.stopCallingTone();
    audioB.stopRingtone();
    audioB.stopCallingTone();

    // Play disconnect sound
    const audio = phone === 'a' ? audioA : audioB;
    audio.playDisconnectTone();

    // Remove Vibrate animations
    document.getElementById(`phone-a`).classList.remove('vibrate-active');
    document.getElementById(`phone-b`).classList.remove('vibrate-active');

    // Clean up WebRTC
    if (localPeerConnectionA) {
        localPeerConnectionA.close();
        localPeerConnectionA = null;
    }
    if (localPeerConnectionB) {
        localPeerConnectionB.close();
        localPeerConnectionB = null;
    }

    // Stop timers & visualizers
    stopCallTimer('a');
    stopCallTimer('b');
    stopVisualizer('a');
    stopVisualizer('b');

    // Reset phone UI states
    phoneState.status = 'idle';
    phoneState.activePeer = null;
    phoneState.typedDigits = '';
    document.getElementById(`phone-${phone}-display`).textContent = '';

    peerState.status = 'idle';
    peerState.activePeer = null;
    peerState.typedDigits = '';
    document.getElementById(`phone-${peer}-display`).textContent = '';

    // Slide call screens down
    document.getElementById(`phone-a-call-screen`).classList.remove('active');
    document.getElementById(`phone-b-call-screen`).classList.remove('active');

    // Reset feature icons
    resetFeatureButtons('a');
    resetFeatureButtons('b');

    // Refresh logs views
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

// Toggle mute functionality
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

// Toggle speaker functionality
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
    
    // Set responsive width
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

    const phoneState = state[phone];
    let angle = 0;

    const draw = () => {
        if (phoneState.status !== 'connected') return;

        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        canvasCtx.lineWidth = 3;
        
        // Define color gradient
        const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, 0);
        gradient.addColorStop(0, '#10b981');
        gradient.addColorStop(0.5, '#3b82f6');
        gradient.addColorStop(1, '#10b981');
        canvasCtx.strokeStyle = gradient;

        canvasCtx.beginPath();
        
        const sliceWidth = canvas.width / 80;
        let x = 0;

        for (let i = 0; i < 80; i++) {
            // Generate simulated audio wave fluctuation using multiple sine waves
            let amp = phoneState.isMuted ? 0 : (12 + Math.sin(angle + i * 0.15) * 8 + Math.cos(angle * 1.5 + i * 0.08) * 4);
            
            // Random noise spike to make it look alive/interactive
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
        
        // Advance oscillation wave speed
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
    
    const peerName = state[peer].displayName;
    const peerNumber = state[peer].number;
    
    let label = 'outgoing';
    if (callOutcome === 'connected') {
        label = 'outgoing'; // started call
    } else if (callOutcome === 'incoming') {
        label = 'incoming';
    } else if (callOutcome === 'missed') {
        label = 'missed';
    }

    // Insert new call record at the beginning of the list
    logs.unshift({
        name: peerName,
        number: peerNumber,
        type: label,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    // Keep log history under 12 items
    if (logs.length > 12) logs.pop();

    localStorage.setItem(`calls_${phone}`, JSON.stringify(logs));
}

function renderLogs(phone) {
    const logs = JSON.parse(localStorage.getItem(`calls_${phone}`)) || [];
    const listEl = document.getElementById(`phone-${phone}-log-list`);
    
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
