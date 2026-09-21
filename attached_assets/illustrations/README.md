# Source illustrations

The six commissioned originals, one per page, at the resolution they were
delivered in (~2.4MB PNG each). **Nothing here is served.** They live outside
`client/` on purpose: `client/public/` is copied verbatim into the Vercel
deploy, so keeping them there shipped 14MB of unresized PNG to every visitor.

What ships is the webp/jpg pair derived from each into
`client/src/assets/illustrations/`, which Vite fingerprints and which
`client/src/components/site/illustrations.ts` serves through a `srcset`.

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

Then update the `width`/`height` passed to `set()` in `illustrations.ts` —
they are the crop's dimensions, and the layout reserves space from them.

## The two rules a crop has to obey

1. Wherever a signpost appears it reads **FOR BARNA / SAMMEN / ENGASJEMENT**,
   complete. Never two of the three.
2. A crop may keep the artwork's own handwritten aside. It may never keep
   lettering that repeats the page's own heading, or a line the page already
   prints as HTML. "Små mennesker, store dager" stays a secondary brand
   phrase, but not on the page that prints it.
