export class ProductionGraph {
  constructor(dataset) {
    this.dataset = dataset;
    this.items = new Map(dataset.items.map((item) => [item.id, item]));
    this.recipes = new Map(dataset.recipes.map((recipe) => [recipe.id, recipe]));
    this.machines = new Map(dataset.machines.map((machine) => [machine.id, machine]));
    this.producers = new Map();
    this.consumers = new Map();

    for (const recipe of dataset.recipes) {
      for (const product of recipe.products) this.#append(this.producers, product.name, recipe);
      for (const ingredient of recipe.ingredients) this.#append(this.consumers, ingredient.name, recipe);
    }
  }

  #append(index, key, value) {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(value);
  }

  machinesFor(recipe) {
    return this.dataset.machines.filter((machine) => machine.categories.includes(recipe.category));
  }

  fuelsFor(machine) {
    return this.dataset.fuels.filter((fuel) => machine.energy.fuelCategories.includes(fuel.category));
  }

  demandRanking() {
    return this.dataset.items.map((item) => {
      const consumers = this.consumers.get(item.id) || [];
      const amount = consumers.reduce((sum, recipe) => sum + recipe.ingredients
        .filter((ingredient) => ingredient.name === item.id)
        .reduce((recipeSum, ingredient) => recipeSum + ingredient.amount, 0), 0);
      return { ...item, recipeCount: consumers.length, statedAmount: amount };
    }).filter((item) => item.recipeCount > 0)
      .sort((a, b) => b.recipeCount - a.recipeCount || b.statedAmount - a.statedAmount || a.name.localeCompare(b.name));
  }

  fullNetwork() {
    const nodes = [];
    const edges = [];
    const fuelIds = new Set(this.dataset.fuels.map((fuel) => fuel.id));
    const ranking = this.demandRanking();
    const demand = new Map(ranking.map((item) => [item.id, item.recipeCount]));
    const itemDepth = new Map();
    const recipeDepth = new Map();

    for (const item of this.dataset.items) {
      if (!(this.producers.get(item.id) || []).length) itemDepth.set(item.id, 0);
    }

    for (let pass = 0; pass < this.dataset.recipes.length; pass += 1) {
      let changed = false;
      for (const recipe of this.dataset.recipes) {
        const depths = recipe.ingredients.map((ingredient) => itemDepth.get(ingredient.name));
        if (depths.some((depth) => depth === undefined)) continue;
        const depth = Math.max(...depths, 0) + 0.5;
        if (!recipeDepth.has(recipe.id) || depth < recipeDepth.get(recipe.id)) {
          recipeDepth.set(recipe.id, depth);
          changed = true;
        }
        for (const product of recipe.products) {
          const productDepth = depth + 0.5;
          if (!itemDepth.has(product.name) || productDepth < itemDepth.get(product.name)) {
            itemDepth.set(product.name, productDepth);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    const resolvedDepths = [...itemDepth.values()];
    const fallbackDepth = resolvedDepths.length ? Math.max(...resolvedDepths) * 0.55 : 4;
    const hash = (value) => {
      let result = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
      }
      return (result >>> 0) / 4294967295;
    };

    for (const item of this.dataset.items) {
      const depth = itemDepth.get(item.id) ?? fallbackDepth;
      nodes.push({
        id: `item:${item.id}`,
        ref: item.id,
        label: item.name,
        kind: fuelIds.has(item.id) ? 'fuel' : item.type,
        demand: demand.get(item.id) || 0,
        targetX: depth * 175,
        x: depth * 175 + (hash(`${item.id}:x`) - 0.5) * 90,
        y: (hash(`${item.id}:y`) - 0.5) * 1100
      });
    }

    for (const recipe of this.dataset.recipes) {
      const depth = recipeDepth.get(recipe.id) ?? fallbackDepth + 0.5;
      nodes.push({
        id: `recipe:${recipe.id}`,
        ref: recipe.id,
        label: recipe.name,
        kind: 'recipe',
        demand: 0,
        targetX: depth * 175,
        x: depth * 175 + (hash(`${recipe.id}:rx`) - 0.5) * 70,
        y: (hash(`${recipe.id}:ry`) - 0.5) * 1100
      });
      for (const ingredient of recipe.ingredients) {
        edges.push({ from: `item:${ingredient.name}`, to: `recipe:${recipe.id}`, kind: 'ingredient', amount: ingredient.amount });
      }
      for (const product of recipe.products) {
        edges.push({ from: `recipe:${recipe.id}`, to: `item:${product.name}`, kind: 'product', amount: product.amount * product.probability });
      }
    }

    for (const machine of this.dataset.machines) {
      const compatibleRecipes = this.dataset.recipes.filter((recipe) => machine.categories.includes(recipe.category));
      const depths = compatibleRecipes.map((recipe) => recipeDepth.get(recipe.id)).filter((depth) => depth !== undefined);
      const depth = depths.length ? depths.reduce((sum, value) => sum + value, 0) / depths.length : fallbackDepth;
      nodes.push({
        id: `machine:${machine.id}`,
        ref: machine.id,
        label: machine.name,
        kind: 'machine',
        demand: compatibleRecipes.length,
        targetX: depth * 175,
        x: depth * 175 + (hash(`${machine.id}:mx`) - 0.5) * 60,
        y: (hash(`${machine.id}:my`) - 0.5) * 900
      });
      for (const recipe of compatibleRecipes) {
        edges.push({ from: `machine:${machine.id}`, to: `recipe:${recipe.id}`, kind: 'operator' });
      }
      for (const fuel of this.fuelsFor(machine)) {
        edges.push({ from: `item:${fuel.id}`, to: `machine:${machine.id}`, kind: 'energy' });
      }
    }

    return { nodes, edges };
  }

  neighborhood(itemId, consumerLimit = 10) {
    const item = this.items.get(itemId) || this.items.get('iron-plate') || this.dataset.items[0];
    const producers = this.producers.get(item.id) || [];
    const consumers = (this.consumers.get(item.id) || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const visibleConsumers = consumers.slice(0, consumerLimit);
    const nodes = new Map();
    const edges = [];

    const addNode = (node) => nodes.set(node.id, node);
    const addEdge = (from, to, type, amount = null) => edges.push({ from, to, type, amount });

    addNode({ id: `item:${item.id}`, ref: item.id, label: item.name, kind: item.type, layer: 2, selected: true });

    for (const recipe of producers) {
      const recipeId = `recipe:${recipe.id}`;
      addNode({ id: recipeId, ref: recipe.id, label: recipe.name, kind: 'recipe', layer: 1, detail: `${recipe.time}s` });
      for (const product of recipe.products.filter((candidate) => candidate.name === item.id)) {
        addEdge(recipeId, `item:${item.id}`, 'product', product.amount * product.probability);
      }
      for (const ingredient of recipe.ingredients) {
        const ingredientItem = this.items.get(ingredient.name) || { id: ingredient.name, name: ingredient.name, type: ingredient.type };
        const ingredientId = `item:${ingredient.name}`;
        addNode({ id: ingredientId, ref: ingredient.name, label: ingredientItem.name, kind: ingredient.type, layer: 0 });
        addEdge(ingredientId, recipeId, 'ingredient', ingredient.amount);
      }
      for (const machine of this.machinesFor(recipe)) {
        const machineId = `machine:${machine.id}`;
        addNode({ id: machineId, ref: machine.id, label: machine.name, kind: 'machine', layer: 1, detail: `${machine.craftingSpeed}×` });
        addEdge(machineId, recipeId, 'operator');
        for (const fuel of this.fuelsFor(machine)) {
          const fuelId = `fuel:${fuel.id}`;
          addNode({ id: fuelId, ref: fuel.id, label: fuel.name, kind: 'fuel', layer: 0, detail: this.formatEnergy(fuel.joules) });
          addEdge(fuelId, machineId, 'energy');
        }
      }
    }

    for (const recipe of visibleConsumers) {
      const recipeId = `recipe:${recipe.id}`;
      addNode({ id: recipeId, ref: recipe.id, label: recipe.name, kind: 'recipe', layer: 3, detail: `${recipe.time}s` });
      for (const ingredient of recipe.ingredients.filter((candidate) => candidate.name === item.id)) {
        addEdge(`item:${item.id}`, recipeId, 'ingredient', ingredient.amount);
      }
      for (const product of recipe.products.slice(0, 1)) {
        const productItem = this.items.get(product.name) || { id: product.name, name: product.name, type: product.type };
        const productId = `item:${product.name}`;
        addNode({ id: productId, ref: product.name, label: productItem.name, kind: product.type, layer: 4 });
        addEdge(recipeId, productId, 'product', product.amount * product.probability);
      }
    }

    return {
      item,
      nodes: [...nodes.values()],
      edges,
      producerCount: producers.length,
      consumerCount: consumers.length,
      hiddenConsumerCount: Math.max(0, consumers.length - visibleConsumers.length)
    };
  }

  formatEnergy(joules) {
    if (joules >= 1e9) return `${joules / 1e9} GJ`;
    if (joules >= 1e6) return `${joules / 1e6} MJ`;
    if (joules >= 1e3) return `${joules / 1e3} kJ`;
    return `${joules} J`;
  }
}
