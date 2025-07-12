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
        li.className = 'flex justify-between items-center ';
        li.textContent = domain;
        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.className = 'px-2 py-1     transition bg-red';
        removeButton.addEventListener('click', () => {
          domains.splice(index, 1);
          chrome.storage.local.set({ domains }, loadDomains);
        });
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
