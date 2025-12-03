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
from io import StringIO, BytesIO
from flask import Response
import json
import uuid
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# Optimize Flask
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False
app.config['JSON_SORT_KEYS'] = False

# Support email configuration (set via environment variables)
SUPPORT_EMAIL_HOST = os.getenv('SUPPORT_EMAIL_HOST', 'localhost')
SUPPORT_EMAIL_PORT = int(os.getenv('SUPPORT_EMAIL_PORT', '25'))
SUPPORT_EMAIL_USE_SSL = os.getenv('SUPPORT_EMAIL_USE_SSL', 'false').lower() == 'true'
SUPPORT_EMAIL_USE_TLS = os.getenv('SUPPORT_EMAIL_USE_TLS', 'true').lower() == 'true'
SUPPORT_EMAIL_USER = os.getenv('SUPPORT_EMAIL_USER')
SUPPORT_EMAIL_PASSWORD = (os.getenv('SUPPORT_EMAIL_PASSWORD') or '').replace(' ', '')

SUPPORT_EMAIL_FROM = os.getenv('SUPPORT_EMAIL_FROM', SUPPORT_EMAIL_USER or 'support@routely.am')
SUPPORT_TARGET_EMAIL = os.getenv('SUPPORT_TARGET_EMAIL', 'amarutyan99@gmail.com')
SUPPORT_REPLY_ADDRESS = os.getenv('SUPPORT_REPLY_ADDRESS', 'noreply@routely.am')

# Set up optimized logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Response cache
response_cache = {}
CACHE_TIMEOUT = 300  # 5 minutes

# Saved Routes System
SAVED_ROUTES_FILE = "saved_routes.json"

def load_saved_routes():
    """Load saved routes from file"""
    try:
        if os.path.exists(SAVED_ROUTES_FILE):
            with open(SAVED_ROUTES_FILE, 'r') as f:
                return json.load(f)
        return []
    except Exception as e:
        logger.error(f"Error loading saved routes: {str(e)}")
        return []

