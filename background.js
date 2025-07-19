const NATIVE_HOST = 'com.example.vless_vpn';

function generatePACScript(domains) {
  const patterns = domains.map(domain => `'${domain}'`).join(', ');
  return `
    function FindProxyForURL(url, host) {
      const patterns = [${patterns}];
      for (const pattern of patterns) {
        if (shExpMatch(host, pattern)) {
          return 'SOCKS5 127.0.0.1:1080';
        }
      }
      return 'DIRECT';
    }
  `;
}

function setProxyWithPAC(domains) {
  const pacScript = generatePACScript(domains);
  const proxySettings = {
    mode: 'pac_script',
    pacScript: {
      data: pacScript
    }
  };
  chrome.proxy.settings.set({ value: proxySettings, scope: 'regular' }, () => {
    console.log('Proxy settings applied with PAC script');
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', JSON.stringify(request));
  if (request.action === 'connect') {
    console.log('Sending to native:', request.vlessKey);
    chrome.runtime.sendNativeMessage(NATIVE_HOST, { vlessKey: request.vlessKey }, (response) => {
      console.log('Native response:', response);
      if (chrome.runtime.lastError) {
        console.error('Native error:', chrome.runtime.lastError.message);
        sendResponse({ status: 'Error: Native host not found: ' + chrome.runtime.lastError.message });
        return;
      }
      if (response && response.success) {
        chrome.storage.local.get('domains', (data) => {
          const domains = data.domains || [];
          setProxyWithPAC(domains);
          chrome.storage.local.set({ isConnected: true });
          sendResponse({ status: 'Connected' });
        });
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
  return true; // Asynchronous response
});

// Обновление PAC-скрипта при изменении списка доменов
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.domains) {
    chrome.storage.local.get('isConnected', (data) => {
      if (data.isConnected) {
        const newDomains = changes.domains.newValue;
        setProxyWithPAC(newDomains);
      }
    });
  }
});
