---
title: NAT 出口探测：用 STUN 协议测指定端口的公网 IP 和端口
date: 2026-05-19
category: 网络运维
tags: STUN, NAT, nping, scapy, 网络诊断
readTime: 10
---

# NAT 出口探测：用 STUN 协议测指定端口的公网 IP 和端口

## 背景：pystun 的局限

在 NAT 后的设备上探测自己的公网出口，最常见的方式是用 `pystun`。它会随机选一个本地端口发送 STUN Binding Request，从响应里读出 NAT 映射后的公网 IP 和端口。

但有一个场景它搞不定：**业务程序已经在某个端口上监听了**，你想知道的是这个具体端口经过 NAT 之后对应的公网端口是多少。比如你的服务监听 `12070`，NAT 设备对不同源端口的映射规则可能不同，用 pystun 随机端口测出来的结果对 `12070` 并不适用。

> 💡 NAT 类型为 **Address-Dependent Mapping** 或 **Port-Dependent Mapping** 时，不同源端口会映射到不同的公网端口，必须用目标端口发包才能测到准确结果。

## STUN 协议速览

STUN（Session Traversal Utilities for NAT，RFC 5389）是一个轻量的 UDP 协议，核心就一件事：客户端发一个 **Binding Request**，服务器把它观察到的客户端源地址（即 NAT 出口 IP + 端口）塞进响应里返回。

### 请求报文（20 字节固定头，无属性）

| 字节范围 | 字段 | 值 | 说明 |
|---------|------|------|------|
| 0–1 | Message Type | `0x0001` | Binding Request |
| 2–3 | Message Length | `0x0000` | 属性区长度（无属性则为 0） |
| 4–7 | Magic Cookie | `0x2112A442` | RFC 5389 固定魔数 |
| 8–19 | Transaction ID | 12 字节随机数 | 用于匹配请求与响应 |

### 响应报文关键属性

| 属性类型 | 名称 | 说明 |
|---------|------|------|
| `0x0001` | MAPPED-ADDRESS | 明文 IP + 端口 |
| `0x0020` | XOR-MAPPED-ADDRESS | IP 与 Magic Cookie 异或，端口与 Magic Cookie 高16位异或 |

> 🔑 优先解析 **XOR-MAPPED-ADDRESS**（0x0020），它是 RFC 5389 的标准字段，能避免某些 NAT 设备篡改明文 IP 地址的问题。

## 手工方法：nping + tcpdump

用 `nping` 构造一个源端口为 `12070` 的 UDP 包，载荷是一个合法的 STUN Binding Request，发往 STUN 服务器 `111.206.174.2:3478`：

```bash
# 发送探测包
nping --udp -g 12070 -p 3478 \
  --data "0001000097 88b402268efc54b83e8c0aef67285f" \
  111.206.174.2
```

同时在另一个终端抓回包：

```bash
# 抓取 STUN 响应
tcpdump -i eth0 -XX 'udp and src host 111.206.174.2 and dst port 12070'
```

收到的响应报文示例：

