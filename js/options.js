document.addEventListener('DOMContentLoaded', () => {
     const domainListElement = document.getElementById('domainList');
     const newDomainInput = document.getElementById('newDomain');
     const addDomainButton = document.getElementById('addDomain');

     function loadDomains() {
       chrome.storage.local.get('domainMap', (data) => {
         const domainMap = data.domainMap || {};
         domainListElement.innerHTML = '';
         Object.keys(domainMap).forEach((mainDomain) => {
           const li = document.createElement('li');
           li.className = 'domain-btn button';

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

           const relatedDomains = domainMap[mainDomain].length > 3
             ? domainMap[mainDomain].slice(0, 3).join(', ') + '...'
             : domainMap[mainDomain].join(', ');

           li.innerHTML = `<div class="domain-text">${mainDomain} (связанные: ${relatedDomains})</div>`;
           li.appendChild(copyButton);
           li.appendChild(removeButton);

           domainListElement.appendChild(li);
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
