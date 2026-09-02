#!/usr/bin/env python3
import sys
import json
import subprocess
import os
import struct
import base64
import urllib.request
from urllib.parse import urlparse, parse_qs, unquote

import signal
import time
import socket

LOG_FILE = '/tmp/native_host.log'
CONFIG_FILE = '/tmp/xray_config.json'
HWID_FILE = os.path.expanduser('~/.config/vlinx/hwid')

# Точный матчинг только наших процессов — не трогаем чужой xray
XRAY_MATCH = 'xray run -c ' + CONFIG_FILE

# Локальные порты по умолчанию
SOCKS_PORT = 1080
HTTP_PORT = 10809

SUB_USER_AGENT = 'v2rayN/6.42'
SUB_TIMEOUT = 15

def get_or_create_hwid():
    try:
        os.makedirs(os.path.dirname(HWID_FILE), exist_ok=True)
        if os.path.exists(HWID_FILE):
            with open(HWID_FILE) as f:
                hwid = f.read().strip()
                if len(hwid) == 32:
                    return hwid
        import hashlib, uuid as _uuid
        hwid = hashlib.md5(_uuid.uuid4().bytes).hexdigest()
        with open(HWID_FILE, 'w') as f:
            f.write(hwid)
        log(f'Generated new HWID: {hwid}')
        return hwid
    except Exception as e:
        log(f'get_or_create_hwid error: {e}')
        import hashlib, uuid as _uuid
        return hashlib.md5(_uuid.uuid4().bytes).hexdigest()

def log(message):
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(message + '\n')
    except Exception:
        pass

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        log('No input received')
        return None
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length)
    try:
        return message.decode('utf-8')
    except UnicodeDecodeError:
        log('Error: Failed to decode input as UTF-8, trying latin1')
        return message.decode('latin1')

def send_message(message):
    encoded_message = json.dumps(message).encode('utf-8')
    length = len(encoded_message)
    sys.stdout.buffer.write(struct.pack('@I', length))
    sys.stdout.buffer.write(encoded_message)
    sys.stdout.buffer.flush()

def fetch_subscription(sub_url, device_id=None):
    import socket, platform as _platform
    hwid = device_id or get_or_create_hwid()
    hostname = socket.gethostname()
    machine = _platform.machine()
    headers = {
        'User-Agent':        'Happ/2.14.0/Linux/2605071234511',
        'X-App-Version':     '2.14.0',
        'X-Device-Locale':   'RU',
        'X-Device-Os':       'Linux',
        'X-Device-Model':    f'{hostname}_{machine}',
        'X-Hwid':            hwid,
        'X-Ver-Os':          'linux_unknown',
        'Accept-Language':   'ru-RU,en,*',
    }
    log(f'Fetching subscription: {sub_url} hwid={hwid}')
    req = urllib.request.Request(sub_url, headers=headers)
    with urllib.request.urlopen(req, timeout=SUB_TIMEOUT) as resp:
        raw = resp.read()
        resp_headers = {k.lower(): v for k, v in resp.headers.items()}
    return raw, resp_headers

def decode_subscription_body(raw_bytes):
    text = raw_bytes.decode('utf-8', errors='replace').strip()
    # JSON или plain text с vless:// — возвращаем как есть
    if text.startswith('[') or text.startswith('{'):
        return text
    if 'vless://' in text or 'vmess://' in text or 'trojan://' in text or 'ss://' in text:
        return text
    # Иначе пробуем base64 (с паддингом и без)
    try:
        padded = text + '=' * (-len(text) % 4)
        decoded = base64.b64decode(padded, validate=False).decode('utf-8', errors='replace')
        return decoded
    except Exception as e:
        log(f'base64 decode failed: {e}')
        return text

def parse_sub_userinfo(value):
    # Формат: upload=...; download=...; total=...; expire=...
    info = {}
    if not value:
        return info
    for part in value.split(';'):
        part = part.strip()
        if '=' in part:
            k, v = part.split('=', 1)
            try:
                info[k.strip()] = int(v.strip())
            except ValueError:
                info[k.strip()] = v.strip()
    return info

