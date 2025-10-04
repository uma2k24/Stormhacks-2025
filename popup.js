const STORAGE_KEY = "elevenlabsApiKey";

document.addEventListener("DOMContentLoaded", () => {
    const readButton = document.getElementById("read");
    const stopButton = document.getElementById("stop");
    const pauseButton = document.getElementById("pause");
    const resumeButton = document.getElementById("resume");
    const apiForm = document.getElementById("apiForm");
    const apiKeyInput = document.getElementById("apiKey");
    const keyStatus = document.getElementById("keyStatus");

    loadApiKey(apiKeyInput, keyStatus);

    readButton?.addEventListener("click", () => {
        sendToActiveTab({ type: "GET_SELECTION_AND_NARRATE" });
    });

    stopButton?.addEventListener("click", () => {
        sendToActiveTab({ type: "STOP_AUDIO" });
    });

    pauseButton?.addEventListener("click", () => {
        sendToActiveTab({ type: "PAUSE_AUDIO" });
    });

    resumeButton?.addEventListener("click", () => {
        sendToActiveTab({ type: "RESUME_AUDIO" });
    });

    apiForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const key = apiKeyInput?.value.trim() ?? "";
        saveApiKey(key, keyStatus);
    });
});

function withActiveTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
            console.error("Eleven Narrator:", chrome.runtime.lastError.message);
            return;
        }
        const [tab] = tabs;
        if (tab?.id !== undefined) {
            callback(tab);
        }
    });
}

function sendToActiveTab(message) {
    withActiveTab((tab) => {
        chrome.tabs.sendMessage(tab.id, message, () => {
            const err = chrome.runtime.lastError;
            if (err && !/Receiving end does not exist/i.test(err.message)) {
                console.error("Eleven Narrator:", err.message);
            }
        });
    });
}

function loadApiKey(inputEl, statusEl) {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
            setStatus(statusEl, "Unable to load key.");
            return;
        }
        const storedKey = result?.[STORAGE_KEY] ?? "";
        if (inputEl) inputEl.value = storedKey;
        setStatus(statusEl, "", 0);
    });
}

function saveApiKey(key, statusEl) {
    chrome.storage.sync.set({ [STORAGE_KEY]: key }, () => {
        if (chrome.runtime.lastError) {
            setStatus(statusEl, "Failed to save key.");
            return;
        }
        setStatus(statusEl, key ? "API key saved." : "API key cleared.");
    });
}

function setStatus(statusEl, text, timeout = 2000) {
    if (!statusEl) return;
    statusEl.textContent = text;
    if (timeout > 0 && text) {
        setTimeout(() => {
            if (statusEl.textContent === text) {
                statusEl.textContent = "";
            }
        }, timeout);
    }
}
