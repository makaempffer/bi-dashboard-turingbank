// Global State
let globalData = [];
let filteredData = [];

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
    renderCommuneComboChart();
    renderNationalityBoxPlot();
    renderAgeLineChart();
}

// ---------------------------------------------------------
// Analytical Charts
// ---------------------------------------------------------

// A. Commune Analysis: Dual-Axis (Rejection Rate vs Income)
function renderCommuneComboChart() {
    const container = d3.select("#commune-chart");
    container.html("");

    if (container.empty()) {
        console.warn("Commune chart container not found");
        return;
    }

    const width = container.node().getBoundingClientRect().width - 40;
    const height = 310;
    const margin = { top: 40, right: 60, bottom: 200, left: 60 }; // Increased bottom for rotated labels

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Group by Commune
    const communes = d3.rollup(filteredData, v => {
        const total = v.length;
        const rejected = v.filter(d => d.decision_legacy && d.decision_legacy.toUpperCase() === "RECHAZADO").length;
        const medianIncome = d3.median(v, d => d.ingresos_mensuales); // Use median to reduce outlier impact
        return {
            rejectionRate: total ? (rejected / total) * 100 : 0,
            avgIncome: medianIncome || 0, // Fallback
            total: total
        };
    }, d => d.comuna);

    // Convert to array, filter, and sort by Income
    let data = Array.from(communes, ([key, value]) => ({ key, ...value }))
        .filter(d => d.total > 50 && d.key !== "Desconocida") // Filter small samples and unknown
        .sort((a, b) => a.avgIncome - b.avgIncome); // Sort by Income (Low to High)

    // Limit to top 30 to avoid overcrowding if too many
    if (data.length > 30) {
        data = data.sort((a, b) => b.total - a.total).slice(0, 30).sort((a, b) => a.avgIncome - b.avgIncome);
    }

    // X Axis: Communes
    const x = d3.scaleBand()
        .range([0, width])
        .domain(data.map(d => d.key))
        .padding(0.2);

    // Y Axis Left: Rejection Rate (Bars)
    const yLeft = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);

    // Y Axis Right: Avg Income (Line)
    const yRight = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.avgIncome) * 1.1])
        .range([height, 0]);

    // Draw Axes
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    svg.append("g")
        .call(d3.axisLeft(yLeft).tickFormat(d => d + "%"));

    svg.append("g")
        .attr("transform", `translate(${width},0)`)
        .call(d3.axisRight(yRight).tickFormat(d3.format(".2s")));

    // Bars (Rejection Rate)
    svg.selectAll("mybar")
        .data(data)
        .join("rect")
        .attr("x", d => x(d.key))
        .attr("y", d => yLeft(d.rejectionRate))
        .attr("width", x.bandwidth())
        .attr("height", d => height - yLeft(d.rejectionRate))
        .attr("fill", colors.rejected)
        .attr("opacity", 0.6)
        .append("title")
        .text(d => `${d.key}\nTasa Rechazo: ${d.rejectionRate.toFixed(1)}%`);

    // Line (Avg Income)
    const line = d3.line()
        .x(d => x(d.key) + x.bandwidth() / 2)
        .y(d => yRight(d.avgIncome));

    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#2ecc71") // Green for income
        .attr("stroke-width", 3)
        .attr("d", line);

    // Dots for Line
    svg.selectAll("mycircle")
        .data(data)
        .join("circle")
        .attr("cx", d => x(d.key) + x.bandwidth() / 2)
        .attr("cy", d => yRight(d.avgIncome))
        .attr("r", 5)
        .attr("fill", "#2ecc71")
        .attr("stroke", "#fff")
        .append("title")
        .text(d => `${d.key}\nIngreso Prom: $${d3.format(",.0f")(d.avgIncome)}`);

    // Axis Labels
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -45)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .style("fill", colors.rejected)
        .text("Tasa de Rechazo (%)");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", width + 45)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .style("fill", "#2ecc71")
        .text("Ingreso Mediana (CLP)");

    // Legend
    const legend = svg.append("g")
        .attr("transform", `translate(${width / 2 - 100}, -30)`);

    legend.append("rect").attr("x", 0).attr("y", 0).attr("width", 10).attr("height", 10).attr("fill", colors.rejected).attr("opacity", 0.6);
    legend.append("text").attr("x", 15).attr("y", 10).text("Tasa Rechazo").style("font-size", "12px").attr("alignment-baseline", "middle");

    legend.append("circle").attr("cx", 100).attr("cy", 5).attr("r", 5).attr("fill", "#2ecc71");
    legend.append("text").attr("x", 110).attr("y", 10).text("Ingreso Mediana").style("font-size", "12px").attr("alignment-baseline", "middle");
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
    const height = 310;
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
    const height = 260;
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
