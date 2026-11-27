// 即時預覽：Markdown 或樣板一存檔就重新產生網頁，瀏覽器自動重新整理
const fs = require("fs");
const path = require("path");
const http = require("http");
const build = require("./build");

const port = Number(process.env.PORT) || 5300;
const clients = new Set();
// 只加在預覽畫面，不會寫進 site/index.html
const reload = '<script>new EventSource("/events").onmessage = () => location.reload();</script>';
let page;

function rebuild() {
  try {
    page = build().replace("</body>", reload + "\n</body>");
    console.log(new Date().toLocaleTimeString(), "已更新");
  } catch (e) {
    console.error("產生失敗，" + e.message);
    const msg = e.message.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    page = `<!DOCTYPE html><meta charset="utf-8"><h1>產生失敗</h1><p>${msg}</p>${reload}`;
  }
  clients.forEach(res => res.write("data: reload\n\n"));
}

let timer;
for (const dir of ["content", "src"]) {
  fs.watch(path.join(__dirname, dir), () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); });
}
rebuild();

http.createServer((req, res) => {
  if (req.url === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write("\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(page);
}).listen(port, "127.0.0.1", () => console.log(`預覽網址 http://localhost:${port} （按 Ctrl+C 結束）`));
