document.addEventListener('DOMContentLoaded', async () => {
  const vlessKeyInput = document.getElementById('vlessKey');
  const keyDisplay = document.getElementById('keyValue');
  const connectButton = document.getElementById('connect');
  const disconnectButton = document.getElementById('disconnect');
  const addDomainButton = document.getElementById('addDomain');
  const removeDomainButton = document.getElementById('removeDomain');
  const currentDomainElement = document.getElementById('currentDomain');
  const statusElement = document.getElementById('status');

  // Получаем домен текущей вкладки
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  const currentUrl = currentTab.url;
  const currentDomain = new URL(currentUrl).hostname;
  currentDomainElement.textContent = currentDomain;

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
  if (isConnected) {
    vlessKeyInput.classList.add('hidden');
    keyDisplay.textContent = storedKey;
    keyDisplay.parentElement.classList.remove('hidden');
    disconnectButton.classList.remove('hidden');
  } else {
    vlessKeyInput.classList.remove('hidden');
    vlessKeyInput.value = storedKey;
    connectButton.classList.remove('hidden');
  }

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

  function updateUI(isConnected, key) {
    if (isConnected) {
      vlessKeyInput.classList.add('hidden');
      keyDisplay.textContent = key;
      keyDisplay.parentElement.classList.remove('hidden');
      connectButton.classList.add('hidden');
      disconnectButton.classList.remove('hidden');
    } else {
      vlessKeyInput.classList.remove('hidden');
      vlessKeyInput.value = key;
      keyDisplay.parentElement.classList.add('hidden');
      connectButton.classList.remove('hidden');
      disconnectButton.classList.add('hidden');
    }
  }

  function updateStatus(message) {
    statusElement.textContent = message;
  }
});