def parse_servers_from_text(text):
    text = text.strip()

    # JSON-массив Xray-конфигов (формат happ/RemnaWave)
    if text.startswith('[') or text.startswith('{'):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                data = [data]
            servers = []
            for item in data:
                if not isinstance(item, dict):
                    continue
                name = item.get('remarks', '') or item.get('id', 'Server')
                # host берём из первого outbound для пинга
                host = ''
                try:
                    host = item['outbounds'][0]['settings']['vnext'][0]['address']
                except Exception:
                    pass
                servers.append({'key': json.dumps(item, ensure_ascii=False), 'name': name, 'host': host})
            log(f'Parsed {len(servers)} servers from JSON array')
            return servers
        except Exception as e:
            log(f'JSON parse failed: {e}, falling back to text parser')

    # Обычный текст с vless:// строками
    servers = []
    for line in text.splitlines():
        line = line.strip()
        if not line or not line.startswith('vless://'):
            continue
        parsed = urlparse(line)
        host = parsed.hostname or ''
        if host in ('0.0.0.0', '127.0.0.1', ''):
            log(f'Skipping placeholder server: {line[:80]}')
            continue
        name = ''
        if '#' in line:
            name = unquote(line.split('#', 1)[1])
        if not name:
            name = host
        servers.append({'key': line, 'name': name, 'host': host})
    return servers

def parse_vless_url(vless_url):
    log('Parsing VLESS URL: ' + vless_url)
    parsed = urlparse(vless_url)
    if parsed.scheme != 'vless':
        raise ValueError("Invalid VLESS URL")

    query = parse_qs(parsed.query)
    config = {
        'id': parsed.username,
        'server': parsed.hostname,
        'port': int(parsed.port or 443),
        'type': query.get('type', ['tcp'])[0],
        'security': query.get('security', ['none'])[0],
        'sni': query.get('sni', [None])[0],
        'pbk': query.get('pbk', [None])[0],
        'fp': query.get('fp', [''])[0],
        'sid': query.get('sid', [''])[0],
        'spx': unquote(query.get('spx', [''])[0]),
        'flow': query.get('flow', [None])[0],
        'path': unquote(query.get('path', ['/'])[0]),
        'mode': query.get('mode', [None])[0],
        'concurrency': query.get('concurrency', [None])[0],
        'serviceName': query.get('serviceName', [''])[0],
    }
    return config

def find_local_socks_port(xray_config):
    try:
        for inbound in xray_config.get('inbounds', []):
            if inbound.get('protocol') == 'socks':
                return int(inbound.get('port', 1080))
    except Exception as e:
        log(f'find_local_socks_port error: {e}')
    return 1080

def find_local_http_port(xray_config):
    try:
        for inbound in xray_config.get('inbounds', []):
            if inbound.get('protocol') == 'http':
                return int(inbound.get('port', HTTP_PORT))
    except Exception as e:
        log(f'find_local_http_port error: {e}')
    return None

def ensure_http_inbound(xray_config, port=HTTP_PORT):
    """Гарантирует HTTP-прокси для внешних приложений (не только браузера)."""
    existing = find_local_http_port(xray_config)
    if existing:
        log(f'HTTP inbound already present on port {existing}')
        return existing
    xray_config.setdefault('inbounds', []).append({
        "port": port,
        "protocol": "http",
        "listen": "127.0.0.1",
        "settings": {},
        "tag": "http-in"
    })
    log(f'HTTP inbound added on 127.0.0.1:{port}')
    return port

def read_config_ports():
    """(socks_port, http_port) из реально записанного на диск конфига."""
    try:
        with open(CONFIG_FILE, encoding='utf-8') as f:
            cfg = json.load(f)
        return find_local_socks_port(cfg), find_local_http_port(cfg)
    except Exception:
        return None, None

def read_config_socks_port():
    """Порт SOCKS из реально записанного на диск конфига (или None)."""
    return read_config_ports()[0]

def get_xray_pids():
    result = subprocess.run(['pgrep', '-f', XRAY_MATCH], capture_output=True, text=True)
    if result.returncode != 0:
        return []
    return [int(p) for p in result.stdout.split() if p.isdigit()]

def stop_xray(timeout=5.0):
    """SIGTERM -> ждём реальной смерти -> SIGKILL. Без гонок с 0.3 сек."""
    pids = get_xray_pids()
    if not pids:
        return True
    log(f'Stopping xray, pids={pids}')
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not get_xray_pids():
            log('Xray stopped (SIGTERM)')
            return True
        time.sleep(0.1)
    left = get_xray_pids()
    log(f'Xray still alive after SIGTERM: {left}, sending SIGKILL')
    for pid in left:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    time.sleep(0.3)
    remaining = get_xray_pids()
    if remaining:
        log(f'Xray NOT killed, remaining pids={remaining}')
        return False
    return True

