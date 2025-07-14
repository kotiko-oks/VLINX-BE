document.addEventListener('DOMContentLoaded', () => {
  const domainListElement = document.getElementById('domainList');
  const newDomainInput = document.getElementById('newDomain');
  const addDomainButton = document.getElementById('addDomain');

  function loadDomains() {
    chrome.storage.local.get('domains', (data) => {
      const domains = data.domains || [];
      domainListElement.innerHTML = '';
      domains.forEach((domain, index) => {
        const li = document.createElement('li');
        li.className = 'domain-btn button';
        
        const removeButton = document.createElement('div');
        removeButton.className = 'btn-recycl  btn-';
        removeButton.addEventListener('click', () => {
          domains.splice(index, 1);
          chrome.storage.local.set({ domains }, loadDomains);
        });

        const copyButton = document.createElement('div');
        copyButton.className = 'btn-copy  btn-';
        copyButton.addEventListener('click', (e) => {
          navigator.clipboard.writeText(domain)
          e.target.remove();
          removeButton.style.width = "100%";
        });

        li.innerHTML = `<div class="domain-text">${domain}</div>`
        li.appendChild(copyButton);
        li.appendChild(removeButton);

        domainListElement.appendChild(li);
      });
    });
  }

  addDomainButton.addEventListener('click', () => {
    const newDomain = newDomainInput.value.trim();
    if (newDomain) {
      chrome.storage.local.get('domains', (data) => {
        const domains = data.domains || [];
        if (!domains.includes(newDomain)) {
          domains.push(newDomain);
          chrome.storage.local.set({ domains }, () => {
            newDomainInput.value = '';
            loadDomains();
          });
        }
      });
    }
  });

  loadDomains();
});
