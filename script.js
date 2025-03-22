document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    const stopButton = document.getElementById('stopButton');
    const recordingsContainer = document.getElementById('recordings');
    let mediaRecorder;
    let audioChunks = [];

    // Request microphone access
    async function setupRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const audioUrl = URL.createObjectURL(audioBlob);
                createAudioElement(audioUrl);
                audioChunks = [];
            };
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Error accessing microphone. Please ensure you have granted permission.');
        }
    }

    function createAudioElement(audioUrl) {
        const recordingItem = document.createElement('div');
        recordingItem.className = 'recording-item';
        
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = audioUrl;
        
        recordingItem.appendChild(audio);
        recordingsContainer.appendChild(recordingItem);
    }

    recordButton.addEventListener('click', () => {
        if (!mediaRecorder) {
            setupRecording().then(() => {
                mediaRecorder.start();
                recordButton.disabled = true;
                stopButton.disabled = false;
            });
        } else {
            mediaRecorder.start();
            recordButton.disabled = true;
            stopButton.disabled = false;
        }
    });

    stopButton.addEventListener('click', () => {
        mediaRecorder.stop();
        recordButton.disabled = false;
        stopButton.disabled = true;
    });
});
