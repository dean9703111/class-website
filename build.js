// 讀 content/*.md，套進 src/template.html，產生 site/index.html
const fs = require("fs");
const path = require("path");
const root = __dirname;

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = s => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/\[(.+?)\]\(((?:https?:|tel:|files\/)[^)\s]+)\)/g, (_, text, url) => {
    if (!url.startsWith("files/")) return `<a href="${url}">${text}</a>`;
    // 附件：檔案要放在 content/files/，點了直接下載
    if (!fs.existsSync(path.join(root, "content", url))) fail("index.md", 0, `找不到附件 content/${url}`);
    return `<a href="${url}" download>${text}</a>`;
  });

function fail(file, line, message) {
  throw new Error(`content/${file}${line ? ` 第 ${line} 行` : ""}：${message}`);
}

// 回傳 [{ text, n }]，n 是行號；HTML 註解會略過
function read(file) {
  const raw = fs.readFileSync(path.join(root, "content", file), "utf8")
    .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ""));
  return raw.split(/\r?\n/).map((text, i) => ({ text: text.trim(), n: i + 1 }));
}

// 依標題切段
function split(lines, mark) {
  const head = [], parts = [];
  for (const l of lines) {
    if (l.text.startsWith(mark + " ")) parts.push({ title: l.text.slice(mark.length + 1).trim(), n: l.n, lines: [] });
    else (parts.length ? parts[parts.length - 1].lines : head).push(l);
  }
  return { head, parts };
}

// 連續的清單行合成一組
function blocks(lines) {
  const out = [];
  let last = null;
  for (const { text, n } of lines) {
    if (!text) { last = null; continue; }
    const m = text.match(/^(-|\d+\.)\s+(.*)$/);
    if (m) {
      const type = m[1] === "-" ? "ul" : "ol";
      if (!last || last.type !== type) out.push(last = { type, items: [], n });
      last.items.push(m[2]);
    } else if (text.startsWith(">")) {
      out.push({ type: "note", text: text.replace(/^>\s*/, ""), n }); last = null;
    } else if (/^[#|]/.test(text)) {
      out.push({ type: "unknown", text, n }); last = null;
    } else {
      out.push({ type: "p", text, n }); last = null;
    }
  }
  return out;
}

const list = (type, items) => `<${type}>\n${items.map(i => `  <li>${inline(i)}</li>`).join("\n")}\n</${type}>`;

const DATE = "\\d{1,2}/\\d{1,2}（[一二三四五六日]）";
const DUE = /^(\d{1,2}\/\d{1,2})（([一二三四五六日])）前：(.+)$/;
const EVENT = new RegExp(`^(${DATE}(?:～${DATE})?)：(.+)$`);

function announcement({ title, lines }) {
  let html = `<article class="card">\n<h3>${inline(title)}</h3>\n`;
  let first = true;
  for (const b of blocks(lines)) {
    if (b.type === "p") html += `<p${first ? ' class="when"' : ""}>${inline(b.text)}</p>\n`;
    else if (b.type === "note") html += `<p class="note">${inline(b.text)}</p>\n`;
    else if (b.type === "ol") html += list("ol", b.items) + "\n";
    else if (b.type === "ul") {
      // 清單依寫法分成：期限（紅色日期標籤）、行事、一般
      const kind = i => DUE.test(i) ? "due" : EVENT.test(i) ? "events" : "";
      const groups = [];
      for (const item of b.items) {
        const k = kind(item);
        if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, items: [] });
        groups[groups.length - 1].items.push(item);
      }
      for (const { k, items } of groups) {
        if (!k) { html += list("ul", items) + "\n"; continue; }
        html += `<ul class="${k}">\n` + items.map(i => {
          if (k === "due") {
            const [, date, week, text] = i.match(DUE);
            return `  <li><b>${date}<small>${week}前</small></b><span>${inline(text)}</span></li>`;
          }
          const [, date, text] = i.match(EVENT);
          return `  <li><span>${date.replace("～", "～<br>")}</span>${inline(text)}</li>`;
        }).join("\n") + "\n</ul>\n";
      }
    } else fail("index.md", b.n, `看不懂「${b.text}」`);
    first = false;
  }
  return html + "</article>";
}

