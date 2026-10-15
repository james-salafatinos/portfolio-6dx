# Factorio Production Network

## Phase 1: establish the production model

This first phase builds a normalized, provenance-backed dataset for **Factorio base game 2.0.77**. It deliberately separates four concepts that are easy to conflate:

- **materials** — items and fluids consumed or produced;
- **recipes** — transformations with quantities, probabilities, categories, and craft times;
- **machines** — operators compatible with one or more recipe categories;
- **fuels** — energy carriers accepted by burner machines.

The default view is the complete directed production network. Materials are circles, recipes are squares, and machines are hexagons. Node size reflects direct recipe reuse, so widely shared inputs stand out before anything is selected. Drag to pan, use the wheel to zoom, and click a node to isolate its immediate connections.

The **Neighborhood** view gives a more literal audit trail for a selected material: its producing recipe, compatible operators, possible fuels, and direct consumers. The ranking at left counts how many distinct recipes directly consume each material; it is a useful structural signal, but it is not the same as factory demand per minute.

## Source and reproducibility

The generated dataset is pinned to Wube Software's official [`factorio-data`](https://github.com/wube/factorio-data) repository at tag `2.0.77`:

- recipes: `base/prototypes/recipe.lua`
- machines and crafting categories: `base/prototypes/entity/entities.lua`
- fuels and energy values: `base/prototypes/item.lua`

The extraction script is at `scripts/extract-factorio-data.mjs`. It intentionally excludes Space Age, Quality, Elevated Rails, Recycler, hidden/editor recipes, generated barrel logistics recipes, and non-recipe production such as mining and pumping. These boundaries keep Phase 1 focused and are recorded in the generated JSON itself.

## Reading the graph

Arrows show production direction. Neutral edges connect materials and recipes, dashed green edges connect compatible machines to recipes, and dotted yellow edges connect chemical fuels to burner machines. Electric energy is recorded on machine records, but is not expanded into the power-generation network yet.

## Next phase

The next phase can turn this validated dataset into the full interactive network and add scenario demand: choose an output rate, recursively balance recipe quantities, resolve alternate paths, and rank raw-resource throughput rather than merely counting connections.
