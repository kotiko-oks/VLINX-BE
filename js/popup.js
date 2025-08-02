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

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  const currentUrl = currentTab.url;
  const currentDomain = new URL(currentUrl).hostname;
  currentDomainElement.value = currentDomain;

  const data = await chrome.storage.local.get(['vlessKey', 'domainMap', 'isConnected']);
  const storedKey = data.vlessKey || '';
  const domainMap = data.domainMap || {};
  let isConnected = data.isConnected || false;

  const realStatus = await checkProxyStatus();
  if (isConnected && !realStatus) {
    updateStatus('Прокси не работает, перезапускается...');
    chrome.runtime.sendMessage({ action: 'connect', vlessKey: storedKey }, (response) => {
      if (response && response.status === 'Connected') {
        updateStatus('Прокси перезапущен');
      } else {
        updateStatus('Ошибка при перезапуске прокси');
        isConnected = false;
      }
      updateUI(isConnected, storedKey);
    });
  } else if (!isConnected && realStatus) {
    chrome.storage.local.set({ isConnected: true });
    isConnected = true;
  }

  const isDomainConnected = Object.keys(domainMap).some(mainDomain => shExpMatch(currentDomain, mainDomain));
  if (isDomainConnected) {
    removeDomainButton.classList.remove('hidden');
  } else {
    addDomainButton.classList.remove('hidden');
  }

  updateStatus(
    isConnected ? (
      isDomainConnected ? 
      `Подключено к ${currentDomain}` 
      : `Прокси активен, но ${currentDomain} не в списке VPN`
    ) : 'Прокси отключен'
  );

  updateUI(isConnected, storedKey);

  addDomainButton.addEventListener('click', async () => {
    const mainDomain = currentDomain
    if (mainDomain) {
      domainMap[mainDomain] = [];
      await chrome.storage.local.set({ domainMap });
      updateStatus(`Добавлен основной домен ${mainDomain} в список VPN`);
      if (shExpMatch(currentDomain, mainDomain)) {
        addDomainButton.classList.add('hidden');
        removeDomainButton.classList.remove('hidden');
      }
    }
  });

  removeDomainButton.addEventListener('click', async () => {
    const matchingMainDomains = Object.keys(domainMap).filter(mainDomain => shExpMatch(currentDomain, mainDomain));
    if (matchingMainDomains.length > 0) {
      const mainDomainToRemove = matchingMainDomains[0];
      delete domainMap[mainDomainToRemove];
      await chrome.storage.local.set({ domainMap });
      updateStatus(`Удален основной домен ${mainDomainToRemove} из списка VPN`);
      removeDomainButton.classList.add('hidden');
      addDomainButton.classList.remove('hidden');
    }
  });

  connectButton.addEventListener('click', async () => {
    const vlessKey = vlessKeyInput.value.trim();
    if (!vlessKey) {
      updateStatus('Пожалуйста, введите ключ VLESS');
      return;
    }
    chrome.runtime.sendMessage({ action: 'connect', vlessKey }, (response) => {
      if (response && response.status) {
        updateStatus(response.status);
        if (response.status === 'Connected') {
          chrome.storage.local.set({ vlessKey, isConnected: true });
          updateUI(true, vlessKey);
        }
      } else {
        updateStatus('Ошибка соединения');
      }
    });
  });

  disconnectButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnect' }, (response) => {
      if (response && response.status) {
        updateStatus(response.status);
        if (response.status === 'Disconnected') {
          chrome.storage.local.set({ isConnected: false });
          updateUI(false, storedKey);
        }
      } else {
        updateStatus('Ошибка отключения');
      }
    });
  });

  resetButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnect' }, (response) => {
      chrome.storage.local.set({ isConnected: false, vlessKey: '', domainMap: {} }, () => {
        vlessKeyInput.value = '';
        updateUI(false, storedKey);
        updateStatus('Сброс завершен');
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

  async function checkProxyStatus() {
    return new Promise((resolve) => {
      chrome.runtime.sendNativeMessage('com.example.vless_vpn', { status: true }, (response) => {
        if (chrome.runtime.lastError || !response) {
          resolve(false);
        } else {
          resolve(response.running);
        }
      });
    });
  }

  function shExpMatch(str, pattern) {
    const escapedPattern = pattern.replace(/([.+^$[\]\\(){}|-])/g, '\\$1');
    const regexPattern = escapedPattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(str);
  }
});
