#!/usr/bin/env python3
import sys
import json
import subprocess
import os
import struct
from urllib.parse import urlparse, parse_qs

def log(message):
    log_file = '/tmp/native_host.log'
    try:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(message + '\n')
    except PermissionError:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        with open(log_file, 'a', encoding='utf-8') as f:
            os.chmod(log_file, 0o666)
            f.write(message + '\n')

def read_message():
    # Read 4-byte length prefix
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        log('No input received')
        return None
    message_length = struct.unpack('@I', raw_length)[0]
    # Read the message of specified length
    message = sys.stdin.buffer.read(message_length)
    try:
        return message.decode('utf-8')
    except UnicodeDecodeError:
        log('Error: Failed to decode input as UTF-8, trying latin1')
        return message.decode('latin1')

def send_message(message):
    # Encode message and prepend 4-byte length
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
        'fp': query.get('fp', [None])[0],
        'sid': query.get('sid', [None])[0],
        'spx': query.get('spx', [None])[0]
    }
    return config

def main():
    log('Native host started')
    input_data = read_message()
    if not input_data:
        send_message({"success": False, "error": "No input received"})
        return

    try:
        message = json.loads(input_data)
        log('Parsed message: ' + str(message))

        if 'stop' in message:
            log('Received stop command')
            subprocess.run(['pkill', '-f', 'xray'])
            if os.path.exists('/tmp/xray_config.json'):
                os.remove('/tmp/xray_config.json')
            log('Xray stopped')
            send_message({"success": True})
        else:
            vless_url = message["vlessKey"]
            config = parse_vless_url(vless_url)
            log('Parsed config: ' + str(config))

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
            config_file = '/tmp/xray_config.json'
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(xray_config, f)
            os.chmod(config_file, 0o666)
            log('Config file written')

            subprocess.Popen(
                ["xray", "run", "-c", config_file],
                stdout=open('/tmp/xray.log', 'a'),
                stderr=subprocess.STDOUT
            )
            log('Xray started')
            send_message({"success": True})
    except Exception as e:
        log('Error: ' + str(e))
        send_message({"success": False, "error": str(e)})

if __name__ == "__main__":
    main()
