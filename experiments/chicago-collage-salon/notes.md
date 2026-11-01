# Chicago Collage Salon

All 345 works from [The Chicago Collage Project gallery](https://www.thechicagocollageproject.com/new-gallery) become a spatial, rearrangeable exhibition.

The interface uses an analog-zine visual language—crooked paper scraps, typewriter ink, waxy color marks, tape, and imperfect hard shadows—so the controls feel cut from the same material as the work rather than layered on as generic software chrome.

The layout buttons transform the same set of WebGL artwork cards between a salon wall, spiral, globe, ribbon, and **Color map**. The color map is a t-SNE-style similarity embedding derived from each image's hue distribution, saturation, lightness, and average RGB values. All 345 cards are rendered together from a local contact-sheet texture, avoiding the mobile browser layer limits that can hide large CSS3D collections.

Open **Analyze / search** to find an artist, arrange the salon by author or color spectrum, or isolate a color family. Orange works sit with orange works in the spectrum arrangement; the similarity map exposes looser palette neighborhoods. Select a work to open a much larger full-resolution image and its plaque. Scroll, pinch, or use **Closer** for an even larger inspection; **All works** returns to the active arrangement.

The local `images/artworks/` folder contains one optimized AVIF file per gallery item in source order; `images/chicago-collage-atlas.jpg` supplies the single-draw overview. When an atlas card grows beyond thumbnail size, the renderer progressively overlays its 1400px local artwork texture, keeping **Lean in** sharp without loading 345 large GPU textures at once. `ColorData.js` stores the precomputed palette analysis and embedding. Artist credit, original dimensions, local paths, and the direct source URL are retained in `Artworks.js`; source records that currently say “by Unknown” are labeled **Uncredited at source** rather than presented as a real artist name.