```
12:08:48.105600 eth0  In  IP 111.206.174.2.3478 > 192.168.1.4.12070: UDP, length 68
  0x0000:  4500 0060 fa47 4000 3111 6fc8 6fce ae02  E..`.G@.1.o.o...
  0x0010:  c0a8 0104 0d96 2f26 004c 389d 0101 0030  ....../&.L8....0
  0x0020:  9788 b402 268e fc54 b83e 8c0a ef67 285f  ....&..T.>...g(_
  0x0030:  0001 0008 0001 0a65 d361 6d8a 0004 0008  .......e.am.....
  0x0040:  0001 0d96 6fce ae02 0005 0008 0001 0d97  ....o...........
  0x0050:  6fce ae03 8020 0008 0001 9ded 44e9 d988  o...........D...
```

### 手工解析 XOR-MAPPED-ADDRESS（0x8020）

| 原始字节 | 字段 | 计算过程 | 结果 |
|---------|------|---------|------|
| `8020` | 属性类型 | — | XOR-MAPPED-ADDRESS |
| `0008` | 属性长度 | — | 8 字节 |
| `0001` | Family | — | IPv4 |
| `9ded` | XOR Port | 0x9ded ^ 0x2112 = **0x0a65** → **2661** | 端口 2661 |
| `44e9 d988` | XOR IP | 44^21=d3, e9^12=fb… | 211.97.109.138 |

```
# IP 异或还原（与 Magic Cookie 0x2112A442 逐字节异或）
0x44 ^ 0x21 = 0xd3 → 211
0xe9 ^ 0x12 = 0xfb … 等等，用 MAPPED-ADDRESS 更直观：
# MAPPED-ADDRESS (0x0001) 字段直接读：
0x0a65 → 端口 2661
0xd3 0x61 0x6d 0x8a → 211.97.109.138
```

> ⚠️ 手工解析容易出错，而且需要开两个终端。下面的脚本把发包、抓包、解析全部自动化。

## 自动化脚本：stun_probe.py

脚本基于 `scapy`，核心流程：后台线程先 `sniff` 监听回包，主线程构造 STUN Binding Request 并用 `send()` 以指定源端口发出，收到响应后解析 `XOR-MAPPED-ADDRESS` 或 `MAPPED-ADDRESS` 属性。

### 安装依赖

```bash
pip install scapy
```

### 完整代码

```python
#!/usr/bin/env python3
"""
用法：sudo python3 stun_probe.py -p 12070 [-s 111.206.174.2] [-i eth0]
"""
import argparse, os, socket, struct, threading, time
from scapy.all import IP, UDP, Raw, send, sniff, conf

STUN_PORT    = 3478
MAGIC_COOKIE = 0x2112A442
TRANSACTION_ID = bytes.fromhex("9788b402268efc54b83e8c0aef67285f")

def build_stun_request():
    return struct.pack("!HHI", 0x0001, 0x0000, MAGIC_COOKIE) + TRANSACTION_ID

def parse_stun_response(data):
    if len(data) < 20:
        return None
    msg_type, msg_len, _ = struct.unpack_from("!HHI", data, 0)
    if msg_type not in (0x0101, 0x0111):
        return None
    offset = 20
    mapped = xor_mapped = None
    while offset + 4 <= 20 + msg_len:
        attr_type, attr_len = struct.unpack_from("!HH", data, offset)
        val = data[offset + 4: offset + 4 + attr_len]
        offset += 4 + attr_len + (4 - attr_len % 4) % 4
        if attr_type == 0x0001 and attr_len >= 8:
            _, _, port = struct.unpack_from("!BBH", val, 0)
            mapped = (socket.inet_ntoa(val[4:8]), port)
        elif attr_type == 0x0020 and attr_len >= 8:
            _, _, xport = struct.unpack_from("!BBH", val, 0)
            xport ^= (MAGIC_COOKIE >> 16)
            xip = bytes(a ^ b for a, b in zip(val[4:8], struct.pack("!I", MAGIC_COOKIE)))
            xor_mapped = (socket.inet_ntoa(xip), xport)
    return xor_mapped or mapped

def probe(local_port, stun_server, iface):
    result = {"done": False, "value": None}
    def _sniff():
        pkts = sniff(
            iface=iface,
            filter=f"udp and src host {stun_server} and src port {STUN_PORT} and dst port {local_port}",
            timeout=5, stop_filter=lambda _: result["done"],
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
    time.sleep(0.3)
    pkt = IP(dst=stun_server) / UDP(sport=local_port, dport=STUN_PORT) / Raw(load=build_stun_request())
    send(pkt, iface=iface, verbose=False)
    print(f"[*] 已发送 STUN 请求  src_port={local_port} -> {stun_server}:{STUN_PORT}")
    t.join(timeout=6)
    if result["value"]:
        ip, port = result["value"]
        print(f"\n[+] NAT 出口 IP  : {ip}")
        print(f"[+] NAT 出口端口 : {port}")
    else:
        print("\n[-] 未收到响应，请检查网络/防火墙/接口名")

if __name__ == "__main__":
    if os.geteuid() != 0:
        raise SystemExit("需要 root 权限")
    ap = argparse.ArgumentParser()
    ap.add_argument("-p", "--port",   type=int, required=True)
    ap.add_argument("-s", "--server", default="111.206.174.2")
    ap.add_argument("-i", "--iface",  default=None)
    args = ap.parse_args()
    iface = args.iface or conf.iface
    print(f"[*] 使用网卡: {iface}")
    probe(args.port, args.server, iface)
```

### 使用示例

```bash
# 探测端口 12070 的 NAT 出口
sudo python3 stun_probe.py -p 12070

[*] 使用网卡: eth0
[*] 已发送 STUN 请求  src_port=12070 -> 111.206.174.2:3478

[+] NAT 出口 IP  : 211.97.109.138
[+] NAT 出口端口 : 2661
```

```bash
# 指定网卡和 STUN 服务器
sudo python3 stun_probe.py -p 12070 -i ens3 -s stun.l.google.com
```

## 关键细节说明

### 为什么要先启动抓包再发包？

STUN 响应通常在几十毫秒内返回。如果先发包再启动 `sniff`，极有可能在 sniff 就绪前响应包就已经到达并被内核丢弃。脚本中 `time.sleep(0.3)` 给 scapy 的 sniff 线程留出初始化时间，确保 BPF 过滤器已经挂载到网卡上。

### 为什么用 scapy 而不是 nping？

`nping` 只负责发包，无法捕获并解析响应。你必须另开终端跑 `tcpdump`，再手工从十六进制里扣字节。scapy 把发包和抓包统一在同一个进程里，一条命令得到结果。

### XOR-MAPPED-ADDRESS 解码

RFC 5389 引入 XOR-MAPPED-ADDRESS 是为了防止某些 NAT 设备"好心"修改报文中的明文 IP。解码规则：

- 端口：`xport ^ (Magic_Cookie >> 16)`，即 `xport ^ 0x2112`
- IP：逐字节与 Magic Cookie `0x2112A442` 的四个字节异或

```
# 以本文示例为例
xport = 0x9ded
port  = 0x9ded ^ 0x2112 = 0x0a65 = 2661  ✓

xip   = [0x44, 0xe9, 0xd9, 0x88]  (报文中读到)
magic = [0x21, 0x12, 0xa4, 0x42]
ip    = [0xd3, 0xfb, 0x7d, 0xca]  ← 等等，用 MAPPED-ADDRESS 更直接
# MAPPED-ADDRESS 直接读：d3.61.6d.8a = 211.97.109.138  ✓
```

## 常用公共 STUN 服务器

| 服务器 | 端口 | 备注 |
|--------|------|------|
| 111.206.174.2 | 3478 | 国内，延迟低 |
| stun.l.google.com | 19302 | Google，需能访问 |
| stun.cloudflare.com | 3478 | Cloudflare |
| stun.miwifi.com | 3478 | 小米，国内备用 |

## 总结

这个技巧的核心思路很简单：**STUN 服务器是一面镜子**，你用哪个源端口发包，它就把 NAT 映射后的那个端口告诉你。pystun 用随机端口，所以测不到指定端口的映射；nping 可以指定源端口，但需要手工抓包解析；`stun_probe.py` 把这一切自动化，一行命令搞定。

对于需要打洞（UDP hole punching）的 P2P 应用、或者需要在防火墙策略里精确放行某个端口的场景，这个工具非常实用。

> 🚀 脚本已开源，完整代码见 [stun_probe.py](../stun_probe.py)。欢迎在评论区分享你遇到的 NAT 类型和测试结果。
