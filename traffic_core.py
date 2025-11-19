import networkx as nx
import osmnx as ox
import random
import numpy as np
from shapely.geometry import Point
import logging
import joblib
import os
from datetime import datetime, timedelta
import hashlib
from functools import lru_cache
import threading
import json
from collections import defaultdict

logger = logging.getLogger(__name__)

# Performance optimizations
ox.settings.use_cache = True
ox.settings.log_console = False

# Load Yerevan road network with caching
@lru_cache(maxsize=1)
def load_road_network():
    """Load and cache the road network"""
    logger.info("Loading Yerevan road network...")
    north, south, east, west = 40.192, 40.175, 44.531, 44.503
    G = ox.graph_from_bbox(north, south, east, west, network_type="drive", simplify=True)
    
    # Precompute edge data for faster access
    for u, v, k, data in G.edges(keys=True, data=True):
        if 'length' not in data:
            data['length'] = 100
        data['congestion'] = random.uniform(0.1, 0.3)  # Lower base congestion
        
        # Precompute road type
        road_type = data.get('highway', 'residential')
        if isinstance(road_type, list):
            data['_road_type'] = road_type[0] if road_type else 'residential'
        else:
            data['_road_type'] = road_type
    
    logger.info(f"Road network loaded: {len(G.nodes())} nodes, {len(G.edges())} edges")
    return G

# Initialize graph
G = load_road_network()

# ML model storage with thread safety
MODELS_DIR = "ml_models"
os.makedirs(MODELS_DIR, exist_ok=True)
_model_lock = threading.Lock()

# Precomputed values for performance
SPEED_LIMITS = {
    'motorway': 90, 'motorway_link': 60, 'trunk': 80, 'trunk_link': 50,
    'primary': 60, 'primary_link': 50, 'secondary': 50, 'secondary_link': 40,
    'tertiary': 40, 'tertiary_link': 30, 'residential': 30, 'unclassified': 40, 'service': 20
}

# Road type descriptions for the smart planner
ROAD_TYPE_DESCRIPTIONS = {
    'motorway': 'High-speed highways',
    'motorway_link': 'Highway ramps and connectors',
    'trunk': 'Major arterial roads',
    'trunk_link': 'Trunk road connectors',
    'primary': 'Primary roads',
    'primary_link': 'Primary road connectors',
    'secondary': 'Secondary roads',
    'secondary_link': 'Secondary road connectors',
    'tertiary': 'Tertiary roads',
    'tertiary_link': 'Tertiary road connectors',
    'residential': 'Residential streets',
    'unclassified': 'Unclassified roads',
    'service': 'Service roads and alleys'
}

# Updated congestion weights for more realistic levels
CONGESTION_WEIGHTS = {
    'motorway': 0.15, 'motorway_link': 0.2, 'trunk': 0.25, 'trunk_link': 0.3,
    'primary': 0.35, 'primary_link': 0.4, 'secondary': 0.45, 'secondary_link': 0.5,
    'tertiary': 0.55, 'tertiary_link': 0.6, 'residential': 0.65, 'unclassified': 0.5, 'service': 0.7
}

DELAY_WEIGHTS = {
    'motorway': 2, 'motorway_link': 5, 'trunk': 8, 'trunk_link': 10,
    'primary': 15, 'primary_link': 20, 'secondary': 25, 'secondary_link': 30,
    'tertiary': 35, 'residential': 40
}

# Historical data storage for pattern analysis
HISTORICAL_DATA_FILE = "historical_traffic_data.json"

def load_historical_data():
    """Load historical traffic data"""
    if os.path.exists(HISTORICAL_DATA_FILE):
        with open(HISTORICAL_DATA_FILE, 'r') as f:
            return json.load(f)
    return {"hourly_patterns": {}, "daily_patterns": {}, "road_patterns": {}}

