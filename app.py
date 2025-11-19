from flask import Flask, render_template, request, jsonify, send_from_directory
from traffic_core import (
    G, enhanced_simulate_congestion, get_road_data, 
    get_traffic_statistics, get_multiple_routes, get_ml_route,
    smart_travel_planner, get_best_travel_times, get_traffic_patterns,
    get_heatmap_data, get_road_types_available
)
from shapely.geometry import Point
from functools import lru_cache
import logging
from datetime import datetime, timedelta
import time
import csv
from io import StringIO
from flask import Response

app = Flask(__name__)

# Optimize Flask
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False
app.config['JSON_SORT_KEYS'] = False

# Set up optimized logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Response cache
response_cache = {}
CACHE_TIMEOUT = 300  # 5 minutes

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/map')
def map_page():
    return render_template('map.html')

# Serve static files
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/roads')
def roads():
    """Optimized roads endpoint with caching"""
    cache_key = f"roads_{request.args.get('hour', '')}_{request.args.get('day_type', '')}"
    
    # Check cache
    if cache_key in response_cache:
        cached_data, timestamp = response_cache[cache_key]
        if time.time() - timestamp < CACHE_TIMEOUT:
            return jsonify(cached_data)
    
    try:
        hour = request.args.get("hour", type=int)
        day_type = request.args.get("day_type", "weekday")
        
        road_data = get_congestion_data(hour, day_type)
        
        # Cache the response
        response_cache[cache_key] = (road_data, time.time())
        
        return jsonify(road_data)
    except Exception as e:
        logger.error(f"Error in /roads: {str(e)}")
        return jsonify({"error": "Failed to load road data"}), 500

@lru_cache(maxsize=48)
def get_congestion_data(hour=None, day_type="weekday"):
    """Cache congestion data for each hour and day type"""
    G_copy = G.copy()
    enhanced_simulate_congestion(G_copy, hour, day_type)
    return get_road_data(G_copy)

@app.route('/route', methods=['POST'])
def route():
    """Optimized single route calculation"""
    start_time = time.time()
    
    try:
        data = request.get_json()
        if not data or 'start' not in data or 'end' not in data:
            return jsonify({"error": "Invalid input: start and end points required"}), 400
            
        start = data['start']
        end = data['end']
        
        # Fast coordinate validation
        if not (-90 <= start['lat'] <= 90) or not (-180 <= start['lng'] <= 180):
            return jsonify({"error": "Invalid start coordinates"}), 400
        if not (-90 <= end['lat'] <= 90) or not (-180 <= end['lng'] <= 180):
            return jsonify({"error": "Invalid end coordinates"}), 400
            
        start_point = Point(start['lng'], start['lat'])
        end_point = Point(end['lng'], end['lat'])

        hour = data.get('hour', 8)
        day_type = data.get('day_type', 'weekday')
        
        route_coords, total_time_s, route_details = get_ml_route(G, start_point, end_point, hour, day_type)
        
        if not route_coords:
            return jsonify({"error": "No route found between the selected points"}), 404
        
        response_time = round((time.time() - start_time) * 1000, 2)
        logger.info(f"Route calculated in {response_time}ms")
            
        return jsonify({
            "route": route_coords,
            "total_time_min": round(total_time_s / 60, 1),
            "total_time_seconds": round(total_time_s, 1),
            "route_details": route_details,
            "model_used": "random_forest",
            "response_time_ms": response_time
        })
    except Exception as e:
        logger.error(f"Error in /route: {str(e)}")
        return jsonify({"error": f"Route calculation failed: {str(e)}"}), 500

