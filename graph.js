// Constants
const MICROSECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_RESULTS_PER_SEARCH = 1000;

// Helper functions
const getDomain = (url) => {
  try {
    return new URL(url).hostname;
  } catch (error) {
    console.warn(`Failed to parse URL: ${url}`, error);
    return url;
  }
};

const formatDate = (date) => new Date(date).toLocaleString();

const getFaviconUrl = (url) =>
  `https://www.google.com/s2/favicons?domain=${url}&sz=32`;

// History fetching
const getHistory = async (days) => {
  console.log(`Starting to fetch history for the last ${days} days...`);
  const endTime = Date.now();
  const startTime = endTime - days * MICROSECONDS_PER_DAY;

  const fetchHistoryChunk = async (searchStartTime, searchEndTime) => {
    console.log(
      `Fetching history from ${new Date(searchStartTime)} to ${new Date(searchEndTime)}...`,
    );
    return new Promise((resolve, reject) => {
      chrome.history.search(
        {
          text: "",
          startTime: searchStartTime,
          endTime: searchEndTime,
          maxResults: MAX_RESULTS_PER_SEARCH,
        },
        (historyItems) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `Error fetching history: ${chrome.runtime.lastError.message}`,
              ),
            );
          } else {
            resolve(historyItems);
          }
        },
      );
    });
  };

  let allHistory = [];
  let currentStartTime = startTime;

  while (currentStartTime < endTime) {
    const chunk = await fetchHistoryChunk(currentStartTime, endTime);
    allHistory = allHistory.concat(chunk);

    if (chunk.length < MAX_RESULTS_PER_SEARCH) break;

    currentStartTime = Math.min(...chunk.map((h) => h.lastVisitTime)) + 1;
  }

  console.log(`Finished fetching history. Total items: ${allHistory.length}`);
  return allHistory;
};

// Data processing
const filterHistoryByTimeHorizon = (historyItems, days) => {
  console.log(
    `Filtering ${historyItems.length} items for last ${days} days...`,
  );
  const cutoff = Date.now() - days * MICROSECONDS_PER_DAY;
  return historyItems.filter((item) => item.lastVisitTime > cutoff);
};

const createGraphStructure = (historyItems) => {
  const nodes = new Map();
  const links = new Map();

  historyItems.forEach((item, index) => {
    const domain = getDomain(item.url);

    // Update nodes
    if (!nodes.has(domain)) {
      nodes.set(domain, {
        id: domain,
        url: item.url,
        visitCount: 1,
        lastVisit: item.lastVisitTime,
      });
    } else {
      const node = nodes.get(domain);
      node.visitCount++;
      node.lastVisit = Math.max(node.lastVisit, item.lastVisitTime);
    }

    // Update links
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

  return {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.values()),
  };
};

// Graph rendering
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

  node.append("circle").attr("r", 16).attr("fill", "white");

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

const drawGraph = (data) => {
  d3.select("#graph").selectAll("*").remove();

  const width = window.innerWidth;
  const height = window.innerHeight - 50;
  const radius = Math.min(width, height) / 2 - 100;

  const svg = createSVG(width, height);
  const g = svg.append("g");
  const zoom = createZoom(g);
  svg.call(zoom);

  const simulation = createSimulation(
    data.nodes,
    data.links,
    width,
    height,
    radius,
  );
  const link = createLinks(g, data.links);
  const node = createNodes(g, data.nodes, simulation);
  const tooltip = createTooltip();

  addNodeInteractions(node, link, tooltip);

  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
};

// Main functions
const updateGraph = async (timeHorizon) => {
  try {
    const historyItems = await getHistory(timeHorizon);
    const filteredItems = filterHistoryByTimeHorizon(historyItems, timeHorizon);
    const graphData = createGraphStructure(filteredItems);

    drawGraph(graphData);

    const itemCountElement = document.getElementById("item-count");
    if (itemCountElement) {
      itemCountElement.textContent = `Showing ${filteredItems.length} items`;
    } else {
      console.warn("item-count element not found in the document.");
    }
  } catch (error) {
    console.error("Error updating graph:", error);
    // TODO: Add user-facing error handling
  }
};

const initializeUI = () => {
  const timeHorizons = [1, 3, 7, 30, 90];
  const sliderElement = document.getElementById("time-horizon");
  const sliderValueElement = document.getElementById("slider-value");

  if (!sliderElement || !sliderValueElement) {
    throw new Error(
      "Required DOM elements not found. Aborting initialization.",
    );
  }

  const updateSliderValue = (value) => {
    sliderValueElement.textContent = `Last ${value} days`;
  };

  sliderElement.addEventListener("input", (event) => {
    const selectedTimeHorizon = timeHorizons[event.target.value];
    updateSliderValue(selectedTimeHorizon);
    updateGraph(selectedTimeHorizon);
  });

  // Initial setup
  const initialDays = timeHorizons[sliderElement.value];
  updateSliderValue(initialDays);
  updateGraph(initialDays);
};

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  try {
    console.log("DOM content loaded. Initializing...");
    initializeUI();
  } catch (error) {
    console.error("Initialization error:", error);
    // TODO: Add user-facing error handling
  }
});

// Global error handling
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error);
  // TODO: Add user-facing error handling
});
