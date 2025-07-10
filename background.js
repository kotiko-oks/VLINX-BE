const NATIVE_HOST = 'com.example.vless_vpn';

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
        const proxySettings = {
          mode: 'fixed_servers',
          rules: {
            singleProxy: {
              scheme: 'socks5',
              host: '127.0.0.1',
              port: 1080
            }
          }
        };
        chrome.proxy.settings.set({ value: proxySettings, scope: 'regular' }, () => {
          console.log('Proxy settings applied');
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
        sendResponse({ status: 'Disconnected' });
      });
    });
  }
  return true; // Asynchronous response
});
