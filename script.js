// Global State
let globalData = [];
let filteredData = [];
const dimensions = {
    sankey: { width: 0, height: 0 },
    hist: { width: 0, height: 0 }
};

// Configuration
const colors = {
    approved: "#4682b4",
    rejected: "#cd5c5c",
    neutral: "#95a5a6"
};

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadData();
});

function loadData() {
    d3.json("data.json").then(data => {
        // Preprocess
        data.forEach((d, i) => {
            d.id = i; // Unique ID for internal tracking
            d.ingresos_mensuales = +d.ingresos_mensuales;
            d.score_riesgo = +d.score_riesgo;
            d.deuda_total = +d.deuda_total;
            d.edad = +d.edad;
            d.monto_solicitado = +d.monto_solicitado;
        });

        globalData = data;
        filteredData = data;

        initDashboard();
    }).catch(err => console.error("Error loading data:", err));
}

function initDashboard() {
    updateKPIs();
    renderSankey();
    renderHistograms();
    renderTable();
}

// ---------------------------------------------------------
// 1. KPI Cards
// ---------------------------------------------------------
function updateKPIs() {
    const total = filteredData.length;
    const approved = filteredData.filter(d => d.decision_legacy === "APROBADO").length;
    const approvalRate = total ? (approved / total * 100).toFixed(1) : 0;
    const avgScore = total ? d3.mean(filteredData, d => d.score_riesgo).toFixed(0) : 0;

    const totalDebt = d3.sum(filteredData, d => d.deuda_total);
    const totalRequested = d3.sum(filteredData, d => d.monto_solicitado);
    const debtRatio = totalRequested ? (totalDebt / totalRequested * 100).toFixed(1) : 0;

    d3.select("#kpi-total").text(d3.format(",")(total));
    d3.select("#kpi-approval").text(`${approvalRate}%`);
    d3.select("#kpi-score").text(avgScore);
    d3.select("#kpi-debt").text(`${debtRatio}%`);
}

// ---------------------------------------------------------
// 2. Sankey Diagram (Overview Flow)
// ---------------------------------------------------------
function renderSankey() {
    const container = d3.select("#sankey-chart");
    container.html(""); // Clear
    const width = container.node().getBoundingClientRect().width;
    const height = container.node().getBoundingClientRect().height;

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height);

    // Prepare Sankey Data: Nacionalidad -> Tipo Contrato -> Decision
    const keys = ["nacionalidad", "tipo_contrato", "decision_legacy"];
    const graph = { nodes: [], links: [] };

    // Simple node generation (can be optimized)
    let nodeMap = new Map();

    // Helper to get/create node
    const getNode = (name, category) => {
        const id = `${category}:${name}`;
        if (!nodeMap.has(id)) {
            nodeMap.set(id, { name: name, category: category, id: graph.nodes.length });
            graph.nodes.push({ name: name, category: category });
        }
        return nodeMap.get(id);
    };

    filteredData.forEach(d => {
        // Link 1: Nacionalidad -> Tipo Contrato
        const n1 = getNode(d.nacionalidad, "nac");
        const n2 = getNode(d.tipo_contrato, "con");
        // Link 2: Tipo Contrato -> Decision
        const n3 = getNode(d.decision_legacy, "dec");

        // Aggregate links
        // Note: This is a simplified aggregation. For large data, we should aggregate first.
    });

    // Aggregation Logic
    const links1 = d3.rollup(filteredData, v => v.length, d => d.nacionalidad, d => d.tipo_contrato);
    const links2 = d3.rollup(filteredData, v => v.length, d => d.tipo_contrato, d => d.decision_legacy);

    links1.forEach((targets, sourceName) => {
        targets.forEach((value, targetName) => {
            graph.links.push({
                source: getNode(sourceName, "nac").id,
                target: getNode(targetName, "con").id,
                value: value
            });
        });
    });

    links2.forEach((targets, sourceName) => {
        targets.forEach((value, targetName) => {
            graph.links.push({
                source: getNode(sourceName, "con").id,
                target: getNode(targetName, "dec").id,
                value: value
            });
        });
    });

    // Sankey Layout
    if (width <= 0 || height <= 0) {
        console.warn("Sankey container has invalid dimensions:", width, height);
        return;
    }

    const sankey = d3.sankey()
        .nodeWidth(15)
        .nodePadding(10)
        .extent([[1, 1], [width - 1, height - 6]]);

    try {
        const { nodes, links } = sankey(graph);

        // Draw Links
        svg.append("g")
            .selectAll("path")
            .data(links)
            .join("path")
            .attr("d", d3.sankeyLinkHorizontal())
            .attr("stroke-width", d => Math.max(1, d.width))
            .attr("class", "link")
            .style("stroke", "#aaa")
            .append("title")
            .text(d => `${d.source.name} → ${d.target.name}\n${d.value} Clientes`);

        // Draw Nodes
        const node = svg.append("g")
            .selectAll("rect")
            .data(nodes)
            .join("rect")
            .attr("x", d => d.x0)
            .attr("y", d => d.y0)
            .attr("height", d => d.y1 - d.y0)
            .attr("width", d => d.x1 - d.x0)
            .attr("fill", d => {
                if (d.name === "APROBADO") return colors.approved;
                if (d.name === "RECHAZADO") return colors.rejected;
                return colors.neutral;
            });

        node.append("title")
            .text(d => `${d.name}\n${d.value} Clientes`);

        // Node Labels
        svg.append("g")
            .style("font", "10px sans-serif")
            .selectAll("text")
            .data(nodes)
            .join("text")
            .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
            .attr("y", d => (d.y1 + d.y0) / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
            .text(d => d.name);

    } catch (e) {
        console.error("Error generating Sankey:", e);
    }
}

