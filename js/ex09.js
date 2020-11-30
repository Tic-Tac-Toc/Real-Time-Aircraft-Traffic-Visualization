var ctx = {
    w: 800,
    h: 400,
    LA_MIN: 41.31,
    LA_MAX: 51.16,
    LO_MIN: -4.93,
    LO_MAX: 7.72,
    TRANSITION_DURATION: 1000,
    scale: 1,
    currentFlights: [],
    planeUpdater: null,
    show_plane: true,
    country_to_continent: {
        "Republic of Korea": "Asia",
        "Kingdom of the Netherlands": "Europe",
        "Russian Federation": "Europe",
        "Viet Nam": "Asia",
        "Republic of Moldova": "Europe"
    },
    country_centroid: {},
    planes_origins: {}
};

const PROJECTIONS = {
    ER: d3.geoEquirectangular().center([0, 0]).scale(128).translate([ctx.w / 2, ctx.h / 2]),
};

var path4proj = d3.geoPath()
    .projection(PROJECTIONS.ER);

var drawMap = function (countries, lakes, rivers, svgEl) {
    var div = d3.select(".tooltip");

    ctx.mapG = svgEl.append("g")
        .attr("id", "map");
    // bind and draw geographical features to <path> elements
    var path4proj = d3.geoPath()
        .projection(PROJECTIONS.ER);
    var countryG = ctx.mapG.append("g").attr("id", "countries");
    countryG.selectAll("path.country")
        .data(countries.features)
        .enter()
        .append("path")
        .attr("opacity", 1)
        .attr("d", path4proj)
        .attr("class", "country")
        .attr("fill", "#EEE")
        .on("click", function (e, d) {
            div.transition()
                .duration(200)
                .style("opacity", .9);

            var plane_numbers = 0;
            if ((d.properties.name in ctx.planes_origins)) { plane_numbers = ctx.planes_origins[d.properties.name]; }

            div.html("Country : " + d.properties.name + "<br/>"
                + "Number of plane originating from : " + plane_numbers)
                .style("left", (e.pageX + 50) + "px")
                .style("top", (e.pageY - 50) + "px")

            d3.select("#planes").selectAll("image")
                .transition()
                .duration(ctx.TRANSITION_DURATION)
                .attr("opacity", (plane) => d.properties.name == plane.origin ? 1 : 0)
                .attr("width", (plane) => d.properties.name == plane.origin ? 15 : 0)
                .attr("height", (plane) => d.properties.name == plane.origin ? 15 : 0);

            d3.select("#show_planes_cb").property('checked', true);
        })
        .on("mouseout", function (e, d) {
            div.style("opacity", 0);
            div.html("")
                .style("left", "-500px")
                .style("top", "-500px");

            d3.select("#planes").selectAll("image")
                .transition()
                .duration(ctx.TRANSITION_DURATION)
                .attr("opacity", 1)
                .attr("width", 8)
                .attr("height", 8);
        });
    var lakeG = ctx.mapG.append("g").attr("id", "lakes");
    lakeG.selectAll("path.lakes")
        .data(lakes.features)
        .enter()
        .append("path")
        .attr("d", path4proj)
        .attr("class", "lake");
    var riverG = ctx.mapG.append("g").attr("id", "rivers");
    riverG.selectAll("path.rivers")
        .data(rivers.features)
        .enter()
        .append("path")
        .attr("d", path4proj)
        .attr("class", "river");
    ctx.mapG.append("g")
        .attr("id", "planes");

    svgEl.append("rect")
        .attr("x", ctx.w - 165)
        .attr("y", ctx.h - 20)
        .attr("width", "165")
        .attr("height", "20")
        .attr("fill", "black");

    svgEl.append("text")
        .attr("id", "last_update")
        .attr("x", ctx.w - 162)
        .attr("y", ctx.h - 7)
        .text("Last update - ")
        .attr("fill", "white");

    svgEl.append("rect")
        .attr("x", 0)
        .attr("y", ctx.h - 20)
        .attr("width", "169")
        .attr("height", "20")
        .attr("fill", "black");

    svgEl.append("text")
        .attr("id", "current_time")
        .attr("x", 2)
        .attr("y", ctx.h - 7)
        .attr("fill", "white");

    setInterval(updateCurrentTime, 1000);

    // pan & zoom
    function zoomed(event, d) {
        ctx.mapG.attr("transform", event.transform);
        var scale = ctx.mapG.attr("transform");
        scale = scale.substring(scale.indexOf('scale(') + 6);
        scale = parseFloat(scale.substring(0, scale.indexOf(')')));
        ctx.scale = 1 / scale;
        if (ctx.scale != 1) {
            d3.selectAll("image")
                .attr("transform", (d) => (getPlaneTransform(d)));
        }
    }
    var zoom = d3.zoom()
        .scaleExtent([1, 40])
        .on("zoom", zoomed);
    svgEl.call(zoom);
};

