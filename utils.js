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

export { getDomain, formatDate, getFaviconUrl };
