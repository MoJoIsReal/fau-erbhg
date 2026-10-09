# Manrope for PDF exports

These static weights (400, 600 and 700) are bundled for the calendar PDF renderer.
They use the same font family as the site's UI and avoid a font CDN request during
export. Keep the accompanying SIL Open Font License.

Source: Google Fonts, Manrope v20, downloaded 2026-09-22.
The weight-specific TTF URLs are supplied by:
https://fonts.googleapis.com/css?family=Manrope:400,600,700

License source:
https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt

# Site webfonts (WOFF2)

`manrope-latin.woff2`, `manrope-latin-ext.woff2`, `caveat-latin.woff2` and
`caveat-latin-ext.woff2` are the site's UI and decorative faces, declared in
`client/src/index.css`. Each is Google Fonts' variable-weight file for that
subset (Manrope v20, Caveat v23), downloaded 2026-10-08 from the URLs listed by
`https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Caveat:wght@600`
with a WOFF2-capable user agent, and served from our own origin so no visitor
request goes to Google. Caveat's licence is `Caveat-OFL.txt`; source:
https://github.com/google/fonts/blob/main/ofl/caveat/OFL.txt
