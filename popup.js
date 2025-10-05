document.addEventListener("DOMContentLoaded", () => {
    const readButton = document.getElementById("read");
    const stopButton = document.getElementById("stop");
    const pauseButton = document.getElementById("pause");
    const resumeButton = document.getElementById("resume");
    const modeSelect = document.getElementById("mode");

    readButton?.addEventListener("click", () => {
        const selectedMode = modeSelect?.value || "Oliver"; // "Oliver", "Paige", or "Annie"
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
