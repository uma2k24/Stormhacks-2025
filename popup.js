document.addEventListener('DOMContentLoaded', () => {
  //grab buttons from popup.html
  const Read   = document.getElementById('read');
  const Stop   = document.getElementById('stop');
  const Pause  = document.getElementById('pause');
  const Resume = document.getElementById('resume');

  //get active tab id
  function withActiveTab(doSomething) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs && tabs[0] && tabs[0].id;
      if (id) doSomething(id);
    });
  }

  //when "Read" button is clicked: prompt user to highlight text
  Read.addEventListener('click', () => {
    withActiveTab((tabId) => {
      chrome.tabs.sendMessage(tabId, { type: 'ARM_SELECTION_MODE' }, () => { //send message to content.js to enter arm selection mode
        //if the page does not allow acess to extensions, show warning
        if (chrome.runtime.lastError) {
          console.warn('Cannot make selection: ', chrome.runtime.lastError.message);
          alert('This page may have blocked extensions. Try another page.');
          return;
        }

        //close popup so user can select text on the page
        window.close();

      });
    });
  });


 //TTS control buttons, may need API 

});