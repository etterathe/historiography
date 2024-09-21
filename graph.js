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

// Label Propagation Algorithm for community detection
const applyLabelPropagation = (graph) => {
  const labels = new Map();
  const neighbors = new Map();

  // Initialize labels and neighbors
  graph.nodes.forEach((node) => {
    labels.set(node.id, node.id); // Each node starts with its own label
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

// Helper function to find the most frequent label
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
      node.cluster = cluster; // Assign cluster to node
    }
  });
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
        cluster: null, // Cluster initially set to null
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

  const graph = {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.values()),
  };

  const clusters = applyLabelPropagation(graph);
  assignClustersToNodes(clusters, nodes);

  return graph;
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

// Load saved cluster names from local storage
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

// Initialize cluster names map
const clusterNames = loadClusterNames(); // Use loaded names from local storage

const displayClustersInSidebar = (graph) => {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = ""; // Clear existing content

  // Add the "Clusters" title at the top of the sidebar
  const title = document.createElement("h2");
  title.textContent = "Clusters";
  title.style.textAlign = "center"; // Center the title
  title.style.marginBottom = "15px"; // Add some space below the title
  sidebar.appendChild(title);

  const clusters = new Map();
  graph.nodes.forEach((node) => {
    if (!clusters.has(node.cluster)) {
      clusters.set(node.cluster, []); // Initialize cluster
    }
    clusters.get(node.cluster).push(node);
  });

  clusters.forEach((nodes, cluster) => {
    const clusterDiv = document.createElement("div");
    clusterDiv.className = "cluster";

    const clusterHeader = document.createElement("div");
    clusterHeader.style.display = "flex";
    clusterHeader.style.alignItems = "center";
    clusterHeader.style.position = "relative"; // Set relative position to manage text and input positioning

    // Container for cluster name text and input (positioned relatively to allow overlaying)
    const nameContainer = document.createElement("div");
    nameContainer.style.position = "relative";
    nameContainer.style.flexGrow = "1"; // Allow the name container to take the available space

    // Display cluster name as text initially
    const currentClusterName =
      clusterNames.get(cluster) || `Cluster ${cluster}`;
    const clusterNameText = document.createElement("span");
    clusterNameText.textContent = currentClusterName;
    clusterNameText.style.color = clusterColors(cluster);
    clusterNameText.style.fontSize = "16px";
    clusterNameText.style.cursor = "pointer";

    // Cluster input field (hidden by default, positioned absolutely)
    const clusterNameInput = document.createElement("input");
    clusterNameInput.type = "text";
    clusterNameInput.value = currentClusterName;
    clusterNameInput.style.color = clusterColors(cluster);
    clusterNameInput.style.fontSize = "18px";
    clusterNameInput.style.border = "1px solid #ccc";
    clusterNameInput.style.backgroundColor = "transparent";
    clusterNameInput.style.position = "absolute"; // Positioned absolutely within the container
    clusterNameInput.style.top = "0";
    clusterNameInput.style.left = "0";
    clusterNameInput.style.width = "100%";
    clusterNameInput.style.display = "none"; // Hidden by default

    // When the pencil button is clicked, show the input and hide the text
    const editButton = document.createElement("button");
    editButton.innerHTML =
      '<span class="material-symbols-outlined">edit</span>'; // Material symbol of the pencil icon
    editButton.style.border = "none";
    editButton.style.backgroundColor = "transparent";
    editButton.style.cursor = "pointer";
    editButton.style.fontSize = "18px";
    editButton.style.marginLeft = "8px";
    editButton.style.borderRadius = "50%";
    editButton.style.padding = "4px";

    // Edit button click: show the input field and hide the text
    editButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent the cluster highlighting action
      clusterNameText.style.display = "none";
      clusterNameInput.style.display = "inline-block";
      clusterNameInput.focus(); // Focus on input field
    });

    // Save the new cluster name when input loses focus or enter key is pressed
    clusterNameInput.addEventListener("blur", () => {
      clusterNames.set(cluster, clusterNameInput.value);
      clusterNameText.textContent = clusterNameInput.value; // Update text with new name
      clusterNameInput.style.display = "none"; // Hide input field
      clusterNameText.style.display = "inline-block"; // Show text again
      saveClusterNames(); // Save to local storage
    });

    clusterNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        clusterNameInput.blur(); // Save and hide input when Enter is pressed
      }
    });

    // Highlight cluster when clicking the cluster name
    clusterNameText.addEventListener("click", () =>
      highlightCluster(cluster, graph),
    );

    // Add delete button with trash icon (Unicode for trash can)
    const deleteButton = document.createElement("button");
    deleteButton.innerHTML =
      '<span class="material-symbols-outlined">delete</span>'; // Material symbol for the trash icon
    deleteButton.style.border = "none";
    deleteButton.style.backgroundColor = "transparent";
    deleteButton.style.cursor = "pointer";
    deleteButton.style.fontSize = "18px";
    deleteButton.style.marginLeft = "8px";
    deleteButton.style.borderRadius = "50%";
    deleteButton.style.padding = "4px";

    // Delete button click: Remove the cluster
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation(); // Prevent other actions like highlighting
      deleteCluster(cluster, graph); // Call deleteCluster function
    });

    // Append text and input to the name container
    nameContainer.appendChild(clusterNameText);
    nameContainer.appendChild(clusterNameInput);

    // Append elements to the header
    clusterHeader.appendChild(nameContainer);
    clusterHeader.appendChild(editButton);
    clusterHeader.appendChild(deleteButton); // Add delete button next to edit button

    // Append the header to the cluster div
    clusterDiv.appendChild(clusterHeader);
    sidebar.appendChild(clusterDiv);
  });
};

const deleteCluster = (cluster, graph) => {
  // Remove the cluster's nodes from the graph
  const remainingNodes = graph.nodes.filter((node) => node.cluster !== cluster);
  const remainingLinks = graph.links.filter(
    (link) =>
      link.source.cluster !== cluster && link.target.cluster !== cluster,
  );

  // Update the graph with the remaining nodes and links
  graph.nodes = remainingNodes;
  graph.links = remainingLinks;

  // Redraw the graph and update the sidebar
  drawGraph(graph); // Redraw the graph without the deleted cluster
  displayClustersInSidebar(graph); // Update the sidebar without the deleted cluster
};

let currentHighlightedCluster = null; // Keep track of the highlighted cluster

const highlightCluster = (cluster, graph) => {
  if (currentHighlightedCluster === cluster) {
    resetHighlight(); // Reset if the same cluster is clicked again
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
  d3.selectAll(".links line").style("opacity", 0.6); // Default opacity for links
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
  }
});

// Global error handling
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error);
});
