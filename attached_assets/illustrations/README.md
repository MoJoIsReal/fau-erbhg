# Source illustrations

The six commissioned originals, one per page, each with a `-dark` sibling
drawn as the same place after nightfall, at the resolution they were delivered
in (~2.4MB PNG each). **Nothing here is served.** They live outside `client/`
on purpose: `client/public/` is copied verbatim into the Vercel deploy, so
keeping them there shipped 14MB of unresized PNG to every visitor.

What ships is the webp/jpg pairs derived from each into
`client/src/assets/illustrations/`, which Vite fingerprints and which
`client/src/components/site/illustrations.ts` serves through a `<picture>`.

## Two crops per scene

Each original is cut **twice**, because a hero is a 3:1 ribbon on a laptop and
close to 4:3 on a phone and one rectangle cannot be both — `object-fit: cover`
would just eat the sides on the phone and take the noticeboard, the postbox or
a child with it:

- `hero-<page>-<w>` — the **wide** crop, for the desktop band or column.
- `hero-<page>-narrow-<w>` — the **narrow** crop, composed for a phone around
  whatever that page's picture is actually about.

`-dark` goes before the width in both (`hero-news-narrow-dark-430.webp`).
`Artwork` picks between the two with a `media` query, so exactly one is
fetched, and the phone frame then renders the narrow crop at its own ratio —
nothing is cropped a second time.

## Regenerating a derivative

`illustrations.ts` documents every crop rectangle and *why* it is that
rectangle — which baked lettering it excludes, and what must survive a
narrower frame. Take the numbers from there. With `sharp` available
(`npm i --no-save sharp`; it is not a project dependency):

```js
const base = await sharp('attached_assets/illustrations/<source>.png')
  .extract({ left, top, width, height })
  .png()
  .toBuffer();

for (const w of [small, large]) {
  const h = Math.round((height * w) / width);
  await sharp(base).resize(w, h, { kernel: 'lanczos3' })
    .webp({ quality: 82 })
    .toFile(`client/src/assets/illustrations/<name>-${w}.webp`);
  await sharp(base).resize(w, h, { kernel: 'lanczos3' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(`client/src/assets/illustrations/<name>-${w}.jpg`);
}
```

Widths are `[840, 1400]` for a wide band, `[782, 1120]` for the home column,
`[620, 960]` for the values banner and `[430, 860]` for a narrow crop (743
rather than 860 where the crop has no more pixels than that). Then update the
`width`/`height` passed to `source()` in `illustrations.ts` — they are the
crop's dimensions, and the layout reserves space and picks its ratios from
them.

## The dark siblings

Dark mode is a **swap, not a filter**: `Artwork` serves the night file whole,
with no grayscale, dimming or overlay over it.

Where the night scene was drawn to the same geometry as its daylight sibling
— Hjem, Aktuelt, Kalender — use the *same* crop rectangle, and the two themes
then frame the same thing. Two were redrawn rather than repainted and need
their own rectangles:

- **`contact-mailbox-dark`** was delivered 1672×941 where the day version is
  1916×821, and moves the postbox to the right with no handwriting at all.
- **`documents-information-dark`** is a different scene entirely: a desk by
  lamplight, no signpost, the fjord seen past a window.

Cut those to the *same ratio* as their daylight crop, so the page keeps one
shape in both themes. `illustrations.ts` records each rectangle beside its
set.

## The three rules a crop has to obey

1. Wherever a signpost appears it reads **FOR BARNA / SAMMEN / ENGASJEMENT**,
   complete. Never two of the three. This holds in both themes.
2. A crop may keep the artwork's own handwritten aside. It may never keep
   lettering that repeats the page's own heading, or a line the page already
   prints as HTML. "Små mennesker, store dager" stays a secondary brand
   phrase, but not on the page that prints it.
3. An edge never cuts *through* lettering: it either clears a phrase
   completely or keeps all of it.
