// Web Audio API Synthesizer for Phone System Tones

class PhoneAudioEngine {
    constructor() {
        this.ctx = null;
        this.callingInterval = null;
        this.ringtoneInterval = null;
        this.activeNodes = [];
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Play DTMF tone for keypad clicks
    playKeyPress(frequency = 440) {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    // Play call tone: "Tuuuu... Tuuuu..."
    startCallingTone() {
        this.init();
        this.stopCallingTone();

        const playBeep = () => {
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(350, this.ctx.currentTime);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(440, this.ctx.currentTime);

            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.08, this.ctx.currentTime + 1.2);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.ctx.destination);

            osc1.start();
            osc2.start();
            
            osc1.stop(this.ctx.currentTime + 1.5);
            osc2.stop(this.ctx.currentTime + 1.5);

            this.activeNodes.push(osc1, osc2, gain);
        };

        playBeep();
        this.callingInterval = setInterval(playBeep, 3000);
    }

    stopCallingTone() {
        if (this.callingInterval) {
            clearInterval(this.callingInterval);
            this.callingInterval = null;
        }
        this.cleanActiveNodes();
    }

    // Modern WhatsApp-style pleasant synth ringtone
    startRingtone() {
        this.init();
        this.stopRingtone();

        // Elegant synth arpeggio on loop
        const notes = [523.25, 659.25, 783.99, 987.77, 880.00, 783.99]; // C5, E5, G5, B5, A5, G5
        let step = 0;

        const playNote = () => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(notes[step % notes.length], this.ctx.currentTime);
            
            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.4);
            this.activeNodes.push(osc, gain);

            step++;
        };

        playNote();
        this.ringtoneInterval = setInterval(playNote, 180);
    }

    stopRingtone() {
        if (this.ringtoneInterval) {
            clearInterval(this.ringtoneInterval);
            this.ringtoneInterval = null;
        }
        this.cleanActiveNodes();
    }

    // Play connection success chirp
    playConnectTone() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, this.ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    // Play call ended busy tone: "Tu, Tu, Tu"
    playDisconnectTone() {
        this.init();
        
        let count = 0;
        const playBeep = () => {
            if (count >= 3) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(425, this.ctx.currentTime);

            gain.gain.setValueAtTime(0, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.08, this.ctx.currentTime + 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.3);
            
            count++;
            setTimeout(playBeep, 500);
        };

        playBeep();
    }

    cleanActiveNodes() {
        // Cancel scheduled node outputs
        this.activeNodes.forEach(node => {
            try {
                node.disconnect();
            } catch(e) {}
        });
        this.activeNodes = [];
    }
}
