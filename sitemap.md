---
title: Mappa del sito
classe: lampone
extra_css: [credit.css]
---

Tutte le pagine del Quaderno, in ordine alfabetico.

{% if collections.sitemap.size > 0 %}
<ul class="mappa-sito">
{% for p in collections.sitemap %}{% unless p.rawUrl == page.url %}
  <li><a href="{{ p.url }}">{{ p.title }}</a></li>
{% endunless %}{% endfor %}
</ul>
{% else %}
Pagina in costruzione.
{% endif %}