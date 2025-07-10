# Инструкция по установке и использованию расширения VLESS VPN

Эта инструкция описывает, как установить и использовать расширение VLESS VPN для браузеров Google Chrome и Opera на Linux. Расширение позволяет настроить VPN-соединение через VLESS-ключ, используя Xray для создания локального SOCKS5-прокси.

## Требования
- Установленный браузер: Google Chrome или Opera (последние версии рекомендуются).
- Установленный Xray (доступный в PATH, проверьте с помощью `which xray`).
- Папка с файлами расширения, расположенная по пути `<path to extend>`, содержащая:
  - `manifest.json`
  - `popup.html`
  - `popup.js`
  - `background.js`
  - `icon.png`
  - `native_host.py` (с правами на выполнение: `chmod +x <path to extend>/native_host.py`)

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
   - На странице `chrome://extensions/` (или `opera://extensions/`) найдите расширение VLESS VPN.
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
     "description": "Native messaging host for VLESS VPN",
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

## Использование
1. **Откройте браузер**:
   - Запустите Google Chrome или Opera.

2. **Откройте попап расширения**:
   - Нажмите на иконку VLESS VPN в панели инструментов браузера.
   - Откроется окно с текстовым полем и кнопками **Connect** и **Disconnect**.

3. **Подключение к VPN**:
   - В текстовое поле вставьте VLESS-ключ, например:
     ```
     vless://RAKETA_...@185.121....:443?type=tcp&security=reality&fp=chrome&pbk=...&sni=whatsapp.com&sid=ffffffffff&spx=%2F#Нидерланды-PRO
     ```
   - Нажмите кнопку **Connect**.
   - Если подключение успешно, в нижней части попапа появится сообщение: **Connected**.
   - Расширение настроит SOCKS5-прокси (`127.0.0.1:1080`), и весь трафик браузера будет направляться через VPN.

4. **Отключение VPN**:
   - В попапе расширения нажмите кнопку **Disconnect**.
   - Появится сообщение: **Disconnected**.
   - Прокси-соединение будет сброшено, и Xray завершит работу.

## Примечания
- Логи работы расширения сохраняются в:
  - `/tmp/native_host.log` (логи скрипта `native_host.py`).
  - `/tmp/xray.log` (логи Xray).
- Если расширение не работает, убедитесь, что:
  - Xray установлен и доступен в PATH.
  - Порт 1080 свободен (`netstat -tuln | grep 1080`).
  - ID расширения в файле `com.example.vless_vpn.json` совпадает с ID в браузере.
- Для отладки откройте консоль разработчика:
  - В Chrome: `chrome://extensions/` → Подробности → Инспектировать виды → Фоновая страница.
  - В Opera: `opera://extensions/` → Подробности → Инспектировать видыоко во время использования VLESS VPN в Opera

После успешной настройки и использования расширения вы сможете безопасно и анонимно просматривать веб-страницы через VPN-соединение, настроенное с помощью VLESS-ключа.
