import { getFaviconUrl, formatDate } from "./utils.js";
import { clusterColors } from "./constants.js";

const createSVG = (width, height) => {
  return d3
    .select("#graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height);
};

const createZoom = (g) => {
  return d3
    .zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
};

const createSimulation = (nodes, links, width, height, radius) => {
  return d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(100),
    )
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(30))
    .force(
      "radial",
      d3.forceRadial(radius, width / 2, height / 2).strength(0.5),
    );
};

const createLinks = (g, links) => {
  return g
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", (d) => Math.sqrt(d.value));
};

const createNodes = (g, nodes, simulation) => {
  const node = g
    .append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(nodes)
    .enter()
    .append("g")
    .call(drag(simulation));

  node
    .append("circle")
    .attr("r", 16)
    .attr("fill", (d) => clusterColors(d.cluster));

  node
    .append("image")
    .attr("xlink:href", (d) => getFaviconUrl(d.url))
    .attr("x", -16)
    .attr("y", -16)
    .attr("width", 32)
    .attr("height", 32);

  node.append("title").text((d) => d.id);

  node
    .append("text")
    .attr("dy", 24)
    .attr("text-anchor", "middle")
    .text((d) => d.id)
    .style("font-size", "8px");

  return node;
};

const createTooltip = () => {
  return d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);
};

const addNodeInteractions = (node, link, tooltip) => {
  node
    .on("mouseover", function (event, d) {
      tooltip.transition().duration(200).style("opacity", 0.9);
      tooltip
        .html(
          `Domain: ${d.id}<br/>Visits: ${d.visitCount}<br/>Last visit: ${formatDate(d.lastVisit)}`,
        )
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY - 28}px`);

      const connectedNodes = new Set([d.id]);
      link.each((l) => {
        if (l.source.id === d.id) connectedNodes.add(l.target.id);
        if (l.target.id === d.id) connectedNodes.add(l.source.id);
      });

      node.style("opacity", (n) => (connectedNodes.has(n.id) ? 1 : 0.1));
      link.style("opacity", (l) =>
        connectedNodes.has(l.source.id) && connectedNodes.has(l.target.id)
          ? 1
          : 0.1,
      );
    })
    .on("mouseout", function () {
      tooltip.transition().duration(500).style("opacity", 0);
      node.style("opacity", 1);
      link.style("opacity", 0.6);
    });
};

const drag = (simulation) => {
  const dragstarted = (event) => {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  };

  const dragged = (event) => {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  };

  const dragended = (event) => {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  };

  return d3
    .drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
};

export {
  createSVG,
  createZoom,
  createSimulation,
  createLinks,
  createNodes,
  createTooltip,
  addNodeInteractions,
};
