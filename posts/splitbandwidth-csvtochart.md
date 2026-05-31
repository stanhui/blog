---
title: 用 Go 写两个带宽数据处理工具：拆分曲线与离线图表生成
date: 2026-05-31
category: 工具开发
tags: Go, ECharts, CLI, CDN, 数据可视化
readTime: 8
---

# 用 Go 写两个带宽数据处理工具：拆分曲线与离线图表生成

## 问题背景

做 CDN 运维时经常遇到一个场景：拿到的带宽监控数据是一条汇总曲线，但你需要按域名拆分成多条独立曲线来做分析、对比或交付。

手工拆？Excel 里随机分一下？问题是随机分出来的数据不符合真实流量特征——真实的 CDN 域名流量占比在短时间内是相对稳定的，不会每个5分钟点都剧烈跳变。

另一个高频需求是：拿到一份多列的带宽 CSV，想快速看趋势图。开 Grafana？太重了。用 Python matplotlib？每次都要写一堆代码。我需要的是一个命令直接出图，离线可看，发给同事直接打开。

于是写了两个工具：

- [**splitbandwidth**](https://github.com/stanhui/splitbandwidth) — 将汇总带宽拆分为多域名曲线
- [**csvtochart**](https://github.com/stanhui/csvtochart) — 将带宽 CSV 直接转为离线交互式 HTML 图表

## splitbandwidth：汇总带宽拆分

### 核心思路

输入一份汇总带宽 CSV 和一个域名列表，输出每个域名的带宽曲线，保证每行各域名之和等于原始总值。

关键在于"怎么分"。工具提供两种模式：

**profile 模式（默认）**：模拟真实 CDN 流量分布。每个域名有一个基础权重，权重随时间缓慢漂移而非剧烈跳变。实现上用了 AR(1) 对数正态过程：

```
logState[i] = ρ * logState[i] + N(0, σ√(1-ρ²))
weight[i]   = baseWeight[i] * exp(logState[i])
```

其中 `ρ`（smoothness，默认 0.98）控制平滑度，`σ`（volatility，默认 0.18）控制波动幅度。这样生成的曲线看起来像真实的域名流量——各域名占比缓慢变化，不会出现某个点突然从 10% 跳到 50% 的情况。

**independent 模式**：每行完全独立随机分配，占比波动大，适合不关心时间连续性的场景。

### 用法

```bash
# 基本用法：拆分到单文件，自动生成图表
splitbandwidth traffic.csv domains.txt -o result.csv

# 指定种子（可复现）+ 保留2位小数
splitbandwidth traffic.csv domains.txt -o result.csv --seed 42 --decimal-places 2

# 调整 profile 参数：域名间差距更大，波动更小
splitbandwidth traffic.csv domains.txt -o result.csv \
  --domain-spread 1.5 --volatility 0.1 --smoothness 0.99
```

输出的 CSV 会在原始列后追加每个域名的带宽列，同时自动生成同名 `.html` 图表文件。

### 拆分精度

拆分时按 `--decimal-places` 指定的精度做整数单位分配，用最大余数法（Largest Remainder Method）保证各域名之和严格等于原始总值，不会出现舍入误差累积的问题。

## csvtochart：CSV 一键出图

csvtochart 是从 splitbandwidth 的图表模块独立出来的工具。使用场景更简单：你已经有了一份多列带宽 CSV，只想快速可视化。

```bash
# 最简用法
csvtochart bandwidth.csv

# 指定数据单位（CSV 里的值是 Mbps）
csvtochart --unit Mbps bandwidth.csv

# 指定标题和输出路径
csvtochart --unit Gbps --title "CDN 带宽趋势" data.csv report.html
```

CSV 格式要求很简单：第一列是时间戳，其余列是数值，列名就是图例名称。

## 图表实现

两个工具共享同一个 `internal/chart` 包，生成完全自包含的 HTML 文件（ECharts JS 通过 `go:embed` 打包进二进制）。打开不需要网络，直接发给任何人都能看。

图表交互功能：

- **深色/浅色主题切换** — 一键切换，适应不同场景
- **Isolate 模式** — 点击图例多选，只高亮选中的线，其余变透明。适合从几十条线里挑出关注的几条对比
- **Hide 模式** — 点击图例隐藏指定线，适合排除干扰项
- **时间轴缩放** — 底部滑块 + 鼠标滚轮，快速聚焦某个时间段
- **Y 轴自动单位换算** — 根据数据量级自动选择 bps/Kbps/Mbps/Gbps/Tbps（1000 进制）

Tooltip 在 Isolate 模式下只显示选中线的数值，不会被几十条线的数据淹没。这个细节在线多的时候非常实用。

## 技术选型

为什么用 Go：

1. **单二进制分发** — 编译出来一个文件，扔到任何机器上直接跑，不需要装运行时
2. **交叉编译** — `GOOS=linux GOARCH=amd64 go build` 一行搞定，GitHub Actions 自动出5个平台的包
3. **embed** — `go:embed` 把 1MB 的 echarts.min.js 打进二进制，生成的 HTML 真正零依赖
4. **性能够用** — 几万行 CSV 秒出结果，不需要上 Rust

为什么不用 Python：最初确实是 Python 版本，但分发太痛苦了。给同事用还得让人装 Python、装依赖，不如直接给个可执行文件。

## 项目地址

- splitbandwidth: https://github.com/stanhui/splitbandwidth
- csvtochart: https://github.com/stanhui/csvtochart

两个项目都提供 Linux/macOS/Windows 的预编译二进制，从 Releases 页面下载即可使用。
