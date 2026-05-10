document.addEventListener('DOMContentLoaded', () => {
  const domainListElement = document.getElementById('domainList');
  const newDomainInput = document.getElementById('newDomain');
  const addDomainButton = document.getElementById('addDomain');
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

  function loadDomains() {
    chrome.storage.local.get(['domainMap', 'noAutoRelated'], (data) => {
      const domainMap = data.domainMap || {};
      const noAutoRelated = data.noAutoRelated || {};
      domainListElement.innerHTML = '';
      Object.keys(domainMap).forEach((mainDomain) => {
        const tr = document.createElement('tr');
        tr.className = 'line';

        const pattern = document.createElement('td');
        pattern.innerHTML = mainDomain
        pattern.className = 'domain-btn button';

        const patternButtons = document.createElement('div');
        patternButtons.className = 'buttons-window';

        const isNoAuto = !!noAutoRelated[mainDomain];

        const removeButton = document.createElement('div');
        removeButton.className = 'btn-recycl btn-';
        removeButton.title = 'Удалить'
        removeButton.addEventListener('click', () => {
          chrome.storage.local.get(['domainMap', 'noAutoRelated'], (ddata) => {
            const ddomainMap = ddata.domainMap || {};
            const dnoAutoRelated = ddata.noAutoRelated || {};
            delete ddomainMap[mainDomain];
            delete dnoAutoRelated[mainDomain];
            chrome.storage.local.set({ domainMap: ddomainMap, noAutoRelated: dnoAutoRelated }, loadDomains);
          });
        });

        const copyButton = document.createElement('div');
        copyButton.className = 'btn-copy btn-';
        copyButton.title = 'Копировать'
        copyButton.addEventListener('click', (e) => {
          navigator.clipboard.writeText(mainDomain);
          e.target.remove();
          removeButton.style.width = "100%";
        });

        const excludeButton = document.createElement('div');
        excludeButton.className = (isNoAuto ? 'btn-join' : 'btn-exclude') + ' btn-'
        excludeButton.title = isNoAuto 
          ? 'Исключать связанные домены по ссылкам (активно)' 
          : 'Добавлять связанные домены автоматически';
        excludeButton.addEventListener('click', () => {
          chrome.storage.local.get('noAutoRelated', (fdata) => {
            let noAuto = fdata.noAutoRelated || {};
            const currently = !!noAuto[mainDomain];
            noAuto[mainDomain] = !currently;
            if (!noAuto[mainDomain]) {
              delete noAuto[mainDomain];
            }
            chrome.storage.local.set({ noAutoRelated: noAuto });
            excludeButton.className = (!currently ? 'btn-join' : 'btn-exclude') + ' btn-';
            excludeButton.title = !currently
              ? 'Исключать связанные домены по ссылкам (активно)'
              : 'Добавлять связанные домены автоматически';
          });
        });

        patternButtons.appendChild(copyButton);
        patternButtons.appendChild(excludeButton);
        patternButtons.appendChild(removeButton);

        pattern.appendChild(patternButtons);

        const associated = document.createElement('td');

        associated.className = 'nowrap';
        associated.innerHTML = domainMap[mainDomain].join(', ');

        tr.appendChild(pattern);
        tr.appendChild(associated);

        domainListElement.appendChild(tr);
      });
    });
  }

  function loadGlobalProxy() {
    chrome.storage.local.get(['globalProxy'], (data) => {
      globalProxyCheckbox.checked = !!data.globalProxy;
    });
  }

  globalProxyCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ globalProxy: globalProxyCheckbox.checked });
  });

  addDomainButton.addEventListener('click', () => {
    const newDomain = newDomainInput.value.trim();
    if (newDomain) {
      chrome.storage.local.get('domainMap', (data) => {
        const domainMap = data.domainMap || {};
        if (!domainMap[newDomain]) {
          domainMap[newDomain] = [];
          chrome.storage.local.set({ domainMap }, () => {
            newDomainInput.value = '';
            loadDomains();
          });
        }
      });
    }
  });

  loadDomains();
  loadGlobalProxy();
});