@app.route('/multi-route', methods=['POST'])
def multi_route():
    """Optimized multi-route calculation"""
    start_time = time.time()
    
    try:
        data = request.get_json()
        if not data or 'start' not in data or 'end' not in data:
            return jsonify({"error": "Invalid input: start and end points required"}), 400
            
        start = data['start']
        end = data['end']
        
        # Fast coordinate validation
        if not (-90 <= start['lat'] <= 90) or not (-180 <= start['lng'] <= 180):
            return jsonify({"error": "Invalid start coordinates"}), 400
        if not (-90 <= end['lat'] <= 90) or not (-180 <= end['lng'] <= 180):
            return jsonify({"error": "Invalid end coordinates"}), 400
            
        start_point = Point(start['lng'], start['lat'])
        end_point = Point(end['lng'], end['lat'])

        hour = data.get('hour', 8)
        day_type = data.get('day_type', 'weekday')
        
        route_options = get_multiple_routes(G, start_point, end_point, hour, day_type)
        
        if not route_options:
            return jsonify({"error": "No routes found between the selected points"}), 404
        
        response_time = round((time.time() - start_time) * 1000, 2)
        logger.info(f"Multi-route calculated in {response_time}ms")
            
        return jsonify({
            "route_options": route_options,
            "model_used": "multi_criteria",
            "response_time_ms": response_time
        })
    except Exception as e:
        logger.error(f"Error in /multi-route: {str(e)}")
        return jsonify({"error": f"Multi-route calculation failed: {str(e)}"}), 500

@app.route('/traffic-data', methods=['GET'])
def traffic_stats():
    """Optimized traffic statistics"""
    cache_key = f"stats_{request.args.get('hour', '')}_{request.args.get('day_type', '')}"
    
    # Check cache
    if cache_key in response_cache:
        cached_data, timestamp = response_cache[cache_key]
        if time.time() - timestamp < CACHE_TIMEOUT:
            return jsonify(cached_data)
    
    try:
        hour = request.args.get("hour", type=int)
        day_type = request.args.get("day_type", "weekday")
        
        G_copy = G.copy()
        enhanced_simulate_congestion(G_copy, hour, day_type)
        stats = get_traffic_statistics(G_copy)
        
        # Cache the response
        response_cache[cache_key] = (stats, time.time())
        
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Error in /traffic-data: {str(e)}")
        return jsonify({"error": "Failed to get traffic statistics"}), 500

@app.route('/traffic-prediction', methods=['GET'])
def traffic_prediction():
    """Get traffic predictions for future times"""
    try:
        hour = request.args.get("hour", type=int, default=datetime.now().hour)
        day_type = request.args.get("day_type", "weekday")
        days_ahead = request.args.get("days_ahead", type=int, default=0)
        
        # Get best travel times for the next 12 hours
        start_hour = hour
        end_hour = min(23, hour + 12)
        
        recommendations = get_best_travel_times(start_hour, end_hour, day_type)
        
        return jsonify({
            "current_time": f"{hour:02d}:00",
            "day_type": day_type,
            "recommendations": recommendations,
            "best_time": recommendations[0] if recommendations else None
        })
    except Exception as e:
        logger.error(f"Error in /traffic-prediction: {str(e)}")
        return jsonify({"error": "Failed to get traffic predictions"}), 500

@app.route('/traffic-patterns', methods=['GET'])
def traffic_patterns():
    """Get traffic pattern analysis"""
    try:
        patterns = get_traffic_patterns()
        return jsonify(patterns)
    except Exception as e:
        logger.error(f"Error in /traffic-patterns: {str(e)}")
        return jsonify({"error": "Failed to get traffic patterns"}), 500

@app.route('/heatmap-data', methods=['GET'])
def heatmap_data():
    """Get heatmap data for congestion visualization"""
    try:
        hour = request.args.get("hour", type=int)
        day_type = request.args.get("day_type", "weekday")
        
        G_copy = G.copy()
        enhanced_simulate_congestion(G_copy, hour, day_type)
        heatmap_data = get_heatmap_data(G_copy, hour, day_type)
        
        return jsonify(heatmap_data)
    except Exception as e:
        logger.error(f"Error in /heatmap-data: {str(e)}")
        return jsonify({"error": "Failed to get heatmap data"}), 500

