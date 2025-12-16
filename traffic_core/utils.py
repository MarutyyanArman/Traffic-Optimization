import random
import numpy as np

# Precomputed values for performance
SPEED_LIMITS = {
    'motorway': 90, 'motorway_link': 60, 'trunk': 80, 'trunk_link': 50,
    'primary': 60, 'primary_link': 50, 'secondary': 50, 'secondary_link': 40,
    'tertiary': 40, 'tertiary_link': 30, 'residential': 30, 'unclassified': 40, 'service': 20
}

# Intersection delay in seconds (base values for moderate congestion)
DELAY_WEIGHTS = {
    'motorway': 0, 'motorway_link': 2, 'trunk': 1, 'trunk_link': 3,
    'primary': 5, 'primary_link': 6, 'secondary': 8, 'secondary_link': 10,
    'tertiary': 12, 'residential': 10, 'unclassified': 8, 'service': 5
}

def get_realistic_speed(edge_data, congestion):
    """Enhanced speed calculation for more realistic speed-congestion relationships"""
    road_type = edge_data.get('_road_type', 'residential')
    base_speed_kmh = SPEED_LIMITS.get(road_type, 30)
    
    # Much more realistic speed reduction based on congestion level
    # Very late night (0-4am): 98-100% of speed limit - almost empty roads
    # Low congestion (< 15%): 90-98% of speed limit - free flow conditions
    # Moderate congestion (15-40%): 70-90% of speed limit
    # Heavy congestion (40-70%): 40-70% of speed limit
    # Severe congestion (70%+): 20-40% of speed limit - stop and go traffic
    
    if congestion < 0.05:  # Empty roads (very late night)
        speed_reduction = 0.98 + ((0.05 - congestion) * 0.4)  # 98-100% of limit
    elif congestion < 0.15:  # Very low congestion (night, early morning)
        speed_reduction = 0.90 + ((0.15 - congestion) * 0.53)  # 90-98% of limit
    elif congestion < 0.4:  # Low to moderate congestion
        speed_reduction = 0.70 + ((0.4 - congestion) * 0.8)  # 70-90% of limit
    elif congestion < 0.7:  # Moderate to heavy congestion
        speed_reduction = 0.40 + ((0.7 - congestion) * 1.0)  # 40-70% of limit
    else:  # Severe congestion (70%+)
        speed_reduction = 0.20 + ((0.95 - min(0.95, congestion)) * 0.2 / 0.25)  # 20-40% of limit
    
    # Apply road type adjustments - highways maintain better speeds even in congestion
    if road_type in ['motorway', 'trunk']:
        speed_reduction = min(1.0, speed_reduction * 1.15)  # Highways maintain better flow
    elif road_type in ['residential', 'service']:
        speed_reduction = max(0.1, speed_reduction * 0.9)  # Local streets slow down more
    
    effective_speed_kmh = base_speed_kmh * max(0.15, speed_reduction)  # Minimum 15% of speed limit
    effective_speed_kmh = max(5, effective_speed_kmh)  # Absolute minimum 5 km/h in worst jams
    
    return effective_speed_kmh / 3.6  # Convert to m/s

def realistic_weight(u, v, d):
    """Optimized travel time calculation with realistic delays"""
    length = d.get('length', 100)
    congestion = d.get('congestion', 0.5)
    
    effective_speed_ms = get_realistic_speed(d, congestion)
    road_type = d.get('_road_type', 'residential')
    
    # Base travel time
    base_travel_time = length / max(0.1, effective_speed_ms)
    
    # Intersection/traffic light delay - only add for roads with traffic signals
    # Delay should scale with congestion level and segment count (not per meter)
    base_delay = DELAY_WEIGHTS.get(road_type, 5)
    
    # Only add significant delay if segment is long enough to have an intersection
    # and scale by congestion (low congestion at 2am = minimal delays)
    if length > 50:  # Only add delays for segments > 50m
        # Congestion multiplier: 0.11 congestion = 0.2x delay, 0.5 = 1x, 0.9 = 2x
        congestion_multiplier = 0.2 + (congestion * 1.8)
        traffic_light_delay = base_delay * congestion_multiplier
    else:
        traffic_light_delay = 0
    
    travel_time = base_travel_time + traffic_light_delay
    return travel_time

def get_color(congestion):
    """More granular color mapping for improved visualization of congestion levels"""
    if congestion < 0.15:   # Very low congestion (0-15%)
        return "#4CAF50"    # Green
    elif congestion < 0.35: # Low to moderate congestion (15-35%)
        return "#8BC34A"    # Light green
    elif congestion < 0.5:  # Moderate congestion (35-50%)
        return "#FFC107"    # Amber
    elif congestion < 0.65: # Moderate to high congestion (50-65%)
        return "#FF9800"    # Orange
    elif congestion < 0.8:  # High congestion (65-80%)
        return "#F44336"    # Red
    else:                   # Severe congestion (80%+)
        return "#D32F2F"    # Deep red