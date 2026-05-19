#!/usr/bin/env python3
"""
stun_probe.py — 探测 NAT 出口 IP 和端口
用法：sudo python3 stun_probe.py -p 12070 [-s 111.206.174.2] [-i eth0]

原理：
  1. 用 scapy 构造源端口为 <local_port> 的 UDP STUN Binding Request
  2. 同时在该接口上抓取来自 STUN 服务器的响应
  3. 解析 MAPPED-ADDRESS (0x0001) 或 XOR-MAPPED-ADDRESS (0x0020) 属性
     得到 NAT 出口 IP 和端口

依赖：pip install scapy
需要 root 权限（raw socket）
"""

import argparse
import os
import socket
import struct
import threading
import time
from scapy.all import (
    IP, UDP, Raw, send,
    sniff, conf
)

STUN_SERVER_DEFAULT = "111.206.174.2"
STUN_PORT = 3478
MAGIC_COOKIE = 0x2112A442

# 固定 Transaction ID（20字节 STUN 头中后12字节）
TRANSACTION_ID = bytes.fromhex("97 88 b4 02 26 8e fc 54 b8 3e 8c 0a ef 67 28 5f".replace(" ", ""))


def build_stun_request():
    """构造 STUN Binding Request（20字节，无属性）"""
    msg_type = 0x0001          # Binding Request
    msg_len  = 0x0000          # 无属性
    return struct.pack("!HHI", msg_type, msg_len, MAGIC_COOKIE) + TRANSACTION_ID


def parse_stun_response(data: bytes):
    """
    解析 STUN Binding Response，返回 (ip, port) 或 None。
    优先取 XOR-MAPPED-ADDRESS，其次 MAPPED-ADDRESS。
    """
    if len(data) < 20:
        return None

    msg_type, msg_len, magic = struct.unpack_from("!HHI", data, 0)
    if msg_type not in (0x0101, 0x0111):   # Success / Error Response
        return None

    tid = data[8:20]
    offset = 20
    mapped = xor_mapped = None

    while offset + 4 <= 20 + msg_len:
        attr_type, attr_len = struct.unpack_from("!HH", data, offset)
        val = data[offset + 4: offset + 4 + attr_len]
        offset += 4 + attr_len + (4 - attr_len % 4) % 4  # 4字节对齐

        if attr_type == 0x0001 and attr_len >= 8:   # MAPPED-ADDRESS
            _, family, port = struct.unpack_from("!BBH", val, 0)
            ip = socket.inet_ntoa(val[4:8])
            mapped = (ip, port)

        elif attr_type == 0x0020 and attr_len >= 8:  # XOR-MAPPED-ADDRESS
            _, family, xport = struct.unpack_from("!BBH", val, 0)
            xport ^= (MAGIC_COOKIE >> 16)
            xip_bytes = bytes(a ^ b for a, b in zip(val[4:8], struct.pack("!I", MAGIC_COOKIE)))
            xor_mapped = (socket.inet_ntoa(xip_bytes), xport)

    return xor_mapped or mapped


def probe(local_port: int, stun_server: str, iface: str):
    result = {"done": False, "value": None}

    def _sniff():
        def _stop(_):
            return result["done"]

        pkts = sniff(
            iface=iface,
            filter=f"udp and src host {stun_server} and src port {STUN_PORT} and dst port {local_port}",
            timeout=5,
            stop_filter=_stop,
        )
        for pkt in pkts:
            if pkt.haslayer(Raw):
                parsed = parse_stun_response(bytes(pkt[Raw]))
                if parsed:
                    result["value"] = parsed
                    result["done"] = True
                    return

    t = threading.Thread(target=_sniff, daemon=True)
    t.start()
    time.sleep(0.3)   # 等抓包就绪

    payload = build_stun_request()
    pkt = IP(dst=stun_server) / UDP(sport=local_port, dport=STUN_PORT) / Raw(load=payload)
    send(pkt, iface=iface, verbose=False)
    print(f"[*] STUN Binding Request 已发送: {stun_server}:{STUN_PORT}  (src port={local_port})")

    t.join(timeout=6)

    if result["value"]:
        ip, port = result["value"]
        print(f"\n[+] NAT 出口 IP  : {ip}")
        print(f"[+] NAT 出口端口 : {port}")
    else:
        print("\n[-] 未收到 STUN 响应，请检查：")
        print("    1. STUN 服务器是否可达")
        print("    2. 防火墙是否放行 UDP 3478")
        print("    3. 接口名称是否正确（-i 参数）")


def detect_iface():
    """自动探测默认出口网卡"""
    return conf.iface


def main():
    if os.geteuid() != 0:
        print("[-] 需要 root 权限（raw socket 抓包）")
        raise SystemExit(1)

    parser = argparse.ArgumentParser(
        description="探测 NAT 出口 IP 和端口（基于 STUN 协议）"
    )
    parser.add_argument("-p", "--port",   type=int, required=True,  help="本地监听端口（即业务程序端口）")
    parser.add_argument("-s", "--server", default=STUN_SERVER_DEFAULT, help=f"STUN 服务器 IP（默认 {STUN_SERVER_DEFAULT}）")
    parser.add_argument("-i", "--iface",  default=None, help="网卡名称（默认自动检测）")
    args = parser.parse_args()

    iface = args.iface or detect_iface()
    print(f"[*] 使用网卡: {iface}")
    probe(args.port, args.server, iface)


if __name__ == "__main__":
    main()
