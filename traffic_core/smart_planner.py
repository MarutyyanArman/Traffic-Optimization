import networkx as nx
import osmnx as ox
import random
import numpy as np
from shapely.geometry import Point
import logging
from .congestion_simulator import historical_data, predict_future_congestion  # Fixed import
from .route_planner import _extract_route_details, _generate_route_summary
from .utils import realistic_weight
from .ml_predictor import ml_predictor

logger = logging.getLogger(__name__)

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

def get_road_types_available():
    """Get list of available road types for the constraint system"""
    from .network_loader import G
    
    road_types = set()
    for u, v, data in G.edges(data=True):
        road_type = data.get('_road_type', 'residential')
        road_types.add(road_type)
    
    return sorted(list(road_types))