def save_historical_data(data):
    """Save historical traffic data"""
    with open(HISTORICAL_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

# Initialize historical data
historical_data = load_historical_data()

def update_historical_data(hour, day_type, congestion_data):
    """Update historical data with current congestion patterns"""
    # Update hourly patterns
    hour_key = str(hour)
    if hour_key not in historical_data["hourly_patterns"]:
        historical_data["hourly_patterns"][hour_key] = []
    
    historical_data["hourly_patterns"][hour_key].append({
        "timestamp": datetime.now().isoformat(),
        "avg_congestion": np.mean([r.get('congestion', 0.5) for r in congestion_data]) if congestion_data else 0.5,
        "day_type": day_type
    })
    
    # Keep only last 100 records per hour to prevent file from growing too large
    if len(historical_data["hourly_patterns"][hour_key]) > 100:
        historical_data["hourly_patterns"][hour_key] = historical_data["hourly_patterns"][hour_key][-100:]
    
    save_historical_data(historical_data)

def enhanced_simulate_congestion(G, hour=None, day_type="weekday"):
    """Optimized congestion simulation using vectorized operations where possible"""
    congestion_data = []
    for u, v, k, data in G.edges(keys=True, data=True):
        base_congestion = get_realistic_congestion(data, hour, day_type)
        data['congestion'] = max(0.05, min(0.95, base_congestion))
        congestion_data.append({"congestion": data['congestion']})
    
    # Update historical data
    if hour is not None:
        update_historical_data(hour, day_type, congestion_data)
    
    return G

def get_realistic_congestion(edge_data, hour, day_type):
    """Optimized congestion calculation with more realistic coefficients"""
    road_type = edge_data.get('_road_type', 'residential')
    base = CONGESTION_WEIGHTS.get(road_type, 0.5)
    
    if hour is not None:
        if day_type == "weekday":
            if 7 <= hour <= 9:    # Morning rush
                base += random.uniform(0.25, 0.4)
            elif 17 <= hour <= 19: # Evening rush
                base += random.uniform(0.3, 0.45)
            elif 12 <= hour <= 14: # Lunch time
                base += random.uniform(0.1, 0.2)
            elif 0 <= hour <= 5:   # Night - significantly reduced congestion
                base -= random.uniform(0.25, 0.4)
        else:  # Weekend
            if 11 <= hour <= 16:   # Weekend daytime
                base += random.uniform(0.15, 0.25)
            elif 19 <= hour <= 22: # Weekend evening
                base += random.uniform(0.1, 0.2)
            elif 0 <= hour <= 6:   # Weekend night - significantly reduced congestion
                base -= random.uniform(0.2, 0.35)
    
    base += random.uniform(-0.08, 0.08)
    return max(0.05, min(0.95, base))

def predict_future_congestion(hour, day_type, days_ahead=0):
    """Predict congestion for future times based on historical patterns"""
    # Base prediction using current algorithm
    base_prediction = get_realistic_congestion({}, hour, day_type)
    
    # Adjust based on historical data if available
    hour_key = str(hour)
    if hour_key in historical_data["hourly_patterns"]:
        hour_data = historical_data["hourly_patterns"][hour_key]
        similar_days = [d for d in hour_data if d.get('day_type') == day_type]
        
        if similar_days:
            historical_avg = np.mean([d['avg_congestion'] for d in similar_days[-10:]])  # Last 10 similar periods
            # Blend current prediction with historical data
            base_prediction = (base_prediction + historical_avg) / 2
    
    # Adjust for special conditions (weekends, holidays, etc.)
    if day_type == "weekend" and 11 <= hour <= 16:
        base_prediction += 0.1  # Weekend afternoons are busier
    
    return max(0.05, min(0.95, base_prediction))

def get_best_travel_times(start_hour, end_hour, day_type="weekday"):
    """Recommend best times to travel based on congestion patterns"""
    recommendations = []
    
    for hour in range(start_hour, end_hour + 1):
        predicted_congestion = predict_future_congestion(hour, day_type)
        
        if predicted_congestion < 0.3:
            rating = "Excellent"
            color = "#10b981"
        elif predicted_congestion < 0.5:
            rating = "Good"
            color = "#3b82f6"
        elif predicted_congestion < 0.7:
            rating = "Fair"
            color = "#f59e0b"
        else:
            rating = "Poor"
            color = "#ef4444"
        
        recommendations.append({
            "hour": hour,
            "congestion": round(predicted_congestion * 100, 1),
            "rating": rating,
            "color": color,
            "description": get_time_description(hour, predicted_congestion)
        })
    
    # Sort by congestion (lowest first)
    recommendations.sort(key=lambda x: x["congestion"])
    return recommendations

def get_time_description(hour, congestion):
    """Get descriptive text for time periods"""
    if hour <= 5:
        period = "Late Night"
    elif hour <= 11:
        period = "Morning"
    elif hour <= 16:
        period = "Afternoon"
    elif hour <= 20:
        period = "Evening"
    else:
        period = "Night"
    
    if congestion < 0.3:
        return f"Light traffic in the {period}"
    elif congestion < 0.5:
        return f"Moderate traffic in the {period}"
    elif congestion < 0.7:
        return f"Heavy traffic in the {period}"
    else:
        return f"Very heavy traffic in the {period}"

def get_traffic_patterns():
    """Analyze traffic patterns from historical data"""
    patterns = {
        "peak_hours": [],
        "congestion_hotspots": [],
        "daily_trends": [],
        "weekly_patterns": []
    }
    
    # Analyze hourly patterns
    hourly_congestion = {}
    for hour, data in historical_data["hourly_patterns"].items():
        if data:
            avg_congestion = np.mean([d['avg_congestion'] for d in data[-20:]])  # Last 20 records
            hourly_congestion[int(hour)] = avg_congestion
    
    # Find peak hours
    if hourly_congestion:
        sorted_hours = sorted(hourly_congestion.items(), key=lambda x: x[1], reverse=True)
        patterns["peak_hours"] = [{"hour": hour, "congestion": round(congestion * 100, 1)} 
                                for hour, congestion in sorted_hours[:5]]
    
    # Generate daily trends (simulated based on typical patterns)
    daily_trends = []
    for hour in range(24):
        weekday_congestion = predict_future_congestion(hour, "weekday")
        weekend_congestion = predict_future_congestion(hour, "weekend")
        
        daily_trends.append({
            "hour": hour,
            "weekday": round(weekday_congestion * 100, 1),
            "weekend": round(weekend_congestion * 100, 1)
        })
    
    patterns["daily_trends"] = daily_trends
    
    # Generate congestion hotspots (simulated based on road types)
    hotspots = [
        {"name": "Mashtots Avenue", "congestion": 72, "type": "Primary Road", "trend": "increasing"},
        {"name": "Tigran Mets Avenue", "congestion": 68, "type": "Primary Road", "trend": "stable"},
        {"name": "Komitas Avenue", "congestion": 65, "type": "Secondary Road", "trend": "decreasing"},
        {"name": "Sayat-Nova Avenue", "congestion": 58, "type": "Secondary Road", "trend": "stable"},
        {"name": "Abovyan Street", "congestion": 55, "type": "City Center", "trend": "increasing"}
    ]
    patterns["congestion_hotspots"] = hotspots
    
    return patterns

def get_heatmap_data(G, hour=None, day_type="weekday"):
    """Generate heatmap data for congestion visualization"""
    heatmap_data = []
    
    for u, v, data in G.edges(data=True):
        if 'geometry' in data:
            # Get multiple points along the road for better heatmap visualization
            coords = list(data['geometry'].coords)
            for i, (lon, lat) in enumerate(coords):
                # Vary congestion slightly along the road for more realistic heatmap
                congestion_variation = data.get('congestion', 0.5) + random.uniform(-0.1, 0.1)
                intensity = max(0.1, min(1.0, congestion_variation))
                
                heatmap_data.append({
                    "lat": lat,
                    "lng": lon,
                    "intensity": intensity,
                    "congestion": round(congestion_variation * 100, 1)
                })
    
    return heatmap_data

def get_realistic_speed(edge_data, congestion):
    """Optimized speed calculation"""
    road_type = edge_data.get('_road_type', 'residential')
    base_speed_kmh = SPEED_LIMITS.get(road_type, 30)
    
    # More realistic speed reduction based on congestion
    if congestion < 0.3:
        speed_reduction = 1.0  # No reduction for low congestion
    elif congestion < 0.6:
        speed_reduction = 0.7  # Moderate reduction
    elif congestion < 0.8:
        speed_reduction = 0.5  # Significant reduction
    else:
        speed_reduction = 0.3  # Heavy traffic
    
    effective_speed_kmh = base_speed_kmh * speed_reduction
    effective_speed_kmh = max(5, effective_speed_kmh)
    
    return effective_speed_kmh / 3.6  # Convert to m/s

def realistic_weight(u, v, d):
    """Optimized travel time calculation"""
    length = d.get('length', 100)
    congestion = d.get('congestion', 0.5)
    
    effective_speed_ms = get_realistic_speed(d, congestion)
    road_type = d.get('_road_type', 'residential')
    
    intersection_delay = DELAY_WEIGHTS.get(road_type, 30)
    traffic_light_delay = intersection_delay * (0.5 + congestion)
    
    travel_time = (length / max(0.1, effective_speed_ms)) + traffic_light_delay
    return travel_time

def get_color(congestion):
    """Optimized color calculation - updated thresholds for more realistic coloring"""
    if congestion < 0.3:    # Low congestion (0-30%)
        return "#4CAF50"    # Green
    elif congestion < 0.6:  # Medium congestion (30-60%)
        return "#FF9800"    # Orange
    else:                   # High congestion (60%+)
        return "#F44336"    # Red

@lru_cache(maxsize=128)
def get_road_data_cache_key(hour, day_type):
    """Cache key for road data"""
    return f"{hour}_{day_type}"

def get_road_data(G):
    """Optimized road data preparation with batch processing"""
    road_data = []
    for u, v, data in G.edges(data=True):
        if 'geometry' in data:
            coords = [(lat, lon) for lon, lat in data['geometry'].coords]
        else:
            u_data = G.nodes[u]
            v_data = G.nodes[v]
            coords = [(u_data['y'], u_data['x']), (v_data['y'], v_data['x'])]
        
        congestion = data.get('congestion', 0.5)
        road_data.append({
            "coords": coords,
            "color": get_color(congestion),
            "congestion_level": round(congestion, 2),
            "road_type": data.get('_road_type', 'unknown'),
            "weight": 3 + congestion * 2
        })
    return road_data

def get_traffic_statistics(G):
    """Optimized statistics calculation"""
    congestions = []
    lengths = []
    road_types = {}
    congestion_by_type = {}
    
    for u, v, data in G.edges(data=True):
        congestion = data.get('congestion', 0.5)
        length = data.get('length', 0)
        
        congestions.append(congestion)
        lengths.append(length)
        
        road_type = data.get('_road_type', 'unknown')
        road_types[road_type] = road_types.get(road_type, 0) + 1
        
        if road_type not in congestion_by_type:
            congestion_by_type[road_type] = []
        congestion_by_type[road_type].append(congestion)
    
    # Calculate averages
    avg_congestion = np.mean(congestions) if congestions else 0
    total_length = sum(lengths) if lengths else 0
    
    avg_congestion_by_type = {}
    for road_type, congs in congestion_by_type.items():
        avg_congestion_by_type[road_type] = round(np.mean(congs), 3)
    
    # Updated congestion distribution with new thresholds
    congestion_dist = {
        "low": len([c for c in congestions if c < 0.3]),
        "medium": len([c for c in congestions if 0.3 <= c < 0.6]),
        "high": len([c for c in congestions if c >= 0.6])
    }
    
    return {
        "total_roads": len(G.edges()),
        "total_nodes": len(G.nodes()),
        "avg_congestion": round(avg_congestion, 3),
        "max_congestion": round(max(congestions), 3) if congestions else 0,
        "min_congestion": round(min(congestions), 3) if congestions else 0,
        "total_road_length_km": round(total_length / 1000, 2),
        "road_type_distribution": road_types,
        "avg_congestion_by_type": avg_congestion_by_type,
        "congestion_distribution": congestion_dist
    }

# Smart Travel Planner Functions
def smart_travel_planner(G, start_point, end_point, constraints):
    """
    Smart travel planner with multiple constraints
    Returns optimal time and route based on user preferences
    """
    try:
        # Extract constraints
        max_travel_time = constraints.get('max_travel_time')  # in minutes
        avoid_road_types = constraints.get('avoid_road_types', [])
        time_window_start = constraints.get('time_window_start', 0)
        time_window_end = constraints.get('time_window_end', 23)
        day_type = constraints.get('day_type', 'weekday')
        
        print(f"Planning with constraints: {constraints}")
        
        # Find best time within the window
        best_time = find_best_time_in_window(G, start_point, end_point, time_window_start, 
                                           time_window_end, max_travel_time, avoid_road_types, day_type)
        
        if not best_time:
            return {
                "success": False,
                "message": "No suitable route found within your constraints. Try relaxing some requirements."
            }
        
        # Get the optimal route for the best time
        optimal_route = get_optimized_route(G, start_point, end_point, best_time['hour'], 
                                          day_type, avoid_road_types)
        
        # Generate recommendations
        recommendations = generate_travel_recommendations(optimal_route, best_time, constraints)
        
        return {
            "success": True,
            "optimal_departure_time": best_time,
            "recommended_route": optimal_route,
            "recommendations": recommendations,
            "constraints_used": constraints
        }
        
    except Exception as e:
        logger.error(f"Error in smart_travel_planner: {str(e)}")
        return {
            "success": False,
            "message": f"Planning error: {str(e)}"
        }

def find_best_time_in_window(G, start_point, end_point, window_start, window_end, 
                           max_travel_time, avoid_road_types, day_type):
    """Find the best departure time within the specified window"""
    best_time = None
    best_score = float('-inf')
    
    # Check fewer hours for better performance (every 2 hours)
    hours_to_check = []
    for hour in range(window_start, window_end + 1):
        if hour % 2 == 0:  # Check every 2 hours
            hours_to_check.append(hour)
    
    # Always include window boundaries
    if window_start not in hours_to_check:
        hours_to_check.insert(0, window_start)
    if window_end not in hours_to_check:
        hours_to_check.append(window_end)
    
    print(f"Checking hours: {hours_to_check}")
    
    for hour in hours_to_check:
        try:
            # Calculate route for this hour
            route_data = get_optimized_route(G, start_point, end_point, hour, day_type, avoid_road_types)
            
            if not route_data or 'total_time_min' not in route_data:
                continue
                
            travel_time = route_data['total_time_min']
            congestion = route_data.get('avg_congestion', 0.5) * 100
            
            # Skip if exceeds max travel time
            if max_travel_time and travel_time > max_travel_time:
                continue
            
            # Calculate score for this time slot
            score = calculate_time_score(travel_time, congestion, hour, max_travel_time)
            
            if score > best_score:
                best_score = score
                best_time = {
                    'hour': hour,
                    'travel_time_min': travel_time,
                    'congestion_percent': congestion,
                    'score': score,
                    'time_display': f"{hour:02d}:00"
                }
                
        except Exception as e:
            logger.warning(f"Error checking hour {hour}: {str(e)}")
            continue
    
    return best_time

def get_optimized_route(G, start_point, end_point, hour, day_type, avoid_road_types):
    """Get route optimized for given constraints"""
    try:
        day_type_numeric = 0 if day_type == "weekday" else 1
        
        # Create graph copy with congestion simulation
        G_optimized = G.copy()
        
        # Apply road type avoidance by setting high weights for avoided types
        for u, v, k, data in G_optimized.edges(keys=True, data=True):
            road_type = data.get('_road_type', 'residential')
            
            # Predict congestion
            length = data.get('length', 100)
            predicted_congestion = ml_predictor.predict_congestion(
                hour, day_type_numeric, road_type, length
            )
            data['congestion'] = predicted_congestion
            
            # Apply avoidance by increasing weight for avoided road types
            if avoid_road_types and road_type in avoid_road_types:
                data['avoid_weight'] = 1000  # Very high weight to avoid
            else:
                data['avoid_weight'] = 1
        
        def constraint_weight(u, v, d):
            base_weight = realistic_weight(u, v, d)
            avoid_multiplier = d.get('avoid_weight', 1)
            return base_weight * avoid_multiplier
        
        # Calculate route
        orig_node = ox.distance.nearest_nodes(G_optimized, start_point.x, start_point.y)
        dest_node = ox.distance.nearest_nodes(G_optimized, end_point.x, end_point.y)
        
        path = nx.shortest_path(G_optimized, orig_node, dest_node, weight=constraint_weight)
        route_coords, total_time_s, route_details = _extract_route_details(G_optimized, path)
        
        # Calculate additional metrics
        total_distance = sum(segment['length'] for segment in route_details)
        avg_congestion = sum(segment['congestion'] for segment in route_details) / len(route_details)
        
        road_types_used = {}
        for segment in route_details:
            road_type = segment['road_type']
            road_types_used[road_type] = road_types_used.get(road_type, 0) + 1
        
        return {
            'route_coords': route_coords,
            'total_time_min': total_time_s / 60,
            'total_distance_km': total_distance / 1000,
            'avg_congestion': avg_congestion,
            'road_types_used': road_types_used,
            'route_details': route_details,
            'summary': _generate_route_summary(route_details)
        }
        
    except Exception as e:
        logger.error(f"Error in get_optimized_route: {str(e)}")
        return None

def calculate_time_score(travel_time, congestion, hour, max_travel_time):
    """Calculate a score for this time slot (higher is better)"""
    # Base score from travel time (lower time = higher score)
    time_score = 100 / (travel_time + 1)  # +1 to avoid division by zero
    
    # Congestion penalty (lower congestion = higher score)
    congestion_penalty = congestion * 0.5
    
    # Time of day preferences (avoid very early/late unless necessary)
    time_penalty = 0
    if hour <= 5 or hour >= 23:  # Very early morning or late night
        time_penalty = 20
    elif hour <= 7 or hour >= 21:  # Early morning or late evening
        time_penalty = 10
    
    # Bonus for meeting max travel time constraint
    constraint_bonus = 0
    if max_travel_time and travel_time <= max_travel_time:
        constraint_bonus = 30
    
    final_score = time_score - congestion_penalty - time_penalty + constraint_bonus
    return max(0, final_score)

def generate_travel_recommendations(route_data, best_time, constraints):
    """Generate smart recommendations based on the results"""
    recommendations = []
    
    travel_time = route_data['total_time_min']
    congestion = best_time['congestion_percent']
    hour = best_time['hour']
    
    # Time-based recommendations
    if hour >= 7 and hour <= 9:
        recommendations.append("⏰ **Morning Rush Hour**: Consider leaving a bit earlier to avoid peak congestion")
    elif hour >= 17 and hour <= 19:
        recommendations.append("🌆 **Evening Rush**: This is the busiest time, but we found the best window")
    elif hour <= 6 or hour >= 22:
        recommendations.append("🌙 **Late Night Travel**: Roads are clear but ensure safe driving conditions")
    
    # Congestion-based recommendations
    if congestion < 30:
        recommendations.append("✅ **Excellent Conditions**: Very light traffic expected")
    elif congestion < 50:
        recommendations.append("👍 **Good Conditions**: Moderate traffic, smooth travel")
    elif congestion < 70:
        recommendations.append("⚠️ **Heavy Traffic**: Expect some delays, plan extra time")
    else:
        recommendations.append("🚨 **Very Heavy Traffic**: Significant delays expected")
    
    # Constraint-based feedback
    max_time = constraints.get('max_travel_time')
    if max_time and travel_time > max_time * 0.9:
        recommendations.append(f"⏱️ **Close to Time Limit**: Travel time ({travel_time:.1f}min) is near your maximum ({max_time}min)")
    
    avoided_roads = constraints.get('avoid_road_types', [])
    if avoided_roads:
        used_roads = list(route_data['road_types_used'].keys())
        actually_avoided = set(avoided_roads) - set(used_roads)
        if actually_avoided:
            recommendations.append(f"🛣️ **Successfully Avoided**: {', '.join(actually_avoided)}")
    
    # Efficiency tips
    if travel_time > 30:
        recommendations.append("💡 **Long Trip Tip**: Consider breaking the journey or checking for rest stops")
    
    if len(route_data['route_details']) > 20:
        recommendations.append("🔄 **Complex Route**: Many turns involved, pay attention to navigation")
    
    return recommendations

def get_road_types_available():
    """Get list of available road types for the constraint system"""
    road_types = set()
    for u, v, data in G.edges(data=True):
        road_type = data.get('_road_type', 'residential')
        road_types.add(road_type)
    
    return sorted(list(road_types))

# ... (rest of your existing traffic_core.py functions remain the same)
# ML model class, route functions, etc. - they should all stay as they were

# Simplified ML Model with caching
class TrafficPredictor:
    def __init__(self):
        self.model = None
        self.is_trained = False
        self.prediction_cache = {}
        
    def generate_training_data(self, n_samples=5000):
        """Generate training data"""
        features = []
        targets = []
        
        for _ in range(n_samples):
            hour = random.randint(0, 23)
            day_type = random.choice([0, 1])
            road_type_idx = random.choice([0, 1, 2, 3])
            length = random.uniform(50, 1000)
            
            is_rush_hour = 1 if (7 <= hour <= 9 or 17 <= hour <= 19) else 0
            is_night = 1 if (0 <= hour <= 5) else 0
            
            base_congestion = [0.2, 0.3, 0.4, 0.5][road_type_idx]
            
            if day_type == 0:  # Weekday
                if is_rush_hour:
                    base_congestion += 0.25
                elif is_night:
                    base_congestion -= 0.3
            else:  # Weekend
                if 11 <= hour <= 16:
                    base_congestion += 0.15
                elif is_night:
                    base_congestion -= 0.25
            
            base_congestion += random.uniform(-0.1, 0.1)
            base_congestion = max(0.05, min(0.95, base_congestion))
            
            features.append([hour, day_type, road_type_idx, length, is_rush_hour, is_night])
            targets.append(base_congestion)
        
        return np.array(features), np.array(targets)
    
    def train_model(self):
        """Train model with optimized parameters"""
        from sklearn.ensemble import RandomForestRegressor
        
        X, y = self.generate_training_data(5000)
        
        self.model = RandomForestRegressor(
            n_estimators=30,
            max_depth=8,
            random_state=42,
            n_jobs=-1
        )
        
        self.model.fit(X, y)
        self.is_trained = True
        
        model_path = os.path.join(MODELS_DIR, "random_forest_model.pkl")
        with _model_lock:
            joblib.dump(self.model, model_path)
        
        return self.model
    
    def load_model(self):
        """Load trained model"""
        model_path = os.path.join(MODELS_DIR, "random_forest_model.pkl")
        if os.path.exists(model_path):
            with _model_lock:
                self.model = joblib.load(model_path)
            self.is_trained = True
            return True
        return False
    
    def predict_congestion(self, hour, day_type, road_type, length):
        """Predict congestion with caching"""
        cache_key = f"{hour}_{day_type}_{road_type}_{length}"
        
        if cache_key in self.prediction_cache:
            return self.prediction_cache[cache_key]
        
        if not self.is_trained:
            if not self.load_model():
                self.train_model()
        
        road_type_encoded = {
            'motorway': 0, 'primary': 1, 'secondary': 2, 'residential': 3
        }.get(road_type, 2)
        
        is_rush_hour = 1 if (7 <= hour <= 9 or 17 <= hour <= 19) else 0
        is_night = 1 if (0 <= hour <= 5) else 0
        
        features = np.array([[hour, day_type, road_type_encoded, length, is_rush_hour, is_night]])
        prediction = self.model.predict(features)[0]
        prediction = max(0.05, min(0.95, prediction))
        
        # Cache the prediction
        self.prediction_cache[cache_key] = prediction
        if len(self.prediction_cache) > 10000:
            self.prediction_cache.clear()
        
        return prediction

# Initialize ML predictor
ml_predictor = TrafficPredictor()

def get_ml_route(G, start_point, end_point, hour=8, day_type="weekday"):
    """Optimized ML route calculation"""
    try:
        orig_node = ox.distance.nearest_nodes(G, start_point.x, start_point.y)
        dest_node = ox.distance.nearest_nodes(G, end_point.x, end_point.y)
        
        day_type_numeric = 0 if day_type == "weekday" else 1
        G_ml = G.copy()
        
        # Batch update congestion
        for u, v, k, data in G_ml.edges(keys=True, data=True):
            road_type = data.get('_road_type', 'residential')
            length = data.get('length', 100)
            
            predicted_congestion = ml_predictor.predict_congestion(
                hour, day_type_numeric, road_type, length
            )
            data['congestion'] = predicted_congestion

        path = nx.shortest_path(G_ml, orig_node, dest_node, weight=realistic_weight)
        return _extract_route_details(G_ml, path)
        
    except Exception as e:
        logger.error(f"Error in ML route calculation: {str(e)}")
        return get_basic_route(G, start_point, end_point)

def get_basic_route(G, start_point, end_point):
    """Optimized basic route calculation"""
    try:
        orig_node = ox.distance.nearest_nodes(G, start_point.x, start_point.y)
        dest_node = ox.distance.nearest_nodes(G, end_point.x, end_point.y)
        path = nx.shortest_path(G, orig_node, dest_node, weight=realistic_weight)
        return _extract_route_details(G, path)
        
    except Exception as e:
        logger.error(f"Error in basic route calculation: {str(e)}")
        return [], 0, []

def _extract_route_details(G, path):
    """Optimized route details extraction"""
    total_time_s = 0
    route_coords = []
    route_details = []
    
    for u, v in zip(path[:-1], path[1:]):
        data = G[u][v][0]
        
        if "geometry" in data:
            coords = [(lat, lon) for lon, lat in data["geometry"].coords]
        else:
            u_data = G.nodes[u]
            v_data = G.nodes[v]
            coords = [(u_data['y'], u_data['x']), (v_data['y'], v_data['x'])]
        
        route_coords.extend(coords)
        segment_time = realistic_weight(u, v, data)
        total_time_s += segment_time
        
        route_details.append({
            "from_node": u,
            "to_node": v,
            "length": data.get('length', 0),
            "congestion": round(data.get('congestion', 0.5), 2),
            "road_type": data.get('_road_type', 'unknown'),
            "segment_time": round(segment_time, 1),
            "speed_kmh": round(get_realistic_speed(data, data.get('congestion', 0.5)) * 3.6, 1)
        })
    
    return route_coords, total_time_s, route_details

def _generate_route_summary(route_details):
    """Optimized route summary generation"""
    if not route_details:
        return {}
    
    total_distance = sum(segment['length'] for segment in route_details)
    avg_congestion = sum(segment['congestion'] for segment in route_details) / len(route_details)
    total_time = sum(segment['segment_time'] for segment in route_details)
    
    road_types = {}
    for segment in route_details:
        road_type = segment['road_type']
        road_types[road_type] = road_types.get(road_type, 0) + 1
    
    turn_count = len(route_details) - 1
    traffic_light_estimate = sum(1 for segment in route_details 
                               if segment['road_type'] in ['primary', 'secondary', 'tertiary'])
    
    avg_speed = round((total_distance / 1000) / (total_time / 3600), 1) if total_time > 0 else 0
    
    return {
        "total_distance_km": round(total_distance / 1000, 2),
        "average_congestion": round(avg_congestion * 100, 1),
        "total_time_min": round(total_time / 60, 1),
        "road_type_breakdown": road_types,
        "estimated_turns": turn_count,
        "estimated_traffic_lights": traffic_light_estimate,
        "average_speed_kmh": avg_speed
    }

def get_multiple_routes(G, start_point, end_point, hour=8, day_type="weekday"):
    """Optimized multiple route calculation"""
    try:
        orig_node = ox.distance.nearest_nodes(G, start_point.x, start_point.y)
        dest_node = ox.distance.nearest_nodes(G, end_point.x, end_point.y)
        day_type_numeric = 0 if day_type == "weekday" else 1
        
        # Create optimized ML graph
        G_ml = G.copy()
        for u, v, k, data in G_ml.edges(keys=True, data=True):
            road_type = data.get('_road_type', 'residential')
            length = data.get('length', 100)
            predicted_congestion = ml_predictor.predict_congestion(
                hour, day_type_numeric, road_type, length
            )
            data['congestion'] = predicted_congestion

        route_options = {}
        
        # Fastest Route
        try:
            fastest_path = nx.shortest_path(G_ml, orig_node, dest_node, weight=realistic_weight)
            fastest_coords, fastest_time, fastest_details = _extract_route_details(G_ml, fastest_path)
            route_options['fastest'] = {
                "name": "Fastest Route",
                "route": fastest_coords,
                "total_time_min": round(fastest_time / 60, 1),
                "route_details": fastest_details,
                "summary": _generate_route_summary(fastest_details),
                "color": "#2563eb",
                "icon": "⚡"
            }
        except Exception as e:
            logger.warning(f"Could not calculate fastest route: {e}")
        
        # Shortest Route
        try:
            shortest_path = nx.shortest_path(G_ml, orig_node, dest_node, weight='length')
            shortest_coords, shortest_time, shortest_details = _extract_route_details(G_ml, shortest_path)
            route_options['shortest'] = {
                "name": "Shortest Route",
                "route": shortest_coords,
                "total_time_min": round(shortest_time / 60, 1),
                "route_details": shortest_details,
                "summary": _generate_route_summary(shortest_details),
                "color": "#10b981",
                "icon": "📏"
            }
        except Exception as e:
            logger.warning(f"Could not calculate shortest route: {e}")
        
        # Least Congested Route
        try:
            def congestion_weight(u, v, d):
                congestion = d.get('congestion', 0.5)
                length = d.get('length', 100)
                return length * (1 + congestion * 3)
            
            least_congested_path = nx.shortest_path(G_ml, orig_node, dest_node, weight=congestion_weight)
            lc_coords, lc_time, lc_details = _extract_route_details(G_ml, least_congested_path)
            route_options['least_congested'] = {
                "name": "Least Congested",
                "route": lc_coords,
                "total_time_min": round(lc_time / 60, 1),
                "route_details": lc_details,
                "summary": _generate_route_summary(lc_details),
                "color": "#8b5cf6",
                "icon": "😌"
            }
        except Exception as e:
            logger.warning(f"Could not calculate least congested route: {e}")
        
        return route_options
        
    except Exception as e:
        logger.error(f"Error in multi-route calculation: {str(e)}")
        return {}

# Train ML model in background thread
def train_ml_model_async():
    """Train ML model in background"""
    def train():
        try:
            ml_predictor.train_model()
            logger.info("ML model trained successfully in background")
        except Exception as e:
            logger.warning(f"Background ML model training failed: {e}")
    
    thread = threading.Thread(target=train, daemon=True)
    thread.start()

# Start background training
train_ml_model_async()

# Backward compatibility
def simulate_congestion(G, hour=None):
    return enhanced_simulate_congestion(G, hour, "weekday")