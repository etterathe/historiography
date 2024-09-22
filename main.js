import { displayClustersInSidebar } from "./clusterManager.js";
import {
  addNodeInteractions,
  createLinks,
  createNodes,
  createSimulation,
  createSVG,
  createTooltip,
  createZoom,
} from "./d3Visualization.js";
import { createGraphStructure } from "./graphStructure.js";
import { filterHistoryByTimeHorizon, getHistory } from "./historyManager.js";

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

export { updateGraph };