def save_routes_to_file(routes):
    """Save routes to file"""
    try:
        with open(SAVED_ROUTES_FILE, 'w') as f:
            json.dump(routes, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving routes: {str(e)}")
        return False

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

# Saved Routes Endpoints
@app.route('/save-route', methods=['POST'])
def save_route():
    """Save a route for later use"""
    try:
        data = request.get_json()
        if not data or 'route_data' not in data:
            return jsonify({"error": "Invalid route data"}), 400
        
        route_data = data['route_data']
        route_name = data.get('route_name', f"Route_{datetime.now().strftime('%Y%m%d_%H%M')}")
        route_type = data.get('route_type', 'smart_plan')
        
        # Generate unique ID for the route
        route_id = str(uuid.uuid4())
        
        saved_route = {
            'id': route_id,
            'name': route_name,
            'type': route_type,
            'created_at': datetime.now().isoformat(),
            'route_data': route_data,
            'start_point': data.get('start_point'),
            'end_point': data.get('end_point')
        }
        
        # Load existing routes and add new one
        saved_routes = load_saved_routes()
        saved_routes.append(saved_route)
        
        # Save back to file
        if save_routes_to_file(saved_routes):
            return jsonify({
                "success": True,
                "message": "Route saved successfully",
                "route_id": route_id
            })
        else:
            return jsonify({"error": "Failed to save route"}), 500
            
    except Exception as e:
        logger.error(f"Error saving route: {str(e)}")
        return jsonify({"error": f"Failed to save route: {str(e)}"}), 500

@app.route('/saved-routes', methods=['GET'])
def get_saved_routes():
    """Get all saved routes"""
    try:
        saved_routes = load_saved_routes()
        return jsonify({
            "success": True,
            "routes": saved_routes
        })
    except Exception as e:
        logger.error(f"Error loading saved routes: {str(e)}")
        return jsonify({"error": "Failed to load saved routes"}), 500

@app.route('/saved-route/<route_id>', methods=['GET'])
def get_saved_route(route_id):
    """Get a specific saved route"""
    try:
        saved_routes = load_saved_routes()
        route = next((r for r in saved_routes if r['id'] == route_id), None)
        
        if route:
            return jsonify({
                "success": True,
                "route": route
            })
        else:
            return jsonify({"error": "Route not found"}), 404
            
    except Exception as e:
        logger.error(f"Error loading saved route: {str(e)}")
        return jsonify({"error": "Failed to load saved route"}), 500

@app.route('/delete-route/<route_id>', methods=['DELETE'])
def delete_route(route_id):
    """Delete a saved route"""
    try:
        saved_routes = load_saved_routes()
        initial_count = len(saved_routes)
        
        # Filter out the route to delete
        saved_routes = [r for r in saved_routes if r['id'] != route_id]
        
        if len(saved_routes) < initial_count:
            # Route was found and removed, save the updated list
            if save_routes_to_file(saved_routes):
                return jsonify({
                    "success": True,
                    "message": "Route deleted successfully"
                })
            else:
                return jsonify({"error": "Failed to save routes after deletion"}), 500
        else:
            return jsonify({"error": "Route not found"}), 404
            
    except Exception as e:
        logger.error(f"Error deleting route: {str(e)}")
        return jsonify({"error": "Failed to delete route"}), 500

@app.route('/update-route/<route_id>', methods=['PUT'])
def update_route(route_id):
    """Update a saved route (e.g., change name)"""
    try:
        data = request.get_json()
        saved_routes = load_saved_routes()
        
        for route in saved_routes:
            if route['id'] == route_id:
                if 'name' in data:
                    route['name'] = data['name']
                route['updated_at'] = datetime.now().isoformat()
                
                if save_routes_to_file(saved_routes):
                    return jsonify({
                        "success": True,
                        "message": "Route updated successfully"
                    })
                else:
                    return jsonify({"error": "Failed to save routes after update"}), 500
        
        return jsonify({"error": "Route not found"}), 404
        
    except Exception as e:
        logger.error(f"Error updating route: {str(e)}")
        return jsonify({"error": "Failed to update route"}), 500

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
        
        # Create CSV in memory with UTF-8 BOM for proper encoding
        output = StringIO()
        output.write('\ufeff')  # UTF-8 BOM for Excel compatibility
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
        
        # Prepare response with UTF-8 encoding
        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"yerevan_traffic_data_{timestamp}.csv"
        
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
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
        
        # Create CSV in memory with UTF-8 BOM for proper encoding
        output = StringIO()
        output.write('\ufeff')  # UTF-8 BOM for Excel compatibility
        writer = csv.writer(output)
        
        # Write CSV header
        writer.writerow([
            'Segment', 'From Node', 'To Node', 'Road Name', 'Road Type', 
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
                segment.get('road_name', 'Unknown Road'), segment.get('road_type', 'unknown'), 
                round(segment_length, 2), round(congestion, 2), round(segment_time, 2),
                segment.get('speed_kmh', 0), round(cumulative_time / 60, 2),
                round(cumulative_distance / 1000, 2)
            ])
        
        # Add summary row
        writer.writerow([])
        writer.writerow(['SUMMARY', '', '', '', '', '', '', '', '', '', ''])
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
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Error generating route CSV: {str(e)}")
        return jsonify({"error": "Failed to generate route data export"}), 500

@app.route('/send-support-email', methods=['POST'])
def send_support_email():
    """Send support email directly without using mailto"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'surname', 'email', 'subject', 'problem']
        for field in required_fields:
            if not data.get(field):
                return jsonify({"error": f"{field} is required"}), 400
        
        # Create email content
        subject = f"Routely Support: {data['subject']}"
        
        body = f"""Dear Routely Support Team,

I am writing to request assistance with the following issue:

--------------------------------------------------
CONTACT INFORMATION
--------------------------------------------------
Name: {data['name']} {data['surname']}
Email: {data['email']}
Subject: {data['subject']}
Date: {datetime.now().strftime('%Y-%m-%d')}
Time: {datetime.now().strftime('%H:%M:%S')}

--------------------------------------------------
ISSUE DESCRIPTION
--------------------------------------------------
{data['problem']}

--------------------------------------------------
ADDITIONAL INFORMATION
--------------------------------------------------
This support request was submitted through the Routely Traffic Optimization Platform.
Reference ID: {int(time.time())}

Thank you for your assistance.

Best regards,
{data['name']} {data['surname']}
{data['email']}
"""
        
        # Send email using Gmail SMTP (you'll need to configure this)
        try:
            msg = MIMEMultipart()
            reply_name = f"{data['name']} {data['surname']}".strip() or data['name'] or data['surname'] or 'Routely User'
            # Present email as coming from the user (so replies auto-fill)
            msg['From'] = formataddr((reply_name, data['email']))
            msg['Sender'] = SUPPORT_EMAIL_FROM
            msg['To'] = SUPPORT_TARGET_EMAIL
            msg['Reply-To'] = formataddr((reply_name, data['email']))
            msg['Subject'] = subject

            msg.attach(MIMEText(body, 'plain'))

            connection = None
            if SUPPORT_EMAIL_USE_SSL:
                connection = smtplib.SMTP_SSL(SUPPORT_EMAIL_HOST, SUPPORT_EMAIL_PORT, timeout=20)
            else:
                connection = smtplib.SMTP(SUPPORT_EMAIL_HOST, SUPPORT_EMAIL_PORT, timeout=20)
                if SUPPORT_EMAIL_USE_TLS:
                    connection.starttls()

            if SUPPORT_EMAIL_USER and SUPPORT_EMAIL_PASSWORD:
                connection.login(SUPPORT_EMAIL_USER, SUPPORT_EMAIL_PASSWORD)

            connection.send_message(msg)
            connection.quit()

            logger.info(f"Support message delivered to {SUPPORT_TARGET_EMAIL} (from {data['email']})")

            return jsonify({
                "success": True,
                "message": "Message sent successfully to the Support Center."
            })

        except Exception as smtp_error:
            logger.error(f"SMTP Error while sending support email: {smtp_error}")
            return jsonify({
                "error": "Failed to deliver your support request. Please try again later."
            }), 500
            
    except Exception as e:
        logger.error(f"Error sending support email: {str(e)}")
        return jsonify({
            "error": "Failed to send support request. Please try again later."
        }), 500

@app.route('/download-route-data', methods=['GET'])
def download_saved_route_data():
    """Download saved route data as CSV by route_id"""
    try:
        route_id = request.args.get('route_id')
        if not route_id:
            return jsonify({"error": "Route ID required"}), 400
        
        # Load the saved route
        saved_routes = load_saved_routes()
        route = next((r for r in saved_routes if r['id'] == route_id), None)
        
        if not route:
            return jsonify({"error": "Route not found"}), 404
        
        route_data = route.get('route_data', {})
        route_name = route.get('name', 'Unknown Route')
        
        # Create CSV in memory with UTF-8 BOM for proper encoding
        output = StringIO()
        output.write('\ufeff')  # UTF-8 BOM for Excel compatibility
        writer = csv.writer(output)
        
        # Get summary data directly from route_data
        summary = route_data.get('summary', {})
        total_distance_km = summary.get('total_distance_km', 0)
        total_time_min = route_data.get('total_time_min', summary.get('total_time_min', 0))
        avg_congestion = summary.get('average_congestion', 0)
        avg_speed = summary.get('average_speed_kmh', 0)
        
        # Get start and end points
        start_point = route.get('start_point', {})
        end_point = route.get('end_point', {})
        
        # Get road names by reverse geocoding the start/end coordinates
        start_road = "Unknown"
        end_road = "Unknown"
        
        # Try to get road names from the graph based on nearest nodes
        try:
            from shapely.geometry import Point
            import osmnx as ox
            
            if start_point.get('lat') and start_point.get('lng'):
                start_node = ox.distance.nearest_nodes(G, start_point['lng'], start_point['lat'])
                # Get edges connected to this node and find road name
                for u, v, data in G.edges(start_node, data=True):
                    name = data.get('name', '')
                    if name:
                        start_road = name[0] if isinstance(name, list) else name
                        break
            
            if end_point.get('lat') and end_point.get('lng'):
                end_node = ox.distance.nearest_nodes(G, end_point['lng'], end_point['lat'])
                for u, v, data in G.edges(end_node, data=True):
                    name = data.get('name', '')
                    if name:
                        end_road = name[0] if isinstance(name, list) else name
                        break
        except Exception as e:
            logger.warning(f"Could not get road names: {e}")
        
        # Write route summary header
        writer.writerow(['Route Name', route_name])
        writer.writerow(['Created', route.get('created_at', 'N/A')])
        writer.writerow(['Type', route.get('type', 'N/A')])
        writer.writerow([])
        
        # Write main metrics
        writer.writerow(['ROUTE SUMMARY'])
        writer.writerow(['Total Distance (km)', round(total_distance_km, 2)])
        writer.writerow(['Total Time (min)', round(total_time_min, 1)])
        writer.writerow(['Average Congestion (%)', round(avg_congestion, 1)])
        writer.writerow(['Average Speed (km/h)', round(avg_speed, 1)])
        writer.writerow([])
        
        # Write road type breakdown if available
        road_types = summary.get('road_type_breakdown', {})
        if road_types:
            writer.writerow(['ROAD TYPES USED'])
            for road_type, count in road_types.items():
                writer.writerow([road_type.title(), f"{count} segments"])
            writer.writerow([])
        
        # Write start and end road names
        writer.writerow(['ROUTE ENDPOINTS'])
        writer.writerow(['Start Road', start_road])
        writer.writerow(['End Road', end_road])
        
        # Prepare response
        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = route_name.replace(' ', '_').replace('/', '_')[:30]
        filename = f"route_{safe_name}_{timestamp}.csv"
        
        return Response(
            output.getvalue().encode('utf-8-sig'),
            mimetype="text/csv; charset=utf-8",
            headers={"Content-disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Error downloading saved route CSV: {str(e)}")
        return jsonify({"error": "Failed to download route data"}), 500

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
    print("  /save-route - Save route for later use")
    print("  /saved-routes - Get all saved routes")
    print("  /saved-route/<id> - Get specific saved route")
    print("  /delete-route/<id> - Delete saved route")
    print("  /update-route/<id> - Update saved route")
    print("  /health    - Health check")
    print("  /debug     - Debug endpoint")
    
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)