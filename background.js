chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: "graph.html" });
});
