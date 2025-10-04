const STORAGE_KEY = "elevenlabsApiKey";
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs Rachel voice
const MODEL_ID = "eleven_multilingual_v2";
const API_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MAX_CHAR_LENGTH = 5000;

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "narrate-selection",
        title: "Narrate with ElevenLabs",
        contexts: ["selection"]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "narrate-selection" && tab?.id !== undefined) {
        requestSelectionFromTab(tab.id);
    }
});

chrome.commands.onCommand.addListener((command) => {
    if (command === "narrate-selection") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const [tab] = tabs;
            if (tab?.id !== undefined) {
                requestSelectionFromTab(tab.id);
            }
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    return undefined;
});

async function handleNarrationRequest(rawText, tabId) {
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (!text) {
        await sendErrorToTab(tabId, "Nothing to narrate.");
        return;
    }

    if (text.length > MAX_CHAR_LENGTH) {
        await sendErrorToTab(tabId, "Selection is too long to narrate (limit 5000 characters).");
        return;
    }

    const apiKey = await getStoredApiKey();
    if (!apiKey) {
        await sendErrorToTab(tabId, "Missing ElevenLabs API key. Open the popup to save one.");
        return;
    }

    try {
        const { audioBase64, mimeType } = await requestNarrationFromElevenLabs(text, apiKey);
        await sendToTab(tabId, { type: "PLAY_AUDIO", audio: audioBase64, mimeType });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to narrate selection.";
        console.error("Eleven Narrator:", message);
        await sendErrorToTab(tabId, message);
        throw error;
    }
}

function requestSelectionFromTab(tabId) {
    sendToTab(tabId, { type: "GET_SELECTION_AND_NARRATE" });
}

function getStoredApiKey() {
    return new Promise((resolve) => {
        chrome.storage.sync.get([STORAGE_KEY], (result) => {
            if (chrome.runtime.lastError) {
                console.error("Eleven Narrator:", chrome.runtime.lastError.message);
                resolve(null);
                return;
            }
            resolve(result?.[STORAGE_KEY] || null);
        });
    });
}

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
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.7
            }
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

async function tryReadError(response) {
    try {
        const data = await response.json();
        if (data?.detail) {
            return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
        }
    } catch (err) {
        // ignored
    }
    try {
        const text = await response.text();
        return text || "Unknown error";
    } catch (err) {
        return "Unknown error";
    }
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
