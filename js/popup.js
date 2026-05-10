document.addEventListener('DOMContentLoaded', async () => {
  const resetButton = document.getElementById('reset');
  const addDomainButton = document.getElementById('addDomain');
  const removeDomainButton = document.getElementById('removeDomain');
  const currentDomainElement = document.getElementById('currentDomain');
  const statusElement = document.getElementById('status');
  const connectButton = document.getElementById('connect');
  const disconnectButton = document.getElementById('disconnect');

  const sourceSelect = document.getElementById('sourceSelect');
  const serverSelect = document.getElementById('serverSelect');
  const serverSelectContainer = document.getElementById('serverSelectContainer');
  const subscriptionInfo = document.getElementById('subscriptionInfo');
  const copySourceBtn = document.getElementById('copySource');
  const copyServerBtn = document.getElementById('copyServer');

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentTab = tabs[0];
  const currentUrl = currentTab.url;
  const currentDomain = new URL(currentUrl).hostname;
  currentDomainElement.value = currentDomain;

  const data = await chrome.storage.local.get([
    'vlessKey', 'domainMap', 'isConnected', 'startupError',
    'subscriptions', 'manualKeys', 'active'
  ]);
  const domainMap = data.domainMap || {};
  let isConnected = data.isConnected || false;
  const startupError = data.startupError || null;
  let subscriptions = data.subscriptions || [];
  let manualKeys = data.manualKeys || [];
  let active = data.active || null;

  renderSources(subscriptions, manualKeys, active);

  if (startupError) {
    chrome.storage.local.set({ startupError: null });
    updateStatus('Ошибка запуска');
    updateUI(false);
  } else {
    const realStatus = await checkProxyStatus();
    if (isConnected && !realStatus) {
      updateStatus('Прокси не работает, перезапускается...');
      const key = await getActiveKey();
      if (key) {
        chrome.runtime.sendMessage({ action: 'connect', vlessKey: key }, (response) => {
          if (response && response.status === 'Connected') {
            updateStatus('Прокси перезапущен');
          } else {
            updateStatus('Ошибка при перезапуске прокси');
            isConnected = false;
          }
          updateUI(isConnected);
        });
      }
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

    updateUI(isConnected);
  }

  sourceSelect.addEventListener('change', () => {
    const val = sourceSelect.value;
    renderServerSelect(val, subscriptions, manualKeys);
    if (isConnected) autoReconnect();
  });

  copySourceBtn.addEventListener('click', () => {
    const src = sourceSelect.value;
    if (!src) return;
    const [type, id] = src.split(':');
    let text = '';
    if (type === 'sub') {
      const sub = subscriptions.find(s => s.id === id);
      text = sub ? sub.url : '';
    } else {
      const mk = manualKeys.find(k => k.id === id);
      text = mk ? mk.key : '';
    }
    if (text) navigator.clipboard.writeText(text);
  });

  copyServerBtn.addEventListener('click', () => {
    const key = resolveSelectedKey();
    if (key) navigator.clipboard.writeText(key);
  });

  serverSelect.addEventListener('change', () => {
    if (isConnected) autoReconnect(); 
  });

  function autoReconnect() {
    const key = resolveSelectedKey();
    if (!key) return;
    const newActive = resolveSelectedActive();
    chrome.storage.local.set({ active: newActive, vlessKey: key });
    active = newActive;
    connectWithKey(key);
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
    const key = resolveSelectedKey();
    if (!key) { updateStatus('Выберите сервер или добавьте ключи в настройках'); return; }
    const newActive = resolveSelectedActive();
    await chrome.storage.local.set({ active: newActive, vlessKey: key });
    active = newActive;
    connectWithKey(key);
  });

  function resolveSelectedKey() {
    const src = sourceSelect.value;
    if (!src) return null;
    const [type, id] = src.split(':');
    if (type === 'sub') {
      const sub = subscriptions.find(s => s.id === id);
      if (!sub || !sub.servers.length) return null;
      const idx = parseInt(serverSelect.value, 10) || 0;
      return sub.servers[idx] ? sub.servers[idx].key : null;
    } else {
      const mk = manualKeys.find(k => k.id === id);
      return mk ? mk.key : null;
    }
  }

  function resolveSelectedActive() {
    const src = sourceSelect.value;
    if (!src) return null;
    const [type, id] = src.split(':');
    if (type === 'sub') {
      return { type: 'sub', subId: id, serverIdx: parseInt(serverSelect.value, 10) || 0 };
    } else {
      return { type: 'manual', keyId: id };
    }
  }

  function connectWithKey(vlessKey) {
    updateStatus('Подключение...');
    chrome.runtime.sendMessage({ action: 'connect', vlessKey }, (response) => {
      if (response && response.status) {
        updateStatus(response.status);
        if (response.status === 'Connected') {
          isConnected = true;
          chrome.storage.local.set({ isConnected: true });
          updateUI(true);
        }
      } else {
        updateStatus('Ошибка соединения');
      }
    });
  }

  disconnectButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnect' }, (response) => {
      if (response && response.status) {
        updateStatus(response.status);
        if (response.status === 'Disconnected') {
          isConnected = false;
          chrome.storage.local.set({ isConnected: false });
          updateUI(false);
        }
      } else {
        updateStatus('Ошибка отключения');
      }
    });
  });

  resetButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'disconnect' }, () => {
      chrome.storage.local.set({
        isConnected: false,
        vlessKey: '',
        active: null,
      }, () => {
        isConnected = false;
        active = null;
        updateUI(false);
        updateStatus('Сброс завершен');
      });
    });
  });

  function updateUI(connected) {
    connectButton.classList.toggle('hidden', connected);
    disconnectButton.classList.toggle('hidden', !connected);
  }

  function updateStatus(message) {
    statusElement.textContent = message;
  }

  async function getActiveKey() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getActiveKey' }, r => resolve(r ? r.key : null));
    });
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

  function renderSources(subs, manuals, active) {
    sourceSelect.innerHTML = '';

    const addOpt = (value, label, group) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      group.appendChild(opt);
    };

    if (subs.length) {
      const grp = document.createElement('optgroup');
      grp.label = 'Подписки';
      subs.forEach(s => addOpt(`sub:${s.id}`, s.name || s.url, grp));
      sourceSelect.appendChild(grp);
    }

    if (manuals.length) {
      const grp = document.createElement('optgroup');
      grp.label = 'Мои ключи';
      manuals.forEach(k => addOpt(`manual:${k.id}`, k.name || k.key.slice(0, 40) + '…', grp));
      sourceSelect.appendChild(grp);
    }

    // Восстанавливаем активный выбор
    if (active) {
      if (active.type === 'sub') sourceSelect.value = `sub:${active.subId}`;
      else sourceSelect.value = `manual:${active.keyId}`;
    }

    renderServerSelect(sourceSelect.value, subs, manuals, active);
  }

  function renderServerSelect(srcValue, subs, manuals, active) {
    if (!srcValue) { serverSelectContainer.classList.add('hidden'); return; }
    const [type, id] = srcValue.split(':');

    if (type === 'sub') {
      const sub = subs.find(s => s.id === id);
      if (!sub || !sub.servers || !sub.servers.length) {
        serverSelectContainer.classList.add('hidden');
        return;
      }
      serverSelectContainer.classList.remove('hidden');
      serverSelect.innerHTML = '';
      sub.servers.forEach((s, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = s.name || s.host || `Server ${i + 1}`;
        if (active && active.type === 'sub' && active.subId === id && active.serverIdx === i) opt.selected = true;
        serverSelect.appendChild(opt);
      });
      const u = sub.info && sub.info.userinfo ? sub.info.userinfo : {};
      const used = (u.upload || 0) + (u.download || 0);
      const parts = [];
      if (u.total) parts.push(`Трафик: ${formatBytes(used)} / ${formatBytes(u.total)}`);
      if (u.expire) parts.push(`До: ${formatExpire(u.expire)}`);
      if (sub.updatedAt) parts.push(`Обновлено: ${new Date(sub.updatedAt).toLocaleString()}`);
      subscriptionInfo.textContent = parts.join(' • ');
    } else {
      serverSelectContainer.classList.add('hidden');
      subscriptionInfo.textContent = '';
    }
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
