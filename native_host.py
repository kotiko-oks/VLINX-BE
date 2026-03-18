#!/usr/bin/env python3
import sys
import json
import subprocess
import os
import struct
from urllib.parse import urlparse, parse_qs

LOG_FILE = '/tmp/native_host.log'
CONFIG_FILE = '/tmp/xray_config.json'

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
        'spx': query.get('spx', [''])[0]
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
                            "users": [
                                {
                                    "id": config["id"],
                                    "encryption": "none"
                                }
                            ]
                        }
                    ]
                },
                "streamSettings": {
                    "network": config["type"],
                    "security": config["security"],
                    "realitySettings": {
                        "serverName": config["sni"],
                        "fingerprint": config["fp"],
                        "publicKey": config["pbk"],
                        "shortId": config["sid"],
                        "spiderX": config["spx"]
                    } if config["security"] == "reality" else {}
                },
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
