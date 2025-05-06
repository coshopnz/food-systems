document.addEventListener('DOMContentLoaded', () => {
    // Check if D3 is loaded
    if (typeof d3 === 'undefined') {
        console.error("D3.js library is not loaded. Loading it now...");
        
        // Dynamically load D3
        const d3Script = document.createElement('script');
        d3Script.src = 'https://d3js.org/d3.v7.min.js';
        d3Script.onload = initPage;
        document.head.appendChild(d3Script);
    } else {
        // D3 is already loaded, proceed
        initPage();
    }
    
    function initPage() {
        const detailsPanel = document.getElementById('details-panel');
        const container = document.getElementById('d3-container');
        const regenToggle = document.getElementById('regen-toggle');
        const noncoreToggle = document.getElementById('noncore-toggle');

        // Ensure container has proper dimensions
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.minHeight = '550px';
        container.style.position = 'relative';

        // Add tooltip div
        const tooltip = d3.select(container)
            .append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);

        // Use container's size for SVG dimensions
        const width = window.innerWidth;
        const height = window.innerHeight;
        const nodeRadius = 20;
        const nodePadding = 80;
        const stagePadding = width / 5;

        // Add variables for node selection
        let currentlySelectedNodeData = null;
        let currentlySelectedNodeElement = null;
        
        // Initialize data placeholders
        let nodes = [];
        let links = [];
        let nodeMap = new Map();
        
        // Load data from JSON file
        loadFoodSystemData()
            .then(data => {
                // Assign data from JSON
                nodes = data.nodes;
                
                // Position the nodes on screen
                positionNodes(nodes, width, height);
                
                // Create a node map for quick lookup
                nodeMap = new Map(nodes.map(node => [node.id, node]));
                
                // Process links with node references
                links = data.links.map(link => ({ ...link, source: nodeMap.get(link.source), target: nodeMap.get(link.target) }));
                
                // Initialize the visualization
                initializeVisualization();
            })
            .catch(error => {
                console.error("Error loading food system data:", error);
                container.innerHTML = `<div class="error-message">Error loading data: ${error.message}</div>`;
            });
        
        // Function to load data from JSON file
        async function loadFoodSystemData() {
            // Only load from data.json
            try {
                const response = await fetch('data.json');
                if (response.ok) {
                    const data = await response.json();
                    if (validateDataStructure(data)) {
                        return data;
                    } else {
                        throw new Error('Invalid data structure in data.json');
                    }
                } else {
                    throw new Error('Failed to fetch data.json');
                }
            } catch (error) {
                throw new Error('Error loading data.json: ' + error.message);
            }
        }
        
        // Function to validate the data structure
        function validateDataStructure(data) {
            // Check if the data has the expected structure
            if (!data || typeof data !== 'object') {
                console.error("Data is not an object");
                return false;
            }
            
            // Check for nodes array
            if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
                console.error("Data missing nodes array or nodes array is empty");
                return false;
            }
            
            // Check for links array
            if (!Array.isArray(data.links) || data.links.length === 0) {
                console.error("Data missing links array or links array is empty");
                return false;
            }
            
            // Check a sample node structure
            const sampleNode = data.nodes[0];
            if (!sampleNode.id || !sampleNode.group || !sampleNode.label) {
                console.error("Node structure is invalid - missing required fields");
                return false;
            }
            
            // Check a sample link structure
            const sampleLink = data.links[0];
            if (!sampleLink.source || !sampleLink.target || !sampleLink.type) {
                console.error("Link structure is invalid - missing required fields");
                return false;
            }
            
            // Check for examples array in links - this is now an optional property because we use example string
            if (sampleLink.examples && !Array.isArray(sampleLink.examples)) {
                console.error("Link has examples property but it's not an array");
                return false;
            }
            
            console.log("Data structure validation passed");
            return true;
        }
        
        // Position nodes according to layout
        function positionNodes(nodes, width, height) {
            // Define category positions
            const categoryPositions = {
                core_flow: { x: width * 0.5, y: height * 0.5 },
                subsystem: { x: width * 0.3, y: height * 0.3 },
                community: { x: width * 0.7, y: height * 0.7 },
                policy: { x: width * 0.2, y: height * 0.2 },
                health: { x: width * 0.8, y: height * 0.2 },
                factor: { x: width * 0.2, y: height * 0.8 },
                economic: { x: width * 0.8, y: height * 0.8 }
            };

            // Group nodes by category
            const nodesByCategory = {};
            nodes.forEach(node => {
                if (!nodesByCategory[node.group]) {
                    nodesByCategory[node.group] = [];
                }
                nodesByCategory[node.group].push(node);
            });

            // Position nodes within each category
            Object.entries(nodesByCategory).forEach(([category, categoryNodes]) => {
                const center = categoryPositions[category] || { x: width * 0.5, y: height * 0.5 };
                const radius = Math.min(width, height) * 0.15;
                const angleStep = (2 * Math.PI) / categoryNodes.length;

                categoryNodes.forEach((node, i) => {
                    const angle = i * angleStep;
                    node.x = center.x + radius * Math.cos(angle);
                    node.y = center.y + radius * Math.sin(angle);
                });
            });
        }
        
        // Main function to initialize the visualization
        function initializeVisualization() {
            // Add variables to track the journey state
            let isJourneyExpanded = false;
            let expandedNodes = new Set(['environment']);
            
            // --- D3 Setup ---
            const svg = d3.select(container).append("svg")
                .attr("width", width)
                .attr("height", height)
                .attr("viewBox", [0, 0, width, height]);

            // Create a container for all visual elements that will be transformed during zoom
            const zoomContainer = svg.append("g");

            // Apply zoom behavior
            const zoomBehavior = d3.zoom()
                .extent([[0, 0], [width, height]])
                .scaleExtent([0.2, 5])
                .on("zoom", zoomed);
            svg.call(zoomBehavior);

            // Add reset zoom button (move here to ensure correct svg reference)
            const resetButton = d3.select(container)
                .append("button")
                .attr("class", "reset-zoom-btn")
                .text("Reset Zoom")
                .on("click", function() {
                    svg.transition()
                        .duration(750)
                        .call(zoomBehavior.transform, d3.zoomIdentity);
                });
            
            // Add a path guide element
            const pathGuide = d3.select(container)
                .append("div")
                .attr("class", "path-guide")
                .html(`
                    <h4>Food Journey</h4>
                    <p>Follow the dark blue arrows to see how food travels from the environment through the food system to consumption.</p>
                    <p>Click on the environment node to begin the journey.</p>
                `);
            
            // Add fullscreen button
            const fullscreenButton = d3.select(container)
                .append("button")
                .attr("class", "fullscreen-btn")
                .html('<i class="fas fa-expand"></i>')
                .on("click", toggleFullscreen);
            
            // Add CSS for styling
            const globalStyle = document.createElement('style');
            globalStyle.textContent = `
                .reset-zoom-btn {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    padding: 8px 12px;
                    background-color: white;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    z-index: 100;
                    font-size: 14px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    transition: background-color 0.2s;
                }
                .reset-zoom-btn:hover {
                    background-color: #f5f5f5;
                }
                .fullscreen-btn {
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    width: 40px;
                    height: 40px;
                    padding: 8px;
                    background-color: white;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    cursor: pointer;
                    z-index: 100;
                    font-size: 14px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    transition: background-color 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .fullscreen-btn:hover {
                    background-color: #f5f5f5;
                }
                #d3-container {
                    position: relative;
                    touch-action: none; /* Prevent browser handling of touch gestures */
                }
                /* Enhanced link styles */
                .link.flow {
                    stroke: #23406e;
                    stroke-width: 3px;
                    stroke-dasharray: none;
                    opacity: 0.95;
                }
                .link.influence {
                    stroke: #888;
                    stroke-width: 1.5px;
                    stroke-dasharray: 6,4;
                    opacity: 0.5;
                }
                .link.economic_incentive, .link.policy_intervention, .link.monitoring {
                    stroke: #888;
                    stroke-width: 1.5px;
                    stroke-dasharray: 6,4;
                    opacity: 0.5;
                }
                .link.waste, .link.problem {
                    stroke: #e74c3c;
                    stroke-width: 2.5px;
                    stroke-dasharray: 8,4;
                    opacity: 0.7;
                }
                .link.health_impact {
                    stroke: #2f855a;
                    stroke-width: 2px;
                    stroke-dasharray: 4,4;
                    opacity: 0.7;
                }
                /* Node label improvements */
                .node-label {
                    font-size: 16px !important;
                    font-weight: 600;
                    fill: #222;
                    text-shadow: 0 1px 4px #fff, 0 0px 2px #fff;
                    paint-order: stroke fill;
                    stroke: #fff;
                    stroke-width: 4px;
                    stroke-linejoin: round;
                    stroke-opacity: 0.7;
                }
                /* Legend styles */
                #diagram-legend {
                    position: absolute;
                    left: -275px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: rgba(255,255,255,0.95);
                    border: 1px solid #bbb;
                    border-radius: 8px;
                    padding: 14px 18px 10px 18px;
                    font-size: 15px;
                    z-index: 300;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                    min-width: 220px;
                }
                #diagram-legend h4 {
                    margin: 0 0 8px 0;
                    font-size: 16px;
                    font-weight: bold;
                }
                #diagram-legend .legend-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 6px;
                    gap: 8px;
                }
                #diagram-legend .legend-line {
                    width: 32px;
                    height: 0;
                    border-top: 4px solid #23406e;
                    margin-right: 6px;
                }
                #diagram-legend .legend-line.influence {
                    border-top: 3px dashed #888;
                }
                #diagram-legend .legend-line.waste {
                    border-top: 3px dashed #e74c3c;
                }
                #diagram-legend .legend-line.health {
                    border-top: 3px dashed #2f855a;
                }
                #diagram-legend .legend-dot {
                    width: 18px;
                    height: 18px;
                    border-radius: 50%;
                    display: inline-block;
                    margin-right: 6px;
                }
                #diagram-legend .core { background: #2c5282; }
                #diagram-legend .community { background: #c05621; }
                #diagram-legend .policy { background: #6b46c1; }
                #diagram-legend .health { background: #2f855a; }
                #diagram-legend .factor { background: #A0AEC0; }
                #diagram-legend .legend-buttons {
                    margin-top: 20px;
                    border-top: 1px solid #ddd;
                    padding-top: 15px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                #diagram-legend .view-btn {
                    padding: 8px 12px;
                    border: 1px solid #bbb;
                    border-radius: 6px;
                    background: #fff;
                    color: #333;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s, color 0.2s;
                }
                #diagram-legend .view-btn.selected, #diagram-legend .view-btn:active {
                    background: #c7e8c7;
                    color: #1a5d1a;
                    border-color: #7fd67f;
                }
            `;
            document.head.appendChild(globalStyle);

            // Add legend to the diagram
            const legend = document.createElement('div');
            legend.id = 'diagram-legend';
            legend.innerHTML = `
                <h4>Legend</h4>
                <div class="legend-row"><span class="legend-dot core"></span> Core Flow</div>
                <div class="legend-row"><span class="legend-dot community"></span> Community</div>
                <div class="legend-row"><span class="legend-dot policy"></span> Policy</div>
                <div class="legend-row"><span class="legend-dot health"></span> Health</div>
                <div class="legend-row"><span class="legend-dot factor"></span> Subsystem</div>
                <div class="legend-row"><span class="legend-line"></span> Core Flow Link</div>
                <div class="legend-row"><span class="legend-line influence"></span> Influence/Secondary Link</div>
                <div class="legend-row"><span class="legend-line waste"></span> Waste/Problem Link</div>
                <div class="legend-row"><span class="legend-line health"></span> Health Impact Link</div>
                
                <div class="legend-buttons">
                    <h4>View Mode</h4>
                    <button class="view-btn" data-view="default">Default</button>
                    <button class="view-btn" data-view="regen">Regen</button>
                    <button class="view-btn" data-view="negative">Negative Effects</button>
                </div>
            `;
            container.appendChild(legend);
            
            // Position the container with margin for legend
            container.style.marginLeft = '275px';
            container.style.position = 'relative';

            function resetZoom() {
                svg.transition()
                    .duration(750)
                    .call(d3.zoom().transform, d3.zoomIdentity);
            }

            // Function to toggle fullscreen mode
            function toggleFullscreen() {
                if (!document.fullscreenElement) {
                    // Enter fullscreen
                    if (container.requestFullscreen) {
                        container.requestFullscreen();
                    } else if (container.mozRequestFullScreen) { /* Firefox */
                        container.mozRequestFullScreen();
                    } else if (container.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
                        container.webkitRequestFullscreen();
                    } else if (container.msRequestFullscreen) { /* IE/Edge */
                        container.msRequestFullscreen();
                    }
                    fullscreenButton.html('<i class="fas fa-compress"></i>');
                } else {
                    // Exit fullscreen
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.mozCancelFullScreen) { /* Firefox */
                        document.mozCancelFullScreen();
                    } else if (document.webkitExitFullscreen) { /* Chrome, Safari & Opera */
                        document.webkitExitFullscreen();
                    } else if (document.msExitFullscreen) { /* IE/Edge */
                        document.msExitFullscreen();
                    }
                    fullscreenButton.html('<i class="fas fa-expand"></i>');
                }
            }
            
            // Listen for fullscreen change events to update button icon
            document.addEventListener('fullscreenchange', updateFullscreenButtonIcon);
            document.addEventListener('webkitfullscreenchange', updateFullscreenButtonIcon);
            document.addEventListener('mozfullscreenchange', updateFullscreenButtonIcon);
            document.addEventListener('MSFullscreenChange', updateFullscreenButtonIcon);
            
            function updateFullscreenButtonIcon() {
                if (document.fullscreenElement) {
                    fullscreenButton.html('<i class="fas fa-compress"></i>');
                } else {
                    fullscreenButton.html('<i class="fas fa-expand"></i>');
                }
            }

            // Function to handle zoom events with enhanced features
            function zoomed(event) {
                zoomContainer.attr("transform", event.transform);
                
                // Scale node labels inversely to maintain readability when zooming out
                if (event.transform.k < 0.6) {
                    nodeGroup.selectAll(".node-label")
                        .style("font-size", `${Math.min(14 / event.transform.k, 22)}px`);
                } else {
                    nodeGroup.selectAll(".node-label")
                        .style("font-size", "12px");
                }
                
                // Adjust link width based on zoom level
                link.style("stroke-width", 1.5 / event.transform.k + "px");
            }

            // Define arrow markers
            const markerBoxWidth = 6;
            const markerRefX = nodeRadius + markerBoxWidth;

            zoomContainer.append('defs').append('marker')
                .attr('id', 'arrowhead-flow')
                .attr('viewBox', '-0 -5 10 10')
                .attr('refX', markerRefX)
                .attr('refY', 0)
                .attr('orient', 'auto')
                .attr('markerWidth', markerBoxWidth)
                .attr('markerHeight', markerBoxWidth)
                .attr('xoverflow', 'visible')
                .append('svg:path')
                .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
                .attr('fill', '#555')
                .style('stroke','none');

            zoomContainer.append('defs').append('marker')
                .attr('id', 'arrowhead-influence')
                .attr('viewBox', '-0 -5 10 10')
                .attr('refX', markerRefX)
                .attr('refY', 0)
                .attr('orient', 'auto')
                .attr('markerWidth', markerBoxWidth - 1)
                .attr('markerHeight', markerBoxWidth - 1)
                .attr('xoverflow', 'visible')
                .append('svg:path')
                .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
                .attr('fill', '#aaa')
                .style('stroke','none');

            // Create simulation (only used when a node is selected)
            const simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links).id(d => d.id).distance(200))
                .force("charge", d3.forceManyBody().strength(d => d.group === 'core_flow' ? -600 : -1200))
                .force("center", d3.forceCenter(width / 2, height / 2))
                .force("x", d3.forceX(width / 2).strength(d => d.group === 'core_flow' ? 0.1 : 0.3))
                .force("y", d3.forceY(height / 2).strength(d => d.group === 'core_flow' ? 0.1 : 0.3))
                .force("collision", d3.forceCollide().radius(d => d.group === 'core_flow' ? nodeRadius * 3 : nodeRadius * 4))
                .stop(); // Stop the simulation initially

            // Add radial force to push non-core nodes outward
            simulation.force("radial", d3.forceRadial(
                d => d.group === 'core_flow' ? 0 : Math.min(width, height) * 0.4,
                width / 2,
                height / 2
            ).strength(d => d.group === 'core_flow' ? 0 : 0.2));

            // Create separate layers for better control over z-order
            const linksLayer = zoomContainer.append("g").attr("class", "links-layer");
            const nodesLayer = zoomContainer.append("g").attr("class", "nodes-layer");
            
            // Draw Links (inside the links layer)
            const link = linksLayer.append("g")
                .attr("class", "links")
                .selectAll("line")
                .data(links)
                .join("line")
                .attr("class", d => `link ${d.type}`)
                .attr('marker-end', d => {
                    if (d.type === 'influence' || d.type === 'waste' || d.type === 'recycle') {
                        return 'url(#arrowhead-influence)';
                    }
                    return 'url(#arrowhead-flow)';
                })
                .attr('data-is-return', d => d.isReturn ? "true" : null)
                .style("stroke-dasharray", d => {
                    if (d.type === 'flow') return "10 10";
                    if (d.type === 'waste' || d.type === 'recycle') return "5 5";
                    if (d.type === "influence") return "5,5";
                    return "none";
                })
                .style("opacity", d => {
                    // Check if either source or target node is hidden with null checks
                    const sourceNode = d3.select(`.node-group[data-id="${d.source.id}"]`);
                    const targetNode = d3.select(`.node-group[data-id="${d.target.id}"]`);
                    
                    // If either node element doesn't exist, hide the link
                    if (sourceNode.empty() || targetNode.empty()) {
                        return 0;
                    }
                    
                    const sourceHidden = sourceNode.classed("hidden");
                    const targetHidden = targetNode.classed("hidden");
                    return (sourceHidden || targetHidden) ? 0 : 0.6;
                })
                .style("pointer-events", d => {
                    // Check if either source or target node is hidden with null checks
                    const sourceNode = d3.select(`.node-group[data-id="${d.source.id}"]`);
                    const targetNode = d3.select(`.node-group[data-id="${d.target.id}"]`);
                    
                    // If either node element doesn't exist, disable pointer events
                    if (sourceNode.empty() || targetNode.empty()) {
                        return "none";
                    }
                    
                    const sourceHidden = sourceNode.classed("hidden");
                    const targetHidden = targetNode.classed("hidden");
                    return (sourceHidden || targetHidden) ? "none" : "auto";
                })
                .on("mouseover", function(event, d) {
                    // Only show tooltip if both nodes are visible with null checks
                    const sourceNode = d3.select(`.node-group[data-id="${d.source.id}"]`);
                    const targetNode = d3.select(`.node-group[data-id="${d.target.id}"]`);
                    
                    // If either node element doesn't exist, don't show tooltip
                    if (sourceNode.empty() || targetNode.empty()) {
                        return;
                    }
                    
                    const sourceHidden = sourceNode.classed("hidden");
                    const targetHidden = targetNode.classed("hidden");
                    
                    if (!sourceHidden && !targetHidden) {
                        // Show tooltip
                        tooltip.transition()
                            .duration(200)
                            .style("opacity", 1);
                        
                        // Get source and target labels
                        const sourceLabel = d.source.label;
                        const targetLabel = d.target.label;
                        const linkType = d.type.charAt(0).toUpperCase() + d.type.slice(1);
                        
                        // Position tooltip near the mouse
                        tooltip.html(`${sourceLabel} → ${targetLabel}<br>Type: ${linkType}`)
                            .style("left", (event.pageX + 10) + "px")
                            .style("top", (event.pageY - 28) + "px");
                            
                            // Highlight the link
                            d3.select(this)
                                .classed("highlighted", true);
                        }
                    })
                    .on("mouseout", function() {
                        // Hide tooltip
                        tooltip.transition()
                            .duration(500)
                            .style("opacity", 0);
                            
                        // Remove highlight
                        d3.select(this)
                            .classed("highlighted", false);
                    });

            // Draw Nodes (inside the nodes layer, which will be on top)
            const nodeGroup = nodesLayer.append("g")
                .attr("class", "nodes")
                .selectAll("g")
                .data(nodes)
                .join("g")
                .attr("class", d => {
                    // Ensure every node has a valid group
                    if (!d.group) {
                        console.warn(`Node without group detected:`, d);
                        d.group = 'uncategorized';
                    }
                    return `node-group ${d.group} ${d.group !== 'core_flow' ? 'non-core-node' : 'core-node'}`;
                })
                .attr("data-group", d => d.group || 'uncategorized')
                .attr("data-id", d => d.id) // Add data-id attribute for link visibility checks
                .call(drag(simulation));

            // Node circle background
            nodeGroup.append("circle")
                .attr("r", nodeRadius)
                .attr("class", d => `node-circle ${d.group}`)
                .style("--node-color", d => d.color)
                .on("click", nodeClicked);

            // Node icon
            nodeGroup.append("text")
                .attr('font-family', '"Font Awesome 5 Free"')
                .attr('font-weight', '900')
                .attr('font-size', '18px')
                .attr("dy", "0.35em")
                .attr("text-anchor", "middle")
                .attr("class", "node-icon")
                .text(d => d.icon)
                .style("pointer-events", "none");

            // Node label
            nodeGroup.append("text")
                .attr("dy", "2.5em")
                .attr("text-anchor", "middle")
                .attr("class", "node-label")
                .text(d => d.label)
                .style("pointer-events", "none");

            // Set initial positions for straight-line layout
            function setInitialPositions() {
                const flowY = height * 0.5;  // Main flow line
                const topY = height * 0.15;  // Top row for factors
                const bottomY = height * 0.85; // Bottom row
                const secondaryTopY = height * 0.3; // Secondary top row
                const secondaryBottomY = height * 0.7; // Secondary bottom row
                
                // Calculate horizontal spacing
                const margin = width * 0.1;
                const usableWidth = width - (margin * 2);
                const stageCount = 9; // Number of main flow stages
                const stagePadding = usableWidth / (stageCount - 1);
                const startX = margin;

                // Clear existing positions
                nodes.forEach(node => {
                    node.x = null;
                    node.y = null;
                });

                // Position primary flow nodes in a clear left-to-right path
                const primaryFlowStages = [
                    'environment',      // Stage 0: Start - Environment
                    'production',       // Stage 1: Production
                    'packhouses',       // Stage 2: Packhouses
                    'processing',       // Stage 3: Processing
                    'distribution',     // Stage 4: Distribution
                    'wholesalers',      // Stage 5: Wholesalers
                    'supermarkets',     // Stage 6: Retail
                    'grocers',          // Stage 6: Alternative retail (same x position)
                    'consumption'       // Stage 7: Consumption
                ];

                // Position primary flow nodes along the main flow line
                primaryFlowStages.forEach((nodeId, index) => {
                    const node = nodes.find(n => n.id === nodeId);
                    if (node) {
                        // Special case for retailers (supermarkets and grocers)
                        if (nodeId === 'grocers') {
                            // Place grocers below supermarkets
                            node.x = startX + stagePadding * 6;
                            node.y = flowY + 80;
                        } else {
                            node.x = startX + (stagePadding * (nodeId === 'supermarkets' ? 6 : index));
                            node.y = flowY;
                        }
                    }
                });

                // Position input nodes above the production stage
                const inputsNode = nodes.find(n => n.id === 'inputs');
                if (inputsNode) {
                    inputsNode.x = startX + stagePadding * 1; // Above production
                    inputsNode.y = flowY - 80;
                }

                // Position import/export nodes at the distribution stage
                const importsNode = nodes.find(n => n.id === 'imports');
                if (importsNode) {
                    importsNode.x = startX + stagePadding * 4;
                    importsNode.y = flowY - 80;
                }
                
                const exportsNode = nodes.find(n => n.id === 'exports');
                if (exportsNode) {
                    exportsNode.x = startX + stagePadding * 4;
                    exportsNode.y = flowY + 80;
                }

                // Position supporting industry nodes
                const fertilizerNode = nodes.find(n => n.id === 'fertilizer_industry');
                if (fertilizerNode) {
                    fertilizerNode.x = startX + stagePadding * 0.5;
                    fertilizerNode.y = flowY + 80;
                }
                
                const pestNode = nodes.find(n => n.id === 'pest_management');
                if (pestNode) {
                    pestNode.x = startX + stagePadding * 1.5;
                    pestNode.y = flowY + 80;
                }

                // Position food service and alternative consumption paths
                const foodServiceNode = nodes.find(n => n.id === 'restaurants' || n.id === 'food_service');
                if (foodServiceNode) {
                    foodServiceNode.x = startX + stagePadding * 6.5;
                    foodServiceNode.y = flowY + 160;
                }

                // Position food rescue and school food programs
                const foodRescueNode = nodes.find(n => n.id === 'food_rescue');
                if (foodRescueNode) {
                    foodRescueNode.x = startX + stagePadding * 5.5;
                    foodRescueNode.y = flowY - 80;
                }
                
                const schoolFoodNode = nodes.find(n => n.id === 'school_food_programs');
                if (schoolFoodNode) {
                    schoolFoodNode.x = startX + stagePadding * 5.5;
                    schoolFoodNode.y = flowY + 80;
                }

                // Position markets node
                const marketsNode = nodes.find(n => n.id === 'markets' || n.id === 'weekend_markets');
                if (marketsNode) {
                    marketsNode.x = startX + stagePadding * 6;
                    marketsNode.y = flowY - 80;
                }

                // Position factor nodes in an arc above the core flow
                const factorNodes = nodes.filter(node => node.group === 'factor');
                const factorXPositions = [0.1, 0.3, 0.5, 0.7, 0.9];
                factorNodes.forEach((node, i) => {
                    if (i < factorXPositions.length) {
                        node.x = width * factorXPositions[i];
                        node.y = topY;
                    }
                });

                // Position waste-related nodes below the core flow
                nodes.forEach(node => {
                    switch (node.id) {
                        case 'food_loss':
                            node.x = startX + stagePadding * 2;
                            node.y = bottomY;
                            break;
                        case 'waste':
                        case 'waste/recovery':
                            node.x = startX + stagePadding * 5;
                            node.y = bottomY;
                            break;
                        case 'food_waste':
                            node.x = startX + stagePadding * 7;
                            node.y = bottomY;
                            break;
                    }
                });
                // Handle any remaining nodes
                nodes.forEach(node => {
                    if (!node.x || !node.y) {
                        // Check its group and position accordingly
                        switch(node.group) {
                            case 'community':
                                node.x = width * 0.75;
                                node.y = secondaryTopY + (Math.random() * 0.2 * height);
                                break;
                            case 'health':
                                node.x = width * 0.8;
                                node.y = secondaryBottomY;
                                break;
                            case 'economic':
                                node.x = width * 0.2;
                                node.y = secondaryBottomY;
                                break;
                            default:
                                // Random position as fallback
                                node.x = margin + (Math.random() * usableWidth);
                                node.y = flowY + (Math.random() * 0.3 * height) - 0.15 * height;
                        }
                    }
                });

                // Update the positions of all nodes and links
                updatePositions();
            }

            // Update positions based on current layout
            function updatePositions() {
                // Update link positions based on current node positions
                link
                    .attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);

                // Update node positions
                nodeGroup
                    .attr("transform", d => `translate(${d.x},${d.y})`);
            }

            // Update nodeClicked function with custom mind map layout (no d3.tree)
            function nodeClicked(event, d) {
                // Special case for progressive reveal
                if (d.id === 'environment' && !isJourneyExpanded) {
                    expandFoodJourney(d);
                    event.stopPropagation();
                    return;
                }
                
                // Regular node click behavior continues below
                // Clear any existing mind map elements first
                zoomContainer.selectAll(".mind-map-link, .tree-link, .example-node").remove();
                
                const isRegenActive = regenToggle.checked;
                const isNegativeView = currentView === 'negative';
                currentlySelectedNodeData = d;

                const detailText = (isRegenActive && d.regen_details) ? d.regen_details : d.details;
                const headerText = (isRegenActive && d.isRegenModified) ? `${d.label} [Regen Focus]` : d.label;
                detailsPanel.innerHTML = `<h3><i class=\"fas ${getIconClass(d.icon)}\"></i> ${headerText}</h3><p>${detailText}</p>`;

                if (currentlySelectedNodeElement) {
                    currentlySelectedNodeElement.classed('selected', false);
                }
                currentlySelectedNodeElement = d3.select(event.currentTarget.parentNode);
                currentlySelectedNodeElement.classed('selected', true);
                
                // Stop animations when a node is selected
                updateAnimationState(true);

                // Identify connected nodes and links
                const connectedNodes = new Set([d]);
                
                // Use a Map to track unique links by node pair to prevent duplicates
                const uniqueLinksMap = new Map();
                
                // Process links and create a deduplicated list
                links.forEach(link => {
                    // In negative view, include 'problem' links; otherwise, only normal types
                    if (
                      (link.source === d || link.target === d) &&
                      (isNegativeView ? ["flow","influence","waste","problem"].includes(link.type) : ["flow","influence","waste"].includes(link.type))
                    ) {
                        const otherNode = link.source === d ? link.target : link.source;
                        connectedNodes.add(otherNode);
                        
                        // Create a unique key for this node pair, sorted to ensure consistency
                        const linkKey = [link.source.id, link.target.id].sort().join('-') + '-' + link.type;
                        
                        // Only keep the first encountered link for each unique node pair and type
                        if (!uniqueLinksMap.has(linkKey)) {
                            uniqueLinksMap.set(linkKey, link);
                        }
                    }
                });
                
                // Convert the map values to an array
                const connectedLinks = Array.from(uniqueLinksMap.values());

                // Stop the simulation completely and remove all forces
                simulation.stop();
                
                // Center coordinates
                const centerX = width / 2;
                const centerY = height / 2;
                
                // Position root node at center
                d.x = centerX;
                d.y = centerY;
                d.fx = centerX;
                d.fy = centerY;
                
                // Group connected nodes by type
                const nodesByGroup = {};
                connectedLinks.forEach(link => {
                    const connectedNode = link.source === d ? link.target : link.source;
                    const group = connectedNode.group;
                    
                    if (!nodesByGroup[group]) {
                        nodesByGroup[group] = [];
                    }
                    
                    nodesByGroup[group].push({
                        node: connectedNode,
                        link: link
                    });
                });
                
                // Sort nodes within each group
                Object.keys(nodesByGroup).forEach(group => {
                    nodesByGroup[group].sort((a, b) => a.node.id.localeCompare(b.node.id));
                });
                
                // Organize by left and right side
                const leftGroups = ["factor"];
                const rightGroups = ["subsystem"];
                
                const leftNodes = [];
                const rightNodes = [];
                
                // Separate nodes into left and right 
                Object.keys(nodesByGroup).forEach(group => {
                    const nodes = nodesByGroup[group];
                    if (leftGroups.includes(group)) {
                        leftNodes.push(...nodes);
                    } else {
                        rightNodes.push(...nodes);
                    }
                });
                
                // Custom mind map positioning parameters
                const horizontalSpacing = 350; // Distance from center (was 280)
                const verticalSpacing = 120;   // Spacing between nodes (was 100)
                
                // Position nodes on the left side
                const leftHeight = (leftNodes.length - 1) * verticalSpacing;
                leftNodes.forEach((nodeInfo, i) => {
                    const node = nodeInfo.node;
                    node.x = centerX - horizontalSpacing;
                    node.y = centerY - leftHeight/2 + i * verticalSpacing;
                    node.fx = node.x;
                    node.fy = node.y;
                });
                
                // Position nodes on the right side
                const rightHeight = (rightNodes.length - 1) * verticalSpacing;
                rightNodes.forEach((nodeInfo, i) => {
                    const node = nodeInfo.node;
                    node.x = centerX + horizontalSpacing;
                    node.y = centerY - rightHeight/2 + i * verticalSpacing;
                    node.fx = node.x;
                    node.fy = node.y;
                });
                
                // Update visible nodes - completely hide non-connected nodes
                nodeGroup
                    .transition()
                    .duration(200)
                    .style("opacity", node => connectedNodes.has(node) ? 1 : 0) // Set opacity to 0 for non-connected nodes
                    .style("pointer-events", node => connectedNodes.has(node) ? "auto" : "none"); // Disable interaction with hidden nodes
                    
                // Update node positions with animation
                nodeGroup
                    .transition()
                    .duration(800)
                    .ease(d3.easeElasticOut)
                    .attr("transform", d => `translate(${d.x},${d.y})`);
                
                // Create separate layers for mind map elements to control z-index
                // First create links layer (bottom layer)
                const mindMapLinksLayer = zoomContainer.append("g")
                    .attr("class", "mind-map-links-layer");
                    
                // Then create examples layer (middle layer)
                const examplesLayer = zoomContainer.append("g")
                    .attr("class", "examples-layer");
                    
                // Move nodes layer to top
                nodesLayer.raise();
                
                // Create curved links between nodes
                const renderedLinks = new Set();
                connectedLinks.forEach(link => {
                    const source = link.source === d ? d : link.source;
                    const target = link.source === d ? link.target : link.source;
                    
                    // Create a unique key for this link
                    const linkKey = [source.id, target.id].sort().join('-') + '-' + link.type;
                    
                    // Only render each link once
                    if (renderedLinks.has(linkKey)) return;
                    renderedLinks.add(linkKey);
                    
                    // Create curved path
                    const sourceX = source.x;
                    const sourceY = source.y;
                    const targetX = target.x;
                    const targetY = target.y;
                    
                    const linkGenerator = d3.linkHorizontal()
                        .x(d => d.x)
                        .y(d => d.y);
                    
                    const pathData = linkGenerator({
                        source: {x: sourceX, y: sourceY},
                        target: {x: targetX, y: targetY}
                    });
                    
                    // Add the link to the mind map links layer
                    mindMapLinksLayer.append("path")
                        .attr("class", `mind-map-link ${link.type}${link.type === 'problem' ? ' problem-link' : ''}`)
                        .attr("d", pathData)
                        .style("fill", "none")
                        .style("stroke", link.type === "problem" ? "#e74c3c" : link.isRegenHighlight ? "#27ae60" : 
                                       link.type === "flow" ? "#555" : 
                                       link.type === "waste" ? "#e74c3c" : "#aaa")
                        .style("stroke-width", link.type === "problem" ? "2.5px" : link.type === "influence" ? "1.5px" : "2px")
                        .style("stroke-dasharray", link.type === "problem" ? "8,4" : link.type === "influence" || link.type === "waste" ? "5,5" : "none")
                        .style("opacity", 0)
                        .transition()
                        .duration(500)
                        .style("opacity", 1);
                });
                
                // Create example nodes as small nodes off the main nodes
                const exampleSpacing = 150; // Increased distance from parent node (was 120)
                const exampleVerticalOffset = 50;  // Increased vertical offset for alternating positions (was 40)
                
                // Track created examples to prevent duplicates
                const createdExamples = new Set();
                
                // Create examples for left nodes
                leftNodes.forEach((nodeInfo, i) => {
                    if (!nodeInfo.link.examples || nodeInfo.link.examples.length === 0) return;
                    
                    const node = nodeInfo.node;
                    
                    // Get examples (limit to 3 for space)
                    const examples = nodeInfo.link.examples.slice(0, 3);
                    
                    // Calculate positions around the node in an arc
                    const totalExamples = examples.length;
                    const arcSpread = 25; // Degrees of arc (reduced from 45)
                    const startAngle = 180 - (arcSpread / 2); // Start from left side, horizontal
                    const radius = exampleSpacing;
                    
                    examples.forEach((example, j) => {
                        const exampleId = `example-${node.id}-${j}-${nodeInfo.link.type}`;
                        
                        // Skip if we've already created this example
                        if (createdExamples.has(exampleId)) return;
                        createdExamples.add(exampleId);
                        
                        // Calculate position in an arc to the left of the node
                        const angle = startAngle + (j * arcSpread / (totalExamples - 1 || 1));
                        const radians = angle * Math.PI / 180;
                        const x = node.x + (radius * Math.cos(radians));
                        const y = node.y + (radius * Math.sin(radians));
                        
                        // Create the example node
                        createExampleNode(
                            exampleId, 
                            x, y, 
                            example, 
                            nodeInfo.link.type, 
                            nodeInfo.link.isRegenHighlight,
                            'left' // Left side alignment
                        );
                        
                        // Create a link between the node and its example
                        // Use straight line for middle node when there are 3 examples
                        const useStraightLine = (totalExamples === 3 && j === 1);
                        
                        if (useStraightLine) {
                            createStraightLink(
                                node.x, node.y,
                                x, y,
                                nodeInfo.link.type,
                                nodeInfo.link.isRegenHighlight,
                                "tree-link"
                            );
                        } else {
                            createCurvedLink(
                                node.x, node.y,
                                x, y,
                                nodeInfo.link.type,
                                nodeInfo.link.isRegenHighlight,
                                "tree-link"
                            );
                        }
                    });
                });
                
                // Create examples for right nodes
                rightNodes.forEach((nodeInfo, i) => {
                    if (!nodeInfo.link.examples || nodeInfo.link.examples.length === 0) return;
                    
                    const node = nodeInfo.node;
                    
                    // Get examples (limit to 3 for space)
                    const examples = nodeInfo.link.examples.slice(0, 3);
                    
                    // Calculate positions around the node in an arc
                    const totalExamples = examples.length;
                    const arcSpread = 25; // Degrees of arc (reduced from 45)
                    const startAngle = 0 - (arcSpread / 2); // Start from right side, horizontal
                    const radius = exampleSpacing;
                    
                    examples.forEach((example, j) => {
                        const exampleId = `example-${node.id}-${j}-${nodeInfo.link.type}`;
                        
                        // Skip if we've already created this example
                        if (createdExamples.has(exampleId)) return;
                        createdExamples.add(exampleId);
                        
                        // Calculate position in an arc to the right of the node
                        const angle = startAngle + (j * arcSpread / (totalExamples - 1 || 1));
                        const radians = angle * Math.PI / 180;
                        const x = node.x + (radius * Math.cos(radians));
                        const y = node.y + (radius * Math.sin(radians));
                        
                        // Create the example node
                        createExampleNode(
                            exampleId, 
                            x, y, 
                            example, 
                            nodeInfo.link.type, 
                            nodeInfo.link.isRegenHighlight,
                            'right' // Right side alignment
                        );
                        
                        // Create a link between the node and its example
                        // Use straight line for middle node when there are 3 examples
                        const useStraightLine = (totalExamples === 3 && j === 1);
                        
                        if (useStraightLine) {
                            createStraightLink(
                                node.x, node.y,
                                x, y,
                                nodeInfo.link.type,
                                nodeInfo.link.isRegenHighlight,
                                "tree-link"
                            );
                        } else {
                            createCurvedLink(
                                node.x, node.y,
                                x, y,
                                nodeInfo.link.type,
                                nodeInfo.link.isRegenHighlight,
                                "tree-link"
                            );
                        }
                    });
                });
                
                // Helper function to create example nodes in the examples layer
                function createExampleNode(id, x, y, text, linkType, isRegenHighlight, alignment) {
                    const exampleGroup = examplesLayer.append("g")
                        .attr("class", "example-node")
                        .attr("transform", `translate(${x},${y})`)
                        .style("opacity", 0);
                        
                    // Calculate text dimensions
                    const textWidth = text.length * 6; // Increased from 5.5 to 7px per character
                    const boxWidth = Math.max(textWidth, 100); // Increased minimum width from 80 to 100
                    const boxHeight = 24; // Fixed height
                    const boxRadius = 4; // Corner radius
                    
                    // Determine text anchor and box position based on alignment
                    const textAnchor = alignment === 'left' ? 'end' : 'start';
                    const boxX = alignment === 'left' ? -boxWidth : 0;
                    
                    // Add a rounded rectangle
                    exampleGroup.append("rect")
                        .attr("class", "example-box")
                        .attr("x", boxX)
                        .attr("y", -boxHeight/2)
                        .attr("width", boxWidth)
                        .attr("height", boxHeight)
                        .attr("rx", boxRadius)
                        .attr("ry", boxRadius)
                        .style("fill", "#f9f9f9")
                        .style("stroke", linkType === "flow" ? "#555" : 
                                       linkType === "waste" ? "#e74c3c" : "#aaa")
                        .style("stroke-width", "1px")
                        .style("filter", "drop-shadow(0px 2px 2px rgba(0,0,0,0.1))");
                        
                    // Add the example text
                    exampleGroup.append("text")
                        .attr("class", "example-text")
                        .attr("text-anchor", textAnchor)
                        .attr("x", alignment === 'left' ? -10 : 10) // Padding from edge
                        .attr("dy", "0.35em")
                        .style("font-size", "11px")
                        .style("fill", "#333")
                        .text(text);
                        
                    // Animate the node
                    exampleGroup.transition()
                        .duration(500)
                        .delay(200)
                        .style("opacity", 1);
                }
                
                // Helper function to create curved links in the links layer
                function createCurvedLink(x1, y1, x2, y2, linkType, isRegenHighlight, className) {
                    const linkGenerator = d3.linkHorizontal()
                        .x(d => d.x)
                        .y(d => d.y);
                    
                    const pathData = linkGenerator({
                        source: {x: x1, y: y1},
                        target: {x: x2, y: y2}
                    });
                    
                    // Add the link to the mind map links layer
                    mindMapLinksLayer.append("path")
                        .attr("class", className)
                        .attr("d", pathData)
                        .style("fill", "none")
                        .style("stroke", isRegenHighlight ? "#27ae60" : 
                                       linkType === "flow" ? "#555" : 
                                       linkType === "waste" ? "#e74c3c" : "#aaa")
                        .style("stroke-width", "1px")
                        .style("stroke-dasharray", linkType === "influence" || linkType === "waste" ? "5,5" : "none")
                        .style("opacity", 0)
                        .transition()
                        .duration(500)
                        .style("opacity", 1);
                }
                
                // Helper function to create straight links
                function createStraightLink(x1, y1, x2, y2, linkType, isRegenHighlight, className) {
                    // Add the link to the mind map links layer
                    mindMapLinksLayer.append("line")
                        .attr("class", className)
                        .attr("x1", x1)
                        .attr("y1", y1)
                        .attr("x2", x2)
                        .attr("y2", y2)
                        .style("fill", "none")
                        .style("stroke", isRegenHighlight ? "#27ae60" : 
                                       linkType === "flow" ? "#555" : 
                                       linkType === "waste" ? "#e74c3c" : "#aaa")
                        .style("stroke-width", "1px")
                        .style("stroke-dasharray", linkType === "influence" || linkType === "waste" ? "5,5" : "none")
                        .style("opacity", 0)
                        .transition()
                        .duration(500)
                        .style("opacity", 1);
                }
                
                // Highlight the main food flow path
                const mainFlowPath = ['environment', 'production', 'packhouses', 'processing', 'distribution', 'wholesalers', 'supermarkets', 'consumption'];
                
                // Mark links that are part of the main flow
                link.classed("main-flow", function(d) {
                    const sourceId = d.source.id;
                    const targetId = d.target.id;
                    
                    // Check if this link connects two consecutive nodes in the main flow path
                    for (let i = 0; i < mainFlowPath.length - 1; i++) {
                        if (sourceId === mainFlowPath[i] && targetId === mainFlowPath[i+1]) {
                            return true;
                        }
                    }
                    return false;
                });
                
                // Hide all the normal links
                link
                    .transition()
                    .duration(200)
                    .style("opacity", 0);
                    
                // Automatic zoom to fit the tree
                svg.transition()
                    .duration(750)
                    .call(d3.zoom().transform, 
                          d3.zoomIdentity
                            .translate(width/2, height/2)
                            .scale(0.85)
                            .translate(-centerX, -centerY));
                
                event.stopPropagation();
            }
            
            // Function to expand the food journey when environment is clicked
            function expandFoodJourney(startNode) {
                // Set of nodes to reveal in first stage, starting with environment
                const firstStageNodes = ['environment'];
                
                // Find nodes directly connected to environment
                const connectedNodes = findConnectedNodes(['environment']);
                
                // Add the core connected nodes for this stage
                const coreStageNodes = ['inputs', 'production', 'fertilizer_industry', 'pest_management'];
                coreStageNodes.forEach(nodeId => {
                    if (connectedNodes.has(nodeId)) {
                        firstStageNodes.push(nodeId);
                    }
                });
                
                // Expand the set of visible nodes
                expandedNodes = new Set(firstStageNodes);
                
                // Position nodes for the first stage
                const flowY = height * 0.5;  // Main flow line y-position
                const margin = width * 0.1;  // Margin from edges
                const usableWidth = width - (margin * 2);
                
                // Position environment at the far left
                const envNode = nodes.find(n => n.id === 'environment');
                if (envNode) {
                    envNode.x = margin;
                    envNode.y = flowY;
                }
                
                // Position other nodes if they're connected
                const prodNode = nodes.find(n => n.id === 'production');
                if (prodNode && expandedNodes.has('production')) {
                    prodNode.x = margin + usableWidth * 0.2;
                    prodNode.y = flowY;
                }
                
                const inputsNode = nodes.find(n => n.id === 'inputs');
                if (inputsNode && expandedNodes.has('inputs')) {
                    inputsNode.x = margin + usableWidth * 0.2;
                    inputsNode.y = flowY - 80;
                }
                
                const fertilizerNode = nodes.find(n => n.id === 'fertilizer_industry');
                if (fertilizerNode && expandedNodes.has('fertilizer_industry')) {
                    fertilizerNode.x = margin + usableWidth * 0.1;
                    fertilizerNode.y = flowY + 80;
                }
                
                const pestNode = nodes.find(n => n.id === 'pest_management');
                if (pestNode && expandedNodes.has('pest_management')) {
                    pestNode.x = margin + usableWidth * 0.3;
                    pestNode.y = flowY + 80;
                }
                
                // Update positions
                updatePositions();
                
                // Show only these nodes
                nodeGroup.transition()
                         .duration(500)
                         .style("opacity", d => expandedNodes.has(d.id) ? 1 : 0)
                         .style("pointer-events", d => expandedNodes.has(d.id) ? "auto" : "none");
                
                // Show links between visible nodes
                link.transition()
                    .duration(500)
                    .style("opacity", d => {
                        if (expandedNodes.has(d.source.id) && expandedNodes.has(d.target.id)) {
                            return d.type === 'flow' ? 0.95 : 0.6;
                        }
                        return 0;
                    })
                    .style("pointer-events", d => {
                        if (expandedNodes.has(d.source.id) && expandedNodes.has(d.target.id)) {
                            return "auto";
                        }
                        return "none";
                    });
                
                // Update path guide
                pathGuide.select("p").text("Beginning of food journey revealed. Click any node to see details or click background to continue.");
                
                // Update flag
                isJourneyExpanded = true;
                
                // Add a "Continue Journey" button to reveal more nodes
                const continueButton = d3.select(container)
                    .append("button")
                    .attr("class", "continue-journey-btn")
                    .text("Continue Journey")
                    .style("position", "absolute")
                    .style("bottom", "100px")
                    .style("right", "20px")
                    .style("padding", "10px 15px")
                    .style("background-color", "#2c5282")
                    .style("color", "white")
                    .style("border", "none")
                    .style("border-radius", "4px")
                    .style("cursor", "pointer")
                    .style("font-size", "14px")
                    .style("z-index", "500")
                    .on("click", continueFoodJourney);
            }
            
            // Helper function to find nodes connected to a set of starting nodes
            function findConnectedNodes(startNodeIds) {
                const connectedNodeIds = new Set(startNodeIds);
                
                // Check all links
                links.forEach(link => {
                    // If the source is in our set, add the target
                    if (connectedNodeIds.has(link.source.id)) {
                        connectedNodeIds.add(link.target.id);
                    }
                    // If the target is in our set, add the source
                    if (connectedNodeIds.has(link.target.id)) {
                        connectedNodeIds.add(link.source.id);
                    }
                });
                
                return connectedNodeIds;
            }
            
            // Function to continue expanding the food journey
            function continueFoodJourney() {
                // Basic layout constants
                const flowY = height * 0.5;   // Main flow line
                const margin = width * 0.05;  // Margin from edges
                const usableWidth = width - (margin * 2);
                
                // Define the core nodes for each progressive stage
                const journeyStages = [
                    // Stage 1: Environment and Production
                    {
                        coreNodes: ['environment', 'inputs', 'production', 'fertilizer_industry', 'pest_management'],
                        positions: {
                            'environment': { x: margin, y: flowY },
                            'production': { x: margin + usableWidth * 0.2, y: flowY },
                            'inputs': { x: margin + usableWidth * 0.2, y: flowY - 80 },
                            'fertilizer_industry': { x: margin + usableWidth * 0.1, y: flowY + 80 },
                            'pest_management': { x: margin + usableWidth * 0.3, y: flowY + 80 }
                        }
                    },
                    // Stage 2: Add Packhouses and Processing
                    {
                        coreNodes: ['environment', 'inputs', 'production', 'fertilizer_industry', 'pest_management', 
                                'packhouses', 'processing'],
                        positions: {
                            'environment': { x: margin, y: flowY },
                            'production': { x: margin + usableWidth * 0.15, y: flowY },
                            'inputs': { x: margin + usableWidth * 0.15, y: flowY - 80 },
                            'fertilizer_industry': { x: margin + usableWidth * 0.07, y: flowY + 80 },
                            'pest_management': { x: margin + usableWidth * 0.22, y: flowY + 80 },
                            'packhouses': { x: margin + usableWidth * 0.3, y: flowY },
                            'processing': { x: margin + usableWidth * 0.45, y: flowY }
                        }
                    },
                    // Stage 3: Add Distribution, Imports, Exports
                    {
                        coreNodes: ['environment', 'inputs', 'production', 'fertilizer_industry', 'pest_management', 
                                'packhouses', 'processing', 'distribution', 'imports', 'exports'],
                        positions: {
                            'environment': { x: margin, y: flowY },
                            'production': { x: margin + usableWidth * 0.13, y: flowY },
                            'inputs': { x: margin + usableWidth * 0.13, y: flowY - 80 },
                            'fertilizer_industry': { x: margin + usableWidth * 0.06, y: flowY + 80 },
                            'pest_management': { x: margin + usableWidth * 0.2, y: flowY + 80 },
                            'packhouses': { x: margin + usableWidth * 0.26, y: flowY },
                            'processing': { x: margin + usableWidth * 0.39, y: flowY },
                            'distribution': { x: margin + usableWidth * 0.52, y: flowY },
                            'imports': { x: margin + usableWidth * 0.52, y: flowY - 80 },
                            'exports': { x: margin + usableWidth * 0.52, y: flowY + 80 }
                        }
                    },
                    // Stage 4: Add Wholesalers, Food Rescue, School Programs
                    {
                        coreNodes: ['environment', 'inputs', 'production', 'fertilizer_industry', 'pest_management', 
                                'packhouses', 'processing', 'distribution', 'imports', 'exports',
                                'wholesalers', 'food_rescue', 'school_food_programs'],
                        positions: {
                            'environment': { x: margin, y: flowY },
                            'production': { x: margin + usableWidth * 0.12, y: flowY },
                            'inputs': { x: margin + usableWidth * 0.12, y: flowY - 80 },
                            'fertilizer_industry': { x: margin + usableWidth * 0.06, y: flowY + 80 },
                            'pest_management': { x: margin + usableWidth * 0.18, y: flowY + 80 },
                            'packhouses': { x: margin + usableWidth * 0.24, y: flowY },
                            'processing': { x: margin + usableWidth * 0.36, y: flowY },
                            'distribution': { x: margin + usableWidth * 0.48, y: flowY },
                            'imports': { x: margin + usableWidth * 0.48, y: flowY - 80 },
                            'exports': { x: margin + usableWidth * 0.48, y: flowY + 80 },
                            'wholesalers': { x: margin + usableWidth * 0.60, y: flowY },
                            'food_rescue': { x: margin + usableWidth * 0.72, y: flowY - 80 },
                            'school_food_programs': { x: margin + usableWidth * 0.72, y: flowY + 80 }
                        }
                    },
                    // Stage 5: Add Retail (Supermarkets, Grocers, Markets, Food Service)
                    {
                        coreNodes: ['environment', 'inputs', 'production', 'fertilizer_industry', 'pest_management', 
                                'packhouses', 'processing', 'distribution', 'imports', 'exports',
                                'wholesalers', 'food_rescue', 'school_food_programs',
                                'supermarkets', 'grocers', 'markets', 'food_service', 'restaurants'],
                        positions: {
                            'environment': { x: margin, y: flowY },
                            'production': { x: margin + usableWidth * 0.11, y: flowY },
                            'inputs': { x: margin + usableWidth * 0.11, y: flowY - 80 },
                            'fertilizer_industry': { x: margin + usableWidth * 0.055, y: flowY + 80 },
                            'pest_management': { x: margin + usableWidth * 0.165, y: flowY + 80 },
                            'packhouses': { x: margin + usableWidth * 0.22, y: flowY },
                            'processing': { x: margin + usableWidth * 0.33, y: flowY },
                            'distribution': { x: margin + usableWidth * 0.44, y: flowY },
                            'imports': { x: margin + usableWidth * 0.44, y: flowY - 80 },
                            'exports': { x: margin + usableWidth * 0.44, y: flowY + 80 },
                            'wholesalers': { x: margin + usableWidth * 0.55, y: flowY },
                            'food_rescue': { x: margin + usableWidth * 0.66, y: flowY - 80 },
                            'school_food_programs': { x: margin + usableWidth * 0.66, y: flowY + 80 },
                            'supermarkets': { x: margin + usableWidth * 0.77, y: flowY },
                            'grocers': { x: margin + usableWidth * 0.77, y: flowY + 80 },
                            'markets': { x: margin + usableWidth * 0.77, y: flowY - 80 },
                            'food_service': { x: margin + usableWidth * 0.77, y: flowY + 160 },
                            'restaurants': { x: margin + usableWidth * 0.77, y: flowY + 160 }
                        }
                    },
                    // Stage 6: Complete with Consumption
                    {
                        coreNodes: ['environment', 'inputs', 'production', 'fertilizer_industry', 'pest_management', 
                                'packhouses', 'processing', 'distribution', 'imports', 'exports',
                                'wholesalers', 'food_rescue', 'school_food_programs',
                                'supermarkets', 'grocers', 'markets', 'food_service', 'restaurants', 'consumption'],
                        positions: {
                            'environment': { x: margin, y: flowY },
                            'production': { x: margin + usableWidth * 0.1, y: flowY },
                            'inputs': { x: margin + usableWidth * 0.1, y: flowY - 80 },
                            'fertilizer_industry': { x: margin + usableWidth * 0.05, y: flowY + 80 },
                            'pest_management': { x: margin + usableWidth * 0.15, y: flowY + 80 },
                            'packhouses': { x: margin + usableWidth * 0.2, y: flowY },
                            'processing': { x: margin + usableWidth * 0.3, y: flowY },
                            'distribution': { x: margin + usableWidth * 0.4, y: flowY },
                            'imports': { x: margin + usableWidth * 0.4, y: flowY - 80 },
                            'exports': { x: margin + usableWidth * 0.4, y: flowY + 80 },
                            'wholesalers': { x: margin + usableWidth * 0.5, y: flowY },
                            'food_rescue': { x: margin + usableWidth * 0.6, y: flowY - 80 },
                            'school_food_programs': { x: margin + usableWidth * 0.6, y: flowY + 80 },
                            'supermarkets': { x: margin + usableWidth * 0.7, y: flowY },
                            'grocers': { x: margin + usableWidth * 0.7, y: flowY + 80 },
                            'markets': { x: margin + usableWidth * 0.7, y: flowY - 80 },
                            'food_service': { x: margin + usableWidth * 0.7, y: flowY + 160 },
                            'restaurants': { x: margin + usableWidth * 0.7, y: flowY + 160 },
                            'consumption': { x: margin + usableWidth * 0.9, y: flowY }
                        }
                    },
                    // Stage 7: Show all nodes (including factors, waste, etc.)
                    {
                        coreNodes: nodes.map(node => node.id),
                        positions: null // Will use setInitialPositions for the full view
                    }
                ];
                
                // Find the current stage
                let currentStageIndex = -1;
                let currentStageNodes = new Set();
                
                // Determine current stage by checking which core nodes are visible
                for (let i = 0; i < journeyStages.length; i++) {
                    const stageCoreNodes = new Set(journeyStages[i].coreNodes);
                    let isCurrentStage = true;
                    
                    // Check if our visible nodes include all core nodes from this stage
                    for (const nodeId of stageCoreNodes) {
                        if (!expandedNodes.has(nodeId)) {
                            isCurrentStage = false;
                            break;
                        }
                    }
                    
                    // Also check if we have any additional nodes that aren't in the next stage
                    if (isCurrentStage) {
                        currentStageIndex = i;
                        currentStageNodes = stageCoreNodes;
                        break;
                    }
                }
                
                // Move to the next stage or reset
                const nextStageIndex = (currentStageIndex + 1) % journeyStages.length;
                const nextStage = journeyStages[nextStageIndex];
                
                // Get the core nodes for the next stage
                const nextCoreCoreNodes = new Set(nextStage.coreNodes);
                
                // Find all nodes that are connected to the core nodes in the next stage
                const allConnectedNodes = findConnectedNodes(nextStage.coreNodes);
                
                // Build the final set of nodes to show: core nodes + connected nodes
                expandedNodes = new Set([...nextCoreCoreNodes, ...allConnectedNodes]);
                
                // Position nodes for this stage
                if (nextStage.positions) {
                    // Use the defined positions for this stage (for core nodes)
                    nodes.forEach(node => {
                        const position = nextStage.positions[node.id];
                        if (position) {
                            node.x = position.x;
                            node.y = position.y;
                        } else if (expandedNodes.has(node.id)) {
                            // If this is a connected node but not a core node, position it randomly
                            // near the core node it's connected to
                            const connectedTo = findNodeConnections(node.id);
                            if (connectedTo.size > 0) {
                                // Take first connection that's a core node
                                for (const connId of connectedTo) {
                                    if (nextStage.positions[connId]) {
                                        const basePos = nextStage.positions[connId];
                                        node.x = basePos.x + (Math.random() - 0.5) * 100;
                                        node.y = basePos.y + (Math.random() - 0.5) * 100;
                                        break;
                                    }
                                }
                            }
                        }
                    });
                } else {
                    // For the final stage, use the standard positioning function
                    setInitialPositions();
                }
                
                // Update node positions
                updatePositions();
                
                // Show only these nodes
                nodeGroup.transition()
                         .duration(800)
                         .style("opacity", d => expandedNodes.has(d.id) ? 1 : 0)
                         .style("pointer-events", d => expandedNodes.has(d.id) ? "auto" : "none");
                
                // Show links between visible nodes
                link.transition()
                    .duration(800)
                    .style("opacity", d => {
                        if (expandedNodes.has(d.source.id) && expandedNodes.has(d.target.id)) {
                            return d.type === 'flow' ? 0.95 : 0.6;
                        }
                        return 0;
                    })
                    .style("pointer-events", d => {
                        if (expandedNodes.has(d.source.id) && expandedNodes.has(d.target.id)) {
                            return "auto";
                        }
                        return "none";
                    });
                
                // Update continue button text based on stage
                if (nextStageIndex === journeyStages.length - 1) {
                    d3.select(".continue-journey-btn").text("Reset Journey");
                    pathGuide.select("p").text("Full food system revealed. Click 'Reset Journey' to start over.");
                } else {
                    d3.select(".continue-journey-btn").text("Continue Journey");
                    pathGuide.select("p").text(`Stage ${nextStageIndex + 1} of ${journeyStages.length - 1} revealed. Click 'Continue Journey' to see more.`);
                }
            }
            
            // Helper function to find nodes that are directly connected to a specific node
            function findNodeConnections(nodeId) {
                const connectedNodes = new Set();
                
                links.forEach(link => {
                    if (link.source.id === nodeId) {
                        connectedNodes.add(link.target.id);
                    }
                    if (link.target.id === nodeId) {
                        connectedNodes.add(link.source.id);
                    }
                });
                
                return connectedNodes;
            }
            
            // Initialize the visualization showing only the environment node first
            initializeJourney();
            
            // --- Regen Toggle Logic ---
            function applyRegenStyles(isActive) {
                // First change the colors of appropriate nodes
                d3.selectAll('.node-group')
                    .classed('regen-modified', d => isActive && d.isRegenModified);
                
                // Then change the style of appropriate links
                d3.selectAll('.link')
                    .classed('regen-highlight', d => isActive && d.isRegenHighlight);
                
                // Change node details if applicable
                if (currentlySelectedNodeData && currentlySelectedNodeData.isRegenModified) {
                    updateNodeDetails(currentlySelectedNodeData);
                }
            }

            regenToggle.addEventListener('change', (event) => {
                applyRegenStyles(event.target.checked);
            });

            // Helper to map unicode to Font Awesome class
            function getIconClass(unicode) {
                const map = {
                  '\uf085': 'fa-cogs', '\uf722': 'fa-tractor', '\uf275': 'fa-industry',
                  '\uf0d1': 'fa-truck', '\uf54e': 'fa-store', '\uf2e7': 'fa-utensils',
                  '\uf1b8': 'fa-recycle', '\uf66f': 'fa-landmark', '\uf201': 'fa-chart-line',
                  '\uf06c': 'fa-leaf', '\uf0c0': 'fa-users', '\uf2db': 'fa-microchip',
                  '\uf3ed': 'fa-shield-virus'
                };
                return map[unicode] || 'fa-question-circle';
            }

            // View mode logic
            let currentView = 'default';
            function applyViewMode(view) {
                currentView = view;
                // Remove selected class from all buttons
                document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('selected'));
                // Add selected class to the active button
                document.querySelector(`.view-btn[data-view="${view}"]`).classList.add('selected');

                if (view === 'regen') {
                    applyRegenStyles(true);
                    // Optionally, dim non-regen nodes/links
                    d3.selectAll('.node-group').style('opacity', d => d.isRegenModified ? 1 : 0.3);
                    d3.selectAll('.link').style('opacity', d => d.isRegenHighlight ? 1 : 0.3);
                } else if (view === 'negative') {
                    // Highlight negative effects (e.g., waste flows)
                    d3.selectAll('.node-group').style('opacity', 1);
                    d3.selectAll('.link').style('opacity', d => d.type === 'waste' ? 1 : 0.3);
                } else {
                    // Default view
                    applyRegenStyles(false);
                    d3.selectAll('.node-group').style('opacity', 1);
                    d3.selectAll('.link').style('opacity', 1);
                }
            }
            // Attach event listeners to view buttons
            document.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', () => applyViewMode(btn.getAttribute('data-view')));
            });
            // Set default view on load
            applyViewMode('default');
            
            // Initialize non-core nodes visibility based on toggle state
            console.log('Starting with non-core nodes:', noncoreToggle.checked ? 'visible' : 'hidden');
            
            // Log ALL node groups to ensure complete categorization
            console.log('Analyzing all node categories in the visualization:');
            const allNodeGroups = new Set();
            const groupCountDetails = {};
            
            d3.selectAll('.node-group').each(function(d) {
                if (d && d.group) {
                    // Add to unique groups set
                    allNodeGroups.add(d.group);
                    
                    // Count nodes per group
                    groupCountDetails[d.group] = (groupCountDetails[d.group] || 0) + 1;
                } else {
                    console.warn('Found node without group:', d);
                }
            });
            
            console.log('All node groups present in data:', Array.from(allNodeGroups));
            console.log('Node counts per group:', groupCountDetails);
            
            toggleNonCoreNodes(noncoreToggle.checked);
            
            // Set up category toggles
            setupCategoryToggles();

            // Function to update the animation state
            function updateAnimationState(isNodeSelected) {
                link.classed("animated", !isNodeSelected)
                   .style("animation", d => {
                       if (isNodeSelected) return 'none';
                       if (d.type === 'flow') {
                           return 'flowAnimation 1.5s linear infinite';
                       } else if (d.type === 'waste') {
                           return 'wasteFlowAnimation 2s linear infinite';
                       } else if (d.type === 'recycle' || (d.type === 'influence' && d.isReturn)) {
                           return 'recycleAnimation 2s linear infinite';
                       }
                       return 'none';
                   });
            }

            // Function to set up category toggles
            function setupCategoryToggles() {
                const categoryCheckboxes = document.querySelectorAll('.category-checkbox');
                const toggleAllCheckbox = document.getElementById('toggle-all-categories');
                
                // Display initial state of categories
                console.log('Setting up category toggles with initial states:');
                
                // Create a lookup of node groups for quick reference
                const nodeGroups = new Set();
                d3.selectAll('.node-group').each(function(d) {
                    if (d && d.group) {
                        nodeGroups.add(d.group);
                    }
                });
                
                console.log('Available node groups in data:', Array.from(nodeGroups));
                
                // Check for any missing categories
                const toggleContainer = document.querySelector('.category-toggles .category-group:last-child');
                const existingCategories = new Set();
                
                // Get existing categories
                categoryCheckboxes.forEach(checkbox => {
                    existingCategories.add(checkbox.getAttribute('data-category'));
                });
                
                // Add any missing categories
                nodeGroups.forEach(group => {
                    if (!existingCategories.has(group)) {
                        console.log(`Adding missing category toggle for: ${group}`);
                        
                        // Create new toggle element
                        const newToggle = document.createElement('label');
                        newToggle.className = 'category-toggle';
                        
                        // Create checkbox
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.className = 'category-checkbox';
                        checkbox.setAttribute('data-category', group);
                        checkbox.checked = true;
                        
                        // Create label
                        const label = document.createElement('span');
                        label.className = `category-label ${group}`;
                        label.textContent = group.charAt(0).toUpperCase() + group.slice(1).replace('_', ' ');
                        
                        // Assemble and add to DOM
                        newToggle.appendChild(checkbox);
                        newToggle.appendChild(label);
                        toggleContainer.appendChild(newToggle);
                        
                        // Add to existingCategories
                        existingCategories.add(group);
                    }
                });
                
                // Find all category checkboxes (including any newly added ones)
                const allCategoryCheckboxes = document.querySelectorAll('.category-checkbox');
                
                // Set up toggle all functionality
                if (toggleAllCheckbox) {
                    toggleAllCheckbox.addEventListener('change', function() {
                        const isChecked = this.checked;
                        console.log(`Toggle all categories: ${isChecked ? 'showing' : 'hiding'}`);
                        
                        // Update all checkboxes
                        allCategoryCheckboxes.forEach(checkbox => {
                            // Only change if current state is different
                            if (checkbox.checked !== isChecked) {
                                checkbox.checked = isChecked;
                                
                                // Trigger visibility update
                                const category = checkbox.getAttribute('data-category');
                                toggleCategoryVisibility(category, isChecked);
                            }
                        });
                    });
                    
                    // Add event listeners to update the "toggle all" checkbox
                    let updateToggleAllState = function() {
                        // Check if all category checkboxes are checked
                        const allChecked = Array.from(allCategoryCheckboxes).every(checkbox => checkbox.checked);
                        const allUnchecked = Array.from(allCategoryCheckboxes).every(checkbox => !checkbox.checked);
                        
                        // Update the toggle all checkbox without triggering its change event
                        if (allChecked) {
                            toggleAllCheckbox.checked = true;
                            toggleAllCheckbox.indeterminate = false;
                        } else if (allUnchecked) {
                            toggleAllCheckbox.checked = false;
                            toggleAllCheckbox.indeterminate = false;
                        } else {
                            toggleAllCheckbox.indeterminate = true;
                        }
                    };
                }
                
                // Apply initial state based on checkbox state
                allCategoryCheckboxes.forEach(checkbox => {
                    const category = checkbox.getAttribute('data-category');
                    const isChecked = checkbox.checked;
                    
                    console.log(`Initial state for ${category}: ${isChecked ? 'visible' : 'hidden'}`);
                    
                    // Apply initial visibility based on checkbox state
                    if (nodeGroups.has(category)) {
                        toggleCategoryVisibility(category, isChecked);
                    } else {
                        console.warn(`Category ${category} does not exist in the data`);
                    }
                    
                    // Add event listeners to each category checkbox
                    checkbox.addEventListener('change', function() {
                        const category = this.getAttribute('data-category');
                        const isChecked = this.checked;
                        
                        console.log(`Toggling category ${category}: ${isChecked ? 'showing' : 'hiding'}`);
                        
                        // Update node visibility for this category
                        toggleCategoryVisibility(category, isChecked);
                        
                        // Update "toggle all" checkbox state if it exists
                        if (toggleAllCheckbox && typeof updateToggleAllState === 'function') {
                            updateToggleAllState();
                        }
                    });
                });
                
                // Also set up event listeners for main toggles
                regenToggle.addEventListener('change', function () {
                    applyRegenStyles(this.checked);
                });

                noncoreToggle.addEventListener('change', function () {
                    toggleNonCoreNodes(this.checked);
                });
            }
            
            // Function to toggle visibility of nodes by category
            function toggleCategoryVisibility(category, showCategory) {
                console.log(`Toggling visibility for category ${category}: ${showCategory ? 'showing' : 'hiding'}`);
                
                // Select nodes using the data-group attribute
                const categorySelector = `.node-group[data-group="${category}"]`;
                console.log('Selecting nodes with selector:', categorySelector);
                
                const categoryElements = d3.selectAll(categorySelector);
                const categoryCount = categoryElements.size();
                
                console.log(`Found ${categoryCount} nodes with data-group="${category}"`);
                
                if (categoryCount === 0) {
                    console.warn(`No nodes found for category: ${category}`);
                    return;
                }
                
                // Set both class and direct style for consistency
                categoryElements
                    .classed('hidden', !showCategory)
                    .transition()
                    .duration(300)
                    .style('opacity', showCategory ? 1 : 0)
                    .style('pointer-events', showCategory ? 'auto' : 'none');
                
                // Update link visibility
                updateLinkVisibility();
            }
            
            // Function to toggle visibility of non-core nodes
            function toggleNonCoreNodes(showNonCore) {
                console.log('Toggling non-core nodes:', showNonCore ? 'showing' : 'hiding');
                
                // Use the specific class-based selector for more reliability
                const nonCoreElements = d3.selectAll('.non-core-node');
                const nonCoreCount = nonCoreElements.size();
                const coreCount = d3.selectAll('.core-node').size();
                
                console.log(`Found ${nonCoreCount} non-core nodes and ${coreCount} core nodes`);
                
                // Toggle the hidden class on non-core nodes
                nonCoreElements
                    .classed('hidden', !showNonCore)
                    .transition()
                    .duration(300)
                    .style('opacity', showNonCore ? 1 : 0)
                    .style('pointer-events', showNonCore ? 'auto' : 'none');
                
                // Update link visibility
                updateLinkVisibility();
                
                // Re-render the simulation with new visibility
                simulation.alpha(0.3).restart();
            }

            // Update link visibility based on node visibility
            function updateLinkVisibility() {
                d3.selectAll('.link')
                    .transition()
                    .duration(300)
                    .style("opacity", function(d) {
                        const sourceNode = d3.select(`.node-group[data-id="${d.source.id}"]`);
                        const targetNode = d3.select(`.node-group[data-id="${d.target.id}"]`);
                        
                        if (sourceNode.empty() || targetNode.empty()) {
                            return 0;
                        }
                        
                        const sourceHidden = sourceNode.classed("hidden") || sourceNode.style("opacity") === "0";
                        const targetHidden = targetNode.classed("hidden") || targetNode.style("opacity") === "0";
                        
                        return (sourceHidden || targetHidden) ? 0 : 0.6;
                    })
                    .style("pointer-events", function(d) {
                        const sourceNode = d3.select(`.node-group[data-id="${d.source.id}"]`);
                        const targetNode = d3.select(`.node-group[data-id="${d.target.id}"]`);
                        
                        if (sourceNode.empty() || targetNode.empty()) {
                            return "none";
                        }
                        
                        const sourceHidden = sourceNode.classed("hidden") || sourceNode.style("opacity") === "0";
                        const targetHidden = targetNode.classed("hidden") || targetNode.style("opacity") === "0";
                        
                        return (sourceHidden || targetHidden) ? "none" : "auto";
                    });
            }

            // Handle window resize
            window.addEventListener('resize', () => {
                const newWidth = window.innerWidth;
                const newHeight = window.innerHeight;
                
                // Update SVG dimensions
                svg.attr("width", newWidth)
                   .attr("height", newHeight)
                   .attr("viewBox", [0, 0, newWidth, newHeight]);
                
                // Reposition nodes
                positionNodes(nodes, newWidth, newHeight);
                updatePositions();
            });

            // Update background click handler
            svg.on('click', (event) => {
                // Ignore the click if it's a drag end or zoom event
                if (event.defaultPrevented) return;
                
                // If we're in the journey mode and not finished, continue the journey
                if (isJourneyExpanded && expandedNodes.size < nodes.length) {
                    continueFoodJourney();
                    return;
                }
                
                // Always reset to initial layout, even if no node is selected
                if (currentlySelectedNodeElement) {
                    currentlySelectedNodeElement.classed('selected', false);
                    currentlySelectedNodeElement = null;
                    currentlySelectedNodeData = null;
                }
                detailsPanel.innerHTML = 'Select an element to see details.';
                
                // Reset to initial layout
                simulation.stop();
                nodes.forEach(node => {
                    node.fx = null;
                    node.fy = null;
                });
                setInitialPositions();
                
                // Reset all nodes to full opacity but maintain their hidden state
                nodeGroup
                    .transition()
                    .duration(200)
                    .style("opacity", function(d) {
                        // Check if the node should be hidden based on its category visibility
                        const isHidden = d3.select(this).classed("hidden");
                        return isHidden ? 0 : 1;
                    })
                    .style("pointer-events", function(d) {
                        const isHidden = d3.select(this).classed("hidden");
                        return isHidden ? "none" : "auto";
                    });

                // Remove mind map paths and example nodes
                zoomContainer.selectAll(".mind-map-link, .tree-link, .example-node")
                    .transition()
                    .duration(200)
                    .style("opacity", 0)
                    .remove();
                    
                // Reset the alreadyRendered flag on all links
                links.forEach(link => {
                    delete link.alreadyRendered;
                });
                    
                // Update link visibility based on current node visibility states
                updateLinkVisibility();
                
                // Restart animations for flow links
                updateAnimationState(false);
                
                // Zoom back out to show the full diagram
                svg.transition()
                    .duration(750)
                    .call(d3.zoom().transform, d3.zoomIdentity);
            });

            // Update drag function to work with zoom
            function drag(simulation) {
                function dragstarted(event, d) {
                    if (!event.active) simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                    event.sourceEvent.stopPropagation(); // Prevent click event after drag
                }

                function dragged(event, d) {
                    const transform = d3.zoomTransform(svg.node());
                    d.fx = transform.invertX(event.x);
                    d.fy = transform.invertY(event.y);
                }

                function dragended(event, d) {
                    if (!event.active) simulation.alphaTarget(0);
                    if (d.id !== currentlySelectedNodeData?.id) {
                        d.fx = null;
                        d.fy = null;
                    }
                    event.sourceEvent.stopPropagation(); // Prevent click event after drag
                }

                return d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended);
            }

            // Always use direct positioning, avoid force simulation
            simulation.on("tick", updatePositions);

            // Set initial positions
            setInitialPositions();
            
            // Modified function to initially show only environment node
            function initializeJourney() {
                console.log("Initializing journey...");
                // Hide all nodes except environment
                nodeGroup.style("opacity", d => d.id === 'environment' ? 1 : 0)
                         .style("pointer-events", d => d.id === 'environment' ? "auto" : "none");
                
                // Hide all links initially
                link.style("opacity", 0)
                    .style("pointer-events", "none");
                
                // Update path guide with instructions
                pathGuide.select("p").text("Click on the environment node to begin the food journey.");
            }
            
            // Initialize the visualization showing only the environment node first
            initializeJourney();
        }
    }
}); 