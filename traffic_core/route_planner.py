import networkx as nx
import osmnx as ox
from shapely.geometry import Point
import logging
from .utils import realistic_weight, get_realistic_speed
from .ml_predictor import ml_predictor

logger = logging.getLogger(__name__)

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