var getPlaneTransform = function (d) {
    var xy = PROJECTIONS.ER([d.lon, d.lat]);
    var sc = 4 * ctx.scale;
    var x = xy[0] - sc;
    var y = xy[1] - sc;
    if (d.bearing != null && d.bearing != 0) {
        var t = `translate(${x},${y}) rotate(${d.bearing} ${sc} ${sc})`;
        return (ctx.scale == 1) ? t : t + ` scale(${ctx.scale})`;
    }
    else {
        var t = `translate(${x},${y})`;
        return (ctx.scale == 1) ? t : t + ` scale(${ctx.scale})`;
    }
};

var createViz = function () {
    d3.select("body")
        .on("keydown", function (event, d) { handleKeyEvent(event); });
    var svgEl = d3.select("#main").append("svg");
    svgEl.attr("width", ctx.w);
    svgEl.attr("height", ctx.h);
    svgEl.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("fill", "#bcd1f1");

    d3.select("#main").append("svg").attr("id", "origin_legend_svg")
        .style("margin-top", "5px")
        .style("margin-left", 0)
        .attr("width", ctx.w)
        .attr("height", 80);

    var div = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);
    loadGeo(svgEl);
    loadPlanes();
};

var loadPlanes = function () {
    d3.json("https://opensky-network.org/api/states/all").then(function (data) {
        ctx.currentFlights = [];
        ctx.planes_origins = {};

        console.log("Load data");

        data.states.forEach(function (d) {
            if (d[5] == null || d[6] == null) { return; }
            ctx.currentFlights.push({
                "id": d[0],
                "callsign": d[1],
                "lon": d[5],
                "lat": d[6],
                "bearing": d[10],
                "alt": d[13],
                "velocity": d[9],
                "origin": d[2],
                "on_ground": d[8]
            });

            if (!(d[2] in ctx.planes_origins)) { ctx.planes_origins[d[2]] = 0; }
            ctx.planes_origins[d[2]] += 1;
        });

        max_origin = d3.max(Object.entries(ctx.planes_origins), d => d[1]);
        min_origin = d3.min(Object.entries(ctx.planes_origins), d => d[1]);

        logScale = d3.scaleLog()
            .domain([min_origin, max_origin])
        colorScaleLog = d3.scaleSequential(
            (d) => d3.interpolateReds(logScale(d))
        )

        d3.selectAll("path.country")
            .attr("fill", function (d) {
                if (!(d.properties.name in ctx.planes_origins)) { return "#EEE"; }
                else { return colorScaleLog(ctx.planes_origins[d.properties.name]); }
            });

        const barHeight = 30;
        const barWidth = 5;
        const points = d3.range(min_origin, max_origin, (max_origin - min_origin) / 60);

        d3.select("#origin_legend_svg").selectAll("*").remove();
        d3.select("#origin_legend_svg").append("g").append("text").attr("id", "info").attr("fill", "black").attr("x", 10).attr("y", 25);
        d3.select("#origin_legend_svg").append("g").append("text").attr("id", "info_origin").attr("fill", "black").attr("x", 10).attr("y", 50);
        d3.select("#origin_legend_svg")
            .append("g")
            .selectAll('bars').data(points).enter()
            .append('rect')
            .attr('y', 0)
            .attr('x', (d, i) => ctx.w - 300 + i * barWidth)
            .attr('width', barWidth)
            .attr('height', barHeight)
            .attr('fill', (d) => colorScaleLog(d));

        d3.select("#origin_legend_svg")
            .append("g")
            .attr("transform", "translate(" + (ctx.w - 300) + ", " + (barHeight + 5) + ")")
            .call(d3.axisBottom(logScale.range([0, 299])).ticks(5))

        d3.select("#origin_legend_svg")
            .append("text")
            .style("margin-left", ctx.w - 300)
            .attr("transform", "translate(0, " + (barHeight + 45) + ")")
            .attr("x", ctx.w - 300 + 10)
            .text("Nb. Planes originating from the country");

        var timestring = new Date().toLocaleTimeString();
        d3.select("#last_update")
            .html("Last update : " + timestring)
            .attr("style", "margin-left:" + ctx.w);

        drawPlanes();
        createHeatmap();
        createUnitChart();
        createBarChart();
    });
};

