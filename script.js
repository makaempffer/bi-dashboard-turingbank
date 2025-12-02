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
            d.ingresos_mensuales = +d.ingresos_mensuales || 0;
            d.score_riesgo = +d.score_riesgo || 0;
            d.deuda_total = +d.deuda_total || 0;
            d.edad = +d.edad || 0;
            d.monto_solicitado = +d.monto_solicitado || 0;
            d.comuna = d.comuna || "Desconocida";
            d.nacionalidad = d.nacionalidad || "Desconocida";
        });

        globalData = data;
        filteredData = data;

        initDashboard();
    }).catch(err => console.error("Error loading data:", err));
}

function initDashboard() {
    updateKPIs();
    renderSankey();
    renderCommuneScatter();
    renderNationalityBoxPlot();
    renderAgeLineChart();
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

    // Check if container exists
    if (container.empty()) {
        console.warn("Sankey container not found");
        return;
    }

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
    container.html("");

    if (container.empty()) {
        console.warn(`Histogram container ${selector} not found`);
        return;
    }

    const width = container.node().getBoundingClientRect().width - 40;
    const height = 250;
    const margin = { top: 10, right: 20, bottom: 40, left: 50 }; // Increased bottom/left for labels

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

    // Bin the data
    const bins = histogram(filteredData);

    // Prepare stacked data for each bin
    const stackedData = bins.map(bin => {
        const approved = bin.filter(d => d.decision_legacy === "APROBADO").length;
        const rejected = bin.filter(d => d.decision_legacy === "RECHAZADO").length;
        return {
            x0: bin.x0,
            x1: bin.x1,
            APROBADO: approved,
            RECHAZADO: rejected,
            total: approved + rejected,
            data: bin // Keep ref to bin data if needed
        };
    });

    const y = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(stackedData, d => d.total)]);

    const stack = d3.stack().keys(["APROBADO", "RECHAZADO"]);
    const series = stack(stackedData);

    const colorScale = d3.scaleOrdinal()
        .domain(["APROBADO", "RECHAZADO"])
        .range([colors.approved, colors.rejected]);

    // Draw Bars
    svg.append("g")
        .selectAll("g")
        .data(series)
        .join("g")
        .attr("fill", d => colorScale(d.key))
        .selectAll("rect")
        .data(d => d)
        .join("rect")
        .attr("x", d => x(d.data.x0))
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]))
        .attr("width", d => Math.max(0, x(d.data.x1) - x(d.data.x0) - 1));

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2s")));

    svg.append("g")
        .call(d3.axisLeft(y).ticks(5));

    // Axis Labels
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 35)
        .style("font-size", "12px")
        .style("fill", "#666")
        .text(title);

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("y", -35)
        .attr("x", -height / 2)
        .style("font-size", "12px")
        .style("fill", "#666")
        .text("Cantidad de Clientes");

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
    renderSankey();
    renderCommuneScatter();
    renderNationalityBoxPlot();
    renderAgeLineChart();
    renderTable();
    // Note: We don't re-render histograms to avoid losing the brush context immediately, 
    // but in a full "Crossfilter" app we would update the OTHER histograms.
    // For this MVP, we update the other views.
}

// ---------------------------------------------------------
// 5. Analytical Charts (New)
// ---------------------------------------------------------

// A. Commune Analysis: Income vs Rejection Rate
function renderCommuneScatter() {
    const container = d3.select("#commune-chart");
    container.html("");

    if (container.empty()) {
        console.warn("Commune chart container not found");
        return;
    }

    const width = container.node().getBoundingClientRect().width - 40;
    const height = 260;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Group by Commune
    const communes = d3.rollup(filteredData, v => {
        const total = v.length;
        const rejected = v.filter(d => d.decision_legacy === "RECHAZADO").length;
        const avgIncome = d3.mean(v, d => d.ingresos_mensuales);
        return {
            rejectionRate: total ? (rejected / total) * 100 : 0,
            avgIncome: avgIncome,
            total: total
        };
    }, d => d.comuna);

    const data = Array.from(communes, ([key, value]) => ({ key, ...value }))
        .filter(d => d.total > 10); // Filter small samples

    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.avgIncome)])
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2s")));

    svg.append("g")
        .call(d3.axisLeft(y));

    // Dots
    svg.append("g")
        .selectAll("circle")
        .data(data)
        .join("circle")
        .attr("cx", d => x(d.avgIncome))
        .attr("cy", d => y(d.rejectionRate))
        .attr("r", d => Math.sqrt(d.total) / 2) // Size by population
        .style("fill", "#e67e22")
        .style("opacity", 0.7)
        .style("stroke", "#fff")
        .append("title")
        .text(d => `${d.key}\nIngreso Prom: $${d3.format(",.0f")(d.avgIncome)}\nTasa Rechazo: ${d.rejectionRate.toFixed(1)}%\nCasos: ${d.total}`);

    // Labels
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 35)
        .style("font-size", "12px")
        .text("Ingreso Promedio (CLP)");

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("y", -35)
        .attr("x", -height / 2)
        .style("font-size", "12px")
        .text("Tasa de Rechazo (%)");
}

