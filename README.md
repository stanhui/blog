# OpsLife · 个人技术博客

纯静态博客，无需构建工具，直接托管即可。

## 本地预览

```bash
python3 -m http.server 8080
# 访问 http://localhost:8080
```

---

## 部署方案

### 方案一：GitHub Pages（推荐，免费）

1. 在 GitHub 新建仓库（如 `opslife`）
2. 把本目录推送到 `main` 分支：
   ```bash
   git init
   git add .
   git commit -m "init blog"
   git remote add origin https://github.com/<你的用户名>/opslife.git
   git push -u origin main
   ```
3. 进入仓库 **Settings → Pages**，Source 选 **GitHub Actions**
4. 推送后自动触发 `.github/workflows/deploy.yml`，部署完成后访问：
   `https://<你的用户名>.github.io/opslife/`

> 如果仓库名就是 `<用户名>.github.io`，则直接访问 `https://<用户名>.github.io`，
> 同时需要把所有 HTML 里的相对路径检查一遍（通常无需改动）。

---

### 方案二：Cloudflare Pages（国内访问更快）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages → Create**
2. 选择 **Connect to Git**，授权并选择你的仓库
3. 配置：
   - Framework preset：**None**
   - Build command：（留空）
   - Build output directory：`/`（根目录）
4. 点击 **Save and Deploy**，完成后获得 `*.pages.dev` 域名

也可以直接上传（无需 Git）：
```
Pages → Create → Direct Upload → 上传整个 site 目录
```

---

### 方案三：Vercel（备选）

```bash
npm i -g vercel
cd /work/site
vercel --prod
```

---

## 添加新文章

1. 在 `posts/` 目录下新建 HTML 文件（参考 `posts/nat-stun-probe.html`）
2. 在 `js/posts.js` 数组开头添加一条记录：
   ```js
   {
     id: 8,
     title: "文章标题",
     category: "分类",
     tags: ["标签1", "标签2"],
     date: "2026-06-01",
     summary: "摘要...",
     cover: "封面图URL",
     readTime: 8,
     url: "posts/your-post.html"
   }
   ```
3. `git add . && git commit -m "new post: xxx" && git push` 即可自动部署

## 自定义域名

- **GitHub Pages**：Settings → Pages → Custom domain，填入域名后在 DNS 添加 CNAME 记录指向 `<用户名>.github.io`
- **Cloudflare Pages**：Pages → 你的项目 → Custom domains → Add，直接在 Cloudflare DNS 管理更方便
