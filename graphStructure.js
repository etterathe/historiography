import { getDomain } from "./utils.js";
import applyLabelPropagation from "./labelPropagation.js";

const assignClustersToNodes = (clusters, nodes) => {
  clusters.forEach((cluster, nodeId) => {
    const node = nodes.get(nodeId);
    if (node) {
      node.cluster = cluster;
    }
  });
};

const createGraphStructure = (historyItems) => {
  const nodes = new Map();
  const links = new Map();

  historyItems.forEach((item, index) => {
    const domain = getDomain(item.url);

    if (!nodes.has(domain)) {
      nodes.set(domain, {
        id: domain,
        url: item.url,
        visitCount: 1,
        lastVisit: item.lastVisitTime,
        cluster: null,
      });
    } else {
      const node = nodes.get(domain);
      node.visitCount++;
      node.lastVisit = Math.max(node.lastVisit, item.lastVisitTime);
    }

    if (index > 0) {
      const prevDomain = getDomain(historyItems[index - 1].url);
      if (prevDomain !== domain) {
        const linkId = `${prevDomain}-${domain}`;
        if (!links.has(linkId)) {
          links.set(linkId, { source: prevDomain, target: domain, value: 1 });
        } else {
          links.get(linkId).value++;
        }
      }
    }
  });

  const graph = {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.values()),
  };

  const clusters = applyLabelPropagation(graph);
  assignClustersToNodes(clusters, nodes);

  return graph;
};

export { createGraphStructure };