// B. Nationality Analysis: Score Box Plot
function renderNationalityBoxPlot() {
    const container = d3.select("#nationality-chart");
    container.html("");

    if (container.empty()) {
        console.warn("Nationality chart container not found");
        return;
    }

    const width = container.node().getBoundingClientRect().width - 40;
    const height = 260;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Compute stats
    const sumstat = d3.rollup(filteredData, function (d) {
        const scores = d.map(g => g.score_riesgo).sort(d3.ascending);
        const q1 = d3.quantile(scores, .25);
        const median = d3.quantile(scores, .5);
        const q3 = d3.quantile(scores, .75);
        const min = d3.min(scores);
        const max = d3.max(scores);
        return { q1, median, q3, min, max };
    }, d => d.nacionalidad);

    const x = d3.scaleBand()
        .range([0, width])
        .domain(Array.from(sumstat.keys()))
        .paddingInner(1)
        .paddingOuter(.5);

    const y = d3.scaleLinear()
        .domain([0, 1000])
        .range([height, 0]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g")
        .call(d3.axisLeft(y));

    // Box Plot Elements
    svg.selectAll("vertLines")
        .data(sumstat)
        .join("line")
        .attr("x1", d => x(d[0]))
        .attr("x2", d => x(d[0]))
        .attr("y1", d => y(d[1].min))
        .attr("y2", d => y(d[1].max))
        .attr("stroke", "black")
        .style("width", 40);

    const boxWidth = 30;
    svg.selectAll("boxes")
        .data(sumstat)
        .join("rect")
        .attr("x", d => x(d[0]) - boxWidth / 2)
        .attr("y", d => y(d[1].q3))
        .attr("height", d => y(d[1].q1) - y(d[1].q3))
        .attr("width", boxWidth)
        .attr("stroke", "black")
        .style("fill", "#69b3a2")
        .style("opacity", 0.7)
        .append("title")
        .text(d => `${d[0]}\nMediana: ${d[1].median}\nQ1-Q3: ${d[1].q1}-${d[1].q3}`);

    svg.selectAll("medianLines")
        .data(sumstat)
        .join("line")
        .attr("x1", d => x(d[0]) - boxWidth / 2)
        .attr("x2", d => x(d[0]) + boxWidth / 2)
        .attr("y1", d => y(d[1].median))
        .attr("y2", d => y(d[1].median))
        .attr("stroke", "black");
}

// C. Age Analysis: Rejection Rate Curve
function renderAgeLineChart() {
    const container = d3.select("#age-chart");
    container.html("");

    if (container.empty()) {
        console.warn("Age chart container not found");
        return;
    }

    const width = container.node().getBoundingClientRect().width - 40;
    const height = 210;
    const margin = { top: 20, right: 20, bottom: 40, left: 50 };

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Group by Age
    const ageGroups = d3.rollup(filteredData, v => {
        const total = v.length;
        const rejected = v.filter(d => d.decision_legacy === "RECHAZADO").length;
        return total > 5 ? (rejected / total) * 100 : null; // Filter sparse ages
    }, d => d.edad);

    const data = Array.from(ageGroups, ([age, rate]) => ({ age, rate }))
        .filter(d => d.rate !== null)
        .sort((a, b) => a.age - b.age);

    const x = d3.scaleLinear()
        .domain(d3.extent(data, d => d.age))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));

    svg.append("g")
        .call(d3.axisLeft(y));

    // Line
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", colors.rejected)
        .attr("stroke-width", 2)
        .attr("d", d3.line()
            .x(d => x(d.age))
            .y(d => y(d.rate))
            .curve(d3.curveMonotoneX)
        );

    // Dots
    svg.append("g")
        .selectAll("circle")
        .data(data)
        .join("circle")
        .attr("cx", d => x(d.age))
        .attr("cy", d => y(d.rate))
        .attr("r", 3)
        .attr("fill", colors.rejected)
        .append("title")
        .text(d => `Edad: ${d.age}\nTasa Rechazo: ${d.rate.toFixed(1)}%`);

    // Labels
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 35)
        .style("font-size", "12px")
        .text("Edad");

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("y", -35)
        .attr("x", -height / 2)
        .style("font-size", "12px")
        .text("Tasa de Rechazo (%)");
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
