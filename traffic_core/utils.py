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
    """Optimized speed calculation with smoother congestion impact"""
    road_type = edge_data.get('_road_type', 'residential')
    base_speed_kmh = SPEED_LIMITS.get(road_type, 30)
    
    # Smoother, more realistic speed reduction based on congestion
    # At 0% congestion: 95% of speed limit (free flow)
    # At 30% congestion: ~75% of speed limit
    # At 60% congestion: ~50% of speed limit  
    # At 90%+ congestion: ~25% of speed limit (heavy traffic)
    
    if congestion < 0.15:  # Very low congestion (night time, early morning)
        speed_reduction = 0.95 - (congestion * 0.5)  # 95% to 92.5%
    elif congestion < 0.4:  # Low to moderate congestion
        speed_reduction = 0.92 - (congestion * 0.6)  # ~92% to 68%
    elif congestion < 0.7:  # Moderate to high congestion
        speed_reduction = 0.80 - (congestion * 0.9)  # ~68% to 37%
    else:  # Heavy congestion
        speed_reduction = 0.50 - (congestion * 0.3)  # ~37% to 23%
    
    effective_speed_kmh = base_speed_kmh * max(0.20, speed_reduction)  # Minimum 20% of speed limit
    effective_speed_kmh = max(8, effective_speed_kmh)  # Absolute minimum 8 km/h
    
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
    """Optimized color calculation - updated thresholds for more realistic coloring"""
    if congestion < 0.3:    # Low congestion (0-30%)
        return "#4CAF50"    # Green
    elif congestion < 0.6:  # Medium congestion (30-60%)
        return "#FF9800"    # Orange
    else:                   # High congestion (60%+)
        return "#F44336"    # Red