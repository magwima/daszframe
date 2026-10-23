# DASZFRAME — Portrait Fragment Studio

Turn a portrait into a fragmented collage, or grade photos like film.
Everything runs in your browser: **your photos never leave your device.**

**Use it online:** https://magwima.github.io/daszframe/

By Michael Kagwima.

---

## What it does

### Studio
- **Face collages** — DASZFRAME finds the face in your photo and cuts it into 13 fragments
  (eyes, nose, mouth, cheeks, forehead, chin, halves and strips) that follow the real features.
  If no face is found, it falls back to standard portrait crops and tells you.
- **7 layouts** — DASZ (signature), Mosaic, Editorial, Cubist, Symmetry, Gallery, Experimental.
  Drag fragments to rearrange them; rotate, flip, round corners, change order, duplicate or delete.
- **Layers** — stack photo, collage and solid-colour layers, each with its own grade, opacity and blend mode.
- **Film looks** — Cinematic, Vintage, B&W, Noir, Bleach Bypass, Teal & Orange, Editorial, Kodak,
  Fuji, Documentary, and a real dot-screen Halftone, each with adjustable strength.
- **Portrait retouch** — Face Light, Eye Enhancer, Skin Smoothing and Teeth Whitening, guided by
  the detected face so only skin, eyes and teeth are touched. On a collage, every fragment updates.
- **Colour grading** — exposure, contrast, highlights, shadows, whites, blacks, saturation,
  vibrance, temperature, tint, lift / gamma / gain, a draggable **Tone Curve**, and a
  **Color Mixer** (hue, saturation and luminance for 8 colour ranges).
- **Before / after and histogram** — hold the `\` key (or the ◐ Before button) to see the original;
  a live histogram shows when highlights or shadows are clipping.
- **Optical FX** — vignette, film grain, chromatic aberration, blur, glow, clarity, sharpness.
- **LUTs** — import any 3D `.cube` LUT.
- **Export** — PNG or JPG at 1×, 2× or 4× (up to 3416 px). Exports render from the full-resolution
  source, and the preview uses the same renderer, so what you see is what you get.
- **Projects** — save and reopen `.daszframe` files. Your work also autosaves in the browser,
  and DASZFRAME offers to restore it next time you open it.
- **Undo / redo** — Ctrl+Z / Ctrl+Y (⌘ on Mac). Del removes the selected fragment.

### Spotlight
Drag over any area of an image to create a CCTV-style detail badge with a connector line.
Badges can be moved, resized and labelled, then exported as PNG.

---

## Repository layout

| Path | What it is |
|------|------------|
| `docs/` | The app. GitHub Pages serves this folder as the website. |
| `docs/app.js` | User interface (React, no build step). |
| `docs/js/engine.js` | Renderer shared by the live preview and export. |
| `docs/js/faces.js` | In-browser face detection and fragment regions. |
| `docs/js/portrait.js` | Face-guided retouch (light, eyes, skin, teeth). |
| `docs/js/store.js` | Project files and autosave (IndexedDB). |
| `docs/vendor/face-api/` | [face-api](https://github.com/vladmandic/face-api) (MIT) and its two models (~2 MB, loaded only when you make a collage). |
| `extension/` | Chrome extension shell (manifest, background script, icons) and its build script. |

## Run it locally

Any static file server works, for example:

```sh
cd docs
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` directly from disk will not load the face detector, because browsers block
`file://` fetches.

## Publish on GitHub Pages

Repository **Settings → Pages → Build and deployment**: Source **Deploy from a branch**,
Branch **main**, folder **/docs**. The site appears at the address above within a minute or two.

## Chrome extension

The extension is built from the same code as the website:

```sh
sh extension/build.sh
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose
`dist/daszframe-extension`. Clicking the toolbar icon opens the studio in a full tab.

## Browser support

Recent Chrome, Edge, Firefox and Safari on desktop. It is designed for a mouse or trackpad on a
large screen; dragging works with touch, but the layout is not yet adapted for phones.

## Licence notes

Bundled third-party code: React (MIT), face-api by Vladimir Mandic (MIT, see
`docs/vendor/face-api/LICENSE`).
