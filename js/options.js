document.addEventListener('DOMContentLoaded', () => {
  const domainListElement = document.getElementById('domainList');
  const newDomainInput = document.getElementById('newDomain');
  const addDomainButton = document.getElementById('addDomain');

  function loadDomains() {
    chrome.storage.local.get('domainMap', (data) => {
      const domainMap = data.domainMap || {};
      domainListElement.innerHTML = '';
      Object.keys(domainMap).forEach((mainDomain) => {
        const tr = document.createElement('tr');
        tr.className = 'line';

        const pattern = document.createElement('td');
        pattern.innerHTML = mainDomain
        pattern.className = 'domain-btn button';

        const removeButton = document.createElement('div');
        removeButton.className = 'btn-recycl btn-';
        removeButton.addEventListener('click', () => {
          delete domainMap[mainDomain];
          chrome.storage.local.set({ domainMap }, loadDomains);
        });

        const copyButton = document.createElement('div');
        copyButton.className = 'btn-copy btn-';
        copyButton.addEventListener('click', (e) => {
          navigator.clipboard.writeText(mainDomain);
          e.target.remove();
          removeButton.style.width = "100%";
        });

        pattern.appendChild(copyButton);
        pattern.appendChild(removeButton);

        const associated = document.createElement('td');

        associated.className = 'nowrap';
        associated.innerHTML = domainMap[mainDomain].join(', ');

        tr.appendChild(pattern);
        tr.appendChild(associated);

        domainListElement.appendChild(tr);
      });
    });
  }

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
});
