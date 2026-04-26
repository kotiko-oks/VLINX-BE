const NATIVE_HOST = 'com.example.vless_vpn';

function showErrorOnActiveTab(errorMessage) {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) return;
    const tab = tabs[0];
    if (!tab.url || /^(chrome|opera|about|edge|moz-extension|chrome-extension):/.test(tab.url)) return;

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (msg) => {
        const prev = document.getElementById('vlinx-err');
        if (prev) prev.remove();

        const d = document.createElement('div');
        d.id = 'vlinx-err';
        d.style.cssText = 'position:fixed;bottom:16px;left:16px;background:#1a1a2e;color:#e0e0e0;border:1px solid #c0392b;border-radius:8px;padding:12px 36px 12px 14px;max-width:380px;font-family:monospace;font-size:12px;line-height:1.5;z-index:2147483647;box-shadow:0 4px 20px rgba(0,0,0,.6);word-break:break-word';

        const title = document.createElement('b');
        title.style.cssText = 'display:block;color:#e74c3c;margin-bottom:4px';
        title.textContent = 'VLINX — ошибка запуска';

        const body = document.createElement('span');
        body.textContent = msg;

        const btn = document.createElement('button');
        btn.style.cssText = 'position:absolute;top:8px;right:10px;background:none;border:none;color:#999;cursor:pointer;font-size:18px;line-height:1;padding:0';
        btn.textContent = '×';
        btn.onclick = () => d.remove();

        d.appendChild(title);
        d.appendChild(body);
        d.appendChild(btn);
        document.body.appendChild(d);
      },
      args: [errorMessage]
    });
  });
}

function startupConnect() {
  chrome.storage.local.get(['isConnected', 'vlessKey', 'proxyPort'], (data) => {
    if (!data.isConnected) return;
    const vlessKey = data.vlessKey;
    if (!vlessKey) {
      chrome.storage.local.set({ isConnected: false });
      return;
    }

    chrome.runtime.sendNativeMessage(NATIVE_HOST, { vlessKey }, (response) => {
      if (chrome.runtime.lastError) {
        const err = chrome.runtime.lastError.message;
        chrome.storage.local.set({ isConnected: false, startupError: err });
        showErrorOnActiveTab('Не удалось запустить Xray: ' + err);
        return;
      }
      if (response && response.success) {
        const port = response.port || data.proxyPort || 1080;
        chrome.storage.local.set({ proxyPort: port, startupError: null });
        applyProxySettings(port);
      } else {
        const err = (response && response.error) || 'Нет ответа от native host';
        chrome.storage.local.set({ startupError: err });
        showErrorOnActiveTab('Не удалось запустить Xray: ' + err);
      }
    });
  });
}

function generatePACScript(domainMap, proxyPort = 1080) {
  if (!domainMap) {
    console.error('domainMap is undefined');
    return '';
  }

  const patterns = Object.entries(domainMap)
    .flatMap(([mainDomain, relatedDomains]) => [
      `'${mainDomain}'`,
      ...relatedDomains.map(domain => `'${domain}'`)
    ])
    .join(', ');

  return `
    function FindProxyForURL(url, host) {
      const patterns = [${patterns}];
      for (const pattern of patterns) {
        if (shExpMatch(host, pattern)) {
          return 'SOCKS5 127.0.0.1:${proxyPort}';
        }
      }
      return 'DIRECT';
    }
  `;
}

function applyProxySettings(proxyPort = 1080) {
  chrome.storage.local.get(['domainMap', 'globalProxy'], (data) => {
    const globalProxy = !!data.globalProxy;
    const domainMap = data.domainMap || {};

    if (globalProxy) {
      const proxySettings = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: 'socks5',
            host: '127.0.0.1',
            port: proxyPort
          }
        }
      };

      chrome.proxy.settings.set({ value: proxySettings, scope: 'regular' }, () => {
        console.log('Global proxy settings applied (all traffic) on port', proxyPort);
      });
    } else {
      const pacScript = generatePACScript(domainMap, proxyPort);
      const proxySettings = {
        mode: 'pac_script',
        pacScript: {
          data: pacScript
        }
      };

      chrome.proxy.settings.set({ value: proxySettings, scope: 'regular' }, () => {
        console.log('Proxy settings applied with PAC script on port', proxyPort);
      });
    }
  });
}

