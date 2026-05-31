const posts = [
  {
    id: 8,
    title: "用 Go 写两个带宽数据处理工具：拆分曲线与离线图表生成",
    category: "工具开发",
    tags: ["Go", "ECharts", "CLI", "CDN", "数据可视化"],
    date: "2026-05-31",
    summary: "汇总带宽需要按域名拆分，拆出来的数据还要符合真实流量特征；多列 CSV 想快速出图又不想开 Grafana。用 Go 写了 splitbandwidth 和 csvtochart 两个工具解决这两个问题。",
    cover: "",
    readTime: 8,
    url: "post-md.html?src=posts/splitbandwidth-csvtochart.md"
  },
  {
    id: 7,
    title: "NAT 出口探测：用 STUN 协议测指定端口的公网 IP 和端口",
    category: "网络运维",
    tags: ["STUN", "NAT", "nping", "scapy"],
    date: "2026-05-19",
    summary: "业务端口已被占用时，pystun 无法测出该端口的 NAT 映射。本文介绍用 nping 手工构造 STUN 请求、再用 stun_probe.py 一键自动化探测出口 IP 和端口的完整方法。",
    cover: "",
    readTime: 10,
    url: "post-md.html?src=posts/nat-stun-probe.md"
  }
];
