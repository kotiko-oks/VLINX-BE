document.addEventListener('DOMContentLoaded', () => {
  const domainListElement = document.getElementById('domainList');
  const newDomainInput = document.getElementById('newDomain');
  const addDomainButton = document.getElementById('addDomain');

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
