#!/usr/bin/env python3
import sys
import json
import subprocess
import os
import struct
import base64
import urllib.request
from urllib.parse import urlparse, parse_qs, unquote

LOG_FILE = '/tmp/native_host.log'
CONFIG_FILE = '/tmp/xray_config.json'

SUB_USER_AGENT = 'v2rayN/6.42'
SUB_TIMEOUT = 15

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

def fetch_subscription(sub_url):
    log('Fetching subscription: ' + sub_url)
    req = urllib.request.Request(sub_url, headers={'User-Agent': SUB_USER_AGENT})
    with urllib.request.urlopen(req, timeout=SUB_TIMEOUT) as resp:
        raw = resp.read()
        headers = {k.lower(): v for k, v in resp.headers.items()}
    return raw, headers

def decode_subscription_body(raw_bytes):
    text = raw_bytes.decode('utf-8', errors='replace').strip()
    # Если уже plain text со ссылками vless:// — оставляем как есть
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
    servers = []
    for line in text.splitlines():
        line = line.strip()
        if not line or not line.startswith('vless://'):
            continue
        # Имя берём из #fragment
        name = ''
        if '#' in line:
            name = unquote(line.split('#', 1)[1])
        parsed = urlparse(line)
        host = parsed.hostname or ''
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
                "port": 1080,
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
    return xray_config, 1080

def build_config_from_json(raw_json):
    xray_config = json.loads(raw_json)
    socks_port = find_local_socks_port(xray_config)
    return xray_config, socks_port

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
            result = subprocess.run(['pgrep', '-f', 'xray'], capture_output=True, text=True)
            is_running = result.returncode == 0
            send_message({"running": is_running})
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
            if not sub_url:
                send_message({"success": False, "error": "Empty subscription URL"})
                return
            try:
                raw, headers = fetch_subscription(sub_url)
                text = decode_subscription_body(raw)
                servers = parse_servers_from_text(text)
                if not servers:
                    send_message({"success": False, "error": "No VLESS keys found in subscription"})
                    return
                info = {
                    'userinfo': parse_sub_userinfo(headers.get('subscription-userinfo', '')),
                    'updateInterval': headers.get('profile-update-interval'),
                    'title': headers.get('profile-title', ''),
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
            subprocess.run(['pkill', '-f', 'xray'])
            if os.path.exists(CONFIG_FILE):
                os.remove(CONFIG_FILE)
            log('Xray stopped')
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

        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(xray_config, f, ensure_ascii=False, indent=2)
        os.chmod(CONFIG_FILE, 0o666)
        log(f'Config file written: {CONFIG_FILE}, socks_port={socks_port}')

        subprocess.run(['pkill', '-f', 'xray run'], capture_output=True)
        import time; time.sleep(0.3)
        subprocess.Popen(
            ["xray", "run", "-c", CONFIG_FILE],
            stdout=open('/tmp/xray.log', 'a'),
            stderr=subprocess.STDOUT
        )
        log('Xray started')
        send_message({"success": True, "status": "Connected", "port": socks_port})

    except Exception as e:
        log('Error: ' + str(e))
        send_message({"success": False, "error": str(e)})

if __name__ == "__main__":
    main()
