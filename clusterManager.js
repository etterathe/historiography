import { clusterColors } from "./constants.js";
import {
  dimOtherClusters,
  saveGraphAsJSON,
  toggleSidebar,
} from "./uiManager.js";

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

  const sidebarContent = document.createElement("div");
  sidebarContent.className = "sidebar-content";
  sidebar.appendChild(sidebarContent);

  const titleContainer = document.createElement("div");
  titleContainer.className = "title-container"; // Flex container for alignment
  sidebarContent.appendChild(titleContainer);

  const collapseButton = document.createElement("button");
  collapseButton.innerHTML =
    '<span class="material-symbols-outlined">right_panel_close</span>';
  collapseButton.className = "collapse-button";
  collapseButton.addEventListener("click", toggleSidebar);
  titleContainer.appendChild(collapseButton);

  const title = document.createElement("h2");
  title.textContent = "Clusters";
  title.className = "sidebar-title";
  titleContainer.appendChild(title);

  const clusterList = document.createElement("div");
  clusterList.className = "cluster-list";
  sidebarContent.appendChild(clusterList);

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
  sidebarContent.appendChild(saveButton);
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

const hideClusterFromGraph = (cluster, graph) => {
  d3.selectAll(".nodes g")
    .filter((d) => d.cluster === cluster)
    .style("display", "none");

  d3.selectAll(".links line")
    .filter((l) => l.source.cluster === cluster || l.target.cluster === cluster)
    .style("display", "none");
};

const showClusterOnGraph = (cluster, graph) => {
  d3.selectAll(".nodes g")
    .filter((d) => d.cluster === cluster)
    .style("display", "");

  d3.selectAll(".links line")
    .filter((l) => l.source.cluster === cluster || l.target.cluster === cluster)
    .style("display", "");
};

export {
  deleteCluster,
  displayClustersInSidebar,
  showClusterOnGraph,
  hideClusterFromGraph,
  highlightCluster,
  loadClusterNames,
  resetHighlight,
  saveClusterNames,
};
