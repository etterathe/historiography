// Function to get domain from URL
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return url; // fallback to full URL if parsing fails
  }
}

// Function to format date
function formatDate(date) {
  return new Date(date).toLocaleString();
}

// Function to get favicon URL
function getFaviconUrl(url) {
  return `https://www.google.com/s2/favicons?domain=${url}&sz=32`;
}

// Function to get history
function getHistory(days, callback) {
  console.log(`Starting to fetch history for the last ${days} days...`);
  const microsecondsPerDay = 1000 * 60 * 60 * 24;
  const endTime = new Date().getTime();
  const startTime = endTime - days * microsecondsPerDay;

  let allHistory = [];

  function fetchHistory(searchStartTime, searchEndTime) {
    console.log(
      `Fetching history from ${new Date(searchStartTime)} to ${new Date(searchEndTime)}...`,
    );
    chrome.history.search(
      {
        text: "",
        startTime: searchStartTime,
        endTime: searchEndTime,
        maxResults: 1000,
      },
      function (historyItems) {
        if (chrome.runtime.lastError) {
          console.error("Error fetching history:", chrome.runtime.lastError);
          callback(allHistory);
          return;
        }

        console.log(`Received ${historyItems.length} history items.`);
        allHistory = allHistory.concat(historyItems);

        if (historyItems.length === 1000) {
          // If we got 1000 results, there might be more
          const oldestTime = Math.min(
            ...historyItems.map((h) => h.lastVisitTime),
          );
          if (oldestTime > searchStartTime) {
            // Continue fetching only if we haven't reached the start time
            fetchHistory(searchStartTime, oldestTime - 1);
          } else {
            console.log(
              `Finished fetching history. Total items: ${allHistory.length}`,
            );
            callback(allHistory);
          }
        } else {
          // We've got all the history, now callback
          console.log(
            `Finished fetching history. Total items: ${allHistory.length}`,
          );
          callback(allHistory);
        }
      },
    );
  }

  // Start fetching from the end time to the start time
  fetchHistory(startTime, endTime);
}

// Function to filter history items based on time horizon
function filterHistoryByTimeHorizon(historyItems, days) {
  console.log(
    `Filtering ${historyItems.length} items for last ${days} days...`,
  );
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const filteredItems = historyItems.filter((item) => {
    return item.lastVisitTime > cutoff;
  });
  console.log(`Filtered to ${filteredItems.length} items.`);
  return filteredItems;
}

// Function to create graph structure
function createGraphStructure(historyItems) {
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

  return {
    nodes: Array.from(nodes.values()),
    links: Array.from(links.values()),
  };
}

// Function to draw graph
function drawGraph(data) {
  // Clear existing graph
  d3.select("#graph").selectAll("*").remove();

  const width = window.innerWidth;
  const height = window.innerHeight - 50; // Adjust for slider height

  const svg = d3
    .select("#graph")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g");

  const zoom = d3
    .zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  // Calculate the radius for the circular layout
  const radius = Math.min(width, height) / 2 - 100;

  const simulation = d3
    .forceSimulation(data.nodes)
    .force(
      "link",
      d3
        .forceLink(data.links)
        .id((d) => d.id)
        .distance(100),
    )
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(30))
    // Add radial force for circular layout
    .force(
      "radial",
      d3.forceRadial(radius, width / 2, height / 2).strength(0.5),
    );

  const link = g
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(data.links)
    .enter()
    .append("line")
    .attr("stroke", "#999")
    .attr("stroke-opacity", 0.6)
    .attr("stroke-width", (d) => Math.sqrt(d.value));

  const node = g
    .append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(data.nodes)
    .enter()
    .append("g")
    .call(drag(simulation));

  // Add favicon backgrounds
  node.append("circle").attr("r", 16).attr("fill", "white");

  // Add favicons
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

  // Add tooltip
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  node
    .on("mouseover", function (event, d) {
      tooltip.transition().duration(200).style("opacity", 0.9);
      tooltip
        .html(
          `Domain: ${d.id}<br/>Visits: ${d.visitCount}<br/>Last visit: ${formatDate(d.lastVisit)}`,
        )
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");

      // Highlight connected nodes
      const connectedNodes = new Set([d.id]);
      link.each(function (l) {
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
    .on("mouseout", function (d) {
      tooltip.transition().duration(500).style("opacity", 0);

      // Reset highlights
      node.style("opacity", 1);
      link.style("opacity", 0.6);
    });

  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
}

// Function to handle node dragging
function drag(simulation) {
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  return d3
    .drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
}

// Function to update the graph based on the selected time horizon
function updateGraph(historyItems, timeHorizon) {
  console.log(
    `Updating graph with ${historyItems.length} items and ${timeHorizon} days horizon...`,
  );
  const filteredItems = filterHistoryByTimeHorizon(historyItems, timeHorizon);
  const graphData = createGraphStructure(filteredItems);
  console.log(
    `Graph data created with ${graphData.nodes.length} nodes and ${graphData.links.length} links.`,
  );
  drawGraph(graphData);

  // Update the item count display
  const itemCountElement = document.getElementById("item-count");
  if (itemCountElement) {
    itemCountElement.textContent = `Showing ${filteredItems.length} items`;
  } else {
    console.warn("item-count element not found in the document.");
  }
}
// Initialization
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM content loaded. Initializing...");
  const timeHorizons = [1, 3, 7, 30, 90]; // Up to 90 days for now
  const sliderElement = document.getElementById("time-horizon");
  const sliderValueElement = document.getElementById("slider-value");

  if (!sliderElement || !sliderValueElement) {
    console.error("Required DOM elements not found. Aborting initialization.");
    return;
  }

  function updateGraphForTimeHorizon(days) {
    getHistory(days, (historyItems) => {
      console.log(
        `Total history items fetched for ${days} days: ${historyItems.length}`,
      );

      if (historyItems.length === 0) {
        console.warn("No history items fetched. The graph will be empty.");
      }

      // Update graph
      updateGraph(historyItems, days);
    });
  }

  // Initial graph draw
  const initialDays = timeHorizons[sliderElement.value];
  updateGraphForTimeHorizon(initialDays);

  // Update slider value text
  sliderValueElement.textContent = `Last ${initialDays} days`;

  // Add event listener for slider changes
  sliderElement.addEventListener("input", (event) => {
    const selectedTimeHorizon = timeHorizons[event.target.value];
    sliderValueElement.textContent = `Last ${selectedTimeHorizon} days`;
    updateGraphForTimeHorizon(selectedTimeHorizon);
  });
});

// Error handling for unexpected errors
window.addEventListener("error", function (event) {
  console.error("Uncaught error:", event.error);
});
