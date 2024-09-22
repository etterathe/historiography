function dimOtherClusters(selectedCluster) {
  const clusterDivs = document.querySelectorAll(".cluster");
  clusterDivs.forEach((clusterDiv) => {
    const clusterNameElement = clusterDiv.querySelector(".cluster-name");
    const clusterId = clusterNameElement.dataset.clusterId;
    if (selectedCluster === null) {
      // Reset all clusters
      clusterDiv.style.opacity = "1";
      clusterDiv.style.fontWeight = "normal";
    } else if (clusterId === selectedCluster) {
      clusterDiv.style.opacity = "1";
      clusterDiv.style.fontWeight = "bold";
    } else {
      clusterDiv.style.opacity = "0.5";
      clusterDiv.style.fontWeight = "normal";
    }
  });
}

const toggleSidebar = () => {
  const sidebar = document.getElementById("sidebar");
  const collapseButton = document.querySelector(".collapse-button");
  const clusterList = document.querySelector(".cluster-list");
  const title = document.querySelector(".sidebar-title");

  const isCollapsed = sidebar.classList.toggle("collapsed");

  if (isCollapsed) {
    sidebar.style.width = "3rem"; // Shrink sidebar to show just the button
    title.style.display = "none";
    collapseButton.innerHTML =
      '<span class="material-symbols-outlined">right_panel_open</span>';
  } else {
    sidebar.style.width = "17rem"; // Restore sidebar width
    title.style.display = "inline-block";
    collapseButton.innerHTML =
      '<span class="material-symbols-outlined">right_panel_close</span>';
  }
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

export { dimOtherClusters, saveGraphAsJSON, toggleSidebar };