@app.route('/smart-travel-plan', methods=['POST'])
def smart_travel_plan():
    """Smart travel planning with multiple constraints"""
    start_time = time.time()
    
    try:
        data = request.get_json()
        if not data or 'start' not in data or 'end' not in data:
            return jsonify({"error": "Invalid input: start and end points required"}), 400
            
        start = data['start']
        end = data['end']
        
        # Validate coordinates
        if not (-90 <= start['lat'] <= 90) or not (-180 <= start['lng'] <= 180):
            return jsonify({"error": "Invalid start coordinates"}), 400
        if not (-90 <= end['lat'] <= 90) or not (-180 <= end['lng'] <= 180):
            return jsonify({"error": "Invalid end coordinates"}), 400
            
        start_point = Point(start['lng'], start['lat'])
        end_point = Point(end['lng'], end['lat'])

        # Extract constraints
        constraints = {
            'max_travel_time': data.get('max_travel_time'),
            'avoid_road_types': data.get('avoid_road_types', []),
            'time_window_start': data.get('time_window_start', 0),
            'time_window_end': data.get('time_window_end', 23),
            'day_type': data.get('day_type', 'weekday')
        }
        
        # Validate time window
        if constraints['time_window_start'] >= constraints['time_window_end']:
            return jsonify({"error": "Invalid time window: start must be before end"}), 400
        
        # Call the smart planner
        result = smart_travel_planner(G, start_point, end_point, constraints)
        
        response_time = round((time.time() - start_time) * 1000, 2)
        logger.info(f"Smart travel plan calculated in {response_time}ms")
        
        # Add response time to result
        result['response_time_ms'] = response_time
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in /smart-travel-plan: {str(e)}")
        return jsonify({"error": f"Smart planning failed: {str(e)}"}), 500

@app.route('/available-road-types', methods=['GET'])
def available_road_types():
    """Get available road types for constraint system"""
    try:
        road_types = get_road_types_available()
        road_types_with_descriptions = []
        
        from traffic_core.smart_planner import ROAD_TYPE_DESCRIPTIONS
        from traffic_core.utils import SPEED_LIMITS
        
        for road_type in road_types:
            road_types_with_descriptions.append({
                'type': road_type,
                'description': ROAD_TYPE_DESCRIPTIONS.get(road_type, 'Unknown road type'),
                'speed_limit': SPEED_LIMITS.get(road_type, 30)
            })
        
        return jsonify({
            'road_types': road_types_with_descriptions
        })
    except Exception as e:
        logger.error(f"Error in /available-road-types: {str(e)}")
        return jsonify({"error": "Failed to get road types"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Optimized health check"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "graph_edges": len(G.edges()),
        "graph_nodes": len(G.nodes()),
        "cache_size": len(response_cache)
    })

@app.route('/debug')
def debug():
    return "Flask is running correctly!"

@app.route('/download-traffic-data', methods=['GET'])
def download_traffic_data():
    """Download comprehensive traffic data as CSV"""
    try:
        hour = request.args.get("hour", type=int)
        day_type = request.args.get("day_type", "weekday")
        
        # Create CSV in memory
        output = StringIO()
        writer = csv.writer(output)
        
        # Write CSV header
        writer.writerow([
            'Road ID', 'Start Node', 'End Node', 'Road Name', 
            'Road Type', 'Length (m)', 'Congestion Level', 
            'Congestion Percentage', 'Speed Limit (km/h)', 
            'Estimated Speed (km/h)', 'Time', 'Day Type',
            'Coordinates'
        ])
        
        # Get current traffic data
        G_copy = G.copy()
        enhanced_simulate_congestion(G_copy, hour, day_type)
        
        from traffic_core.utils import get_realistic_speed, SPEED_LIMITS
        
        # Write road data
        for i, (u, v, data) in enumerate(G_copy.edges(data=True)):
            road_name = data.get('name', f'Road_{u}_{v}')
            road_type = data.get('_road_type', 'unknown')
            length = data.get('length', 0)
            congestion = data.get('congestion', 0.5)
            congestion_percent = round(congestion * 100, 2)
            
            # Calculate speed information
            speed_limit = SPEED_LIMITS.get(road_type, 30)
            estimated_speed = get_realistic_speed(data, congestion) * 3.6
            
            # Get coordinates
            if 'geometry' in data:
                coords = list(data['geometry'].coords)
                coord_str = '; '.join([f"{lon},{lat}" for lon, lat in coords])
            else:
                u_data = G_copy.nodes[u]
                v_data = G_copy.nodes[v]
                coord_str = f"{u_data['x']},{u_data['y']}; {v_data['x']},{v_data['y']}"
            
            writer.writerow([
                f"R{i+1:04d}", u, v, road_name, road_type, 
                round(length, 2), congestion, congestion_percent,
                speed_limit, round(estimated_speed, 2),
                f"{hour:02d}:00" if hour is not None else "Current",
                day_type, coord_str
            ])
        
        # Prepare response
        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"yerevan_traffic_data_{timestamp}.csv"
        
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Error generating CSV: {str(e)}")
        return jsonify({"error": "Failed to generate traffic data export"}), 500

