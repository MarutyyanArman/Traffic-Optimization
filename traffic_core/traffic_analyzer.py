import numpy as np
import random
from .utils import get_color

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