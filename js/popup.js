document.addEventListener('DOMContentLoaded', async () => {
  const resetButton = document.getElementById('reset');
  const vlessKeyInput = document.getElementById('vlessKey');
  const vlessKeyContainer = document.getElementById('vlessKeyContainer');
  const keyDisplay = document.getElementById('keyValue');
  const keyDisplayContainer = document.getElementById('keyDisplayContainer');
  const connectButton = document.getElementById('connect');
  const disconnectButton = document.getElementById('disconnect');
  const addDomainButton = document.getElementById('addDomain');
  const removeDomainButton = document.getElementById('removeDomain');
  const currentDomainElement = document.getElementById('currentDomain');
  const statusElement = document.getElementById('status');
  const copyKeyElement = document.getElementById('copyKey');
  

  function getDomainPattern(domain) {
    const parts = domain.split('.');
    if (parts.length > 2) {
      return `*${parts.slice(-2).join('.')}`;
    }
    return domain;
  }

  // Получаем домен текущей вкладки
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  const currentUrl = currentTab.url;
  const currentDomain = getDomainPattern(new URL(currentUrl).hostname);
  currentDomainElement.value = currentDomain;

  // Получаем сохраненные данные
  const data = await chrome.storage.local.get(['vlessKey', 'domains', 'isConnected']);
  const storedKey = data.vlessKey || '';
  const domains = data.domains || [];
  const isConnected = data.isConnected || false;

  // Обновляем кнопки управления доменом
  if (domains.includes(currentDomain)) {
    removeDomainButton.classList.remove('hidden');
  } else {
    addDomainButton.classList.remove('hidden');
  }

  // Обновляем интерфейс ключа и подключения
  updateUI(isConnected, storedKey);

  // Обработчики событий
  addDomainButton.addEventListener('click', async () => {
    domains.push(currentDomain);
    await chrome.storage.local.set({ domains });
    addDomainButton.classList.add('hidden');
    removeDomainButton.classList.remove('hidden');
    updateStatus(`Добавлен ${currentDomain} в список VPN`);
  });

  removeDomainButton.addEventListener('click', async () => {
    const index = domains.indexOf(currentDomain);
    if (index > -1) {
      domains.splice(index, 1);
      await chrome.storage.local.set({ domains });
      removeDomainButton.classList.add('hidden');
      addDomainButton.classList.remove('hidden');
      updateStatus(`Удален ${currentDomain} из списка VPN`);
    }
  });

  connectButton.addEventListener('click', async () => {
    const vlessKey = vlessKeyInput.value.trim();
    if (!vlessKey) {
      updateStatus('Пожалуйста, введите ключ VLESS');
      return;
    }
    chrome.runtime.sendMessage({ action: 'connect', vlessKey }, (response) => {
      updateStatus(response.status);
      if (response.status === 'Connected') {
        chrome.storage.local.set({ vlessKey, isConnected: true });
        updateUI(true, vlessKey);
      }
    });
  });

  disconnectButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnect' }, (response) => {
      updateStatus(response.status);
      if (response.status === 'Disconnected') {
        chrome.storage.local.set({ isConnected: false });
        updateUI(false, storedKey);
      }
    });
  });

  resetButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnect' }, (response) => {
      chrome.storage.local.set({ isConnected: false, vlessKey: '' }, () => {
        vlessKeyInput.value = '';
        updateUI(false, storedKey);
        updateStatus('Reset complete');
      });
    });
  });

  copyKeyElement.addEventListener('click', (e) => {
    navigator.clipboard.writeText(storedKey);
    e.target.remove();
  });

  function updateUI(isConnected, key) {
    vlessKeyContainer.classList.toggle('hidden', isConnected);
    keyDisplayContainer.classList.toggle('hidden', !isConnected);
    connectButton.classList.toggle('hidden', isConnected);
    disconnectButton.classList.toggle('hidden', !isConnected);
    keyDisplay.innerHTML = isConnected ? key.replace(/&/g, '&<wbr>') : '';
    vlessKeyInput.value = isConnected ? '' : key;
  }

  function updateStatus(message) {
    statusElement.textContent = message;
  }
});
