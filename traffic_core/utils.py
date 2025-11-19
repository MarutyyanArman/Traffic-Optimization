import random
import numpy as np

# Precomputed values for performance
SPEED_LIMITS = {
    'motorway': 90, 'motorway_link': 60, 'trunk': 80, 'trunk_link': 50,
    'primary': 60, 'primary_link': 50, 'secondary': 50, 'secondary_link': 40,
    'tertiary': 40, 'tertiary_link': 30, 'residential': 30, 'unclassified': 40, 'service': 20
}

DELAY_WEIGHTS = {
    'motorway': 2, 'motorway_link': 5, 'trunk': 8, 'trunk_link': 10,
    'primary': 15, 'primary_link': 20, 'secondary': 25, 'secondary_link': 30,
    'tertiary': 35, 'residential': 40
}

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