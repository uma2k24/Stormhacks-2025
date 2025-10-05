// -----------------------------
// Config
// -----------------------------
const API_KEY = "sk_32454f6661293ee996467313112e60f063501985571290d0"; // hardcoded ElevenLabs key
const VOICE_ID = "L1aJrPa7pLJEyYlh3Ilq"; // Oliver's voice (Default?)
let CURR_VOICE_ID = VOICE_ID; // allow changing voice later if needed
const MODEL_ID = "eleven_multilingual_v2";
const API_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MAX_CHAR_LENGTH = 5000;

// -----------------------------
// Context menu setup (startup & install), old version was on install only
// -----------------------------
function createContextMenu() {
    // Remove any existing menu items first
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "narrate-selection",
            title: "Narrate with ElevenLabs",
            contexts: ["selection"]
        });
    });
}

// Run on extension install
chrome.runtime.onInstalled.addListener(createContextMenu);

// Run on browser startup (service worker wakes up)
chrome.runtime.onStartup.addListener(createContextMenu);

function requestSelectionFromTab(tabId, selectionText = null) {
    // More debug printing, stupid menu wont print anything now...
    console.log("Sending selection to tab:", tabId, selectionText);
    chrome.tabs.sendMessage(tabId, {
        type: "GET_SELECTION_AND_NARRATE",
        selectionText: selectionText
    }, () => {
        const err = chrome.runtime.lastError;
        if (err) console.error("Error sending message to tab:", err.message);
    });
}


// -----------------------------
// Handle menu click or keyboard command, consolelog working now, api isnt
// -----------------------------
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "narrate-selection" && tab?.id !== undefined) {
        requestSelectionFromTab(tab.id, info.selectionText);
    }
});



chrome.commands.onCommand.addListener((command) => {
    if (command === "narrate-selection") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const [tab] = tabs;
            if (tab?.id !== undefined) requestSelectionFromTab(tab.id);
        });
    }
});

// -----------------------------
// Messaging from content script
// -----------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // If the message is a narration request
    if (message?.type === "NARRATE") {
        const tabId = sender.tab?.id;
        if (tabId === undefined) {
            sendResponse({ ok: false, error: "Missing tab context" });
            return;
        }

        handleNarrationRequest(message.text, tabId)
            .then(() => sendResponse({ ok: true }))
            .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
    }
    // If the message is for changing the narrator
    else if (message?.type === "SET_VOICE_ID") {
        CURR_VOICE_ID = message.voice_id;
        console.log("Voice changed to:", CURRENT_VOICE_ID);
        sendResponse({ ok: true });
        return true;
    }
});

// -----------------------------
// Main narration logic
// -----------------------------
async function handleNarrationRequest(rawText, tabId) {
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (!text) {
        await sendErrorToTab(tabId, "Nothing to narrate.");
        return;
    }

    if (text.length > MAX_CHAR_LENGTH) {
        await sendErrorToTab(tabId, "Selection too long (max 5000 chars).");
        return;
    }

    try {
        const { audioBase64, mimeType } = await requestNarrationFromElevenLabs(text, API_KEY);
        await sendToTab(tabId, { type: "PLAY_AUDIO", audio: audioBase64, mimeType });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to narrate selection.";
        console.error("Eleven Narrator:", message);
        await sendErrorToTab(tabId, message);
        throw error;
    }
}

// -----------------------------
// Helper: request text-to-speech
// -----------------------------
async function requestNarrationFromElevenLabs(text, apiKey) {
    const url = `${API_BASE_URL}/${VOICE_ID}`;
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
function sendToTab(tabId, message) {
    chrome.tabs.sendMessage(tabId, message, () => {
        const err = chrome.runtime.lastError;
        // More debug printing
        if (err) console.error("Error sending message to tab:", err.message);
    });
}


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
                console.error("Eleven Narrator:", err.message);
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
