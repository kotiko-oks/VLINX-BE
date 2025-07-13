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
        li.className = 'rm';
        const removeButton = document.createElement('button');
        removeButton.textContent = domain;
        removeButton.className = 'transition remove-domain';
        removeButton.addEventListener('click', () => {
          domains.splice(index, 1);
          chrome.storage.local.set({ domains }, loadDomains);
        });
        `
        <div class="recycl-btn"></div>
        <div class="copy-btn"></div>
        `
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
