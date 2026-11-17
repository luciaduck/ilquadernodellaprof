const { Liquid } = require("liquidjs");
const sass = require("sass");
const markdownItAttrs = require("markdown-it-attrs");
const path = require("node:path");
const fs = require("node:fs");

// ── robots.txt: fonte di verità per le sitemap ───────────────
const ROBOTS_FILE = "robots.txt";
const ROBOTS_AGENT = "DuckDuckBot";

// Pagine tecniche: mai in sitemap, anche se robots le permette.
const SITEMAP_SKIP = ["/404.html", "/offline.html"];

// Legge le regole Allow/Disallow del gruppo indicato.
function readRobotsRules(file = ROBOTS_FILE, agent = ROBOTS_AGENT) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return []; // nessun robots.txt = tutto permesso
  }

  const rules = [];
  let inGroup = false;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;

    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      // Più User-agent di fila = un unico gruppo condiviso
      if (!lastWasAgent) inGroup = false;
      if (value === agent) inGroup = true;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;

    if (!inGroup) continue;
    if (field !== "allow" && field !== "disallow") continue;
    if (field === "disallow" && value === "") continue; // "Disallow:" vuoto = permetti tutto
    rules.push({ allow: field === "allow", path: value });
  }
  return rules;
}

// Confronto in stile robots: prefisso, con supporto per * e $.
// Restituisce la lunghezza della regola che ha fatto match, o -1.
function robotsMatchLength(pattern, url) {
  let p = pattern;
  let anchored = false;
  if (p.endsWith("$")) {
    p = p.slice(0, -1);
    anchored = true;
  }
  const source =
    "^" +
    p
      .split("*")
      .map((chunk) => chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^]*") +
    (anchored ? "$" : "");
  return new RegExp(source).test(url) ? pattern.length : -1;
}

// Regola più lunga = più specifica; a parità vince Allow.
function isAllowedByRobots(url, rules) {
  let bestAllow = -1;
  let bestDisallow = -1;
  for (const rule of rules) {
    const len = robotsMatchLength(rule.path, url);
    if (len < 0) continue;
    if (rule.allow) bestAllow = Math.max(bestAllow, len);
    else bestDisallow = Math.max(bestDisallow, len);
  }
  if (bestDisallow < 0) return true;
  return bestAllow >= bestDisallow;
}