var drawPlanes = function () {
    var planesG = d3.select("#planes");

    planesG.selectAll("image")
        .data(ctx.currentFlights, (d) => d.id)
        .enter()
        .append("image")
        .attr("opacity", 1)
        .attr("class", "plane")
        .attr("width", 8)
        .attr("height", 8)
        .attr("transform", (d) => getPlaneTransform(d))
        .attr("xlink:href", "plane_icon.png");

    planesG.selectAll("image")
        .data(ctx.currentFlights, (d) => d.id)
        .exit()
        .remove();

    planesG.selectAll("image")
        .data(ctx.currentFlights, (d) => d.id)
        .transition()
        .duration(ctx.TRANSITION_DURATION)
        .attr("transform", (d) => getPlaneTransform(d));

    var divinfo = d3.select("text#info");
    var divinfo_origin = d3.select("text#info_origin");
    var div = d3.select(".tooltip");
    planesG.selectAll("image")
        .on("mouseover", function (e, d) {
            divinfo.text(d.callsign);
            divinfo_origin.text("Origin : " + d.origin);
            d3.select(this)
                .transition()
                .duration(ctx.TRANSITION_DURATION)
                .attr("width", 15)
                .attr("height", 15);

            div.transition()
                .duration(200)
                .style("opacity", .9);
            div.html("Avion : " + d.id + "<br/>"
                + "Callsign : " + d.callsign + "<br/>"
                + "Altitude : " + (d.alt != null ? d.alt : 0) + "<br/>"
                + "Origin : " + d.origin)
                .style("left", (e.pageX + 10) + "px")
                .style("top", (e.pageY - 10) + "px")
        })
        .on("mouseout", function (e, d) {
            div.style("opacity", 0);
            div.html("")
                .style("left", "-500px")
                .style("top", "-500px");

            d3.selectAll("path.country")
                .transition()
                .duration(ctx.TRANSITION_DURATION)
                .attr("opacity", 1)

            planesG.selectAll("image")
                .transition()
                .duration(ctx.TRANSITION_DURATION)
                .attr("opacity", 1)
                .attr("width", 8)
                .attr("height", 8);

            planesG.select("#follow_line").remove();
        })
        .on("click", function (e, plane) {
            planesG.selectAll("image")
                .transition()
                .duration(ctx.TRANSITION_DURATION)
                .attr("opacity", (d) => d == plane ? 1 : 0)

            if (!(plane.origin in ctx.country_centroid)) { return; }
            coordinates = PROJECTIONS.ER([plane.lon, plane.lat]);
            planesG.append("path")
                .transition()
                .duration(ctx.TRANSITION_DURATION)
                .attr("d", (d) => QuadraticBezierCurve(coordinates[0], coordinates[1], ctx.country_centroid[plane.origin][0], ctx.country_centroid[plane.origin][1]))
                .attr("id", "follow_line")
                .attr("stroke", "black")
                .attr("stroke-width", "3px")
                .attr("stroke-dasharray", "5,5")
                .attr("fill", "none")
                .attr("opacity", 0.8);

            div.style("opacity", 0);
            div.html("")
                .style("left", "-500px")
                .style("top", "-500px");
        });
};

/* data fetching and transforming */
var loadGeo = function (svgEl) {
    var promises = [d3.json("ne_50m_admin_0_countries.geojson"),
    d3.json("ne_50m_lakes.geojson"),
    d3.json("ne_50m_rivers_lake_centerlines.geojson")];
    Promise.all(promises).then(function (data) {
        data[0].features.forEach(function (d) {
            ctx.country_to_continent[d.properties.name] = d.properties.continent;
            ctx.country_centroid[d.properties.name] = path4proj.centroid(d);
        });

        drawMap(data[0], data[1], data[2], svgEl);
    }).catch(function (error) { console.log(error) });
};

var toggleUpdate = function () {
    // feel free to rewrite the 'if' test
    // this is just dummy code to make the interface
    // behave properly
    divinfocmd = d3.select("div#cmds_state")
    if (d3.select("#updateBt").attr("value") == "On") {
        d3.select("#updateBt").attr("value", "Off");
        setInterval(loadPlanes, 10000);
        divinfocmd.html("Update is currently <b>ON</b>");
    }
    else {
        d3.select("#updateBt").attr("value", "On");
        divinfocmd.html("Update is currently <b>OFF</b>");
        clearInterval();
    }
};

/* Input events */
var handleKeyEvent = function (e) {
    if (e.keyCode === 85) {
        // hitting u on the keyboard triggers flight data fetching and display
        loadPlanes()
    }
};

var updateCurrentTime = function () {
    var timestring = new Date().toLocaleTimeString();
    d3.select("#current_time")
        .text("Current time : " + timestring);
};

