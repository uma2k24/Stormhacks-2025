// -----------------------------
// Config
// -----------------------------
const EL_API_KEY = "sk_32454f6661293ee996467313112e60f063501985571290d0"; // hardcoded ElevenLabs key
const GCP_API_KEY = "AIzaSyA-goMvDh6LwDhUUiJqJBCl_RYlbhTZReA"; // hardcoded GCP API key
const MODEL_ID = "eleven_multilingual_v2";
const EL_API_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const GCP_API_BASE_URL = "https://translation.googleapis.com/language/translate/v3";
const MAX_CHAR_LENGTH = 5000;

const VOICE_MAP = {
    "Oliver": "L1aJrPa7pLJEyYlh3Ilq",
    "Paige": "NDTYOmYEjbDIVCKB35i3",
    "Annie": "XW70ikSsadUbinwLMZ5w"
};

async function googleTranslateAuto({text, target}){
    if(!GCP_API_KEY) 
        throw new Error("Missing Google API key");
    if(!target || target === "none")
        return {translated: text, detected: null};

    const MAX_CHARS = 5000;
    const chars = [];
    for(let i = 0; i < text.length; i += MAX_CHARS){
        chars.push(text.slice(i, i+MAX_CHARS));
    }

    const qs = new URLSearchParams({key:GCP_API_KEY, target});
    const resp = await fetch(`${GCP_API_BASE_URL}?${qs.toString()}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({q: chars, format: "text"})
    });

    if(!resp.ok){
        const errorText = await tryReadError(resp);
        throw new Error(`Google translate failed: ${resp.status} ${errorText}`);
    }

    const data = await resp.json();
    const trs = (data?.data?.translations) || [];
    const translated = trs.map(t => t.translatedText).join("");

    const counts = {};
    trs.forEach(t => {
        const d = t.detectedSourceLanguage;
        if (d) counts[d] = (counts[d] || 0) + 1;
    });
    const detected = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;

    return {translated, detected};

}

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

// Made this async for getting stored mode
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "narrate-selection" && tab?.id !== undefined) {
        // Getting stored speaker, default to Oliver
        const { selectedMode } = await chrome.storage.local.get("selectedMode");
        const modeToUse = selectedMode || "Oliver";
        chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION_AND_NARRATE", mode: modeToUse });
    }
});

// Making this async for getting stored mode
chrome.commands.onCommand.addListener(async (command) => {
    if (command === "narrate-selection") {
        // Getting stored speaker, default to Oliver
        const { selectedMode } = await chrome.storage.local.get("selectedMode");
        const modeToUse = selectedMode || "Oliver";
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const [tab] = tabs;
            if (tab?.id !== undefined) {
                chrome.tabs.sendMessage(tab.id, { type: "GET_SELECTION_AND_NARRATE", mode: modeToUse });
            }
        });
    }
});

// -----------------------------
// Messaging from content/popup (Just content, popup passes through content)
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
        const { audioBase64, mimeType } = await requestNarrationFromElevenLabs(text, EL_API_KEY, voiceId);
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
    const url = `${EL_API_BASE_URL}/${voiceId}`;
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
