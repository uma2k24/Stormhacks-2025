// Functions for saving selected mode to chrome storage
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

document.addEventListener("DOMContentLoaded", async () => {
    const readButton = document.getElementById("read");
    const stopButton = document.getElementById("stop");
    const pauseButton = document.getElementById("pause");
    const resumeButton = document.getElementById("resume");
    const modeSelect = document.getElementById("mode");

    // Load saved mode from storage, had to change document event listener to async
    const storedMode = await getStoredSelectedMode();
    if (modeSelect) modeSelect.value = storedMode;

    // Listener for detecting change in mode dropdown
    modeSelect.addEventListener("change", () => {
        const selectedMode = modeSelect.value;
        setStoredSelectedMode(selectedMode);
    });

    readButton?.addEventListener("click", () => {
        const selectedMode = modeSelect?.value || "Oliver"; // "Oliver", "Paige", or "Annie"
        console.log("Popup sending mode:", selectedMode);

        sendToActiveTab({
            type: "GET_SELECTION_AND_NARRATE",
            mode: selectedMode
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
