# Chicago Collage Salon

All 345 works from [The Chicago Collage Project gallery](https://www.thechicagocollageproject.com/new-gallery) become a spatial, rearrangeable exhibition.

The layout buttons transform the same set of WebGL artwork cards between a salon wall, spiral, globe, and ribbon. All 345 cards are rendered together from a local contact-sheet texture, avoiding the mobile browser layer limits that can hide large CSS3D collections. Drag to orbit, scroll or pinch to zoom, and select a work to open its full-resolution image and plaque. **All works** returns to the active arrangement; **Drift** cycles through the exhibition automatically.

The local `images/artworks/` folder contains one optimized AVIF file per gallery item in source order; `images/chicago-collage-atlas.jpg` supplies the single-draw overview. Artist credit, original dimensions, local paths, and the direct source URL are retained in `Artworks.js`.
