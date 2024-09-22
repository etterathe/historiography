const MICROSECONDS_PER_DAY = 1000 * 60 * 60 * 24;
const MAX_RESULTS_PER_SEARCH = 100000;
const CLUSTER_COLORS = d3.scaleOrdinal(d3.schemeCategory10);

export {
  MICROSECONDS_PER_DAY,
  MAX_RESULTS_PER_SEARCH,
  CLUSTER_COLORS as clusterColors,
};