var createHeatmap = function () {
    var vlSpec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
        "data": { "values": ctx.currentFlights },
        "mark": "rect",
        "encoding": {
            "x": {
                "bin": { "maxbins": 50 },
                "field": "velocity",
                "type": "quantitative",
                "axis": { "title": "Velocity (m/s)" }
            },
            "y": {
                "bin": { "maxbins": 50 },
                "field": "alt",
                "type": "quantitative",
                "axis": { "title": "Altitude (m)" }
            },
            "tooltip": { "type": "quantitative", "aggregate": "count" },
            "color": {
                "aggregate": "count",
                "type": "quantitative",
                "axis": { "title": "Count of planes" },
                "scale": { "scheme": "blues" }
            }
        },
        "config": {
            "view": {
                "stroke": "transparent"
            }
        }
    };

    // see options at https://github.com/vega/vega-embed/blob/master/README.md
    var vlOpts = { width: 300, height: 300, actions: false };
    vegaEmbed("#heatmap", vlSpec, vlOpts);
};

var createBarChart = function () {


    var vlSpec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
        "data": { "values": ctx.currentFlights },
        "width": 400,
        "height": 100,
        "mark": "bar",
        "encoding": {
            "color": { "type": "nominal", "field": "on_ground", "axis": { "title": "Planes on ground" } },
            "x": { "type": "quantitative", "aggregate": "count", "field": "on_ground", "axis": { "title": "Count of planes" } },
            "tooltip": { "type": "quantitative", "aggregate": "count", "field": "on_ground" },
            "order": { "aggregate": "count", "field": "on_ground", "type": "quantitative" },
        }
    };

    // see options at https://github.com/vega/vega-embed/blob/master/README.md
    var vlOpts = { width: 400, height: 100, actions: false };
    vegaEmbed("#on_ground", vlSpec, vlOpts);
};

var createUnitChart = function () {
    var unitChartData = [];
    var continent_count = {};
    var continent_fly = {};
    var i = 1;
    ctx.currentFlights.forEach(function (d) {
        if (!(d.origin in ctx.country_to_continent)) { return; }

        var continent = ctx.country_to_continent[d.origin];
        if (!(continent in continent_count)) { continent_count[continent] = 0; }
        if (!(continent in continent_fly)) { continent_fly[continent] = []; }
        continent_count[continent] += 1;

        continent_fly[continent].push({
            "subid": continent_count[continent],
            "country": d.origin,
            "continent": continent,
            "tooltip": d.origin + " - " + d.callsign
        });
    });

    for (var ctnt in continent_fly) {
        continent_fly[ctnt].forEach(function (d) {
            unitChartData.push({
                "id": i,
                "subid": d.subid,
                "country": d.country,
                "continent": d.continent,
                "PlaneInfos": d.tooltip,
                "Continent": d.continent + " : " + continent_count[d.continent] + " originating planes"
            });

            i += 1;
        })
    }

    var vlSpec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
        "data": { "values": unitChartData },
        "width": 1200,
        "height": 180,
        "mark": "rect",
        "transform": [
            { "calculate": "ceil(datum.id/ 10)", "as": "X" },
            { "calculate": "datum.id - (datum.X - 1) *10", "as": "Y" }
        ],
        "encoding": {
            "x": {
                "field": "X",
                "type": "ordinal",
                "axis": null
            },
            "y": {
                "field": "Y",
                "type": "ordinal",
                "axis": null
            },
            "color": {
                "field": "continent",
                "type": "nominal",
                "axis": {"title": "Originating continent"}
            },
            "tooltip": [
                {
                    "field": "PlaneInfos",
                    "type": "nominal"
                },
                {
                    "field": "Continent",
                    "type": "nominal"
                }
            ],
        },
        "config": {
            "cell": { "strokeOpacity": 0 }
        }
    };


    // see options at https://github.com/vega/vega-embed/blob/master/README.md
    var vlOpts = { width: 1200, height: 180, actions: false };
    vegaEmbed("#inTheAir", vlSpec, vlOpts);
};

var toggleUpdateShowPlanes = function () {
    // feel free to rewrite the 'if' test
    // this is just dummy code to make the interface
    // behave properly
    var planesG = d3.select("#planes");
    if (d3.select("#show_planes_cb").property('checked') == true) {
        planesG.selectAll("image")
            .attr("opacity", 0)
            .transition()
            .duration(ctx.TRANSITION_DURATION)
            .attr("opacity", 1)
            .attr("width", 8)
            .attr("height", 8);

        ctx.show_plane = true;
    }
    else {
        planesG.selectAll("image")
            .attr("opacity", 1)
            .transition()
            .duration(ctx.TRANSITION_DURATION)
            .attr("opacity", 0)
            .attr("width", 0)
            .attr("height", 0);

        ctx.show_plane = false;
    }

    console.log(ctx.show_plane);
};

function QuadraticBezierCurve(x1, y1, x2, y2) {

    rho = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) / 2;
    alpha = Math.atan2((y2 - y1), (x2 - x1));

    cpx = x1 + rho * Math.cos(alpha + Math.PI / 6);
    cpy = y1 + rho * Math.sin(alpha + Math.PI / 6);

    return "M" + x1 + "," + y1 + " Q" + cpx + "," + cpy + " " + x2 + "," + y2;
};