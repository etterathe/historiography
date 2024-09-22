const MICROSECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_RESULTS_PER_SEARCH = 100000;

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
  let currentEndTime = endTime;

  while (currentEndTime > startTime) {
    const chunk = await fetchHistoryChunk(startTime, currentEndTime);
    allHistory = allHistory.concat(chunk);

    if (chunk.length < MAX_RESULTS_PER_SEARCH) break;

    // Ensure we're moving backward in time
    currentEndTime = Math.min(...chunk.map((h) => h.lastVisitTime)) - 1;
  }

  console.log(`Finished fetching history. Total items: ${allHistory.length}`);
  return allHistory;
};

const filterHistoryByTimeHorizon = (historyItems, days) => {
  console.log(
    `Filtering ${historyItems.length} items for last ${days} days...`,
  );
  const cutoff = Date.now() - days * MICROSECONDS_PER_DAY;
  const filteredItems = historyItems.filter(
    (item) => item.lastVisitTime > cutoff,
  );
  console.log(`Filtered to ${filteredItems.length} items`);
  return filteredItems;
};

// Label Propagation Algorithm for community detection
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

const mode = (array) => {
  const frequencyMap = new Map();
  array.forEach((item) => {
    frequencyMap.set(item, (frequencyMap.get(item) || 0) + 1);
  });
  return [...frequencyMap.entries()].reduce((a, b) => (a[1] > b[1] ? a : b))[0];
};

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

const clusterColors = d3.scaleOrdinal(d3.schemeCategory10);

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

const loadClusterNames = () => {
  const savedNames = localStorage.getItem("clusterNames");
  if (savedNames) {
    return new Map(JSON.parse(savedNames));
  }
  return new Map();
};

const saveClusterNames = () => {
  localStorage.setItem(
    "clusterNames",
    JSON.stringify(Array.from(clusterNames.entries())),
  );
};

const clusterNames = loadClusterNames();

const displayClustersInSidebar = (graph) => {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = "Clusters";
  title.className = "sidebar-title";
  sidebar.appendChild(title);

  const clusterList = document.createElement("div");
  clusterList.className = "cluster-list";
  sidebar.appendChild(clusterList);

  const clusters = new Map();
  graph.nodes.forEach((node) => {
    if (!clusters.has(node.cluster)) {
      clusters.set(node.cluster, []);
    }
    clusters.get(node.cluster).push(node);
  });

  const hiddenClusters = new Set();
  const clusterTemplate = document.getElementById("cluster-template");
  let currentlyHighlightedCluster = null;

  clusters.forEach((nodes, cluster) => {
    const clusterElement = clusterTemplate.content.cloneNode(true);
    const clusterDiv = clusterElement.querySelector(".cluster");
    const nameContainer = clusterElement.querySelector(".name-container");
    const clusterNameText = clusterElement.querySelector(".cluster-name");
    const clusterNameInput = clusterElement.querySelector(
      ".cluster-name-input",
    );
    const editButton = clusterElement.querySelector(".edit-button");
    const toggleVisibilityButton = clusterElement.querySelector(
      ".toggle-visibility-button",
    );
    const deleteButton = clusterElement.querySelector(".delete-button");

    const currentClusterName = clusterNames.get(cluster) || `${cluster}`;
    clusterNameText.textContent = currentClusterName;
    clusterNameText.dataset.clusterId = cluster;
    clusterNameText.title = currentClusterName;
    clusterNameText.style.background = clusterColors(cluster);
    clusterNameInput.value = currentClusterName;
    clusterNameInput.style.color = clusterColors(cluster);

    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      nameContainer.classList.add("editing");
      clusterNameInput.value = clusterNameText.textContent;
      clusterNameInput.style.display = "block";
      clusterNameInput.focus();
      clusterNameInput.select();
    });

    clusterNameInput.addEventListener("blur", () =>
      saveClusterName(
        cluster,
        clusterNameText,
        clusterNameInput,
        nameContainer,
      ),
    );
    clusterNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        saveClusterName(
          cluster,
          clusterNameText,
          clusterNameInput,
          nameContainer,
        );
      }
    });

    clusterNameText.addEventListener("click", () => {
      const clickedCluster = clusterNameText.dataset.clusterId;
      console.log("Cluster clicked:", clickedCluster);
      if (currentlyHighlightedCluster === clickedCluster) {
        // If the same cluster is clicked again, reset all clusters
        dimOtherClusters(null);
        currentlyHighlightedCluster = null;
      } else {
        // Highlight the clicked cluster
        dimOtherClusters(clickedCluster);
        currentlyHighlightedCluster = clickedCluster;
      }
      highlightCluster(clickedCluster, graph);
    });

    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteClusterFromSidebar(clusterDiv);
    });

    toggleVisibilityButton.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleClusterVisibility(
        cluster,
        graph,
        toggleVisibilityButton,
        hiddenClusters,
      );
    });

    clusterList.appendChild(clusterElement);
  });

  const saveButton = document.createElement("button");
  saveButton.innerHTML =
    '<span class="material-symbols-outlined">download</span>';
  saveButton.className = "save-button";
  saveButton.addEventListener("click", () => saveGraphAsJSON(graph));
  sidebar.appendChild(saveButton);
};

