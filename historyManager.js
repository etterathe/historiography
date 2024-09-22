import { MICROSECONDS_PER_DAY, MAX_RESULTS_PER_SEARCH } from "./constants.js";

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

export { getHistory, filterHistoryByTimeHorizon };