def wait_port_free(port, timeout=5.0):
    """Порт свободен, если мы можем сами на него забиндиться."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        s = socket.socket()
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(('127.0.0.1', port))
            return True
        except OSError:
            time.sleep(0.1)
        finally:
            s.close()
    return False

def wait_port_listening(port, timeout=8.0, proc=None):
    """Ждём, пока новый Xray реально начнёт слушать свой SOCKS-порт."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc is not None and proc.poll() is not None:
            return False
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False

def build_config_from_vless(vless_url):
    config = parse_vless_url(vless_url)
    net = config["type"]

    # Пользователь: flow только если явно задан
    user = {
        "id": config["id"],
        "encryption": "none",
    }
    if config["flow"]:
        user["flow"] = config["flow"]

    # streamSettings
    stream = {
        "network": net,
        "security": config["security"],
    }

    if config["security"] == "reality":
        stream["realitySettings"] = {
            "serverName": config["sni"],
            "fingerprint": config["fp"],
            "publicKey": config["pbk"],
            "shortId": config["sid"],
            "spiderX": config["spx"] or "",
        }
    elif config["security"] == "tls":
        stream["tlsSettings"] = {
            "serverName": config["sni"],
            "fingerprint": config["fp"],
        }

    if net == "ws":
        stream["wsSettings"] = {
            "path": config.get("path", "/"),
            "headers": {"Host": config["sni"] or ""},
        }
    elif net == "xhttp":
        xhttp_settings = {"path": config.get("path", "/")}
        if config.get("mode"):
            xhttp_settings["mode"] = config["mode"]
        if config.get("concurrency"):
            try:
                xhttp_settings["concurrency"] = int(config["concurrency"])
            except (ValueError, TypeError):
                pass
        stream["xhttpSettings"] = xhttp_settings
    elif net == "grpc":
        stream["grpcSettings"] = {
            "serviceName": config.get("serviceName", ""),
        }
    elif net == "h2":
        stream["httpSettings"] = {
            "path": config.get("path", "/"),
            "host": [config["sni"]] if config["sni"] else [],
        }

    xray_config = {
        "inbounds": [
            {
                "port": SOCKS_PORT,
                "protocol": "socks",
                "listen": "127.0.0.1",
                "settings": {
                    "auth": "noauth",
                    "udp": True
                },
                "tag": "socks-in"
            }
        ],
        "outbounds": [
            {
                "protocol": "vless",
                "settings": {
                    "vnext": [
                        {
                            "address": config["server"],
                            "port": config["port"],
                            "users": [user]
                        }
                    ]
                },
                "streamSettings": stream,
                "tag": "proxy"
            }
        ]
    }
    return xray_config, SOCKS_PORT

def build_config_from_json(raw_json):
    xray_config = json.loads(raw_json)
    socks_port = find_local_socks_port(xray_config)
    return xray_config, socks_port

def apply_obfuscation(xray_config):
    """
    Добавляет фрагментирование TLS Hello и мультиплексирование.
    Мультиплексирование применяется только к аутбаундам БЕЗ xtls-rprx-vision —
    этот flow несовместим с mux в Xray.
    Пресет: fragment tlshello 50-100 / 10-20 ms + mux (TCP×8, XUDP×8, reject QUIC)
    """
    for outbound in xray_config.get('outbounds', []):
        protocol = outbound.get('protocol', '')
        if protocol not in ('vless', 'vmess', 'trojan'):
            continue

        # Проверяем, есть ли xtls-rprx-vision у любого пользователя
        has_xtls_flow = False
        try:
            for peer in outbound['settings'].get('vnext', []):
                for user in peer.get('users', []):
                    if 'xtls' in user.get('flow', ''):
                        has_xtls_flow = True
                        break
        except Exception:
            pass

        # Фрагментирование совместимо с xtls-rprx-vision
        stream = outbound.setdefault('streamSettings', {})
        sockopt = stream.setdefault('sockopt', {})
        sockopt['fragment'] = {
            'packets': 'tlshello',
            'length': '50-100',
            'interval': '10-20',
        }

        # Мультиплексирование несовместимо с xtls-rprx-vision — пропускаем
        if has_xtls_flow:
            log(f'Obfuscation: skipping mux for outbound "{outbound.get("tag","")}" (xtls-rprx-vision)')
            continue

        outbound['mux'] = {
            'enabled': True,
            'concurrency': 8,
            'xudpConcurrency': 8,
            'xudpProxyUDP443': 'reject',
        }

    log('Obfuscation applied (fragment tlshello; mux only where compatible)')
    return xray_config