function saveClusterName(
  cluster,
  clusterNameText,
  clusterNameInput,
  nameContainer,
) {
  const newName = clusterNameInput.value.trim();
  if (newName !== "") {
    clusterNames.set(cluster, newName);
    clusterNameText.textContent = newName;
    clusterNameText.title = newName;
  }
  nameContainer.classList.remove("editing");
  clusterNameInput.style.display = "none";
  clusterNameText.style.display = "inline-block";
  saveClusterNames();
}

function toggleClusterVisibility(
  cluster,
  graph,
  toggleVisibilityButton,
  hiddenClusters,
) {
  if (hiddenClusters.has(cluster)) {
    showClusterOnGraph(cluster, graph);
    toggleVisibilityButton.innerHTML =
      '<span class="material-symbols-outlined">visibility</span>';
    hiddenClusters.delete(cluster);
  } else {
    hideClusterFromGraph(cluster, graph);
    toggleVisibilityButton.innerHTML =
      '<span class="material-symbols-outlined">visibility_off</span>';
    hiddenClusters.add(cluster);
  }
}

const hideClusterFromGraph = (cluster, graph) => {
  d3.selectAll(".nodes g")
    .filter((d) => d.cluster === cluster)
    .style("display", "none");

  d3.selectAll(".links line")
    .filter((l) => l.source.cluster === cluster || l.target.cluster === cluster)
    .style("display", "none");
};

function dimOtherClusters(selectedCluster) {
  console.log("Dimming other clusters, selected cluster:", selectedCluster);
  const clusterDivs = document.querySelectorAll(".cluster");
  clusterDivs.forEach((clusterDiv) => {
    const clusterNameElement = clusterDiv.querySelector(".cluster-name");
    const clusterId = clusterNameElement.dataset.clusterId;
    if (selectedCluster === null) {
      // Reset all clusters
      console.log("Resetting cluster:", clusterId);
      clusterDiv.style.opacity = "1";
      clusterDiv.style.fontWeight = "normal";
    } else if (clusterId === selectedCluster) {
      console.log("Highlighting cluster:", clusterId);
      clusterDiv.style.opacity = "1";
      clusterDiv.style.fontWeight = "bold";
    } else {
      console.log("Dimming cluster:", clusterId);
      clusterDiv.style.opacity = "0.5";
      clusterDiv.style.fontWeight = "normal";
    }
  });
}

const showClusterOnGraph = (cluster, graph) => {
  d3.selectAll(".nodes g")
    .filter((d) => d.cluster === cluster)
    .style("display", "");

  d3.selectAll(".links line")
    .filter((l) => l.source.cluster === cluster || l.target.cluster === cluster)
    .style("display", "");
};

const saveGraphAsJSON = (graph) => {
  const graphData = {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      url: node.url,
      visitCount: node.visitCount,
      lastVisit: node.lastVisit,
      cluster: node.cluster,
    })),
    links: graph.links.map((link) => ({
      source: link.source.id,
      target: link.target.id,
      value: link.value,
    })),
  };

  const jsonString = JSON.stringify(graphData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "graph.json";
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
};

const deleteClusterFromSidebar = (clusterDiv) => {
  clusterDiv.remove();
};

const deleteCluster = (cluster, graph) => {
  // Remove the cluster's nodes from the graph
  const remainingNodes = graph.nodes.filter((node) => node.cluster !== cluster);
  const remainingLinks = graph.links.filter(
    (link) =>
      link.source.cluster !== cluster && link.target.cluster !== cluster,
  );

  graph.nodes = remainingNodes;
  graph.links = remainingLinks;

  drawGraph(graph);
  displayClustersInSidebar(graph);
};

let currentHighlightedCluster = null;

const highlightCluster = (cluster, graph) => {
  if (currentHighlightedCluster === cluster) {
    resetHighlight();
    currentHighlightedCluster = null;
  } else {
    const connectedNodes = new Set();
    graph.nodes.forEach((node) => {
      if (node.cluster === cluster) {
        connectedNodes.add(node.id);
      }
    });

    // Highlight nodes and links
    d3.selectAll(".nodes circle").style("opacity", (d) =>
      connectedNodes.has(d.id) ? 1 : 0.1,
    );
    d3.selectAll(".nodes image").style("opacity", (d) =>
      connectedNodes.has(d.id) ? 1 : 0.1,
    );
    d3.selectAll(".links line").style("opacity", (l) =>
      connectedNodes.has(l.source.id) && connectedNodes.has(l.target.id)
        ? 1
        : 0.1,
    );

    currentHighlightedCluster = cluster;
  }
};

const resetHighlight = () => {
  d3.selectAll(".nodes circle").style("opacity", 1);
  d3.selectAll(".nodes image").style("opacity", 1);
  d3.selectAll(".links line").style("opacity", 0.6);
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
  displayClustersInSidebar(data);
};

// Main functions
const updateGraph = async (timeHorizon) => {
  try {
    const historyItems = await getHistory(timeHorizon);
    console.log(`Fetched ${historyItems.length} items for ${timeHorizon} days`);

    const filteredItems = filterHistoryByTimeHorizon(historyItems, timeHorizon);
    console.log(
      `Filtered to ${filteredItems.length} items for ${timeHorizon} days`,
    );

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

  const initialDays = timeHorizons[sliderElement.value];
  updateSliderValue(initialDays);
  updateGraph(initialDays);
};

document.addEventListener("DOMContentLoaded", () => {
  try {
    console.log("DOM content loaded. Initializing...");
    initializeUI();
  } catch (error) {
    console.error("Initialization error:", error);
  }
});

window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error);
});
