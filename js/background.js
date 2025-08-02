const NATIVE_HOST = 'com.example.vless_vpn';

function generatePACScript(domainMap) {
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
          return 'SOCKS5 127.0.0.1:1080';
        }
      }
      return 'DIRECT';
    }
  `;
}

function setProxyWithPAC(domainMap) {
  const pacScript = generatePACScript(domainMap);
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

function trackRequests() {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      const mainUrl = new URL(details.initiator || details.url);
      const relatedUrl = new URL(details.url);
      const mainDomain = mainUrl.hostname;
      const relatedDomain = relatedUrl.hostname;

      if (mainDomain !== relatedDomain) {
        chrome.storage.local.get('domainMap', (data) => {
          const domainMap = data.domainMap || {};
          let updated = false;

          for (const pattern in domainMap) {
            if (shExpMatch(mainDomain, pattern)) {
              if (!domainMap[pattern].includes(relatedDomain)) {
                domainMap[pattern].push(relatedDomain);
                updated = true;
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
    chrome.storage.local.get('isConnected', (data) => {
      const isConnected = data.isConnected || false;
      if (isConnected && !isRunning) {
        chrome.storage.local.get('vlessKey', (data) => {
          const vlessKey = data.vlessKey;
          if (vlessKey) {
            chrome.runtime.sendNativeMessage(NATIVE_HOST, { vlessKey }, (response) => {
              if (response && response.success) {
                console.log('Xray restarted successfully');
                chrome.storage.local.get('domainMap', (data) => {
                  const domainMap = data.domainMap || {};
                  setProxyWithPAC(domainMap);
                });
              } else {
                console.error('Failed to restart Xray:', response ? response.error : 'No response');
                chrome.storage.local.set({ isConnected: false });
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
        chrome.storage.local.get('domainMap', (data) => {
          const domainMap = data.domainMap || {};
          setProxyWithPAC(domainMap);
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
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.domainMap) {
    chrome.storage.local.get('isConnected', (data) => {
      if (data.isConnected) {
        const newDomainMap = changes.domainMap.newValue;
        setProxyWithPAC(newDomainMap);
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

checkXrayStatus();
setInterval(checkXrayStatus, 30 * 1000);
trackRequests();