def main():
    log('Native host started')
    input_data = read_message()
    if not input_data:
        send_message({"success": False, "error": "No input received"})
        return

    try:
        message = json.loads(input_data)
        log('Parsed message: ' + str(message))

        if 'status' in message:
            pids = get_xray_pids()
            port, http_port = read_config_ports()
            log(f'Status: pids={pids}, config_socks_port={port}, config_http_port={http_port}')
            send_message({"running": bool(pids), "port": port, "httpPort": http_port, "pids": pids})
            return

        if 'ping' in message:
            import socket, time
            host = message.get('host', '')
            port = int(message.get('port', 443))
            try:
                t0 = time.monotonic()
                with socket.create_connection((host, port), timeout=5):
                    pass
                ms = round((time.monotonic() - t0) * 1000)
                send_message({"success": True, "ms": ms})
            except Exception as e:
                send_message({"success": False, "error": str(e)})
            return

        if 'subscription' in message:
            sub_url = message.get('subscription', '').strip()
            device_id = message.get('deviceId', None)
            if not sub_url:
                send_message({"success": False, "error": "Empty subscription URL"})
                return
            try:
                raw, resp_headers = fetch_subscription(sub_url, device_id)
                text = decode_subscription_body(raw)
                servers = parse_servers_from_text(text)
                if not servers:
                    if resp_headers.get('x-hwid-limit') == 'true':
                        send_message({"success": False, "error": "Сервер вернул заглушку: лимит устройств исчерпан. Удалите одно из устройств в личном кабинете подписки."})
                    else:
                        send_message({"success": False, "error": "No VLESS keys found in subscription"})
                    return
                info = {
                    'userinfo': parse_sub_userinfo(resp_headers.get('subscription-userinfo', '')),
                    'updateInterval': resp_headers.get('profile-update-interval'),
                    'title': resp_headers.get('profile-title', ''),
                }
                log(f'Subscription parsed: {len(servers)} servers')
                send_message({
                    "success": True,
                    "servers": servers,
                    "info": info
                })
            except Exception as e:
                log(f'Subscription error: {e}')
                send_message({"success": False, "error": f"Subscription fetch failed: {e}"})
            return

        if 'stop' in message:
            log('Received stop command')
            ok = stop_xray()
            if os.path.exists(CONFIG_FILE):
                os.remove(CONFIG_FILE)
            log(f'Xray stopped: {ok}')
            send_message({"success": True, "status": "Disconnected"})
            return

        raw_value = message.get("vlessKey", "")
        if not raw_value:
            send_message({"success": False, "error": "Empty config"})
            return

        raw_value = raw_value.strip()

        if raw_value.startswith("{"):
            log('Detected JSON config')
            xray_config, socks_port = build_config_from_json(raw_value)
        else:
            log('Detected VLESS URL')
            xray_config, socks_port = build_config_from_vless(raw_value)

        if message.get('obfuscation'):
            xray_config = apply_obfuscation(xray_config)

        http_port = ensure_http_inbound(xray_config)
        log(f'Connect: socks_port={socks_port}, http_port={http_port}')

        if not stop_xray():
            send_message({"success": False, "error": "Не удалось остановить предыдущий процесс Xray"})
            return

        for _p in (socks_port, http_port):
            if not wait_port_free(_p):
                log(f'Port {_p} is still busy after stopping xray')
                send_message({"success": False, "error": f"Порт {_p} занят другим процессом"})
                return

        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(xray_config, f, ensure_ascii=False, indent=2)
        os.chmod(CONFIG_FILE, 0o666)
        log(f'Config file written: {CONFIG_FILE}, socks_port={socks_port}')

        proc = subprocess.Popen(
            ["xray", "run", "-c", CONFIG_FILE],
            stdout=open('/tmp/xray.log', 'a'),
            stderr=subprocess.STDOUT
        )

        if not wait_port_listening(socks_port, proc=proc):
            code = proc.poll()
            log(f'Xray failed to listen on {socks_port}, exit_code={code}')
            stop_xray()
            send_message({"success": False, "error": f"Xray не поднял SOCKS на порту {socks_port} (см. /tmp/xray.log)"})
            return

        log(f'Xray started, pid={proc.pid}, socks=127.0.0.1:{socks_port}, http=127.0.0.1:{http_port}')
        send_message({"success": True, "status": "Connected", "port": socks_port, "httpPort": http_port})

    except Exception as e:
        log('Error: ' + str(e))
        send_message({"success": False, "error": str(e)})

if __name__ == "__main__":
    main()