// ---------------------------------------------------------
// 3. Linked Histograms (Zoom & Filter)
// ---------------------------------------------------------
const brushes = {};

function renderHistograms() {
    renderHistogram("score_riesgo", "#hist-score", "Score de Riesgo", [0, 1000]);
    renderHistogram("ingresos_mensuales", "#hist-income", "Ingresos Mensuales", [0, 3000000]); // Capped for visibility
    renderHistogram("deuda_total", "#hist-debt", "Deuda Total", [0, 10000000]); // Capped
}

function renderHistogram(key, selector, title, domain) {
    const container = d3.select(selector);
    container.html(`<h4>${title}</h4>`); // Simple title
    const width = container.node().getBoundingClientRect().width - 40;
    const height = 250;
    const margin = { top: 10, right: 20, bottom: 30, left: 40 };

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
        .domain(domain || d3.extent(globalData, d => d[key]))
        .range([0, width]);

    const histogram = d3.bin()
        .value(d => d[key])
        .domain(x.domain())
        .thresholds(x.ticks(20));

    const bins = histogram(filteredData);

    const y = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(bins, d => d.length)]);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2s")));

    svg.append("g")
        .call(d3.axisLeft(y).ticks(5));

    const bars = svg.selectAll("rect")
        .data(bins)
        .join("rect")
        .attr("x", 1)
        .attr("transform", d => `translate(${x(d.x0)},${y(d.length)})`)
        .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
        .attr("height", d => height - y(d.length))
        .style("fill", "#69b3a2");

    // Brushing
    const brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on("end", (event) => brushed(event, key, x));

    svg.append("g")
        .attr("class", "brush")
        .call(brush);
}

function brushed(event, key, xScale) {
    if (!event.selection) {
        // Reset filter for this key if needed, but for now simplistic single-brush logic or reset
        // To implement multi-brush, we need to store selection states.
        // For this MVP, let's assume clearing a brush resets ALL filters for simplicity or just this one.
        // Let's reload full data for simplicity if selection is cleared.
        if (filteredData.length !== globalData.length) {
            filteredData = globalData;
            updateAll();
        }
        return;
    }

    const [x0, x1] = event.selection.map(xScale.invert);

    // Filter Global Data
    filteredData = globalData.filter(d => d[key] >= x0 && d[key] <= x1);

    updateAll();
}

function updateAll() {
    updateKPIs();
    renderSankey(); // Re-render Sankey with filtered data
    renderTable(); // Update Table
    // Note: We don't re-render histograms to avoid losing the brush context immediately, 
    // but in a full "Crossfilter" app we would update the OTHER histograms.
    // For this MVP, we update the other views.
}

// ---------------------------------------------------------
// 4. Data Table (Details)
// ---------------------------------------------------------
function renderTable() {
    const tbody = d3.select("#data-table tbody");
    tbody.html("");

    // Show top 50 rows of filtered data
    const rows = filteredData.slice(0, 50);

    rows.forEach(d => {
        const row = tbody.append("tr");
        row.append("td").text(d.id_cliente);
        row.append("td").text(d.edad);
        row.append("td").text(d.nacionalidad);
        row.append("td").text(d.ingresos_mensuales);
        row.append("td").text(d.score_riesgo);
        row.append("td").text(d.decision_legacy);
    });
}
