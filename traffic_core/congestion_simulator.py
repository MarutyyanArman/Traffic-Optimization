import random
import numpy as np
import json
import os
from datetime import datetime
from collections import defaultdict

# Precomputed values for performance
SPEED_LIMITS = {
    'motorway': 90, 'motorway_link': 60, 'trunk': 80, 'trunk_link': 50,
    'primary': 60, 'primary_link': 50, 'secondary': 50, 'secondary_link': 40,
    'tertiary': 40, 'tertiary_link': 30, 'residential': 30, 'unclassified': 40, 'service': 20
}

# Updated congestion weights for more realistic levels - lowered base values
CONGESTION_WEIGHTS = {
    'motorway': 0.10, 'motorway_link': 0.15, 'trunk': 0.20, 'trunk_link': 0.25,
    'primary': 0.30, 'primary_link': 0.30, 'secondary': 0.35, 'secondary_link': 0.40,
    'tertiary': 0.45, 'tertiary_link': 0.45, 'residential': 0.50, 'unclassified': 0.40, 'service': 0.55
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
    """Optimized congestion calculation with more realistic time-based patterns"""
    road_type = edge_data.get('_road_type', 'residential')
    base = CONGESTION_WEIGHTS.get(road_type, 0.5)
    
    if hour is not None:
        # Apply time-of-day congestion patterns
        if 0 <= hour <= 4:  # Late night/early morning (minimal traffic)
            # Force very low congestion during night hours
            base = max(0.05, base * 0.15)  # Reduce to 15% of base value
            # Add small random variation
            base += random.uniform(-0.02, 0.04)
            # Return early - night hours should be consistently low congestion
            return max(0.03, min(0.15, base))  # Cap at 15% max congestion for night
            
        if day_type == "weekday":
            if 8 <= hour <= 9:  # Peak morning rush hour (moved from 7-9)
                base += random.uniform(0.45, 0.65)  # Maximum rush hour effect
            elif hour == 7:  # Early rush hour
                base += random.uniform(0.30, 0.45)  # Building up to peak
            elif hour == 6:  # Early morning - moderate traffic
                base += random.uniform(0.10, 0.20)  # Some yellow streets appearing
            elif hour == 5:  # Very early morning - minimal traffic
                base -= random.uniform(0.05, 0.15)  # Very few yellow streets
            elif 17 <= hour <= 19:  # Evening rush hour
                base += random.uniform(0.4, 0.55)  # Stronger evening rush
            elif 12 <= hour <= 13:  # Lunch hour
                base += random.uniform(0.15, 0.25)
            elif 10 <= hour <= 11:  # Mid-morning
                base += random.uniform(0.1, 0.2)
            elif 14 <= hour <= 16:  # Afternoon
                base += random.uniform(0.2, 0.35)
            elif 20 <= hour <= 21:  # Evening
                base += random.uniform(0.1, 0.2)
            elif 22 <= hour <= 23:  # Late evening
                base -= random.uniform(0.15, 0.25)  # Reducing traffic
        else:  # Weekend
            if 11 <= hour <= 16:  # Weekend shopping/activities
                base += random.uniform(0.2, 0.3)
            elif 17 <= hour <= 20:  # Weekend evening
                base += random.uniform(0.15, 0.25)
            elif 9 <= hour <= 10:  # Weekend morning
                base += random.uniform(0.05, 0.15)
            elif 21 <= hour <= 23:  # Weekend late evening
                base -= random.uniform(0.1, 0.2)
            elif 5 <= hour <= 8:  # Weekend early morning
                base -= random.uniform(0.15, 0.25)
    
    # Apply small random variation
    base += random.uniform(-0.08, 0.08)
    
    # Apply special case for major vs minor roads during off-peak hours
    if hour is not None and ((5 <= hour <= 6) or (21 <= hour <= 23)):
        # Major roads retain more traffic in early morning/late night
        if road_type in ['motorway', 'trunk', 'primary']:
            base = max(base, 0.15)  # Ensure major roads have some minimal traffic
    
    return max(0.05, min(0.95, base))

def simulate_congestion(G, hour=None):
    """Backward compatibility wrapper"""
    return enhanced_simulate_congestion(G, hour, "weekday")

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