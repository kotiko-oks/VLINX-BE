# Инструкция по установке и использованию расширения VLINX

Эта инструкция описывает, как установить и использовать расширение VLINX для браузеров Google Chrome и Opera на Linux. Расширение позволяет настроить VPN-соединение через VLESS-ключ, используя Xray для создания локального SOCKS5-прокси.

## Требования
- Установленный браузер: Google Chrome или Opera (рекомендуются последние версии).
- Установленный Xray (доступный в PATH, проверьте с помощью `which xray`).
- Python 3.x для работы скрипта `native_host.py`.
- Папка с файлами расширения, расположенная по пути `<path to extend>`, содержащая все необходимые файлы (см. дерево проекта ниже).

## Структура проекта
```
VLINX/
├── css/
│   └── styles.css
├── html/
│   ├── options.html
│   └── popup.html
├── icons/
│   ├── icon.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── icon-feat.png
├── js/
│   ├── background.js
│   ├── options.js
│   └── popup.js
├── manifest.json
├── native_host.py
└── README.md
```

## Установка

### 1. Установка расширения
1. **Откройте браузер**:
   - Для Google Chrome: перейдите в `chrome://extensions/`.
   - Для Opera: перейдите в `opera://extensions/` (или через Меню → Расширения → Расширения).

2. **Включите режим разработчика**:
   - В правом верхнем углу включите переключатель **Режим разработчика**.

3. **Загрузите расширение**:
   - Нажмите кнопку **Загрузить распакованное расширение** (в Chrome) или **Загрузить распакованное** (в Opera).
   - Выберите папку `<path to extend>` и нажмите **ОК**.
   - Расширение появится в списке установленных, и его иконка отобразится в панели инструментов.

4. **Скопируйте ID расширения**:
   - На странице `chrome://extensions/` (или `opera://extensions/`) найдите расширение VLINX.
   - Скопируйте его ID (например, `fabecnkllghdhjmgemgdollkchlbnaoj` для Chrome или другой для Opera).

### 2. Настройка Native Messaging
Для взаимодействия расширения с Xray необходимо настроить хост Native Messaging.

1. **Создайте директорию для конфигурации**:
   - Для Chrome:
     ```bash
     mkdir -p ~/.config/google-chrome/NativeMessagingHosts
     ```
   - Для Opera:
     ```bash
     mkdir -p ~/.config/opera/NativeMessagingHosts
     ```

2. **Создайте файл конфигурации**:
   - Для Chrome:
     ```bash
     nano ~/.config/google-chrome/NativeMessagingHosts/com.example.vless_vpn.json
     ```
   - Для Opera:
     ```bash
     nano ~/.config/opera/NativeMessagingHosts/com.example.vless_vpn.json
     ```

3. **Вставьте следующий код в файл**:
   ```json
   {
     "name": "com.example.vless_vpn",
     "description": "Native messaging host for VLINX",
     "path": "<path to extend>/native_host.py",
     "type": "stdio",
     "allowed_origins": [
       "chrome-extension://<extension_id>/"
     ]
   }
   ```
   - Замените `<extension_id>` на ID расширения, скопированный на шаге 1.4.
     - Например, для Chrome: `"chrome-extension://fabecnkllghdhjmgemgdollkchlbnaoj/"`.
     - Для Opera используйте ID, полученный в Opera.

4. **Сохраните файл и установите права**:
   ```bash
   chmod 644 ~/.config/<browser>/NativeMessagingHosts/com.example.vless_vpn.json
   ```
   - Замените `<browser>` на `google-chrome` или `opera`, в зависимости от браузера.

### 3. Проверка прав доступа
Убедитесь, что скрипт `native_host.py` имеет права на выполнение:
```bash
chmod +x <path to extend>/native_host.py
```
Проверьте права:
```bash
ls -l <path to extend>/native_host.py
```
Ожидаемый вывод: `-rwxr-xr-x`.

### 4. Установка зависимостей
- Убедитесь, что Python 3 установлен:
  ```bash
  python3 --version
  ```
- Убедитесь, что Xray установлен и доступен:
  ```bash
  which xray
  ```
  Если Xray не установлен, следуйте инструкциям для его установки (например, через официальный репозиторий: https://github.com/XTLS/Xray-core).

## Использование
1. **Откройте браузер**:
   - Запустите Google Chrome или Opera.

2. **Откройте попап расширения**:
   - Нажмите на иконку VLINX в панели инструментов браузера.
   - Откроется окно с текстовым полем, кнопками **Connect**, **Disconnect**, **Add Domain**, **Remove Domain**, **Reset** и ссылкой **Manage Domains**.

3. **Управление доменами**:
   - В попапе отображается текущий домен активной вкладки.
   - Если домен соответствует сохранённому паттерну (например, `*example.com`), отображается кнопка **Remove Domain**.
   - Иначе отображается кнопка **Add Domain**, которая добавляет текущий домен в список VPN.
   - Для управления списком доменов нажмите **Manage Domains**, чтобы открыть страницу настроек, где можно добавлять паттерны (например, `*.example.com` или `10.81*`).

4. **Подключение к VPN**:
   - В текстовое поле вставьте VLESS-ключ, например:
     ```
     vless://RAKETA_...@185.121....:443?type=tcp&security=reality&fp=chrome&pbk=...&sni=whatsapp.com&sid=ffffffffff&spx=%2F#Нидерланды-PRO
     ```
   - Нажмите кнопку **Connect**.
   - Если подключение успешно, в нижней части попапа появится сообщение: **Connected**.
   - Расширение настроит SOCKS5-прокси (`127.0.0.1:1080`), и трафик для указанных доменов будет направляться через VPN.

5. **Отключение VPN**:
   - В попапе расширения нажмите кнопку **Disconnect**.
   - Появится сообщение: **Disconnected**.
   - Прокси-соединение будет сброшено, и Xray завершит работу.

6. **Сброс настроек**:
   - Нажмите кнопку **Reset**, чтобы отключить прокси и очистить сохранённый VLESS-ключ.
   - Появится сообщение: **Сброс завершен**.

## Примечания
- Логи работы расширения сохраняются в:
  - `/tmp/native_host.log` (логи скрипта `native_host.py`).
  - `/tmp/xray.log` (логи Xray).
- Если расширение не работает, убедитесь, что:
  - Xray установлен и доступен в PATH.
  - Порт 1080 свободен (`netstat -tuln | grep 1080`).
  - ID расширения в файле `com.example.vless_vpn.json` совпадает с ID в браузере.
  - Файл `styles.css` присутствует в папке `css/` и корректно подключен.
- Для отладки откройте консоль разработчика:
  - В Chrome: `chrome://extensions/` → Подробности → Инспектировать виды → Фоновая страница.
  - В Opera: `opera://extensions/` → Подробности → Инспектировать виды.
- Если Xray не запускается, проверьте логи в `/tmp/xray.log` и убедитесь, что VLESS-ключ корректен.

## Отладка
- Если вы видите ошибки в консоли, проверьте:
  - Соответствие ID расширения в `com.example.vless_vpn.json`.
  - Доступность `native_host.py` и его права.
  - Работу Xray с вашим VLESS-ключом (протестируйте его вручную с помощью `xray run -c <config>`).
- Для проверки Native Messaging:
  ```bash
  python3 <path to extend>/native_host.py
  ```
  Отправьте тестовое сообщение в формате JSON и проверьте ответ.

После успешной настройки и использования расширения вы сможете безопасно и анонимно просматривать веб-страницы через VPN-соединение, настроенное с помощью VLESS-ключа.