function home() {
  const { head, parts } = split(read("index.md"), "##");
  const top = head.filter(l => l.text);
  if (top.length !== 2 || !top[0].text.startsWith("# ")) fail("index.md", 1, "開頭要是「# 班名」，下面一行寫學校與學期");
  const names = ["班呼", "最新公告", "導師的話", "頁尾"];
  const extra = parts.find(p => !names.includes(p.title));
  if (extra) fail("index.md", extra.n, `不認得的段落「## ${extra.title}」，只能用：${names.join("、")}`);
  const get = name => parts.find(p => p.title === name) || fail("index.md", 0, `找不到「## ${name}」`);
  const textLines = name => get(name).lines.filter(l => l.text).map(l => l.text);

  const news = split(get("最新公告").lines, "###");
  const stray = news.head.find(l => l.text);
  if (stray) fail("index.md", stray.n, "公告要先寫「### 標題」");

  const words = blocks(get("導師的話").lines).map(b => {
    if (b.type === "ul" || b.type === "ol") return list(b.type, b.items);
    if (b.type !== "p") fail("index.md", b.n, "導師的話只能用段落和清單");
    return b.text.startsWith("署名：")
      ? `<p class="sign">${inline(b.text.slice(3))}</p>`
      : `<p>${inline(b.text)}</p>`;
  }).join("\n");

  const className = top[0].text.slice(2).trim();
  const school = top[1].text;
  return {
    title: esc(`${className}｜${school.split(/\s/)[0]}`),
    className: inline(className),
    school: inline(school),
    cheer: textLines("班呼").map(t => `<span>${inline(t)}</span>`).join(""),
    footer: textLines("頁尾").map(inline).join("<br>"),
    home: ` <div class="home">
  <div>
  <h2>最新公告</h2>
${news.parts.map(announcement).join("\n")}
  </div>
  <div>
  <h2>導師的話</h2>
  <div class="card teacher">
${words}
  </div>
  </div>
 </div>`
  };
}

function timetable() {
  const lines = read("timetable.md");
  const table = lines.filter(l => l.text.startsWith("|"))
    .map(l => ({ n: l.n, cells: l.text.replace(/^\||\|$/g, "").split("|").map(c => c.trim()) }));
  const rows = table.slice(2); // 去掉表頭與分隔線
  if (!rows.length) fail("timetable.md", 0, "找不到課表表格");
  for (const r of rows) if (r.cells.length !== 7) fail("timetable.md", r.n, "每一列要有 7 格：節次、時間、星期一到五");

  const periods = rows.map((r, i) => {
    const [name, time, ...subjects] = r.cells;
    const isBreak = /下課|午/.test(name);
    const tds = subjects.map((s, d) => {
      if (s === "〃") return ""; // 併入上一格
      let span = 1;
      while (rows[i + span] && rows[i + span].cells[d + 2] === "〃") span++;
      const [subject, place] = s.split("／");
      const attrs = (isBreak || !subject || /^\d/.test(subject) ? "" : ` class="${esc(subject.slice(0, 2))}"`) + (span > 1 ? ` rowspan="${span}"` : "");
      return `<td data-d="${d}"${attrs}>${inline(subject)}${place ? `<small>${inline(place)}</small>` : ""}</td>`;
    }).join("");
    return `<tr${isBreak ? ' class="break"' : ""}><th scope="row">${inline(name)}<small>${inline(time)}</small></th>${tds}</tr>`;
  }).join("");

  const notes = blocks(lines.filter(l => !l.text.startsWith("|") && !l.text.startsWith("# "))).map(b => {
    if (b.type === "ul") return list("ul", b.items);
    if (b.type !== "p") fail("timetable.md", b.n, "表格下方只能用清單或段落");
    return `<p>${inline(b.text)}</p>`;
  }).join("\n");

  return { periods, scheduleNotes: notes };
}

function contactBook() {
  const { head, parts } = split(read("contact-book.md"), "##");
  const notes = blocks(head.filter(l => !l.text.startsWith("# "))).map(b => {
    if (b.type !== "note") fail("contact-book.md", b.n, "第一個日期之前只能放「> 提醒」");
    return `<p class="when">${inline(b.text)}</p>`;
  });
  const pages = parts.map(p => {
    if (!new RegExp(`^${DATE}$`).test(p.title)) fail("contact-book.md", p.n, "日期請寫成「## 11/26（四）」");
    const body = blocks(p.lines).map(b => {
      if (b.type === "ul" || b.type === "ol") return list(b.type, b.items);
      fail("contact-book.md", b.n, "每一項請用「1. 」開頭");
    }).join("\n");
    return `<article class="page">\n<h3>${p.title}</h3>\n${body}\n</article>`;
  });
  return { book: `<div class="book">\n${pages.join("\n")}\n</div>\n${notes.join("\n")}` };
}

function build() {
  const data = { ...home(), ...timetable(), ...contactBook() };
  const html = fs.readFileSync(path.join(root, "src", "template.html"), "utf8")
    .replace("版面樣板。內容請改 content/ 裡的 Markdown。", "此檔由程式產生，請勿直接修改。內容請改 content/ 裡的 Markdown。")
    .replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? fail("", 0, `樣板欄位 ${key} 沒有內容`));
  fs.mkdirSync(path.join(root, "site"), { recursive: true });
  fs.writeFileSync(path.join(root, "site", "index.html"), html);
  const files = path.join(root, "content", "files");
  if (fs.existsSync(files)) fs.cpSync(files, path.join(root, "site", "files"), { recursive: true });
  return html;
}

module.exports = build;

if (require.main === module) {
  try { build(); console.log("已產生 site/index.html"); }
  catch (e) { console.error("產生失敗，" + e.message); process.exitCode = 1; }
}
