const mode = (array) => {
  const frequencyMap = new Map();
  array.forEach((item) => {
    frequencyMap.set(item, (frequencyMap.get(item) || 0) + 1);
  });
  return [...frequencyMap.entries()].reduce((a, b) => (a[1] > b[1] ? a : b))[0];
};

const applyLabelPropagation = (graph) => {
  const labels = new Map();
  const neighbors = new Map();

  graph.nodes.forEach((node) => {
    labels.set(node.id, node.id);
    neighbors.set(node.id, []);
  });

  graph.links.forEach((link) => {
    neighbors.get(link.source).push(link.target);
    neighbors.get(link.target).push(link.source);
  });

  let changed = true;
  while (changed) {
    changed = false;
    graph.nodes.forEach((node) => {
      const neighborLabels = neighbors.get(node.id).map((n) => labels.get(n));
      const mostFrequentLabel = mode(neighborLabels);
      if (labels.get(node.id) !== mostFrequentLabel) {
        labels.set(node.id, mostFrequentLabel);
        changed = true;
      }
    });
  }

  return labels;
};

export default applyLabelPropagation;
