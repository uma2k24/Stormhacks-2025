const HIGHLIGHT_CLASS = "eleven-narrator-highlight";
const STYLE_ID = "eleven-narrator-style";

let currentHighlight = null;
let activeAudio = null;
let activeAudioUrl = null;

ensureHighlightStyles();

function getSelectionText() {
    const selection = window.getSelection();
    return selection && selection.toString().trim();
}

function ensureHighlightStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `.${HIGHLIGHT_CLASS} {
        background-color: #ffe58f;
        padding: 0 0.05em;
        border-radius: 0.1em;
        transition: background-color 0.3s ease;
    }`;
    (document.head || document.documentElement).appendChild(style);
}

function clearHighlight() {
    if (!currentHighlight || !currentHighlight.parentNode) {
        currentHighlight = null;
        return;
    }

    const parent = currentHighlight.parentNode;
    while (currentHighlight.firstChild) {
        parent.insertBefore(currentHighlight.firstChild, currentHighlight);
    }
    parent.removeChild(currentHighlight);
    currentHighlight = null;
}

function highlightSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    ensureHighlightStyles();
    clearHighlight();

    const range = selection.getRangeAt(0);
    const highlight = document.createElement("mark");
    highlight.className = HIGHLIGHT_CLASS;

    try {
        highlight.appendChild(range.extractContents());
        range.insertNode(highlight);
        selection.removeAllRanges();
        selection.selectAllChildren(highlight);
        currentHighlight = highlight;
    } catch (err) {
        console.warn("Eleven Narrator: unable to highlight selection", err);
        currentHighlight = null;
        selection.removeAllRanges();
    }

    return { text };
}

// Reworked this function to not be dependent on highlight (we lose highlight in extension menu)
function sendSelection(passedText) {
    const text = passedText || window.getSelection()?.toString()?.trim();
    console.log("Sending selection to background:", text);
    if (!text) return;
    chrome.runtime.sendMessage({ type: "NARRATE", text });
}




function stopAudioPlayback({ clear = true } = {}) {
    if (activeAudio) {
        try {
            activeAudio.pause();
            activeAudio.currentTime = 0;
        } catch (err) {
            console.warn("Eleven Narrator: unable to stop audio", err);
        }
    }
    if (activeAudioUrl && activeAudioUrl.startsWith("blob:")) {
        URL.revokeObjectURL(activeAudioUrl);
    }
    activeAudio = null;
    activeAudioUrl = null;
    if (clear) clearHighlight();
}

function pauseAudioPlayback() {
    if (activeAudio && !activeAudio.paused) {
        activeAudio.pause();
    }
}

function resumeAudioPlayback() {
    if (activeAudio && activeAudio.paused) {
        activeAudio.play().catch((err) => {
            console.error("Eleven Narrator: unable to resume audio", err);
        });
    }
}

function playAudioFromBase64(base64Audio, mimeType = "audio/mpeg") {
    stopAudioPlayback({ clear: false });
    const source = `data:${mimeType};base64,${base64Audio}`;
    activeAudioUrl = source;
    activeAudio = new Audio(source);
    activeAudio.addEventListener("ended", () => {
        clearHighlight();
        activeAudio = null;
        activeAudioUrl = null;
    });
    activeAudio.play().catch((err) => {
        console.error("Eleven Narrator: unable to play audio", err);
        clearHighlight();
    });
}

chrome.runtime.onMessage.addListener((msg) => {
    // More debugging...
    console.log("Content script received message:", msg);
    switch (msg?.type) {
        case "GET_SELECTION_AND_NARRATE":
            // Use selectionText from the background if provided
            sendSelection(msg.selectionText);
            break;
        case "PLAY_AUDIO":
            if (msg.audio) {
                playAudioFromBase64(msg.audio, msg.mimeType);
            }
            break;
        case "STOP_AUDIO":
            stopAudioPlayback();
            break;
        case "PAUSE_AUDIO":
            pauseAudioPlayback();
            break;
        case "RESUME_AUDIO":
            resumeAudioPlayback();
            break;
        case "NARRATION_ERROR":
            stopAudioPlayback();
            if (msg.error) {
                console.error("Eleven Narrator:", msg.error);
            }
            break;
        default:
            break;
    }
});
