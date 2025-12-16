import networkx as nx
import osmnx as ox
from shapely.geometry import Point
import logging
import math
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
        
        # Get road name - handle list of names or single name
        raw_name = data.get('name', '')
        if isinstance(raw_name, list):
            road_name = raw_name[0] if raw_name else 'Unnamed Road'
        else:
            road_name = raw_name if raw_name else 'Unnamed Road'
        
        route_details.append({
            "from_node": u,
            "to_node": v,
            "road_name": road_name,
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
    """A* based multiple route calculation with different heuristics"""
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

        # Get destination coordinates for heuristics
        dest_y = G_ml.nodes[dest_node]['y']
        dest_x = G_ml.nodes[dest_node]['x']
        
        # Helper function to calculate straight-line distance (haversine)
        def haversine_distance(node_id):
            """Calculate straight-line distance from node to destination in meters"""
            node_y = G_ml.nodes[node_id]['y']
            node_x = G_ml.nodes[node_id]['x']
            
            # Haversine formula
            R = 6371000  # Earth radius in meters
            lat1, lon1 = math.radians(node_y), math.radians(node_x)
            lat2, lon2 = math.radians(dest_y), math.radians(dest_x)
            
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            
            a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
            c = 2 * math.asin(math.sqrt(a))
            
            return R * c

        route_options = {}
        
        # Fastest Route: A* with cost = time, heuristic = distance / max_speed
        try:
            def fastest_heuristic(node_id, dest_node_id):
                """Heuristic: straight-line distance / max speed (highway speed ~120 km/h)"""
                distance = haversine_distance(node_id)
                max_speed_ms = 90 / 3.6  # 120 km/h to m/s
                return distance / max_speed_ms
            
            fastest_path = nx.astar_path(
                G_ml, orig_node, dest_node,
                heuristic=fastest_heuristic,
                weight=realistic_weight
            )
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
        
        # Shortest Route: A* with cost = length, heuristic = straight-line distance
        try:
            def shortest_heuristic(node_id, dest_node_id):
                """Heuristic: straight-line distance in meters"""
                return haversine_distance(node_id)
            
            shortest_path = nx.astar_path(
                G_ml, orig_node, dest_node,
                heuristic=shortest_heuristic,
                weight='length'
            )
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
        
        # Least Congested Route: A* with cost = congestion score
        try:
            def congestion_weight(u, v, d):
                """Weight function: congestion-based cost"""
                congestion = d.get('congestion', 0.5)
                length = d.get('length', 100)
                # Higher congestion = higher cost
                return length * (1 + congestion * 3)
            
            def congestion_heuristic(node_id, dest_node_id):
                """Heuristic: straight-line distance (optimistic congestion-free path)"""
                return haversine_distance(node_id)
            
            least_congested_path = nx.astar_path(
                G_ml, orig_node, dest_node,
                heuristic=congestion_heuristic,
                weight=congestion_weight
            )
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

        # Relabel routes so that:
        # - Fastest Route has minimum total_time_min
        # - Shortest Route has minimum total_distance_km
        # - Least Congested has minimum average_congestion
        if not route_options:
            return {}

        # Work on route objects as a list
        routes = list(route_options.values())

        def get_time(r):
            return r.get("summary", {}).get("total_time_min", float('inf'))

        def get_distance(r):
            return r.get("summary", {}).get("total_distance_km", float('inf'))

        def get_congestion(r):
            return r.get("summary", {}).get("average_congestion", float('inf'))

        final_routes = {}

        # Fastest
        try:
            fastest = min(routes, key=get_time)
            fastest_route = dict(fastest)
            fastest_route["name"] = "Fastest"
            fastest_route["color"] = "#2563eb"
            fastest_route["icon"] = "⚡"
            final_routes["fastest"] = fastest_route
        except ValueError:
            pass

        # Shortest
        try:
            shortest = min(routes, key=get_distance)
            shortest_route = dict(shortest)
            shortest_route["name"] = "Shortest"
            shortest_route["color"] = "#10b981"
            shortest_route["icon"] = "📏"
            final_routes["shortest"] = shortest_route
        except ValueError:
            pass

        # Least congested
        try:
            least = min(routes, key=get_congestion)
            least_route = dict(least)
            least_route["name"] = "Least Congested"
            least_route["color"] = "#8b5cf6"
            least_route["icon"] = "😌"
            final_routes["least_congested"] = least_route
        except ValueError:
            pass

        return final_routes or route_options
        
    except Exception as e:
        logger.error(f"Error in multi-route calculation: {str(e)}")
        return {}