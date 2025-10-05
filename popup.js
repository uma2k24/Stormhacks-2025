// Functions for saving selected mode to chrome storage, can't use await in popup or content scripts
function getStoredSelectedMode() {
    return new Promise((resolve) => {
        chrome.storage.local.get("selectedMode", (result) => {
            resolve(result.selectedMode || "Oliver"); // default to Oliver
        });
    });
}

function setStoredSelectedMode(mode) {
    chrome.storage.local.set({ selectedMode: mode });
}

// Functions for getting saved translation (No awaits in popup again...)
function getStoredLanguage() {
    return new Promise((resolve) => {
        chrome.storage.local.get("selectedLanguage", (result) => {
            resolve(result.selectedLanguage || "en"); // default English
        });
    });
}

function setStoredLanguage(lang) {
    chrome.storage.local.set({ selectedLanguage: lang });
}

document.addEventListener("DOMContentLoaded", async () => {
    const readButton = document.getElementById("read");
    const stopButton = document.getElementById("stop");
    const pauseButton = document.getElementById("pause");
    const resumeButton = document.getElementById("resume");
    const modeSelect = document.getElementById("mode");
    const langSelect = document.getElementById("targetLang");

    // Load saved mode from storage, had to change document event listener to async
    const storedMode = await getStoredSelectedMode();
    if (modeSelect) modeSelect.value = storedMode;
    const storedLang = await getStoredLanguage();
    if (langSelect) langSelect.value = storedLang;

    // Listener for detecting change in language dropdown
    langSelect.addEventListener("change", () => {
        const selectedLang = langSelect.value;
        setStoredLanguage(selectedLang);
    });

    // Listener for detecting change in mode dropdown
    modeSelect.addEventListener("change", () => {
        const selectedMode = modeSelect.value;
        setStoredSelectedMode(selectedMode);
    });

    readButton?.addEventListener("click", () => {
        const selectedMode = modeSelect?.value || "Oliver"; // "Oliver", "Paige", or "Annie"
        const selectedLang = langSelect?.value || "en"; // e.g. en, hi, pt
        console.log("Popup sending mode:", selectedMode);

        sendToActiveTab({
            type: "GET_SELECTION_AND_NARRATE",
            mode: selectedMode,
            lang: selectedLang
        }); 
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
});

function withActiveTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
            console.error("Eleven Narrator:", chrome.runtime.lastError.message);
            return;
        }
        const [tab] = tabs;
        if (tab?.id !== undefined) callback(tab);
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