// URL pulito
function cleanUrl(url) {
  return url.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = function (eleventyConfig) {

  // Motore Liquid con sintassi Jekyll (include senza virgolette,
  // {% include {{ btn }} %} dinamico). Di default, da 11ty 1.0 in poi,
  // servirebbero le virgolette: {% include "head.html" %}.
  // strictFilters: true fa fallire la build se resta un filtro Jekyll
  // non convertito (es. relative_url dimenticato), invece di ignorarlo
  // silenziosamente.
  eleventyConfig.setLibrary("liquid", new Liquid({
    dynamicPartials: false,
    strictFilters: true,
    root: ["_includes"],
  }));

  // ── Markdown ─────────────────────────────────────────────────────
  // Attributi in coda a un elemento markdown: `## Titolo {#id data-x="y"}`.
  // Serve per marcare le sezioni della dispensa senza scrivere HTML.
  eleventyConfig.amendLibrary("md", (md) => md.use(markdownItAttrs));

  // ── Sass ─────────────────────────────────────────────────────────
  // Compila qualunque .scss trovato nel progetto nel corrispondente .css
  eleventyConfig.addTemplateFormats("scss"); // forse ridondante, ma innocua
  eleventyConfig.addExtension("scss", {
    outputFileExtension: "css",
    compile: async function (inputContent, inputPath) {
      if (path.basename(inputPath).startsWith("_")) {
        return;
      }
      let result = sass.compileString(inputContent, {
        loadPaths: ["_sass"],
      });
      return async () => result.css;
    },
    getData: async function () {
      return { layout: false };
    },
  });

  // ── Dati globali del sito ──────────────────────────────────────
  const site = {
    title: "il Quaderno della Prof",
    description:
      "Un quaderno pieno di appunti, materiali, papere e letture. App didattica della prof Lucia Capurri.",
    version: "2.0.0",
    lang: "it",
    url: "https://ilquadernodellaprof.it",
    image: "assets/icons/og.png",
  };
  eleventyConfig.addGlobalData("site", site);

  // Layout di default.
  eleventyConfig.addGlobalData("layout", "page");

// Permalink piatti per tutto il sito, come Jekyll — richiesto dai link relativi
eleventyConfig.addGlobalData("eleventyComputed", {
  permalink: (data) => {
    if (data.page.inputPath.endsWith(".md") || data.page.inputPath.endsWith(".html")) {
      return data.page.filePathStem + ".html";
    }
  },
});

  // ── File statici da copiare così come sono ─────────────────────
  eleventyConfig.addPassthroughCopy("assets/fonts");
  eleventyConfig.addPassthroughCopy("assets/icons");
  eleventyConfig.addPassthroughCopy("manifest.json");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("_headers");
  eleventyConfig.addPassthroughCopy("_redirects");
  eleventyConfig.addPassthroughCopy("sw.js");
  eleventyConfig.addPassthroughCopy("act.js");
  eleventyConfig.addPassthroughCopy("auth.js");
  eleventyConfig.addPassthroughCopy("header.js")
  eleventyConfig.addPassthroughCopy("pag/**/img/**");
  eleventyConfig.addWatchTarget("_sass");
  eleventyConfig.addWatchTarget(ROBOTS_FILE);

  // ── Sitemap ──────────────────────────────────────────────────────
  //   • collections.sitemap  → sitemap.md
  //   • sitemap.xml          → scritto a fine build, qui sotto
  // Per escludere una pagina a mano: `sitemap: false` nel front matter.
  let sitemapPages = [];

  eleventyConfig.addCollection("sitemap", (collectionApi) => {
    const rules = readRobotsRules();

    sitemapPages = collectionApi
      .getAll()
      .filter((item) => item.outputPath && item.outputPath.endsWith(".html"))
      .filter((item) => item.data.sitemap !== false)
      .filter((item) => !SITEMAP_SKIP.includes(item.url))
      .filter(
        (item) =>
          isAllowedByRobots(item.url, rules) &&
          isAllowedByRobots(cleanUrl(item.url), rules)
      )
      .map((item) => ({
        url: cleanUrl(item.url),
        rawUrl: item.url,
        loc: site.url + cleanUrl(item.url),
        title: item.data.title || cleanUrl(item.url),
        lastmod: item.date ? item.date.toISOString().slice(0, 10) : null,
      }))
      .sort((a, b) =>
        a.title.localeCompare(b.title, "it", { sensitivity: "base" })
      );

    return sitemapPages;
  });

  // sitemap.xml scritta direttamente in _site a fine build:
  // stessi dati della pagina HTML, ordinati per URL.
  eleventyConfig.on("eleventy.after", async ({ dir }) => {
    const urls = [...sitemapPages].sort((a, b) => a.loc.localeCompare(b.loc));
    const body = urls
      .map(
        (p) =>
          `  <url>\n    <loc>${escapeXml(p.loc)}</loc>` +
          (p.lastmod ? `\n    <lastmod>${p.lastmod}</lastmod>` : "") +
          `\n  </url>`
      )
      .join("\n");

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${body}\n</urlset>\n`;

    await fs.promises.mkdir(dir.output, { recursive: true });
    await fs.promises.writeFile(path.join(dir.output, "sitemap.xml"), xml);
    console.log(`[sitemap] ${urls.length} pagine permesse da ${ROBOTS_FILE}`);
  });

// ── Shortcode SEO ────────────────────────────────────────────────
  // Uso in head.html: {% seo title, description, og_image %}
  // og_image: opzionale (front matter); ha site.image come fallback.
  eleventyConfig.addShortcode("seo", function (title, description, image) {
    const pageTitle = title ? `${title} — ${site.title}` : site.title;
    const pageDescription = description || site.description;
    const canonicalUrl = `${site.url}${cleanUrl(this.page.url)}`;
    const imagePath = (image || site.image).replace(/^\//, "");
    const imageUrl = `${site.url}/${imagePath}`;

    const escape = (str) =>
      String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    return [
      `<title>${escape(pageTitle)}</title>`,
      `<meta name="description" content="${escape(pageDescription)}">`,
      `<link rel="canonical" href="${canonicalUrl}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${escape(site.title)}">`,
      `<meta property="og:locale" content="it_IT">`,
      `<meta property="og:url" content="${canonicalUrl}">`,
      `<meta property="og:title" content="${escape(pageTitle)}">`,
      `<meta property="og:description" content="${escape(pageDescription)}">`,
      `<meta property="og:image" content="${imageUrl}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
    ].join("\n  ");
  });

  // ── Cartelle e motore di template ───────────────────────────────
  return {
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    templateFormats: ["html", "md", "scss"],
    htmlTemplateEngine: "liquid",
    markdownTemplateEngine: "liquid",
  };
};