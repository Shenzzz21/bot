document.addEventListener("DOMContentLoaded", () => {
    const chatWindow = document.getElementById("chat-window");
    const textInput = document.getElementById("message_input");
    const sendButton = document.getElementById("send_button");
    const startRecord = document.getElementById("start_recording_button");
    const stopRecord = document.getElementById("stop_recording_button");

    console.log({
        chatWindow: document.getElementById("chat-window"),
        textInput: document.getElementById("message_input"),
        sendButton: document.getElementById("send_button"),
        startRecord: document.getElementById("start_recording_button"),
        stopRecord: document.getElementById("stop_recording_button")
    });

    document.addEventListener("DOMContentLoaded", () => {
        try {
            const chatWindow = document.getElementById("chat-window");
            if (!chatWindow) throw new Error("chat-window not found");
            const textInput = document.getElementById("message_input");
            if (!textInput) throw new Error("message_input not found");
            const sendButton = document.getElementById("send_button");
            if (!sendButton) throw new Error("send_button not found");
            const startRecord = document.getElementById("start_recording_button");
            if (!startRecord) throw new Error("start_recording_button not found");
            const stopRecord = document.getElementById("stop_recording_button");
            if (!stopRecord) throw new Error("stop_recording_button not found");
    
            // Continue with your script logic
        } catch (error) {
            console.error(error.message);
        }
    });
    
    
    // Function to append messages to the chat window
    const appendMessage = (message, sender) => {
        const chatMessage = document.createElement("div");
        chatMessage.classList.add("chat-message", sender);
        const messageBubble = document.createElement("div");
        messageBubble.classList.add("message");
        messageBubble.textContent = message;
        chatMessage.appendChild(messageBubble);
        chatWindow.appendChild(chatMessage);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    };

    // Function to send a text message
    const sendTextMessage = async () => {
        const userMessage = textInput.value.trim();
        if (!userMessage) return;

        appendMessage(userMessage, "user");
        textInput.value = "";

        const typingIndicator = document.createElement("div");
        typingIndicator.classList.add("typing-indicator");
        typingIndicator.textContent = "Bot is typing...";
        chatWindow.appendChild(typingIndicator);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        try {
            const response = await fetch("/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: userMessage }),
            });
            const data = await response.json();
            typingIndicator.remove();

            if (data.answer) {
                appendMessage(data.answer, "bot");
            } else {
                appendMessage("I couldn't find an answer to your question.", "bot");
            }
        } catch (error) {
            typingIndicator.remove();
            appendMessage("Error connecting to the server!", "bot");
        }
    };

    // Event listener for the send button
    sendButton.addEventListener("click", sendTextMessage);

    // Event listener for pressing Enter to send a message
    textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });

    let mediaRecorder;
    let audioChunks = [];

    startRecord.onclick = () => {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                console.log("Microphone access granted, starting recording...");
                mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
                mediaRecorder.start();
                audioChunks = [];
                mediaRecorder.addEventListener("dataavailable", event => {
                    audioChunks.push(event.data);
                });
                startRecord.disabled = true;
                stopRecord.disabled = false;
            })
            .catch(error => {
                console.error("Error accessing microphone:", error);
                alert("Microphone access denied or unavailable.");
            });
    };    

    stopRecord.onclick = () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            console.log("Stopping recording...");
            mediaRecorder.stop();
            startRecord.disabled = false;
            stopRecord.disabled = true;
    
            mediaRecorder.addEventListener("stop", () => {
                console.log("Recording stopped, processing audio...");
                const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                convertToWav(audioBlob).then(wavBlob => {
                    const formData = new FormData();
                    formData.append("audio", wavBlob, "recording.wav");
                    fetch("/queryaudio", {
                        method: "POST",
                        body: formData
                    })
                    .then(response => response.json())
                    .then(data => {
                        console.log("Response received:", data);
                        appendMessage(`${data.query}`, "user");
                        appendMessage(`${data.response}`, "bot");
                    
                        if (typeof data.audio_response === 'string') {
                            const audio = new Audio(`data:audio/mp3;base64,${data.audio_response}`);
                            audio.play();
                        } else {
                            console.error("Invalid audio response:", data.audio_response);
                        }
                    })
                    .catch(error => console.error("Error sending audio to server:", error));
                });
            });
        } else {
            console.warn("MediaRecorder not in recording state.");
        }
    };    

    function convertToWav(blob) {
        return new Promise(resolve => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const fileReader = new FileReader();

            fileReader.onload = event => {
                const arrayBuffer = event.target.result;
                audioContext.decodeAudioData(arrayBuffer, buffer => {
                    const wavBuffer = bufferToWav(buffer);
                    resolve(new Blob([wavBuffer], { type: "audio/wav" }));
                });
            };

            fileReader.readAsArrayBuffer(blob);
        });
    }

    function bufferToWav(abuffer) {
        const numOfChan = abuffer.numberOfChannels;
        const length = abuffer.length * numOfChan * 2 + 44;
        const buffer = new ArrayBuffer(length);
        const view = new DataView(buffer);
        const channels = [];
        let offset = 0;
        let pos = 0;

        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // length = 16
        setUint16(1); // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(abuffer.sampleRate);
        setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2); // block-align
        setUint16(16); // 16-bit

        setUint32(0x61746164); // "data" - chunk
        setUint32(length - pos - 4); // chunk length

        for (let i = 0; i < abuffer.numberOfChannels; i++) {
            channels.push(abuffer.getChannelData(i));
        }

        while (pos < length) {
            for (let i = 0; i < numOfChan; i++) {
                const sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
                view.setInt16(pos, (sample * 32767) | 0, true); // scale to 16-bit signed int
                pos += 2;
            }
            offset++;
        }

        return buffer;

        function setUint16(data) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    }
});
