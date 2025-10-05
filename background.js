// -----------------------------
// Config
// -----------------------------
const API_KEY = "sk_32454f6661293ee996467313112e60f063501985571290d0"; // hardcoded ElevenLabs key
const MODEL_ID = "eleven_multilingual_v2";
const API_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MAX_CHAR_LENGTH = 5000;

const VOICE_MAP = {
    "Oliver": "L1aJrPa7pLJEyYlh3Ilq",
    "Paige": "NDTYOmYEjbDIVCKB35i3",
    "Annie": "XW70ikSsadUbinwLMZ5w"
};

// -----------------------------
// Context menu
// -----------------------------
function createContextMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "narrate-selection",
            title: "Narrate with ElevenLabs",
            contexts: ["selection"]
        });
    });
}

chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "narrate-selection" && tab?.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION_AND_NARRATE" });
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command === "narrate-selection") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const [tab] = tabs;
            if (tab?.id !== undefined) {
                chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION_AND_NARRATE" });
            }
        });
    }
});

// -----------------------------
// Messaging from content/popup
// -----------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message?.type) return;
    console.log("Background received message:", message);

    if (message.type === "NARRATE" || message.type === "GET_SELECTION_AND_NARRATE") {
        const tabId = sender.tab?.id;
        if (tabId === undefined) {
            sendResponse({ ok: false, error: "Missing tab context" });
            return;
        }

        const text = message.text || message.selectionText;
        const mode = message.mode || "Oliver"; // default voice

        handleNarrationRequest(text, tabId, mode)
            .then(() => sendResponse({ ok: true }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));

        return true; // keep port open for async
    }
});

// -----------------------------
// Main narration logic
// -----------------------------
async function handleNarrationRequest(rawText, tabId, mode = "Oliver") {
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (!text) {
        await sendErrorToTab(tabId, "Nothing to narrate.");
        return;
    }
    if (text.length > MAX_CHAR_LENGTH) {
        await sendErrorToTab(tabId, "Selection too long (max 5000 chars).");
        return;
    }

    const voiceId = VOICE_MAP[mode] || VOICE_MAP["Oliver"];
    console.log("handleNarrationRequest called with mode:", mode, "voiceId:", voiceId);



    try {
        const { audioBase64, mimeType } = await requestNarrationFromElevenLabs(text, API_KEY, voiceId);
        await sendToTab(tabId, { type: "PLAY_AUDIO", audio: audioBase64, mimeType });
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to narrate selection.";
        console.error("Eleven Narrator:", message);
        await sendErrorToTab(tabId, message);
        throw err;
    }
}

// -----------------------------
// API call
// -----------------------------
async function requestNarrationFromElevenLabs(text, apiKey, voiceId) {
    const url = `${API_BASE_URL}/${voiceId}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
            "xi-api-key": apiKey
        },
        body: JSON.stringify({
            text,
            model_id: MODEL_ID,
            voice_settings: { stability: 0.5, similarity_boost: 0.7 }
        })
    });

    if (!response.ok) {
        const errorText = await tryReadError(response);
        throw new Error(`ElevenLabs request failed (${response.status}): ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type") || "audio/mpeg";
    const audioBase64 = arrayBufferToBase64(buffer);
    return { audioBase64, mimeType };
}

// -----------------------------
// Helpers
// -----------------------------
function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function sendToTab(tabId, message) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, () => {
            const err = chrome.runtime.lastError;
            if (err && !/Receiving end does not exist/i.test(err.message)) {
                console.error("Error sending message to tab:", err.message);
            }
            resolve();
        });
    });
}

function sendErrorToTab(tabId, error) {
    return sendToTab(tabId, { type: "NARRATION_ERROR", error });
}

async function tryReadError(response) {
    try {
        const data = await response.json();
        if (data?.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    } catch {}
    try {
        const text = await response.text();
        return text || "Unknown error";
    } catch {
        return "Unknown error";
    }
}
