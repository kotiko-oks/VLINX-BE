document.addEventListener('DOMContentLoaded', () => {
  const vlessKeyInput = document.getElementById('vlessKey');
  const connectButton = document.getElementById('connect');
  const disconnectButton = document.getElementById('disconnect');
  const resetButton = document.getElementById('reset');
  const optionsButton = document.getElementById('options');
  const statusElement = document.getElementById('status');

  // Load saved VLESS key and connection state
  chrome.storage.local.get(['vlessKey', 'isConnected'], (data) => {
    if (data.vlessKey) {
      vlessKeyInput.value = data.vlessKey;
    }
    checkConnectionStatus((isConnected) => {
      updateUI(data.isConnected || isConnected);
    });
  });

  // Save VLESS key on input
  vlessKeyInput.addEventListener('input', () => {
    chrome.storage.local.set({ vlessKey: vlessKeyInput.value });
  });

  // Connect button click
  connectButton.addEventListener('click', () => {
    const vlessKey = vlessKeyInput.value;
    if (!vlessKey) {
      updateStatus('Please enter a VLESS key');
      return;
    }
    chrome.runtime.sendMessage({ action: 'connect', vlessKey }, (response) => {
      updateStatus(response.status);
      if (response.status === 'Connected') {
        chrome.storage.local.set({ isConnected: true });
        updateUI(true);
      }
    });
  });

  // Disconnect button click
  disconnectButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnect' }, (response) => {
      updateStatus(response.status);
      if (response.status === 'Disconnected') {
        chrome.storage.local.set({ isConnected: false });
        updateUI(false);
      }
    });
  });

  // Reset button click
  resetButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnect' }, (response) => {
      chrome.storage.local.set({ isConnected: false, vlessKey: '' }, () => {
        vlessKeyInput.value = '';
        updateUI(false);
        updateStatus('Reset complete');
      });
    });
  });

  // Options button click
  optionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Check if the proxy is actually active
  function checkConnectionStatus(callback) {
    chrome.proxy.settings.get({}, (details) => {
      const isConnected = details.value.mode === 'pac_script'; // Теперь проверяем PAC-скрипт
      callback(isConnected);
    });
  }

  // Update UI based on connection state
  function updateUI(isConnected) {
    vlessKeyInput.disabled = isConnected;
    connectButton.classList.toggle('hidden', isConnected);
    disconnectButton.classList.toggle('hidden', !isConnected);
    statusElement.textContent = isConnected ? 'Connected' : 'Disconnected';
  }

  // Update status message
  function updateStatus(message) {
    statusElement.textContent = message;
  }
});