function trackRequests() {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const mainUrl = new URL(details.initiator || details.url);
      const relatedUrl = new URL(details.url);
      const mainDomain = mainUrl.hostname;
      const relatedDomain = relatedUrl.hostname;

      if (mainDomain !== relatedDomain) {
        chrome.storage.local.get(['domainMap', 'noAutoRelated'], (data) => {
          const domainMap = data.domainMap || {};
          const noAutoRelated = data.noAutoRelated || {};
          let updated = false;

          for (const pattern in domainMap) {
            if (shExpMatch(mainDomain, pattern)) {
              if (!noAutoRelated[pattern]) {
                if (!domainMap[pattern].includes(relatedDomain)) {
                  domainMap[pattern].push(relatedDomain);
                  updated = true;
                }
              }
              break;
            }
          }

          if (updated) {
            chrome.storage.local.set({ domainMap });
          }
        });
      }
    },
    { urls: ["<all_urls>"] },
    []
  );
}

function checkXrayStatus() {
  chrome.runtime.sendNativeMessage(NATIVE_HOST, { status: true }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Native error:', chrome.runtime.lastError.message);
      return;
    }

    const isRunning = response && response.running;
    chrome.storage.local.get(['isConnected', 'proxyPort'], (data) => {
      const isConnected = data.isConnected || false;
      const proxyPort = data.proxyPort || 1080;

      if (isConnected && !isRunning) {
        chrome.storage.local.get('vlessKey', (keyData) => {
          const vlessKey = keyData.vlessKey;
          if (vlessKey) {
            chrome.runtime.sendNativeMessage(NATIVE_HOST, { vlessKey }, (restartResponse) => {
              if (restartResponse && restartResponse.success) {
                const newPort = restartResponse.port || proxyPort;
                chrome.storage.local.set({ proxyPort: newPort, startupError: null });
                applyProxySettings(newPort);
                console.log('Xray restarted successfully');
              } else {
                const err = restartResponse ? restartResponse.error : 'Нет ответа при перезапуске';
                console.error('Failed to restart Xray:', err);
                chrome.storage.local.set({ startupError: err });
                showErrorOnActiveTab('Не удалось перезапустить Xray: ' + err);
              }
            });
          }
        });
      } else if (!isConnected && isRunning) {
        chrome.runtime.sendNativeMessage(NATIVE_HOST, { stop: true }, () => {
          chrome.proxy.settings.clear({ scope: 'regular' });
        });
      }
    });
  });
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('Received message:', JSON.stringify(request));

  if (request.action === 'connect') {
    chrome.runtime.sendNativeMessage(NATIVE_HOST, { vlessKey: request.vlessKey }, (response) => {
      console.log('Native response:', response);

      if (chrome.runtime.lastError) {
        console.error('Native error:', chrome.runtime.lastError.message);
        sendResponse({ status: 'Error: Native host not found: ' + chrome.runtime.lastError.message });
        return;
      }

      if (response && response.success) {
        const proxyPort = response.port || 1080;
        applyProxySettings(proxyPort);
        chrome.storage.local.set({ isConnected: true, proxyPort });
        sendResponse({ status: 'Connected' });
      } else {
        console.error('Native response error:', response ? response.error : 'No response');
        sendResponse({ status: 'Error: ' + (response ? response.error : 'No response from native host') });
      }
    });
  } else if (request.action === 'disconnect') {
    console.log('Sending stop to native');
    chrome.runtime.sendNativeMessage(NATIVE_HOST, { stop: true }, (response) => {
      console.log('Native response:', response);

      if (chrome.runtime.lastError) {
        console.error('Native error:', chrome.runtime.lastError.message);
        sendResponse({ status: 'Error: Native host not found: ' + chrome.runtime.lastError.message });
        return;
      }

      chrome.proxy.settings.clear({ scope: 'regular' }, () => {
        console.log('Proxy settings cleared');
        chrome.storage.local.set({ isConnected: false });
        sendResponse({ status: 'Disconnected' });
      });
    });
  }

  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.domainMap || changes.globalProxy)) {
    chrome.storage.local.get(['isConnected', 'proxyPort'], (data) => {
      if (data.isConnected) {
        const proxyPort = data.proxyPort || 1080;
        applyProxySettings(proxyPort);
      }
    });
  }
});

function shExpMatch(str, pattern) {
  const escapedPattern = pattern.replace(/([.+^$[\]\\(){}|-])/g, '\\$1');
  const regexPattern = escapedPattern.replace(/\*/g, '.*').replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

chrome.runtime.onStartup.addListener(startupConnect);

checkXrayStatus();
setInterval(checkXrayStatus, 30 * 1000);
trackRequests();
