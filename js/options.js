document.addEventListener('DOMContentLoaded', () => {
  const globalProxyCheckbox = document.getElementById('globalProxy');

  const subListEl = document.getElementById('subList');
  const newSubUrlInput = document.getElementById('newSubUrl');
  const newSubNameInput = document.getElementById('newSubName');
  const addSubButton = document.getElementById('addSub');

  const manualListEl = document.getElementById('manualList');
  const newManualKeyInput = document.getElementById('newManualKey');
  const newManualNameInput = document.getElementById('newManualName');
  const addManualButton = document.getElementById('addManual');

  function genId() {
    return Math.random().toString(36).slice(2, 10);
  }

  // ─── Подписки ───────────────────────────────────────────────

  function loadSubscriptions() {
    chrome.storage.local.get(['subscriptions'], (data) => {
      const subs = data.subscriptions || [];
      subListEl.innerHTML = '';
      subs.forEach((sub) => {
        const tr = document.createElement('tr');
        tr.className = 'line';

        const nameTd = document.createElement('td');
        nameTd.className = 'domain-btn button';
        nameTd.textContent = sub.name || sub.url;

        const nameButtons = document.createElement('div');
        nameButtons.className = 'buttons-window';

        const infoTd = document.createElement('td');
        infoTd.className = 'nowrap';
        infoTd.textContent = `${sub.servers ? sub.servers.length : 0} серверов` +
          (sub.updatedAt ? ` • ${new Date(sub.updatedAt).toLocaleString()}` : '');

        const refreshBtn = document.createElement('div');
        refreshBtn.className = 'btn-refresh btn-';
        refreshBtn.title = 'Обновить';
        refreshBtn.addEventListener('click', () => {
          infoTd.textContent = 'Загрузка...';
          chrome.runtime.sendMessage({ action: 'fetchSubscription', subscriptionUrl: sub.url }, (resp) => {
            if (!resp || !resp.success) {
              infoTd.textContent = 'Ошибка: ' + (resp ? resp.error : 'нет ответа');
              return;
            }
            chrome.storage.local.get('subscriptions', (d) => {
              const list = d.subscriptions || [];
              const idx = list.findIndex(s => s.id === sub.id);
              if (idx !== -1) {
                list[idx] = { ...list[idx], servers: resp.servers, info: resp.info, updatedAt: Date.now() };
                chrome.storage.local.set({ subscriptions: list }, loadSubscriptions);
              }
            });
          });
        });

        const removeBtn = document.createElement('div');
        removeBtn.className = 'btn-recycl btn-';
        removeBtn.title = 'Удалить';
        removeBtn.addEventListener('click', () => {
          chrome.storage.local.get('subscriptions', (d) => {
            const list = (d.subscriptions || []).filter(s => s.id !== sub.id);
            chrome.storage.local.set({ subscriptions: list }, loadSubscriptions);
          });
        });

        nameButtons.appendChild(refreshBtn);
        nameButtons.appendChild(removeBtn);
        nameTd.appendChild(nameButtons);

        tr.appendChild(nameTd);
        tr.appendChild(infoTd);
        subListEl.appendChild(tr);
      });
    });
  }

  addSubButton.addEventListener('click', () => {
    const url = newSubUrlInput.value.trim();
    if (!url) return;
    const name = newSubNameInput.value.trim() || url;
    chrome.storage.local.get('subscriptions', (data) => {
      const list = data.subscriptions || [];
      if (list.some(s => s.url === url)) return; // дубликат
      const newSub = { id: genId(), url, name, servers: [], info: null, updatedAt: 0 };
      list.push(newSub);
      chrome.storage.local.set({ subscriptions: list }, () => {
        newSubUrlInput.value = '';
        newSubNameInput.value = '';
        // сразу загружаем серверы
        chrome.runtime.sendMessage({ action: 'fetchSubscription', subscriptionUrl: url }, (resp) => {
          if (resp && resp.success) {
            chrome.storage.local.get('subscriptions', (d) => {
              const l = d.subscriptions || [];
              const i = l.findIndex(s => s.id === newSub.id);
              if (i !== -1) {
                l[i] = { ...l[i], servers: resp.servers, info: resp.info, updatedAt: Date.now() };
                chrome.storage.local.set({ subscriptions: l }, loadSubscriptions);
              }
            });
          } else {
            loadSubscriptions();
          }
        });
      });
    });
  });

  // ─── Мои ключи ────────────────────────────────────────────

  function loadManualKeys() {
    chrome.storage.local.get(['manualKeys'], (data) => {
      const keys = data.manualKeys || [];
      manualListEl.innerHTML = '';
      keys.forEach((mk) => {
        const tr = document.createElement('tr');
        tr.className = 'line';

        const nameTd = document.createElement('td');
        nameTd.className = 'domain-btn button';
        nameTd.textContent = mk.name || mk.key.slice(0, 30) + '…';

        const nameButtons = document.createElement('div');
        nameButtons.className = 'buttons-window';

        const copyBtn = document.createElement('div');
        copyBtn.className = 'btn-copy btn-';
        copyBtn.title = 'Копировать';
        copyBtn.addEventListener('click', () => navigator.clipboard.writeText(mk.key));

        const removeBtn = document.createElement('div');
        removeBtn.className = 'btn-recycl btn-';
        removeBtn.title = 'Удалить';
        removeBtn.addEventListener('click', () => {
          chrome.storage.local.get('manualKeys', (d) => {
            const list = (d.manualKeys || []).filter(k => k.id !== mk.id);
            chrome.storage.local.set({ manualKeys: list }, loadManualKeys);
          });
        });

        nameButtons.appendChild(copyBtn);
        nameButtons.appendChild(removeBtn);
        nameTd.appendChild(nameButtons);

        const keyTd = document.createElement('td');
        keyTd.className = 'nowrap';
        keyTd.textContent = mk.key;

        tr.appendChild(nameTd);
        tr.appendChild(keyTd);
        manualListEl.appendChild(tr);
      });
    });
  }

  addManualButton.addEventListener('click', () => {
    const key = newManualKeyInput.value.trim();
    if (!key || (!key.startsWith('vless://') && !key.startsWith('{'))) return;
    const name = newManualNameInput.value.trim() ||
      (key.includes('#') ? decodeURIComponent(key.split('#').pop()) : key.slice(0, 30));
    chrome.storage.local.get('manualKeys', (data) => {
      const list = data.manualKeys || [];
      if (list.some(k => k.key === key)) return;
      list.push({ id: genId(), key, name });
      chrome.storage.local.set({ manualKeys: list }, () => {
        newManualKeyInput.value = '';
        newManualNameInput.value = '';
        loadManualKeys();
      });
    });
  });

  loadSubscriptions();
  loadManualKeys();

  const obfuscationCheckbox = document.getElementById('obfuscation');

  function loadGlobalProxy() {
    chrome.storage.local.get(['globalProxy', 'obfuscation'], (data) => {
      globalProxyCheckbox.checked = !!data.globalProxy;
      obfuscationCheckbox.checked = !!data.obfuscation;
    });
  }

  globalProxyCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ globalProxy: globalProxyCheckbox.checked });
  });

  obfuscationCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ obfuscation: obfuscationCheckbox.checked });
  });

  loadGlobalProxy();
});