@app.route('/download-route-data', methods=['POST'])
def download_route_data():
    """Download route-specific data as CSV"""
    try:
        data = request.get_json()
        if not data or 'route_details' not in data:
            return jsonify({"error": "Invalid route data"}), 400
        
        route_details = data['route_details']
        route_name = data.get('route_name', 'Unknown Route')
        
        # Create CSV in memory
        output = StringIO()
        writer = csv.writer(output)
        
        # Write CSV header
        writer.writerow([
            'Segment', 'From Node', 'To Node', 'Road Type', 
            'Length (m)', 'Congestion (%)', 'Travel Time (s)',
            'Estimated Speed (km/h)', 'Cumulative Time (min)',
            'Cumulative Distance (km)'
        ])
        
        cumulative_time = 0
        cumulative_distance = 0
        
        for i, segment in enumerate(route_details, 1):
            segment_time = segment.get('segment_time', 0)
            segment_length = segment.get('length', 0)
            congestion = segment.get('congestion', 0.5) * 100
            
            cumulative_time += segment_time
            cumulative_distance += segment_length
            
            writer.writerow([
                i, segment.get('from_node', 'N/A'), segment.get('to_node', 'N/A'),
                segment.get('road_type', 'unknown'), round(segment_length, 2),
                round(congestion, 2), round(segment_time, 2),
                segment.get('speed_kmh', 0), round(cumulative_time / 60, 2),
                round(cumulative_distance / 1000, 2)
            ])
        
        # Add summary row
        writer.writerow([])
        writer.writerow(['SUMMARY', '', '', '', '', '', '', '', '', ''])
        writer.writerow([
            'Total', '', '', '', 
            round(cumulative_distance, 2), 
            round(sum(seg.get('congestion', 0.5) * 100 for seg in route_details) / len(route_details), 2),
            round(cumulative_time, 2),
            round((cumulative_distance / 1000) / (cumulative_time / 3600), 2) if cumulative_time > 0 else 0,
            round(cumulative_time / 60, 2),
            round(cumulative_distance / 1000, 2)
        ])
        
        # Prepare response
        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"yerevan_route_{route_name.replace(' ', '_').lower()}_{timestamp}.csv"
        
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Error generating route CSV: {str(e)}")
        return jsonify({"error": "Failed to generate route data export"}), 500

# Clear cache periodically
def clear_old_cache():
    """Clear old cache entries"""
    current_time = time.time()
    keys_to_remove = []
    
    for key, (data, timestamp) in response_cache.items():
        if current_time - timestamp > CACHE_TIMEOUT:
            keys_to_remove.append(key)
    
    for key in keys_to_remove:
        del response_cache[key]
    
    if keys_to_remove:
        logger.info(f"Cleared {len(keys_to_remove)} old cache entries")

# Cache cleanup on startup
clear_old_cache()

if __name__ == "__main__":
    print("Starting Yerevan Traffic Intelligence Server...")
    print("Available routes:")
    print("  /          - Homepage")
    print("  /map       - Interactive Map")
    print("  /roads     - Road data API")
    print("  /route     - Route calculation API") 
    print("  /multi-route - Multiple route options API")
    print("  /traffic-data - Traffic statistics API")
    print("  /traffic-prediction - Traffic prediction API")
    print("  /traffic-patterns - Traffic pattern analysis API")
    print("  /heatmap-data - Heatmap data API")
    print("  /smart-travel-plan - Smart travel planner with constraints")
    print("  /available-road-types - Get road types for constraints")
    print("  /health    - Health check")
    print("  /debug     - Debug endpoint")
    
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)