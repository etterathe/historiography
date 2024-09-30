# 📜 historiography

**historiography** is a Google Chrome add-on designed to provide a dynamic, interactive way to visualize your browsing history using a force-directed graph. This tool not only helps you see your browsing patterns but also enables deep exploration of how your website visits are interconnected over time. 

## ✨ Features

- **Time Horizon Adjustments:** 
  You can generate browsing history graphs for specific time frames—choose between 1 day, 3 days, 7 days, 30 days, or 90 days. Easily modify the selected time horizon using a bottom slider to dynamically adjust your view of the data.

- **Force-Directed Graph Visualization:** 
  Your browsing history is presented on a visually engaging force-directed graph where nodes represent websites, and edges signify the connections between them. 

- **Community Detection via Label Propagation Algorithm:**
  Using machine learning, specifically the Label Propagation Algorithm (LPA), Historiography automatically groups websites based on common visit patterns. These groups are color-coded for easy identification.

- **Interactive Sidebar with Groups:**
  A sidebar displays the detected website groups. From here, you can:
  - **Highlight Groups:** Click on any color-coded group to highlight it on the graph and in the sidebar. All other groups will be grayed out for clarity.
  - **Rename Groups:** Customize group names for easier reference.
  - **Hide/Show Groups:** Toggle the visibility of specific groups on the graph.
  - **Delete Groups:** Remove groups from the sidebar without affecting their nodes on the graph.
  
- **Export Graph Data**: You can download the entire graph as a JSON file, enabling you to perform further analysis on your browsing history using external tools.

## 🧰 Installation

- Clone the repository:
    ```bash
    git clone https://github.com/yourusername/historiography.git
    ```
- Load the extension in developer mode on Chrome:
    1. Go to `chrome://extensions/`
    2. Enable **Developer Mode**
    3. Click **Load unpacked** and select the `historiography` directory.

## Contribution

Feel free to fork this repository and submit pull requests for any enhancements or bug fixes. 

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
