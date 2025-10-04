function getSelectionText(){
    const sel = window.getSelection();
    return sel && sel.toString().trim();
}

function sendSelection(command = "narrate"){
    const text = getSelectionText();
    if (!text) return;
    chrome.runtime.sendMessage({type: "NARRATE", text});
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "GET_SELECTION_AND_NARRATE") sendSelection();
});