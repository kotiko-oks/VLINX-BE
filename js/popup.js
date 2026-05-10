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
  const serverSelectContainer = document.getElementById('serverSelectContainer');
  const serverSelect = document.getElementById('serverSelect');
  const subscriptionInfo = document.getElementById('subscriptionInfo');
  const refreshSubButton = document.getElementById('refreshSub');

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  const currentUrl = currentTab.url;
  const currentDomain = new URL(currentUrl).hostname;
  currentDomainElement.value = currentDomain;

  const data = await chrome.storage.local.get([
    'vlessKey', 'domainMap', 'isConnected', 'startupError',
    'subscriptionUrl', 'subscriptionServers', 'selectedServerIndex', 'subscriptionInfo', 'subscriptionUpdatedAt'
  ]);
  const storedKey = data.vlessKey || '';
  const domainMap = data.domainMap || {};
  let isConnected = data.isConnected || false;
  const startupError = data.startupError || null;
  let subscriptionServers = data.subscriptionServers || [];
  let selectedServerIndex = data.selectedServerIndex || 0;

  renderSubscription(subscriptionServers, selectedServerIndex, data.subscriptionInfo, data.subscriptionUpdatedAt);

  if (startupError) {
    chrome.storage.local.set({ startupError: null });
    updateStatus('Ошибка');
    updateUI(false, storedKey);
  } else {
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
  }

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
      const flagData = await chrome.storage.local.get('noAutoRelated');
      let noAutoRelated = flagData.noAutoRelated || {};
      delete noAutoRelated[mainDomainToRemove];
      delete domainMap[mainDomainToRemove];
      await chrome.storage.local.set({ domainMap, noAutoRelated });
      updateStatus(`Удален основной домен ${mainDomainToRemove} из списка VPN`);
      removeDomainButton.classList.add('hidden');
      addDomainButton.classList.remove('hidden');
    }
  });

  connectButton.addEventListener('click', async () => {
    const input = vlessKeyInput.value.trim();
    if (!input) {
      updateStatus('Пожалуйста, введите ключ, JSON или URL подписки');
      return;
    }

    // Если это URL подписки — сначала забираем список серверов
    if (/^https?:\/\//i.test(input)) {
      updateStatus('Загрузка подписки...');
      const subResp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'fetchSubscription', subscriptionUrl: input }, resolve);
      });
      if (!subResp || !subResp.success) {
        updateStatus('Ошибка подписки: ' + (subResp ? subResp.error : 'нет ответа'));
        return;
      }
      const servers = subResp.servers;
      const firstKey = servers[0].key;
      await chrome.storage.local.set({
        subscriptionUrl: input,
        subscriptionServers: servers,
        subscriptionInfo: subResp.info,
        subscriptionUpdatedAt: Date.now(),
        selectedServerIndex: 0,
        vlessKey: firstKey
      });
      subscriptionServers = servers;
      selectedServerIndex = 0;
      renderSubscription(servers, 0, subResp.info, Date.now());
      connectWithKey(firstKey);
      return;
    }

    connectWithKey(input);
  });

  function connectWithKey(vlessKey) {
    updateStatus('Подключение...');
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
  }

  serverSelect.addEventListener('change', async () => {
    const idx = parseInt(serverSelect.value, 10);
    if (isNaN(idx) || !subscriptionServers[idx]) return;
    selectedServerIndex = idx;
    const newKey = subscriptionServers[idx].key;
    await chrome.storage.local.set({ selectedServerIndex: idx, vlessKey: newKey });
    if (isConnected) {
      updateStatus('Переключение сервера...');
      connectWithKey(newKey);
    } else {
      updateStatus(`Выбран сервер: ${subscriptionServers[idx].name}`);
    }
  });

  refreshSubButton.addEventListener('click', async () => {
    const sd = await chrome.storage.local.get('subscriptionUrl');
    if (!sd.subscriptionUrl) {
      updateStatus('Нет сохранённой подписки');
      return;
    }
    updateStatus('Обновление подписки...');
    const subResp = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'fetchSubscription', subscriptionUrl: sd.subscriptionUrl }, resolve);
    });
    if (!subResp || !subResp.success) {
      updateStatus('Ошибка обновления: ' + (subResp ? subResp.error : 'нет ответа'));
      return;
    }
    const idx = Math.min(selectedServerIndex, subResp.servers.length - 1);
    await chrome.storage.local.set({
      subscriptionServers: subResp.servers,
      subscriptionInfo: subResp.info,
      subscriptionUpdatedAt: Date.now(),
      selectedServerIndex: idx,
      vlessKey: subResp.servers[idx].key
    });
    subscriptionServers = subResp.servers;
    selectedServerIndex = idx;
    renderSubscription(subResp.servers, idx, subResp.info, Date.now());
    updateStatus(`Подписка обновлена: ${subResp.servers.length} серверов`);
    if (isConnected) connectWithKey(subResp.servers[idx].key);
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
      chrome.storage.local.set({
        isConnected: false,
        vlessKey: '',
        domainMap: {},
        noAutoRelated: {},
        subscriptionUrl: '',
        subscriptionServers: [],
        subscriptionInfo: null,
        subscriptionUpdatedAt: 0,
        selectedServerIndex: 0
      }, () => {
        vlessKeyInput.value = '';
        subscriptionServers = [];
        selectedServerIndex = 0;
        renderSubscription([], 0, null, 0);
        updateUI(false, '');
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
    keyDisplay.textContent = isConnected ? key : '';
    keyDisplay.style.whiteSpace = 'pre-wrap';
    keyDisplay.style.wordBreak = 'break-all';
    vlessKeyInput.value = isConnected ? '' : key;
  }

  function updateStatus(message) {
    statusElement.textContent = message;
  }

  function formatBytes(n) {
    if (!n || isNaN(n)) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(2) + ' ' + units[i];
  }

  function formatExpire(ts) {
    if (!ts || isNaN(ts)) return '—';
    return new Date(ts * 1000).toLocaleDateString();
  }

  function renderSubscription(servers, idx, info, updatedAt) {
    if (!servers || servers.length === 0) {
      serverSelectContainer.classList.add('hidden');
      subscriptionInfo.textContent = '';
      return;
    }
    serverSelectContainer.classList.remove('hidden');
    serverSelect.innerHTML = '';
    servers.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = s.name || s.host || `Server ${i + 1}`;
      if (i === idx) opt.selected = true;
      serverSelect.appendChild(opt);
    });
    const u = info && info.userinfo ? info.userinfo : {};
    const used = (u.upload || 0) + (u.download || 0);
    const parts = [];
    if (u.total) parts.push(`Трафик: ${formatBytes(used)} / ${formatBytes(u.total)}`);
    if (u.expire) parts.push(`До: ${formatExpire(u.expire)}`);
    if (updatedAt) parts.push(`Обновлено: ${new Date(updatedAt).toLocaleString()}`);
    subscriptionInfo.textContent = parts.join(' • ');
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
